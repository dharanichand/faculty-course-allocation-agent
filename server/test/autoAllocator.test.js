// Tests for the automatic allocator: quotas, designation priority, coverage
// and the workload flags.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runAutoAllocation, workloadStatus} from '../src/services/autoAllocator.js';
import {normalizeDesignation} from '../src/services/designationPolicy.js';

const mkFaculty = (id, designation, prefs = [], extra = {}) => {
  const d = normalizeDesignation(designation);
  return {
    facultyId: id, name: `Name ${id}`, designation: d.designation, priorityTier: d.tier, courseQuota: d.quota,
    prescribedMin: d.prescribedMin, prescribedMax: d.prescribedMax,
    preferences: prefs.map((c, i) => ({courseId: c, rank: i + 1})), previousCourseIds: [], ...extra
  };
};
const mkCourse = (id, sections, hours = 6, per = 1, year = 'II') => ({
  courseId: id, courseName: `Course ${id}`, program: 'B. Tech.', year, hoursPerSection: hours, instructorsPerSection: per,
  sections: Array.from({length: sections}, (_, i) => ({sectionId: `${id}-S${String(i + 1).padStart(2, '0')}`}))
});

test('designation policy: quotas and priority tiers', () => {
  assert.deepEqual(['Professor', 'Associate Professor', 'Assistant Professor', 'Assistant Professor (Contract)', 'CAP', 'Teaching Associate']
    .map(x => normalizeDesignation(x).tier), [1, 2, 3, 3, 4, 4]);
  assert.equal(normalizeDesignation('Assoc. Prof.').designation, 'Associate Professor');
  assert.equal(normalizeDesignation('Asst. Prof. (Entry level)').designation, 'Assistant Professor');
  assert.equal(normalizeDesignation('Teaching \n Associate').designation, 'Teaching Associate');
  assert.equal(normalizeDesignation('Professor').courseQuota ?? normalizeDesignation('Professor').quota, 1);
  assert.equal(normalizeDesignation('Assoc. Prof.').quota, 2);
  assert.equal(normalizeDesignation('CAP').quota, 3);
});

