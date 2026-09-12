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
You are the Faculty Course Allocation Agent for a university CSE department.

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

7. What-if simulations must never modify the database.

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

  const q = String(message || '').toLowerCase();


  // --------------------------------------------------
  // CONFLICT
  // --------------------------------------------------

  if (q.includes('conflict')) {

    const data =
      await toolFns.list_pending_conflicts({});

    return {

      answer: data.length
        ? `I found ${data.length} course(s) with multiple pending faculty requests. HOD review is required before final allocation.`
        : 'No conflicting multi-request courses were found in the current dataset.',

      requiresHod:
        data.length > 0,

      toolTrace: [
        {
          name: 'list_pending_conflicts',
          args: '{}'
        }
      ]

    };
  }


  // --------------------------------------------------
  // FACULTY
  // --------------------------------------------------

  const facultyMatch =
    String(message).match(/\bF\d{3,}\b/i);


  if (facultyMatch) {

    const id =
      facultyMatch[0].toUpperCase();


    const faculty =
      await toolFns.get_faculty_profile({
        facultyId: id
      });


    return {

      answer: faculty

        ? `Verified faculty: ${faculty.name} (${faculty.facultyId}). Expertise: ${
            (faculty.expertise || []).join(', ') ||
            'not specified'
          }. Current workload: ${
            faculty.currentWorkload || 0
          }/${
            faculty.maxWorkload || 18
          } hours.`

        : `No verified faculty record was found for ${id}.`,

      requiresHod: false,

      toolTrace: [
        {
          name: 'get_faculty_profile',

          args: JSON.stringify({
            facultyId: id
          })
        }
      ]

    };
  }


  // --------------------------------------------------
  // COURSE
  // --------------------------------------------------

  const courseMatch =
    String(message).match(/\bCSE\d{3,}\b/i);


  if (courseMatch) {

    const id =
      courseMatch[0].toUpperCase();


    const result =
      await toolFns.analyze_course({
        courseId: id
      });


    return {

      answer: result.course

        ? `Verified course: ${result.course.courseName}. ${
            result.requestCount
          } faculty request(s). ${
            result.recommendation

              ? `Best eligible candidate is ${result.recommendation.verified.faculty} with score ${result.recommendation.score}/100.`

              : 'No eligible recommendation was found.'
          } ${
            result.requiresHodReview
              ? 'HOD review is required.'
              : ''
          }`

        : `No verified course record was found for ${id}.`,

      requiresHod:
        !!result.requiresHodReview,

      toolTrace: [
        {
          name: 'analyze_course',

          args: JSON.stringify({
            courseId: id
          })
        }
      ]

    };
  }


  // --------------------------------------------------
  // GENERAL SEARCH
  // --------------------------------------------------

  const data =
    await toolFns.search_faculty({
      query: message
    });


  return {

    answer: data.length

      ? `I found ${data.length} matching faculty record(s): ${data
          .map(x => x.name)
          .join(', ')}.`

      : 'I could not find a matching verified faculty record. Add your dataset or include a faculty ID such as F001.',

    requiresHod: false,

    toolTrace: [
      {
        name: 'search_faculty',

        args: JSON.stringify({
          query: message
        })
      }
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

    input: outputs,

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