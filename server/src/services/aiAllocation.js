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
for a university CSE department.

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
