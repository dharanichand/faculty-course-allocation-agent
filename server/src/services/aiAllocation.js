import OpenAI from 'openai';

// ======================================================
// GROQ CLIENT (reuses the same key/model as the chat agent)
// ======================================================

let client = null;

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null; // caller falls back to deterministic scoring
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
    });
  }
  return client;
}

// ======================================================
// SYSTEM PROMPT
// This model is only allowed to CLASSIFY and EXPLAIN verified
// numbers that the backend already computed. It is never allowed
// to invent a score, a qualification, or override a hard violation.
// The route that calls this always re-checks hard violations itself
// before trusting the model's decision (see allocationAgent.js).
// ======================================================

const CLASSIFY_SYSTEM = `
You are an academic operations agent that classifies faculty-course allocation candidates
for a university academic department. The specific department for each course is given to
you in the verified data (course.department) - never assume it is any one fixed department.

You are given VERIFIED data only: a course, and a list of candidate faculty with
backend-calculated scores, score breakdowns, and hard constraint violations.

RULES (do not break these):
1. Never invent, guess, or alter any score, qualification, or fact not present in the
   verified data you are given.
2. Never approve a candidate that has one or more hard violations listed.
3. Never approve when more than one eligible (no hard-violation) candidate has scores
   within 8 points of each other - that always requires human (HOD) review.
4. Base every "reason" string strictly on the verified breakdown/score fields you were given.

For each candidate, assign exactly one flag:
- "perfect": no hard violations, score >= 75, strong alignment across the breakdown.
- "compromise": no hard violations, score 50-74, a real trade-off is visible in the breakdown.
- "conflict": has one or more hard violations, OR the course has more than one eligible
  candidate whose scores are close enough to require a human tie-break.

Then set:
- "decision": "auto_approve" only if exactly one eligible candidate is a clear leader
  (either the only eligible candidate, or leading the next eligible candidate by 8+ points)
  AND that candidate's score is >= 75.
- otherwise "decision": "escalate".

Respond with STRICT JSON only (no markdown fences, no prose, no trailing commentary),
matching exactly this shape:

{
  "courseId": string,
  "decision": "auto_approve" | "escalate",
  "approvedFacultyId": string | null,
  "candidates": [
    { "facultyId": string, "flag": "perfect" | "compromise" | "conflict", "reason": string }
  ],
  "summary": string
}
`;

/**
 * Ask the LLM to classify/explain one course's candidate pool.
 * Returns null (never throws) if the key is missing, the call fails,
 * or the response isn't valid JSON - callers must fall back to the
 * deterministic scorer in that case.
 */
export async function classifyCourseAllocation({ course, candidates }) {
  const groq = getGroqClient();
  if (!groq) return null;

  const payload = {
    course: {
      courseId: course?.courseId,
      courseName: course?.courseName,
      department: course?.department,
      requiredExpertise: course?.requiredExpertise,
      credits: course?.credits
    },
    candidates: candidates.map(c => ({
      facultyId: c.facultyId,
      score: c.score,
      breakdown: c.breakdown,
      hardViolations: c.hardViolations || [],
      verified: c.verified
    }))
  };

  try {
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CLASSIFY_SYSTEM },
        { role: 'user', content: JSON.stringify(payload) }
      ]
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.candidates)) return null;
    return parsed;
  } catch (error) {
    console.error('AI allocation classification failed, will fall back to deterministic scoring:', error.message);
    return null;
  }
}

// ======================================================
// BATCHED NARRATION FOR A FULL SEMESTER RUN
//
// classifyCourseAllocation above makes one Groq call per course. That's fine
// for reviewing a single course, but the semester-wide optimizer
// (services/allocationOptimizer.js) can produce results for dozens of
// courses in one run - calling the LLM once per course there would mean
// dozens of sequential blocking API calls (real latency, real per-call
// cost) for what is fundamentally one review document. This groups many
// already-decided draft assignments/gaps into a handful of calls instead,
// asking the model only to write the human-readable "why", never to change
// a decision, a score, or a name.
// ======================================================

const NARRATE_SYSTEM = `
You are writing short, plain-English justification notes for a Head of Department reviewing
a draft faculty-course allocation for an entire semester. The assignments and gaps you are
given were already decided by deterministic backend scoring/optimization - you are not
choosing anyone or scoring anything.

RULES (do not break these):
1. Never change, invent, or contradict any score, name, department, or decision you are given.
   You are only writing a 1-2 sentence human-readable "why" for each item.
2. Never suggest a different faculty member than the one already chosen for an assignment.
3. For gaps (unallocated courses), do not invent a workaround faculty member - explain the
   shortfall clearly enough that an HOD knows what to consider next (relax a constraint, split
   the section, hire adjunct, etc.), based only on the reason/candidates you were given.

Respond with STRICT JSON only (no markdown fences, no prose), matching exactly:
{
  "assignments": [ { "courseId": string, "note": string } ],
  "gaps": [ { "courseId": string, "note": string } ]
}
`;

async function classifyBatchAllocations({ draftAllocations = [], gapAnalysis = [] }) {
  const groq = getGroqClient();
  if (!groq) return null;

  const payload = {
    assignments: draftAllocations.map(a => ({
      courseId: a.courseId, courseName: a.courseName,
      facultyId: a.facultyId, facultyName: a.facultyName,
      score: a.score, breakdown: a.breakdown
    })),
    gaps: gapAnalysis.map(g => ({
      courseId: g.courseId, courseName: g.courseName,
      reason: g.reason, candidates: g.candidates
    }))
  };

  try {
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: NARRATE_SYSTEM },
        { role: 'user', content: JSON.stringify(payload) }
      ]
    });
    const raw = response.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || (!Array.isArray(parsed.assignments) && !Array.isArray(parsed.gaps))) return null;
    return parsed;
  } catch (error) {
    console.error('Batched allocation narration failed, falling back to deterministic justification text:', error.message);
    return null;
  }
}

// Chunks a large semester run into a handful of calls (not one call total,
// so a single oversized prompt doesn't get truncated or time out; not one
// call per course, so cost/latency stay bounded as the dataset grows).
// Falls back silently (returns the input unchanged) if Groq is unavailable
// or a chunk fails - the deterministic `justification` text already on each
// item is always there as a safe default.
export async function narrateDraftInBatches({ draftAllocations = [], gapAnalysis = [] }, chunkSize = 25) {
  const notesByAssignment = new Map();
  const notesByGap = new Map();

  for (let i = 0; i < draftAllocations.length || i < gapAnalysis.length; i += chunkSize) {
    const result = await classifyBatchAllocations({
      draftAllocations: draftAllocations.slice(i, i + chunkSize),
      gapAnalysis: gapAnalysis.slice(i, i + chunkSize)
    });
    if (!result) continue;
    for (const a of result.assignments || []) if (a?.courseId && a?.note) notesByAssignment.set(a.courseId, a.note);
    for (const g of result.gaps || []) if (g?.courseId && g?.note) notesByGap.set(g.courseId, g.note);
  }

  return {
    draftAllocations: draftAllocations.map(a => notesByAssignment.has(a.courseId) ? { ...a, justification: notesByAssignment.get(a.courseId) } : a),
    gapAnalysis: gapAnalysis.map(g => notesByGap.has(g.courseId) ? { ...g, note: notesByGap.get(g.courseId) } : g)
  };
}
