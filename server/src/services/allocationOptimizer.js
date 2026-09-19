import { allCourses, pendingAllocations, findFaculty, hoursForCourse } from '../data/store.js';
import { calculateRecommendationScore } from '../tools/allocationTools.js';

// ============================================================================
// SEMESTER-WIDE ALLOCATION OPTIMIZER
//
// Why this exists: the original `analyze_course` picks the best candidate for
// ONE course at a time, in isolation. That works fine as a single lookup, but
// running it course-by-course across a whole semester has two real problems
// at scale:
//   1. A faculty member who is the top match for several courses can be
//      "won" by all of them before anything notices they're over their
//      max workload - each course only ever saw a snapshot of their capacity
//      at the moment it was scored, not what earlier courses in the same run
//      already committed against that same person.
//   2. There is no global view, so nothing guarantees every course actually
//      gets a faculty member, and nothing reports the ones that can't.
//
// This module treats one semester's pending requests as a single constrained
// assignment problem: maximize total score, subject to (a) no faculty member
// exceeding their workload band and (b) trying to leave zero courses
// unallocated when a feasible eligible candidate exists anywhere for them.
// It is a heuristic (the underlying problem, a generalized assignment
// problem, is NP-hard) but a well-understood and explainable one:
//   Step 1: score every requesting (faculty, course) pair once (unchanged
//           deterministic backend scoring - never touched by the LLM).
//   Step 2: regret-based greedy assignment - process courses in order of how
//           much worse their second-best option is compared to their best
//           (highest "regret" first), so courses with only one good fit don't
//           lose it to a course that had other good options anyway.
//   Step 3: bounded local-search swap pass - try pairwise swaps between two
//           already-assigned courses if it raises total score without
//           breaking anyone's capacity. Bounded to a fixed number of passes
//           so runtime stays predictable (roughly O(passes * n^2) on the
//           number of *assigned* courses, not the whole faculty table) even
//           as the dataset grows.
// It never writes to the database - per the project's own guardrail, the
// optimizer proposes, a human (HOD) decides. See routes/allocations.js for
// the endpoint that lets the HOD apply (or partially apply) this draft.
// ============================================================================

const MAX_SWAP_PASSES = 3;

function buildJustification(candidate) {
  const b = candidate.breakdown || {};
  const parts = [];
  if (b.expertise) parts.push(`expertise match (+${b.expertise})`);
  if (b.qualification) parts.push(`meets required qualification (+${b.qualification})`);
  if (b.preference) parts.push(`faculty preference (+${b.preference})`);
  if (b.continuity) parts.push(`continuity with prior teaching (+${b.continuity})`);
  if (b.publication) parts.push(`publication/research alignment (+${b.publication})`);
  if (b.feedback) parts.push(`positive past student feedback (+${b.feedback})`);
  return (parts.length ? `Selected for ${parts.join(', ')}. ` : '') + `Total score ${candidate.score}/100.`;
}

