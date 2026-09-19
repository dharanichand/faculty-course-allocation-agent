import {
  StateGraph,
  START,
  END,
  Annotation,
  MemorySaver
} from '@langchain/langgraph';

import OpenAI from 'openai';

import {
  toolDefinitions,
  toolFns
} from '../tools/agentTools.js';


// ======================================================
// SYSTEM PROMPT
// ======================================================

const SYSTEM = `
You are the Faculty Course Allocation Agent for a university academic department.
The specific department(s) involved come from the verified data returned by your tools
(e.g. a course's department field, or a department filter argument) - never assume it is
any one fixed department such as CSE unless the verified data says so.

You are a decision-support agent, NOT the final allocator.
The HOD remains the final authority.

RULES:

1. Use backend tools for every factual claim about faculty, courses,
   requests, scores, workload, qualifications, availability, or history.

2. Never invent data.

3. You may search, retrieve, analyze, and simulate.

4. Never silently approve, reject, override, or finalize an allocation.

5. Recommendation scores come from backend tools.
   Never calculate or change the score yourself.

6. If multiple faculty request the same course,
   explicitly state that HOD review is required.

7. What-if simulations must never modify the database. The same applies to
   run_semester_optimization: it only proposes a draft and a gap analysis -
   it never approves, rejects, or writes anything, and you must never say it
   has "finalized" or "assigned" anything. Applying a draft is a separate,
   explicit HOD action outside this chat tool.

8. Clearly separate:
   - Verified facts
   - Recommendation
   - Conflicts
   - HOD decision requirements

9. If the request is ambiguous, use the available search tools
   before asking for identifiers.

10. Keep answers concise but explain reasoning using verified
    tool-derived information.

11. If a tool returns no record, clearly say that the verified
    dataset contains no matching record.

12. Never claim an action was performed unless a backend tool
    actually performed it.

13. Allocation policy: a Professor gets 1 course, an Associate Professor 2,
    everyone else 3. Seat conflicts are decided by designation priority
    (Professor > Associate Professor > Assistant Professor > others).
    preview_auto_allocation is a dry run only; the real automatic run is the
    HOD's Start Allocation button. Use get_workload_flags to answer questions
    about overloaded or very-low-workload faculty. Always write faculty as
    "Name (ID)".
`;


// ======================================================
// LANGGRAPH STATE
// ======================================================

const State = Annotation.Root({

  input: Annotation({
    reducer: (a, b) => a.concat(b),
    default: () => []
  }),

  pendingCalls: Annotation({
    reducer: (_, b) => b,
    default: () => []
  }),

  answer: Annotation({
    reducer: (_, b) => b,
    default: () => ''
  }),

  requiresHod: Annotation({
    reducer: (a, b) => a || b,
    default: () => false
  }),

  toolTrace: Annotation({
    reducer: (a, b) => a.concat(b),
    default: () => []
  })

});


// ======================================================
// GROQ CLIENT
// ======================================================

let client = null;

function getClient() {

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY is not configured. Add your Groq API key to server/.env'
    );
  }

  if (!client) {

    client = new OpenAI({

      apiKey: apiKey,

      baseURL:
        process.env.GROQ_BASE_URL ||
        'https://api.groq.com/openai/v1'

    });

  }

  return client;
}


// ======================================================
// LOCAL FALLBACK
// ======================================================

