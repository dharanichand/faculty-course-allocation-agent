// Pure unit tests for computeScore() — no MongoDB connection required.
// Run with:  cd server && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore } from '../src/tools/allocationTools.js';

const config = {
  weights: { expertise: 35, publication: 15, qualification: 20, preference: 15, continuity: 10, feedback: 5 },
  maxWorkload: 18
};

function baseFaculty(overrides = {}) {
  return {
    facultyId: 'F001',
    name: 'Dr. Test Faculty',
    expertise: ['Machine Learning', 'Data Science'],
    qualifications: ['M.Tech Computer Science', 'Ph.D. AI'],
    publications: ['Machine Learning'],
    preferences: [],
    maxWorkload: 18,
    currentWorkload: 10,
    onLeave: false,
    adminLoadHours: 0,
    ...overrides
  };
}

function baseCourse(overrides = {}) {
  return {
    courseId: 'CSE501',
    courseName: 'Machine Learning',
    requiredExpertise: ['Machine Learning'],
    requiredQualification: ['M.Tech'],
    credits: 4,
    ...overrides
  };
}

test('full expertise + qualification match scores all of both weights, no hard violations', () => {
  const result = computeScore(baseFaculty(), baseCourse(), [], [], config);
  assert.equal(result.breakdown.expertise, 35);
  assert.equal(result.breakdown.qualification, 20);
  assert.deepEqual(result.hardViolations, []);
});

test('missing required qualification is a hard violation and scores zero qualification points', () => {
  const faculty = baseFaculty({ qualifications: ['B.Tech'] });
  const result = computeScore(faculty, baseCourse(), [], [], config);
  assert.equal(result.breakdown.qualification, 0);
  assert.ok(result.hardViolations.includes('required qualification not met'));
});

test('a faculty member on leave is hard-excluded regardless of how strong the match is', () => {
  const faculty = baseFaculty({ onLeave: true, leaveReason: 'Sabbatical' });
  const result = computeScore(faculty, baseCourse(), [], [], config);
  assert.ok(result.hardViolations.some(v => v.includes('on leave')));
  assert.ok(result.hardViolations[0].includes('Sabbatical') || result.hardViolations.some(v => v.includes('Sabbatical')));
  // Score itself is untouched (still reflects expertise etc.) — it's the
  // hard violation that removes them from consideration, not the score.
  assert.equal(result.breakdown.expertise, 35);
});

test('administrative load reduces effective workload capacity before the course is added', () => {
  const faculty = baseFaculty({ maxWorkload: 18, currentWorkload: 10, adminLoadHours: 6 });
  // Effective max = 18 - 6 = 12; current 10 + course load 4 = 14 > 12 -> violation.
  const result = computeScore(faculty, baseCourse({ credits: 4 }), [], [], config);
  assert.ok(result.hardViolations.includes('maximum workload would be exceeded'));
  assert.equal(result.verified.workload.max, 12);
});

test('without admin load, the same course would have fit comfortably', () => {
  const faculty = baseFaculty({ maxWorkload: 18, currentWorkload: 10, adminLoadHours: 0 });
  const result = computeScore(faculty, baseCourse({ credits: 4 }), [], [], config);
  assert.ok(!result.hardViolations.includes('maximum workload would be exceeded'));
  assert.equal(result.verified.workload.max, 18);
});

test('exceeding workload capacity is a hard violation', () => {
  const faculty = baseFaculty({ maxWorkload: 18, currentWorkload: 17 });
  const result = computeScore(faculty, baseCourse({ credits: 4 }), [], [], config);
  assert.ok(result.hardViolations.includes('maximum workload would be exceeded'));
});

test('faculty preference rank 1 scores the full preference weight', () => {
  const faculty = baseFaculty({ preferences: [{ courseId: 'CSE501', rank: 1 }] });
  const result = computeScore(faculty, baseCourse(), [], [], config);
  assert.equal(result.breakdown.preference, 15);
});

test('no preference expressed scores zero preference points', () => {
  const result = computeScore(baseFaculty(), baseCourse(), [], [], config);
  assert.equal(result.breakdown.preference, 0);
});

test('continuity: having taught the immediately preceding part of a sequence scores full continuity weight', () => {
  const history = [{ courseId: 'CSE500' }];
  const historyCourses = [{ courseId: 'CSE500', courseName: 'Machine Learning Part I' }];
  const course = baseCourse({ courseName: 'Machine Learning Part II' });
  const result = computeScore(baseFaculty(), course, history, historyCourses, config);
  assert.equal(result.breakdown.continuity, 10);
  assert.equal(result.verified.continuity.taughtPrior, true);
});

test('continuity: having taught the exact same course before scores half the continuity weight', () => {
  const history = [{ courseId: 'CSE501' }];
  const historyCourses = [{ courseId: 'CSE501', courseName: 'Machine Learning' }];
  const result = computeScore(baseFaculty(), baseCourse(), history, historyCourses, config);
  assert.equal(result.breakdown.continuity, 5);
});

test('missing faculty or course short-circuits to a zero score with an explanatory violation', () => {
  const result = computeScore(null, baseCourse(), [], [], config);
  assert.equal(result.score, 0);
  assert.deepEqual(result.hardViolations, ['missing faculty/course']);
});
