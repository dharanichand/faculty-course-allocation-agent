// Database glue: the runner must replace only undecided rows, keep approved
// ones, and the workload report must flag overloaded / very-low faculty.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDesignation} from '../src/services/designationPolicy.js';

const P = n => new URL(`../src/models/${n}.js`, import.meta.url).href;
const RUNNER = new URL('../src/services/allocationRunner.js', import.meta.url).href + '?t=';
const REPORT = new URL('../src/services/workloadReport.js', import.meta.url).href + '?t=';

const chain = data => { const p = Promise.resolve(data); const c = {lean: () => p, select: () => c, sort: () => c, then: (a, b) => p.then(a, b)}; return c; };

const mkF = (id, des, prefs) => { const d = normalizeDesignation(des); return {facultyId: id, name: `Name ${id}`, designation: d.designation, priorityTier: d.tier, courseQuota: d.quota, prescribedMin: d.prescribedMin, prescribedMax: d.prescribedMax, preferences: prefs.map((c, i) => ({courseId: c, rank: i + 1})), previousCourseIds: [], status: 'active'}; };
const courses = [
  {courseId: 'A', courseName: 'Alpha', program: 'B. Tech.', year: 'II', hoursPerSection: 6, instructorsPerSection: 1, academicYear: '2026-27', semester: 'I', sections: [1, 2, 3, 4].map(n => ({sectionId: `A-S0${n}`}))},
  {courseId: 'B', courseName: 'Beta', program: 'B. Tech.', year: 'III', hoursPerSection: 5, instructorsPerSection: 1, academicYear: '2026-27', semester: 'I', sections: [1, 2, 3].map(n => ({sectionId: `B-S0${n}`}))}
];

function setup(t, store) {
  const model = (rows, extra = {}) => ({
    find: q => chain(rows(q)), deleteMany: async q => { store.deleted.push(q); }, insertMany: async d => { store.inserted.push(...d); return d; },
    create: async d => { store.audit.push(d); return d; }, ...extra
  });
  t.mock.module(P('Faculty'), {defaultExport: model(() => store.faculty)});
  t.mock.module(P('Course'), {defaultExport: model(() => courses)});
  t.mock.module(P('Allocation'), {defaultExport: model(q => q?.status === 'approved' ? store.approved : q?.status === 'rejected' ? [] : q?.status ? store.counted : []), deleteMany: async q => { store.deleted.push(q); }});
  t.mock.module(P('Conflict'), {defaultExport: model(() => [])});
  t.mock.module(P('AuditLog'), {defaultExport: model(() => [])});
}

test('runner replaces pending/recommended rows only and keeps approved ones locked', async t => {
  const store = {faculty: [mkF('F1', 'Assistant Professor', ['A', 'B']), mkF('F2', 'Professor', ['A'])], approved: [{facultyId: 'F1', courseId: 'A', sectionId: 'A-S01', status: 'approved'}], deleted: [], inserted: [], audit: [], counted: []};
  setup(t, store);
  const {runAndPersistAutoAllocation} = await import(RUNNER + 'runner1');
  const res = await runAndPersistAutoAllocation({actor: 'hod1', actorRole: 'hod'});
  assert.deepEqual(store.deleted[0], {status: {$in: ['pending', 'recommended']}});
  assert.ok(res.created > 0);
  assert.ok(store.inserted.every(d => d.status === 'recommended' && d.source === 'auto' && d.facultyName));
  assert.ok(!store.inserted.some(d => d.courseId === 'A' && d.sectionId === 'A-S01'), 'approved seat is not issued again');
  assert.equal(store.inserted.filter(d => d.facultyId === 'F2').length, 1, 'Professor gets exactly one course');
  assert.equal(store.audit.at(-1).action, 'AUTO_ALLOCATION_RUN');
});

test('dry run writes nothing', async t => {
  const store = {faculty: [mkF('F1', 'Assistant Professor', ['A'])], approved: [], deleted: [], inserted: [], audit: [], counted: []};
  setup(t, store);
  const {runAndPersistAutoAllocation} = await import(RUNNER + 'runner2');
  const res = await runAndPersistAutoAllocation({dryRun: true});
  assert.equal(res.dryRun, true);
  assert.equal(store.deleted.length, 0);
  assert.equal(store.inserted.length, 0);
});

test('workload report flags overloaded and very-low faculty and groups courses by year', async t => {
  const store = {
    faculty: [mkF('OVER', 'Professor', []), mkF('LOW', 'Assistant Professor', []), mkF('OK', 'Assistant Professor', [])],
    approved: [], deleted: [], inserted: [], audit: [],
    counted: [
      {facultyId: 'OVER', courseId: 'A', sectionId: 'A-S01', hours: 6, status: 'approved'}, {facultyId: 'OVER', courseId: 'B', sectionId: 'B-S01', hours: 5, status: 'recommended'},   // 11h > 8h
      {facultyId: 'LOW', courseId: 'B', sectionId: 'B-S02', hours: 5, status: 'recommended'},                                                                                            // 5h < 16
      {facultyId: 'OK', courseId: 'A', sectionId: 'A-S02', hours: 6, status: 'approved'}, {facultyId: 'OK', courseId: 'A', sectionId: 'A-S03', hours: 6, status: 'approved'}, {facultyId: 'OK', courseId: 'B', sectionId: 'B-S03', hours: 5, status: 'approved'}   // 17h
    ]
  };
  setup(t, store);
  const {buildWorkloadReport, summarizeWorkload} = await import(REPORT + 'report1');
  const rows = await buildWorkloadReport();
  const by = id => rows.find(r => r.facultyId === id);
  assert.equal(by('OVER').workloadStatus, 'overloaded');
  assert.equal(by('LOW').workloadStatus, 'underloaded');
  assert.equal(by('OK').workloadStatus, 'balanced');
  assert.deepEqual(by('OVER').yearGroups, ['2', '3']);
  assert.equal(by('OVER').assignedHours, 11);
  const s = summarizeWorkload(rows);
  assert.deepEqual([s.overloaded, s.underloaded, s.balanced], [1, 1, 1]);
});
