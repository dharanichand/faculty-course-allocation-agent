// Builds the dataset from the real spreadsheets shipped in server/data and
// checks the rules the department asked for - above all that the assignments
// held by the application are exactly the ones printed in the workload sheet.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {buildDataset, personKey} from '../src/services/datasetBuilder.js';
import {verifyAllocations, readSheetRows} from '../src/services/datasetVerifier.js';
import {runAutoAllocation} from '../src/services/autoAllocator.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const only = re => {
  const m = fs.readdirSync(dir).filter(n => re.test(n));
  assert.equal(m.length, 1, `exactly one file must match ${re} in server/data (found ${m.join(', ') || 'none'})`);
  return path.join(dir, m[0]);
};
const workloadPath = only(/^Workload.*\.xlsx$/i);
const submissionsPath = only(/^submissions.*\.xlsx$/i);
const data = buildDataset({workloadPath, submissionsPath});
const facultyByName = re => data.faculty.find(f => re.test(f.name));
const allocsOf = f => data.allocations.filter(a => a.facultyId === f.facultyId);

test('the assignments in the application are EXACTLY the Faculty WL sheet, row for row', () => {
  const check = verifyAllocations({workloadPath, allocations: data.allocations, faculty: data.faculty, courses: data.courses});
  assert.deepEqual(check.problems, []);
  assert.equal(check.allocations, check.sheetRows);
  assert.equal(check.allocationHours, check.sheetHours);
  assert.ok(check.sheetRows > 500, 'sheet rows were actually read');
});

test('the verifier really catches errors (it is not a rubber stamp)', () => {
  const base = {workloadPath, faculty: data.faculty, courses: data.courses};
  const tweak = fn => { const a = data.allocations.map(x => ({...x})); fn(a); return verifyAllocations({...base, allocations: a}); };
  assert.ok(tweak(a => { a[0].hours += 1; }).problems.length > 0, 'changed hours');
  assert.ok(tweak(a => { a.pop(); }).problems.length > 0, 'missing allocation');
  assert.ok(tweak(a => { a.push({...a[0]}); }).problems.length > 0, 'duplicated allocation');
  assert.ok(tweak(a => { a[3].sectionLabel = '99'; }).problems.length > 0, 'wrong section');
  assert.ok(tweak(a => { const other = data.courses.find(c => c.courseId !== a[5].courseId && c.courseName !== a[5].courseName); a[5].courseId = other.courseId; }).problems.length > 0, 'wrong course');
});

test('faculty roster is the union of both files and nobody is duplicated', () => {
  const {summary, faculty} = data;
  assert.equal(faculty.length, summary.inBothFiles + summary.workloadOnly + summary.submissionsOnly);
  assert.equal(new Set(faculty.map(f => f.facultyId)).size, faculty.length, 'faculty ids are unique');
  assert.equal(new Set(faculty.map(f => personKey(f.name))).size, faculty.length, 'no person appears twice under two employee numbers');
  assert.equal(faculty.filter(f => f.inWorkloadSheet).length, new Set(readSheetRows(workloadPath).map(r => r.sl)).size + summary.facultyWithoutAssignments.filter(x => faculty.find(f => `${f.facultyId} ${f.name}` === x)?.inWorkloadSheet).length);
  assert.equal(summary.submittedPreferences + summary.workloadAssignedPreferences + summary.noPreferenceData, faculty.length);
});

test('people whose employee number differs between the files are merged, keeping the workload sheet number', () => {
  const p = facultyByName(/Munipalli Veerendra/);      // 03372 in the workload sheet, 30874 on the form
  assert.equal(p.facultyId, '03372');
  assert.equal(p.submissionEmployeeNo, '30874');
  assert.equal(p.preferenceSource, 'submitted');
  assert.ok(allocsOf(p).length > 0, 'keeps the assignments of the workload sheet');
  assert.ok(data.summary.matchedByNameWithDifferentEmployeeNo >= 27);
});

test('a duplicated employee number in the workload sheet is repaired (Shareefunnisa -> 01238)', () => {
  const s = facultyByName(/Shareefunnisa/i);
  const b = data.faculty.find(f => /Bhargavi/i.test(f.name) && f.facultyId === '01201');
  assert.equal(s.facultyId, '01238');
  assert.ok(b);
});

test('faculty who submitted keep their submitted ranking; faculty who did not get their assigned courses as preferences', () => {
  for (const f of data.faculty) {
    assert.equal(new Set(f.preferences.map(p => p.courseId)).size, f.preferences.length, 'distinct preference courses');
    assert.ok(['submitted', 'workload', 'none'].includes(f.preferenceSource));
    if (f.inSubmissionsSheet && f.preferenceSource !== 'submitted') assert.fail(`${f.name} filed a submission but it was not used`);
    if (f.preferenceSource === 'submitted') assert.ok(f.preferences.length >= 1);
    if (f.preferenceSource === 'workload') {
      const assigned = [...new Set(allocsOf(f).map(a => a.courseId))];
      assert.deepEqual(f.preferences.map(p => p.courseId), assigned, `${f.name}: preferences must be exactly the assigned courses`);
      assert.deepEqual(f.preferences.map(p => p.rank), assigned.map((_, i) => i + 1));
    }
    if (f.preferenceSource === 'none') { assert.equal(allocsOf(f).length, 0); assert.equal(f.preferences.length, 0); }
  }
  // people who are in the workload sheet with courses but not on the form
  const notSubmitted = data.faculty.filter(f => f.inWorkloadSheet && !f.inSubmissionsSheet && allocsOf(f).length);
  assert.ok(notSubmitted.length > 0);
  assert.ok(notSubmitted.every(f => f.preferenceSource === 'workload'));
});