test('professor gets 1 course, associate 2, everyone else 3 - and nobody gets the same course twice', () => {
  const courses = ['A', 'B', 'C', 'D', 'E'].map(id => mkCourse(id, 10));
  const faculty = [
    mkFaculty('P1', 'Professor', ['A', 'B', 'C']),
    mkFaculty('AP1', 'Assoc. Prof.', ['A', 'B', 'C']),
    mkFaculty('AS1', 'Assistant Professor', ['A', 'B', 'C']),
    mkFaculty('TA1', 'Teaching Associate', ['A', 'B', 'C'])
  ];
  const r = runAutoAllocation({faculty, courses});
  const count = id => r.assignments.filter(a => a.facultyId === id).length;
  assert.deepEqual([count('P1'), count('AP1'), count('AS1'), count('TA1')], [1, 2, 3, 3]);
  for (const f of faculty) {
    const ids = r.assignments.filter(a => a.facultyId === f.facultyId).map(a => a.courseId);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('seat conflict: Professor > Associate > Assistant > others', () => {
  // ONE seat, four people who all want it as their first choice.
  const courses = [mkCourse('HOT', 1), mkCourse('OTHER', 10)];
  const faculty = [
    mkFaculty('TA', 'Teaching Associate', ['HOT', 'OTHER'], {submittedAt: '4/13/2026, 1:00:00 AM'}),
    mkFaculty('AS', 'Assistant Professor', ['HOT', 'OTHER'], {submittedAt: '4/13/2026, 2:00:00 AM'}),
    mkFaculty('AP', 'Associate Professor', ['HOT', 'OTHER'], {submittedAt: '4/14/2026, 2:00:00 AM'}),
    mkFaculty('PR', 'Professor', ['HOT', 'OTHER'], {submittedAt: '4/15/2026, 2:00:00 AM'})
  ];
  const r = runAutoAllocation({faculty, courses});
  const holder = r.assignments.filter(a => a.courseId === 'HOT').map(a => a.facultyId);
  assert.deepEqual(holder, ['PR']);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].courseId, 'HOT');
  assert.ok(r.conflicts[0].facultyIds.includes('TA') && r.conflicts[0].facultyIds.includes('AS') && r.conflicts[0].facultyIds.includes('AP'));

  // Two seats: Professor and Associate win, Assistant and others are pushed to their next choice.
  const r2 = runAutoAllocation({faculty, courses: [mkCourse('HOT', 2), mkCourse('OTHER', 10)]});
  assert.deepEqual(r2.assignments.filter(a => a.courseId === 'HOT').map(a => a.facultyId).sort(), ['AP', 'PR']);
});

test('inside one tier the earlier submission wins the contested seat', () => {
  const courses = [mkCourse('HOT', 1), mkCourse('OTHER', 10)];
  const faculty = [
    mkFaculty('LATE', 'Assistant Professor', ['HOT', 'OTHER'], {submittedAt: '4/15/2026, 9:00:00 AM'}),
    mkFaculty('EARLY', 'Assistant Professor', ['HOT', 'OTHER'], {submittedAt: '4/13/2026, 9:00:00 AM'})
  ];
  const r = runAutoAllocation({faculty, courses});
  assert.deepEqual(r.assignments.filter(a => a.courseId === 'HOT').map(a => a.facultyId), ['EARLY']);
});

test('every section gets a lead instructor before any co-instructor seat is given out', () => {
  // Everyone wants POPULAR; QUIET is nobody's choice but still has sections to cover.
  const courses = [mkCourse('POPULAR', 4, 6, 2), mkCourse('QUIET', 6, 4, 1)];
  const faculty = Array.from({length: 6}, (_, i) => mkFaculty(`F${i}`, 'Assistant Professor', ['POPULAR'], {courseQuota: 2}));
  const r = runAutoAllocation({faculty, courses});
  const leadSections = c => new Set(r.assignments.filter(a => a.courseId === c && a.role !== 'co').map(a => a.sectionId)).size;
  assert.equal(leadSections('QUIET'), 6);
  assert.equal(leadSections('POPULAR'), 4);
  assert.equal(r.uncovered.length, 0);
});

test('approved allocations stay locked and rejected pairs are never proposed again', () => {
  const courses = [mkCourse('A', 3), mkCourse('B', 3)];
  const faculty = [mkFaculty('F1', 'Assistant Professor', ['A', 'B'])];
  const first = runAutoAllocation({faculty, courses, locked: [{facultyId: 'F1', courseId: 'A', sectionId: 'A-S02'}], blocked: [{facultyId: 'F1', courseId: 'B'}]});
  assert.ok(!first.assignments.some(a => a.courseId === 'A' && a.sectionId === 'A-S02'), 'locked seat is not re-issued');
  assert.ok(!first.assignments.some(a => a.courseId === 'B'), 'rejected course is not proposed');
  assert.equal(first.stats.lockedKept, 1);
});

test('faculty on leave or inactive are never assigned', () => {
  const courses = [mkCourse('A', 5)];
  const faculty = [mkFaculty('L', 'Assistant Professor', ['A'], {onLeave: true}), mkFaculty('I', 'Assistant Professor', ['A'], {status: 'inactive'}), mkFaculty('OK', 'Assistant Professor', ['A'])];
  const r = runAutoAllocation({faculty, courses});
  assert.deepEqual([...new Set(r.assignments.map(a => a.facultyId))], ['OK']);
});

test('workload status: overloaded above the prescribed max, very low below 85% of the min', () => {
  assert.equal(workloadStatus({hours: 19, min: 16, max: 18}), 'overloaded');
  assert.equal(workloadStatus({hours: 18, min: 16, max: 18}), 'balanced');
  assert.equal(workloadStatus({hours: 14, min: 16, max: 18}), 'balanced');   // slightly under is tolerated
  assert.equal(workloadStatus({hours: 12, min: 16, max: 18}), 'underloaded');
  assert.equal(workloadStatus({hours: 0, min: 6, max: 8}), 'underloaded');
  assert.equal(workloadStatus({hours: 9, min: 6, max: 8}), 'overloaded');
  assert.equal(workloadStatus({hours: 0, min: 16, max: 18, onLeave: true}), 'on_leave');
});