export async function optimizeSemesterAllocation({ academicYear, semester, department } = {}) {
  const [pending, courses] = await Promise.all([
    pendingAllocations({ academicYear, semester }),
    allCourses(department ? { department, academicYear, semester } : { academicYear, semester })
  ]);
  const courseById = new Map(courses.map(c => [c.courseId, c]));

  const byCourse = new Map();
  for (const request of pending) {
    if (department) {
      const course = courseById.get(request.courseId);
      if (course && course.department !== department) continue;
    }
    if (!byCourse.has(request.courseId)) byCourse.set(request.courseId, []);
    byCourse.get(request.courseId).push(request);
  }

  // ---- Step 1: score every requested (faculty, course) pair once ----
  const courseCandidates = new Map(); // courseId -> scored candidates, best first
  for (const [courseId, requests] of byCourse) {
    const facultyIds = [...new Set(requests.map(r => r.facultyId))];
    const scored = [];
    for (const facultyId of facultyIds) {
      const score = await calculateRecommendationScore(facultyId, courseId);
      const request = requests.find(r => r.facultyId === facultyId);
      scored.push({ ...score, allocationId: request?._id });
    }
    scored.sort((a, b) => b.score - a.score);
    courseCandidates.set(courseId, scored);
  }

  // ---- capacity bookkeeping (starts from real DB state, then simulated locally for this run) ----
  const facultyCapacity = new Map();
  async function remainingCapacity(facultyId) {
    if (!facultyCapacity.has(facultyId)) {
      const faculty = await findFaculty(facultyId);
      const nominalMax = Number(faculty?.maxWorkload) || 18;
      // Match calculateRecommendationScore's hard-constraint math: admin
      // load reduces effective capacity, and anyone on leave has none.
      const adminLoad = Number(faculty?.adminLoadHours) || 0;
      const max = faculty?.onLeave ? 0 : Math.max(0, nominalMax - adminLoad);
      const used = Number(faculty?.currentWorkload) || 0;
      facultyCapacity.set(facultyId, Math.max(0, max - used));
    }
    return facultyCapacity.get(facultyId);
  }

  const eligibleByCourse = new Map(); // courseId -> eligible (no hard violation) candidates, best first
  for (const [courseId, list] of courseCandidates) {
    eligibleByCourse.set(courseId, list.filter(c => !c.hardViolations || c.hardViolations.length === 0));
  }

  const assignment = new Map(); // courseId -> chosen candidate

  function regretOrderedUnassigned() {
    return [...eligibleByCourse.entries()]
      .filter(([courseId, list]) => !assignment.has(courseId) && list.length > 0)
      .map(([courseId, list]) => ({
        courseId,
        list,
        // Big gap between #1 and #2 = urgent (losing the top pick hurts a lot).
        // Only one eligible candidate at all = treat as maximally urgent.
        regret: list.length > 1 ? (list[0].score - list[1].score) : 1000
      }))
      .sort((a, b) => b.regret - a.regret);
  }

  // ---- Step 2: regret-based greedy assignment ----
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const { courseId, list } of regretOrderedUnassigned()) {
      const need = hoursForCourse(courseById.get(courseId));
      let pick = null;
      for (const candidate of list) {
        const cap = await remainingCapacity(candidate.facultyId);
        if (cap >= need) { pick = candidate; break; }
      }
      if (!pick) continue; // nobody currently has room - stays unassigned, surfaces in gap analysis
      assignment.set(courseId, pick);
      facultyCapacity.set(pick.facultyId, (await remainingCapacity(pick.facultyId)) - need);
      progressed = true;
    }
  }

  // ---- Step 3: bounded local-search swap improvement ----
  const assignedIds = [...assignment.keys()];
  for (let pass = 0; pass < MAX_SWAP_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < assignedIds.length; i++) {
      for (let j = i + 1; j < assignedIds.length; j++) {
        const c1 = assignedIds[i], c2 = assignedIds[j];
        const a1 = assignment.get(c1), a2 = assignment.get(c2);
        if (a1.facultyId === a2.facultyId) continue;
        const alt1 = courseCandidates.get(c1).find(x => x.facultyId === a2.facultyId && (!x.hardViolations || !x.hardViolations.length));
        const alt2 = courseCandidates.get(c2).find(x => x.facultyId === a1.facultyId && (!x.hardViolations || !x.hardViolations.length));
        if (!alt1 || !alt2) continue;
        if ((alt1.score + alt2.score) <= (a1.score + a2.score)) continue;
        const h1 = hoursForCourse(courseById.get(c1)), h2 = hoursForCourse(courseById.get(c2));
        const cap1 = await remainingCapacity(a1.facultyId), cap2 = await remainingCapacity(a2.facultyId);
        // After swap: a1.facultyId gives up c1 (+h1 free) and takes on c2 (-h2); a2.facultyId mirrors that.
        if ((cap1 + h1) < h2 || (cap2 + h2) < h1) continue;
        assignment.set(c1, alt1);
        assignment.set(c2, alt2);
        facultyCapacity.set(a1.facultyId, cap1 + h1 - h2);
        facultyCapacity.set(a2.facultyId, cap2 + h2 - h1);
        improved = true;
      }
    }
    if (!improved) break;
  }

  // ---- gap analysis: courses that still have nobody ----
  const gapAnalysis = [];
  for (const [courseId, list] of courseCandidates) {
    if (assignment.has(courseId)) continue;
    const course = courseById.get(courseId);
    const hasEligible = (eligibleByCourse.get(courseId) || []).length > 0;
    gapAnalysis.push({
      courseId,
      courseName: course?.courseName || courseId,
      requestCount: list.length,
      reason: list.length === 0
        ? 'No faculty requested this course.'
        : hasEligible
          ? 'Every requesting faculty member is fully booked under the current workload limits.'
          : 'Every requesting faculty member fails a hard constraint (required qualification or workload cap).',
      candidates: list.map(c => ({ facultyId: c.facultyId, name: c.verified?.faculty || c.facultyId, score: c.score, hardViolations: c.hardViolations || [] }))
    });
  }

  const draftAllocations = [...assignment.entries()].map(([courseId, candidate]) => ({
    courseId,
    courseName: courseById.get(courseId)?.courseName || courseId,
    facultyId: candidate.facultyId,
    facultyName: candidate.verified?.faculty || candidate.facultyId,
    score: candidate.score,
    breakdown: candidate.breakdown,
    allocationId: candidate.allocationId,
    justification: buildJustification(candidate)
  }));

  return {
    generatedAt: new Date().toISOString(),
    scope: { academicYear: academicYear || null, semester: semester || null, department: department || null },
    coursesConsidered: courseCandidates.size,
    coursesAllocated: draftAllocations.length,
    coursesUnallocated: gapAnalysis.length,
    draftAllocations,
    gapAnalysis
  };
}