test('spot checks against the sheet (values read by hand from the workbook)', () => {
  const hod = facultyByName(/Phani Kumar/);                       // Faculty WL rows 9-10
  assert.deepEqual(allocsOf(hod).map(a => [a.courseName, a.sectionLabel, a.hours, a.students]), [['Machine Learning', '7', 6, 70], ['Machine Learning', '13', 6, 71]]);
  assert.equal(hod.designation, 'Professor');
  assert.deepEqual([hod.prescribedMin, hod.prescribedMax], [6, 8]);
  const sarvani = facultyByName(/Neeli Sarvani/);                 // several sections on one row
  assert.deepEqual(allocsOf(sarvani).map(a => [a.courseName, a.sectionLabel, a.hours]), [['Computing Ethics', '1,3,18,22', 8], ['Computing Ethics', '4,5,7,9,21', 10]]);
  assert.deepEqual(allocsOf(sarvani)[0].sectionNumbers, [1, 3, 18, 22]);
  const mounika = facultyByName(/Mounika/);                       // branch batches ("EEE") and a CAP
  assert.equal(mounika.designation, 'CAP');
  assert.deepEqual([mounika.prescribedMin, mounika.prescribedMax], [12, 12]);
  assert.deepEqual(allocsOf(mounika).map(a => a.sectionLabel), ['EEE', 'Chem', '10']);
  const kokila = facultyByName(/Kokila/);                         // M.Tech + B.Tech mix
  assert.deepEqual(allocsOf(kokila).map(a => [a.courseName, a.hours]), [['Internet of Things', 3], ['Computer Vision', 6], ['Computer Vision', 6]]);
  const ramanjaneyulu = facultyByName(/Ramanjaneyulu/);           // in the sheet but nothing assigned
  assert.equal(allocsOf(ramanjaneyulu).length, 0);
  assert.equal(ramanjaneyulu.preferenceSource, 'none');
  const amaresh = facultyByName(/Amaresh/);                       // only on the form
  assert.equal(amaresh.inWorkloadSheet, false);
  assert.equal(allocsOf(amaresh).length, 0);
  assert.ok(amaresh.preferences.length >= 4);
  assert.equal(new Set(data.faculty.map(f => f.designation)).has('Teaching Associate'), true);
});

test('every faculty stored workload equals the sum of their sheet rows; sheet-stated totals that disagree are reported', () => {
  for (const f of data.faculty) assert.equal(f.currentWorkload, allocsOf(f).reduce((n, a) => n + a.hours, 0), f.name);
  const bad = data.summary.sheetTotalMismatches.map(m => m.name.trim());
  assert.ok(bad.some(n => /Yuvana/.test(n)), 'Yuvana: sheet says 18 h, rows add up to 14 h');
});

test('courses the workload sheet uses but the course list omits are added, so no assignment is lost', () => {
  const ids = new Set(data.courses.map(c => c.courseId));
  for (const a of data.allocations) assert.ok(ids.has(a.courseId), `${a.courseId} exists`);
  for (const n of ['Digital Logic Design', 'NPTEL']) assert.ok(data.courses.some(c => c.courseName === n), n);
  assert.equal(new Set(data.courses.map(c => c.courseId)).size, data.courses.length);
});

test('dataset build is reproducible (same files in, same records out)', () => {
  const again = buildDataset({workloadPath, submissionsPath});
  assert.deepEqual(again.faculty, data.faculty);
  assert.deepEqual(again.allocations, data.allocations);
  assert.deepEqual(again.courses, data.courses);
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

test('the sheet\'s own prescribed weekly hours are used (6-8 / 12-14 / 16-18 / 12)', () => {
  const seen = new Set(data.faculty.filter(f => f.sheetPrescribed).map(f => f.sheetPrescribed));
  for (const s of ['6-8', '12-14', '16-18', '12']) assert.ok(seen.has(s), s);
  for (const f of data.faculty.filter(f => f.sheetPrescribed)) {
    const [lo, hi] = f.sheetPrescribed.split('-').map(Number);
    assert.deepEqual([f.prescribedMin, f.prescribedMax], [lo, hi ?? lo], f.name);
  }
});

test('re-running the automatic allocator on top of the sheet assignments never hands out a locked section twice', () => {
  const locked = data.allocations.map(a => ({facultyId: a.facultyId, courseId: a.courseId, sectionId: a.sectionId}));
  const r = runAutoAllocation({faculty: data.faculty, courses: data.courses, locked});
  assert.equal(r.stats.lockedKept, data.allocations.length);
  const held = new Set(data.allocations.map(a => `${a.facultyId}|${a.courseId}`));
  for (const a of r.assignments) assert.ok(!held.has(`${a.facultyId}|${a.courseId}`), 'nobody gets a course they already teach');
});

test('a fresh automatic allocation (no sheet rows locked) still fills every quota and covers every section', () => {
  const r = runAutoAllocation({faculty: data.faculty, courses: data.courses});
  for (const s of r.facultySummary) assert.equal(s.assignedCount, s.quota, `${s.name} (${s.facultyId})`);
  assert.equal(r.uncovered.length, 0);
  // Only the CAPs (fixed 12 h/week but a 3-course quota) can exceed their prescribed hours.
  assert.ok(r.facultySummary.filter(s => s.status === 'overloaded').every(s => s.designation === 'CAP'));
  const seen = new Set();
  for (const a of r.assignments) { const k = `${a.facultyId}|${a.courseId}`; assert.ok(!seen.has(k)); seen.add(k); }
  const seats = new Set();
  for (const a of r.assignments) { const k = `${a.courseId}|${a.sectionId}`; assert.ok(!seats.has(k)); seats.add(k); }
});