async function localAgentAnswer(message) {
  const q = String(message || '').trim();
  const lower = q.toLowerCase();

  if (lower.includes('gap') || lower.includes('no suitable') || lower.includes('unallocated') || lower.includes('no faculty')) {
    const data = await toolFns.get_gap_analysis({});
    return {
      answer: data.coursesUnallocated
        ? `Gap analysis: ${data.coursesUnallocated} of ${data.coursesConsidered} pending course(s) currently have no viable faculty. ${data.gapAnalysis.slice(0,5).map(g=>`${g.courseId} (${g.courseName}): ${g.reason}`).join(' ')}`
        : `Gap analysis: all ${data.coursesConsidered} pending course(s) have at least one viable faculty candidate right now.`,
      requiresHod: data.coursesUnallocated > 0,
      toolTrace: [{name:'get_gap_analysis',args:'{}'}]
    };
  }

  if (lower.includes('optimi') && (lower.includes('semester') || lower.includes('whole') || lower.includes('all course') || lower.includes('run allocation'))) {
    const data = await toolFns.run_semester_optimization({});
    return {
      answer: `Semester optimization proposal only (nothing written to the database): ${data.coursesAllocated} of ${data.coursesConsidered} course(s) matched to a faculty member, ${data.coursesUnallocated} left unallocated. HOD review and explicit apply is required before anything is finalized.`,
      requiresHod: true,
      toolTrace: [{name:'run_semester_optimization',args:'{}'}]
    };
  }

  if (lower.includes('conflict') || lower.includes('multiple request')) {
    const data = await toolFns.list_pending_conflicts({});
    return {
      answer: data.length
        ? `I found ${data.length} course(s) with multiple pending allocation candidates. HOD review is required.`
        : 'No pending multi-request conflicts were found in the dataset.',
      requiresHod: data.length > 0,
      toolTrace: [{name:'list_pending_conflicts',args:'{}'}]
    };
  }

  const whatFaculty = q.match(/\b(?:FAC\d{4}|F\d{3,})\b/i)?.[0];
  const whatCourse = q.match(/\b(?:CS|AI|EC|EE|ME|CE|MC|MB)\d{3}\b/i)?.[0];
  if ((lower.includes('what if') || lower.includes('assign') || lower.includes('simulate')) && whatFaculty && whatCourse) {
    const result = await toolFns.what_if_assignment({facultyId:whatFaculty,courseId:whatCourse});
    return {
      answer:`What-if simulation only — database modified: ${result.databaseModified ? 'yes' : 'no'}. Proposed score: ${result.proposedScore}/100. ${result.impact} ${result.hardViolations?.length ? `Violations: ${result.hardViolations.join('; ')}.` : 'No hard constraint violations detected.'}`,
      requiresHod:Boolean(result.hardViolations?.length),
      toolTrace:[{name:'what_if_assignment',args:JSON.stringify({facultyId:whatFaculty,courseId:whatCourse})}]
    };
  }

  const facultyId = whatFaculty;
  if (facultyId) {
    const f = await toolFns.get_faculty_profile({facultyId});
    return {
      answer: f
        ? `Verified faculty: ${f.name} (${f.employeeNo || f.facultyId}). Department: ${f.department}. Expertise: ${(f.expertise||[]).slice(0,8).join(', ') || 'not specified'}. Current workload: ${f.currentWorkload}/${f.maxWorkload} hours.`
        : `No verified faculty record was found for ${facultyId.toUpperCase()}.`,
      requiresHod:false,
      toolTrace:[{name:'get_faculty_profile',args:JSON.stringify({facultyId})}]
    };
  }

  const courseId = q.match(/\b(?:CS|AI|EC|EE|ME|CE|MC|MB)\d{3}\b/i)?.[0];
  if (courseId) {
    const result = await toolFns.analyze_course({courseId});
    const rec = result.recommendation;
    return {
      answer: result.course
        ? `Verified course: ${result.course.courseCode} — ${result.course.courseName}. ${result.requestCount} pending candidate(s). ${rec ? `Top eligible candidate: ${rec.verified.faculty} with score ${rec.score}/100.` : 'No eligible candidate was found.'} ${result.requiresHodReview ? 'HOD review is required.' : ''}`
        : `No verified course record was found for ${courseId.toUpperCase()}.`,
      requiresHod:!!result.requiresHodReview,
      toolTrace:[{name:'analyze_course',args:JSON.stringify({courseId})}]
    };
  }

  if (/\b(all|list|show).*(faculty|teachers|professors)/i.test(q)) {
    const data=await toolFns.search_faculty({query:''});
    return {
      answer:`The dataset contains ${data.length >= 20 ? 'many' : data.length} faculty records. Here are the first ${Math.min(data.length,20)}: ${data.slice(0,20).map(x=>`${x.name} (${x.facultyId})`).join(', ')}.`,
      requiresHod:false, toolTrace:[{name:'search_faculty',args:'{"query":""}'}]
    };
  }

  if (/\b(all|list|show).*(course|subject)/i.test(q)) {
    const data=await toolFns.search_courses({query:''});
    return {
      answer:`Here are the first ${Math.min(data.length,20)} verified courses: ${data.slice(0,20).map(x=>`${x.courseCode} — ${x.courseName}`).join('; ')}.`,
      requiresHod:false, toolTrace:[{name:'search_courses',args:'{"query":""}'}]
    };
  }

  const [fac, courses] = await Promise.all([
    toolFns.search_faculty({query:q}),
    toolFns.search_courses({query:q})
  ]);
  if (fac.length || courses.length) {
    return {
      answer:`Verified search results: ${fac.length ? `Faculty: ${fac.slice(0,8).map(x=>x.name).join(', ')}.` : ''} ${courses.length ? `Courses: ${courses.slice(0,8).map(x=>`${x.courseCode} — ${x.courseName}`).join(', ')}.` : ''}`,
      requiresHod:false,
      toolTrace:[
        {name:'search_faculty',args:JSON.stringify({query:q})},
        {name:'search_courses',args:JSON.stringify({query:q})}
      ]
    };
  }

  return {
    answer:'I could not find a matching verified faculty or course record in the current dataset. Try a faculty ID such as FAC0001 or a course code such as CS101.',
    requiresHod:false,
    toolTrace:[
      {name:'search_faculty',args:JSON.stringify({query:q})},
      {name:'search_courses',args:JSON.stringify({query:q})}
    ]
  };
}

