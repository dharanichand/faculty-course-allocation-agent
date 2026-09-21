// ============================================================================
// AUTOMATIC ALLOCATION ENGINE
//
// This is the "agent" step that assigns courses to faculty WITHOUT any manual
// picking. It is a pure function (no database, no I/O) so it is fast, fully
// explainable and unit-tested. The database glue lives in allocationRunner.js.
//
// Policy (all configurable through the faculty records / dataset builder):
//   * Quota      : Professor 1 course, Associate Professor 2, everyone else 3.
//   * Priority   : when several faculty want the same course and there are not
//                  enough sections, it is decided by designation:
//                     1) Professor  2) Associate Professor
//                     3) Assistant Professor  4) all remaining faculty
//                  (ties inside a tier: earlier submission first, then emp. no.)
//   * Preference : each faculty member is given their highest-ranked course
//                  that still has room. Anything left over is filled
//                  automatically (continuity -> coverage -> hours fit).
//   * Coverage   : every section must get a lead instructor before a second
//                  (co-)instructor is given out.
//   * One faculty member never gets two seats in the same course.
//
// The result is a PROPOSAL: rows are stored as status "recommended" and the
// HOD approves / rejects / overrides them (human-in-the-loop).
// ============================================================================

import {TIER_LABELS} from './designationPolicy.js';
export {TIER_LABELS};
const DEFAULT_QUOTA = {1: 1, 2: 2, 3: 3, 4: 3};
const PREF_SCORE = [60, 50, 40, 30, 20];

const submittedMs = f => {
  const t = Date.parse(f.submittedAt || '');
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
};

// A faculty member is "overloaded" above the prescribed maximum and has a
// "very low" (underloaded) workload when they sit clearly below the prescribed
// minimum (below 85% of it). Between the two they are "balanced".
export const UNDERLOAD_FACTOR = 0.85;
export function workloadStatus({hours, min, max, onLeave = false}) {
  if (onLeave) return 'on_leave';
  if (max && hours > max) return 'overloaded';
  if (min && hours < min * UNDERLOAD_FACTOR) return 'underloaded';
  return 'balanced';
}

function slotList(course) {
  const per = Number(course.instructorsPerSection) || Math.max(1, ...((course.sections || []).map(s => Number(s.instructorSlots) || 1)));
  const sections = (course.sections || []).length
    ? course.sections.map(s => s.sectionId)
    : Array.from({length: Number(course.sectionCount) || 0}, (_, i) => `${course.courseId}-S${String(i + 1).padStart(2, '0')}`);
  const slots = [];
  // Lead seats for every section first, then co-instructor seats.
  for (let k = 0; k < per; k++) {
    for (const sectionId of sections) {
      slots.push(k === 0
        ? {sectionId, allocSectionId: sectionId, role: per > 1 ? 'lead' : 'sole', isLead: true}
        : {sectionId, allocSectionId: `${sectionId}-CO${k > 1 ? k : ''}`, role: 'co', isLead: false});
    }
  }
  return slots;
}

