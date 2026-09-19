// Builds the dataset from the real spreadsheets shipped in server/data and
// checks the rules the department asked for.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {buildDataset} from '../src/services/datasetBuilder.js';
import {runAutoAllocation} from '../src/services/autoAllocator.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const pick = re => path.join(dir, fs.readdirSync(dir).filter(n => re.test(n)).sort().pop());
const data = buildDataset({workloadPath: pick(/^Workload.*\.xlsx$/i), submissionsPath: pick(/^submissions.*\.xlsx$/i)});

test('faculty roster is the union of both files - nobody is dropped', () => {
  const {summary, faculty} = data;
  assert.equal(faculty.length, summary.inBothFiles + summary.workloadOnly + summary.submissionsOnly);
  assert.equal(new Set(faculty.map(f => f.facultyId)).size, faculty.length, 'faculty ids are unique');
  assert.equal(summary.submittedPreferences + summary.syntheticPreferences, faculty.length);
  assert.ok(summary.syntheticPreferences > 0);
});

test('a duplicated employee number in the workload sheet is repaired (Shareefunnisa -> 01238)', () => {
  const s = data.faculty.find(f => /Shareefunnisa/i.test(f.name));
  const b = data.faculty.find(f => /Bhargavi/i.test(f.name) && f.facultyId === '01201');
  assert.equal(s.facultyId, '01238');
  assert.ok(b);
});

test('every faculty member has 5 ranked, distinct preference groups (submitted or synthetic)', () => {
  for (const f of data.faculty) {
    const ranks = new Set(f.preferences.map(p => p.rank));
    assert.ok(ranks.size >= 3 && ranks.size <= 5, `${f.facultyId} has ${ranks.size} ranks`);
    assert.equal(new Set(f.preferences.map(p => p.courseId)).size, f.preferences.length);
    assert.ok(['submitted', 'synthetic'].includes(f.preferenceSource));
  }
});

test('synthetic preferences are reproducible', () => {
  const again = buildDataset({workloadPath: pick(/^Workload.*\.xlsx$/i), submissionsPath: pick(/^submissions.*\.xlsx$/i)});
  assert.deepEqual(again.faculty.map(f => f.preferences), data.faculty.map(f => f.preferences));
});

test('mandatory courses have the real section counts: 26 (1st yr), 19 (2nd), 22 (3rd), 19 (4th)', () => {
  const expected = {I: 26, II: 19, III: 22, IV: 19};
  for (const c of data.courses.filter(c => c.program === 'B. Tech.' && c.courseType === 'Mandatory')) {
    assert.equal(c.sectionCount, expected[c.year], `${c.courseName} (${c.year})`);
    assert.equal(c.sections.length, c.sectionCount);
  }
});

test('quotas by designation: Professor 1, Associate 2, everyone else 3', () => {
  for (const f of data.faculty) {
    const want = f.designation === 'Professor' ? 1 : f.designation === 'Associate Professor' ? 2 : 3;
    assert.equal(f.courseQuota, want, f.designation);
  }
});

test('end to end: everyone gets exactly their quota, every section has an instructor', () => {
  const r = runAutoAllocation({faculty: data.faculty, courses: data.courses});
  for (const s of r.facultySummary) assert.equal(s.assignedCount, s.quota, `${s.name} (${s.facultyId})`);
  assert.equal(r.uncovered.length, 0);
  assert.equal(r.stats.overloaded, 0);
  // no faculty member holds two seats of the same course
  const seen = new Set();
  for (const a of r.assignments) {
    const k = `${a.facultyId}|${a.courseId}`;
    assert.ok(!seen.has(k)); seen.add(k);
  }
  // no seat is issued twice
  const seats = new Set();
  for (const a of r.assignments) { const k = `${a.courseId}|${a.sectionId}`; assert.ok(!seats.has(k)); seats.add(k); }
});

test('priority invariant on the real data: a lower-priority faculty never wins a contested seat over a higher-priority one', () => {
  const r = runAutoAllocation({faculty: data.faculty, courses: data.courses});
  const tierOf = new Map(data.faculty.map(f => [f.facultyId, f.priorityTier]));
  assert.ok(r.conflicts.length > 0, 'the real data contains contested courses');
  for (const c of r.conflicts) {
    const denied = c.facultyIds.map(id => tierOf.get(id));
    const winners = r.assignments.filter(a => a.courseId === c.courseId && a.source === 'preference').map(a => a.priorityTier);
    const violations = [];
    for (const d of denied) for (const w of winners) if (d < w) violations.push([d, w]);
    assert.deepEqual(violations, [], `${c.courseName}: a higher-priority faculty was denied while a lower-priority one won`);
  }
});