// ======================================================
// AGENT NODE
// ======================================================

async function agentNode(state) {

  const response =
    await getClient().chat.completions.create({

      model:
        process.env.GROQ_MODEL ||
        'llama-3.3-70b-versatile',

      messages: [

        {
          role: 'system',
          content: SYSTEM
        },

        ...state.input

      ],

      tools: toolDefinitions,

      tool_choice: 'auto',

      temperature: 0.2

    });


  const message =
    response.choices?.[0]?.message;


  if (!message) {

    throw new Error(
      'Groq returned an empty response.'
    );

  }


  // --------------------------------------------------
  // NO TOOL CALL
  // --------------------------------------------------

  if (
    !message.tool_calls ||
    message.tool_calls.length === 0
  ) {

    return {

      input: [
        ...state.input,
        message
      ],

      pendingCalls: [],

      answer:
        message.content ||
        'I could not generate a response.',

      toolTrace: []

    };

  }


  // --------------------------------------------------
  // TOOL CALLS
  // --------------------------------------------------

  const pendingCalls =
    message.tool_calls.map(call => ({

      call_id: call.id,

      name:
        call.function.name,

      arguments:
        call.function.arguments || '{}'

    }));


  return {

    input: [
      ...state.input,
      message
    ],

    pendingCalls,

    answer:
      message.content || '',

    toolTrace:
      message.tool_calls.map(call => ({

        name:
          call.function.name,

        args:
          call.function.arguments || '{}'

      }))

  };

}


// ======================================================
// TOOLS NODE
// ======================================================

async function toolsNode(state) {

  const outputs = [];

  let requires =
    state.requiresHod;


  for (
    const call of state.pendingCalls
  ) {

    let result;


    try {

      const args =
        JSON.parse(
          call.arguments || '{}'
        );


      if (!toolFns[call.name]) {

        throw new Error(
          `Unknown tool: ${call.name}`
        );

      }


      result =
        await toolFns[call.name](args);


      // ----------------------------------------------
      // HOD REVIEW DETECTION
      // ----------------------------------------------

      if (
        call.name === 'analyze_course' &&
        result?.requiresHodReview
      ) {

        requires = true;

      }


      if (
        call.name ===
          'calculate_recommendation_score' &&
        result?.hardViolations?.length
      ) {

        requires = true;

      }


      if (
        call.name === 'get_course_requests' &&
        Array.isArray(result) &&
        result.length > 1
      ) {

        requires = true;

      }


      if (
        call.name === 'list_pending_conflicts' &&
        Array.isArray(result) &&
        result.length > 0
      ) {

        requires = true;

      }


    } catch (error) {

      result = {
        error: error.message
      };

    }


    outputs.push({

      role: 'tool',

      tool_call_id:
        call.call_id,

      content:
        JSON.stringify(result)

    });

  }


  return {

    input: [...state.input, ...outputs],

    pendingCalls: [],

    requiresHod: requires

  };

}


// ======================================================
// ROUTER
// ======================================================

function route(state) {

  return state.pendingCalls?.length
    ? 'tools'
    : END;

}


// ======================================================
// BUILD LANGGRAPH
// ======================================================

const builder =
  new StateGraph(State)

    .addNode(
      'agent',
      agentNode
    )

    .addNode(
      'tools',
      toolsNode
    )

    .addEdge(
      START,
      'agent'
    )

    .addConditionalEdges(
      'agent',
      route
    )

    .addEdge(
      'tools',
      'agent'
    );


export const allocationGraph =
  builder.compile({

    checkpointer:
      new MemorySaver()

  });


// ======================================================
// RUN AGENT
// ======================================================

export async function runAgent({

  message,

  threadId = 'default'

}) {


  // --------------------------------------------------
  // FALLBACK WHEN GROQ KEY IS MISSING
  // --------------------------------------------------

  if (!process.env.GROQ_API_KEY) {

    return localAgentAnswer(
      message
    );

  }


  // --------------------------------------------------
  // RUN GROQ + LANGGRAPH
  // --------------------------------------------------

  try {

    const result =
      await allocationGraph.invoke(

        {

          input: [

            {
              role: 'user',

              content:
                String(message)

            }

          ]

        },

        {

          configurable: {
            thread_id:
              threadId
          }

        }

      );


    return {

      answer:
        result.answer ||
        'I could not generate a response.',

      requiresHod:
        !!result.requiresHod,

      toolTrace:
        result.toolTrace || []

    };


  } catch (error) {

    console.error(
      'Groq Agent Error:',
      error
    );


    throw new Error(
      `Groq agent failed: ${
        error?.message ||
        'Unknown error'
      }`
    );

  }

}