export function runAutoAllocation({faculty, courses, locked = [], blocked = []}) {
  const courseMap = new Map(courses.map(c => [c.courseId, c]));
  const hoursOf = c => Number(c.hoursPerSection) || Number(c.credits) || 3;

  // ---- free seats per course ----
  const free = new Map();
  for (const c of courses) free.set(c.courseId, slotList(c));
  const seatsTotal = new Map([...free].map(([id, list]) => [id, list.length]));
  const leadsFree = new Map([...free].map(([id, list]) => [id, list.filter(s => s.isLead).length]));

  // ---- faculty state ----
  const states = faculty
    .filter(f => !f.onLeave && f.status !== 'inactive')
    .map(f => {
      const tier = Number(f.priorityTier) || 4;
      const quota = Number.isFinite(Number(f.courseQuota)) && f.courseQuota !== undefined && f.courseQuota !== null ? Number(f.courseQuota) : DEFAULT_QUOTA[tier];
      return {
        f, tier, quota, quotaLeft: quota, hours: 0, assigned: [], courseIds: new Set(),
        prefs: [...(f.preferences || [])].sort((a, b) => a.rank - b.rank),
        taught: new Set(f.previousCourseIds || []),
        min: Number(f.prescribedMin ?? f.minWorkload) || 0,
        max: Number(f.prescribedMax ?? f.maxWorkload) || 0
      };
    })
    .sort((a, b) => a.tier - b.tier || submittedMs(a.f) - submittedMs(b.f) || String(a.f.facultyId).localeCompare(String(b.f.facultyId)));
  const stateById = new Map(states.map(s => [s.f.facultyId, s]));

  // Coverage guard. Every section must end up with a lead instructor, so the
  // number of faculty places still open must never drop below the number of
  // uncovered sections. "slack" is how many co-instructor seats can still be
  // handed out; once it hits 0 only lead seats are given.
  let quotaLeftTotal = states.reduce((n, s) => n + s.quotaLeft, 0);
  let leadsFreeTotal = [...leadsFree.values()].reduce((n, v) => n + v, 0);
  const slack = () => quotaLeftTotal - leadsFreeTotal;
  const seatOk = courseId => {
    const list = free.get(courseId) || [];
    return list.length > 0 && (list[0].isLead || slack() > 0);
  };

  const blockedSet = new Set(blocked.map(b => `${b.facultyId}|${b.courseId}`));

  const take = (st, courseId, meta) => {
    const list = free.get(courseId);
    const seat = list.shift();
    quotaLeftTotal -= 1;
    if (seat.isLead) { leadsFree.set(courseId, leadsFree.get(courseId) - 1); leadsFreeTotal -= 1; }
    const course = courseMap.get(courseId);
    st.assigned.push({courseId, sectionId: seat.allocSectionId, baseSectionId: seat.sectionId, role: seat.role, hours: hoursOf(course), ...meta});
    st.courseIds.add(courseId);
    st.hours += hoursOf(course);
    st.quotaLeft -= 1;
  };

  // ---- 0. approved allocations are locked in ----
  for (const l of locked) {
    const st = stateById.get(l.facultyId);
    const list = free.get(l.courseId);
    if (!st || !list) continue;
    // Approved rows imported from the workload sheet carry the sheet's own section
    // label ("7", "12,19,4,7", "EEE"), which need not equal a generated seat id. In
    // that case the course's first free lead seat (else any seat) is used up instead,
    // so a re-run never hands the same section to somebody else as well.
    let idx = list.findIndex(s => s.allocSectionId === l.sectionId);
    if (idx < 0) idx = list.findIndex(s => s.isLead);
    if (idx < 0 && list.length) idx = 0;
    const seat = idx >= 0 ? list.splice(idx, 1)[0] : {sectionId: l.sectionId, allocSectionId: l.sectionId, role: 'sole', isLead: false};
    quotaLeftTotal -= st.quotaLeft > 0 ? 1 : 0;
    if (idx >= 0 && seat.isLead) { leadsFree.set(l.courseId, leadsFree.get(l.courseId) - 1); leadsFreeTotal -= 1; }
    st.assigned.push({courseId: l.courseId, sectionId: seat.allocSectionId, baseSectionId: seat.sectionId, role: seat.role, hours: hoursOf(courseMap.get(l.courseId)), source: 'locked', rank: null});
    st.courseIds.add(l.courseId);
    st.hours += hoursOf(courseMap.get(l.courseId));
    st.quotaLeft = Math.max(0, st.quotaLeft - 1);
  }

  const canTake = (st, courseId) => courseMap.has(courseId) && !st.courseIds.has(courseId)
    && !blockedSet.has(`${st.f.facultyId}|${courseId}`) && seatOk(courseId);

  // ---- 1. preference phase: strictly by priority tier ----
  const denials = new Map();             // courseId -> Map(facultyId -> best rank they wanted)
  const maxQuota = Math.max(0, ...states.map(s => s.quota));
  for (const tier of [1, 2, 3, 4]) {
    const group = states.filter(s => s.tier === tier);
    for (let round = 0; round < maxQuota; round++) {
      for (const st of group) {
        if (st.quotaLeft <= 0) continue;
        let picked = null;
        const skipped = [];
        const usable = [];
        for (const pref of st.prefs) {
          if (!courseMap.has(pref.courseId) || st.courseIds.has(pref.courseId) || blockedSet.has(`${st.f.facultyId}|${pref.courseId}`)) continue;
          if (seatOk(pref.courseId)) usable.push(pref);
          else skipped.push(pref);
        }
        if (usable.length) {
          picked = usable[0];
          // On the last place, prefer (among the faculty member's OWN choices)
          // the one that brings the weekly hours into the prescribed range.
          if (st.quotaLeft === 1 && st.min) {
            const fit = usable.find(p => {
              const h = st.hours + hoursOf(courseMap.get(p.courseId));
              return h >= st.min && (!st.max || h <= st.max);
            });
            if (fit) picked = fit;
          }
          // Only choices ranked ABOVE the one that was given count as denied.
          const cut = st.prefs.indexOf(picked);
          for (let i = skipped.length - 1; i >= 0; i--) if (st.prefs.indexOf(skipped[i]) > cut) skipped.splice(i, 1);
        }
        for (const s of skipped) {
          if (!denials.has(s.courseId)) denials.set(s.courseId, new Map());
          if (!denials.get(s.courseId).has(st.f.facultyId)) denials.get(s.courseId).set(st.f.facultyId, s.rank);
        }
        if (picked) take(st, picked.courseId, {source: 'preference', rank: picked.rank});
      }
    }
  }

  // ---- 2. automatic fill phase ----
  const fillScore = (st, courseId) => {
    const course = courseMap.get(courseId);
    const h = hoursOf(course);
    let score = 0;
    if (st.taught.has(courseId)) score += 40;                               // continuity
    if (leadsFree.get(courseId) > 0) score += 45;                           // uncovered section first
    if (st.assigned.some(a => courseMap.get(a.courseId)?.year === course.year && courseMap.get(a.courseId)?.program === course.program)) score += 6;
    const slotsAfter = st.quotaLeft - 1;
    const projected = st.hours + h;
    if (st.max) {
      if (slotsAfter === 0) {
        const dist = projected < st.min ? st.min - projected : projected > st.max ? projected - st.max : 0;
        score += 30 - 8 * dist - (projected > st.max ? 10 : 0);
      } else {
        const need = st.min ? (st.min - st.hours) / st.quotaLeft : 0;
        score += 3 * (h - need);
        if (projected + slotsAfter * 2 > st.max) score -= 20;
      }
    }
    // small deterministic spread so equal candidates do not all pile on one course
    score += 10 * (free.get(courseId).length / (seatsTotal.get(courseId) || 1));
    return score;
  };

  for (const tier of [1, 2, 3, 4]) {
    const group = states.filter(s => s.tier === tier);
    for (let round = 0; round < maxQuota; round++) {
      for (const st of group) {
        if (st.quotaLeft <= 0) continue;
        let best = null, bestScore = -Infinity;
        for (const c of courses) {
          if (!canTake(st, c.courseId)) continue;
          const sc = fillScore(st, c.courseId);
          if (sc > bestScore || (sc === bestScore && best && c.courseId < best)) { best = c.courseId; bestScore = sc; }
        }
        if (best) take(st, best, {source: st.taught.has(best) ? 'continuity' : 'fill', rank: null});
      }
    }
  }

  // ---- 2b. repair: make sure no section is left without an instructor ----
  const giveSeat = (st, courseId, meta) => take(st, courseId, meta);
  for (const c of courses) {
    while ((leadsFree.get(c.courseId) || 0) > 0) {
      // (a) somebody with spare quota who does not hold this course yet
      let taker = states.find(st => st.quotaLeft > 0 && !st.courseIds.has(c.courseId) && !blockedSet.has(`${st.f.facultyId}|${c.courseId}`));
      if (taker) { giveSeat(taker, c.courseId, {source: 'fill', rank: null}); continue; }
      // (b) swap: an assignment elsewhere moves to somebody with spare quota,
      //     and its old owner takes the uncovered lead seat instead.
      let done = false;
      const rankOfSource = a => a.source === 'fill' ? 0 : a.source === 'continuity' ? 1 : 2 + (a.rank || 0);
      for (const x of [...states].reverse()) {
        if (x.courseIds.has(c.courseId) || blockedSet.has(`${x.f.facultyId}|${c.courseId}`)) continue;
        const options = x.assigned.map((a, i) => ({a, i})).filter(o => o.a.source !== 'locked').sort((p, q) => rankOfSource(p.a) - rankOfSource(q.a));
        for (const {a: old} of options) {
          // A preferred seat may only move to somebody of equal or higher priority,
          // so the repair pass can never undo the designation priority rule.
          const y = states.find(st => st !== x && st.quotaLeft > 0 && !st.courseIds.has(old.courseId) && !blockedSet.has(`${st.f.facultyId}|${old.courseId}`)
            && (old.source !== 'preference' || st.tier <= x.tier));
          if (!y) continue;
          const idx = x.assigned.indexOf(old);
          x.assigned.splice(idx, 1);
          x.courseIds.delete(old.courseId); x.hours -= old.hours; x.quotaLeft += 1; quotaLeftTotal += 1;
          free.get(old.courseId).unshift({sectionId: old.baseSectionId, allocSectionId: old.sectionId, role: old.role, isLead: old.role !== 'co'});
          if (old.role !== 'co') { leadsFree.set(old.courseId, leadsFree.get(old.courseId) + 1); leadsFreeTotal += 1; }
          giveSeat(x, c.courseId, {source: 'fill', rank: null});
          giveSeat(y, old.courseId, {source: 'fill', rank: null});
          done = true; break;
        }
        if (done) break;
      }
      if (!done) break;
    }
  }

  // ---- 3. output ----
  const assignments = [];
  const facultySummary = [];
  for (const st of states) {
    const status = workloadStatus({hours: st.hours, min: st.min, max: st.max});
    facultySummary.push({
      facultyId: st.f.facultyId, name: st.f.name, designation: st.f.designation, tier: st.tier,
      quota: st.quota, assignedCount: st.assigned.length, hours: st.hours, min: st.min, max: st.max, status
    });
    const inRange = st.hours >= st.min && (!st.max || st.hours <= st.max);
    for (const a of st.assigned) {
      if (a.source === 'locked') continue;
      const course = courseMap.get(a.courseId);
      let score = a.source === 'preference' ? (PREF_SCORE[Math.min(a.rank, 5) - 1] ?? 15) : 0;
      if (st.taught.has(a.courseId)) score += 25;
      if (inRange) score += 15;
      score = Math.max(0, Math.min(100, score));
      const parts = [];
      parts.push(a.source === 'preference' ? `Faculty preference #${a.rank}` : a.source === 'continuity' ? 'Auto-assigned: taught this course previously' : 'Auto-assigned to complete course coverage / workload');
      if (st.taught.has(a.courseId) && a.source === 'preference') parts.push('taught previously');
      parts.push(`${TIER_LABELS[st.tier]} priority (tier ${st.tier})`);
      parts.push(`${a.hours} h/week`);
      assignments.push({
        facultyId: st.f.facultyId, facultyName: st.f.name, designation: st.f.designation,
        courseId: a.courseId, courseName: course.courseName, courseYear: course.year, program: course.program,
        sectionId: a.sectionId, role: a.role, hours: a.hours,
        preferenceRank: a.source === 'preference' ? a.rank : null,
        source: a.source, priorityTier: st.tier, score,
        reason: parts.join(' · ')
      });
    }
  }

  // ---- conflicts: courses where somebody's wanted seat was taken ----
  const holdersOf = new Map();
  for (const st of states) for (const a of st.assigned) {
    if (!holdersOf.has(a.courseId)) holdersOf.set(a.courseId, []);
    holdersOf.get(a.courseId).push(st);
  }
  const conflicts = [];
  for (const [courseId, denied] of denials) {
    const course = courseMap.get(courseId);
    const holders = holdersOf.get(courseId) || [];
    const byTier = t => holders.filter(h => h.tier === t).length;
    const deniedStates = [...denied.keys()].map(id => stateById.get(id)).filter(Boolean)
      .sort((a, b) => a.tier - b.tier || String(a.f.facultyId).localeCompare(String(b.f.facultyId)));
    const names = deniedStates.slice(0, 8).map(s => `${s.f.name} (${s.f.facultyId}, ${TIER_LABELS[s.tier]})`).join('; ');
    const more = deniedStates.length > 8 ? ` and ${deniedStates.length - 8} more` : '';
    const seats = seatsTotal.get(courseId);
    conflicts.push({
      conflictId: `AUTO-${courseId}`,
      severity: deniedStates.length >= 10 ? 'HIGH' : 'MEDIUM',
      type: 'Course seat conflict',
      courseId, courseName: course.courseName,
      facultyIds: deniedStates.map(s => s.f.facultyId),
      facultyNames: deniedStates.map(s => s.f.name),
      description: `${holders.length + deniedStates.length} faculty wanted ${course.courseName} but only ${seats} seat${seats === 1 ? '' : 's'} exist (${(course.sections || []).length} sections). `
        + `Seats were awarded by priority: ${byTier(1)} Professor, ${byTier(2)} Associate Professor, ${byTier(3)} Assistant Professor, ${byTier(4)} other. `
        + `Not awarded and moved to their next preference: ${names}${more}.`,
      status: 'resolved',
      resolution: 'Resolved automatically by designation priority (Professor > Associate Professor > Assistant Professor > others).'
    });
  }

  // ---- gaps ----
  const uncovered = [];
  for (const c of courses) {
    const n = leadsFree.get(c.courseId) || 0;
    if (n > 0) uncovered.push({courseId: c.courseId, courseName: c.courseName, sectionsWithoutInstructor: n});
  }
  const counts = {professor: 0, associate: 0, assistant: 0, other: 0};
  facultySummary.forEach(f => { counts[['professor', 'associate', 'assistant', 'other'][f.tier - 1]]++; });
  const stats = {
    faculty: states.length,
    assignments: assignments.length,
    lockedKept: locked.length,
    fromPreference: assignments.filter(a => a.source === 'preference').length,
    autoFilled: assignments.filter(a => a.source !== 'preference').length,
    conflictsResolved: conflicts.length,
    sectionsWithoutInstructor: uncovered.reduce((n, u) => n + u.sectionsWithoutInstructor, 0),
    facultyBelowQuota: facultySummary.filter(f => f.assignedCount < f.quota).length,
    overloaded: facultySummary.filter(f => f.status === 'overloaded').length,
    underloaded: facultySummary.filter(f => f.status === 'underloaded').length,
    balanced: facultySummary.filter(f => f.status === 'balanced').length,
    byTier: counts
  };
  return {assignments, conflicts, uncovered, facultySummary, stats};
}
