// What the Faculty page shows (buildWorkloadReport) must be the workload sheet:
// same courses, same sections, same hours for every faculty member.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {buildDataset} from '../src/services/datasetBuilder.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const pick = re => path.join(dir, fs.readdirSync(dir).filter(n => re.test(n))[0]);
const data = buildDataset({workloadPath: pick(/^Workload.*\.xlsx$/i), submissionsPath: pick(/^submissions.*\.xlsx$/i)});

const P = n => new URL(`../src/models/${n}.js`, import.meta.url).href;
const REPORT = new URL('../src/services/workloadReport.js', import.meta.url).href + '?t=';
const chain = rows => { const p = Promise.resolve(rows); const c = {lean: () => p, select: () => c, sort: () => c, then: (a, b) => p.then(a, b)}; return c; };

test('the Faculty page report lists exactly the sheet assignments for every faculty member', async t => {
  const allocs = data.allocations.map((a, i) => ({...a, _id: `A${i}`}));
  t.mock.module(P('Faculty'), {defaultExport: {find: () => chain(data.faculty)}});
  t.mock.module(P('Course'), {defaultExport: {find: () => chain(data.courses)}});
  t.mock.module(P('Allocation'), {defaultExport: {find: () => chain(allocs)}});
  const {buildWorkloadReport, summarizeWorkload} = await import(REPORT + 'r1');
  const rows = await buildWorkloadReport();
  assert.equal(rows.length, data.faculty.length);
  let seenRows = 0;
  for (const r of rows) {
    const mine = data.allocations.filter(a => a.facultyId === r.facultyId);
    seenRows += r.assignments.length;
    assert.equal(r.assignedRows, mine.length, r.name);
    assert.equal(r.assignedHours, mine.reduce((n, a) => n + a.hours, 0), r.name);
    assert.equal(r.assignedCount, new Set(mine.map(a => a.courseId)).size, r.name);
    const shown = r.assignments.map(a => `${a.sheetRow}|${a.courseName}|${a.sectionLabel}|${a.hours}`).sort();
    const expected = mine.map(a => `${a.sheetRow}|${a.courseName}|${a.sectionLabel}|${a.hours}`).sort();
    assert.deepEqual(shown, expected, r.name);
    assert.ok(r.assignments.every(a => a.status === 'approved'));
  }
  assert.equal(seenRows, data.allocations.length);
  const s = summarizeWorkload(rows);
  assert.equal(s.faculty, data.faculty.length);
  assert.equal(s.unassigned, data.summary.facultyWithoutAssignments.length);
});
