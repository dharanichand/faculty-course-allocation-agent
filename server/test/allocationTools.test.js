// Tests for the core scoring function used by both the single-course agent
// flow and the whole-semester optimizer. Uses node:test's built-in module
// mocking (Node 22+, `--experimental-test-module-mocks`) to stand in for
// ../src/data/store.js so these run instantly with no live MongoDB.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const STORE_PATH = new URL('../src/data/store.js', import.meta.url).href;

const baseFaculty = {
  facultyId: 'F100',
  name: 'Dr. Test Faculty',
  qualifications: ['M.Tech CSE'],
  expertise: ['Cloud Computing'],
  publications: [],
  preferences: [],
  currentWorkload: 0,
  maxWorkload: 18,
  adminLoadHours: 0,
  status: 'active',
  onLeave: false
};

const baseCourse = {
  courseId: 'C100',
  courseName: 'Cloud Computing',
  requiredExpertise: ['Cloud Computing'],
  requiredQualification: ['M.Tech'],
  credits: 4
};

const defaultConfig = {
  weights: { expertise: 35, publication: 15, qualification: 20, preference: 15, continuity: 10, feedback: 5 },
  maxWorkload: 18
};

function mockStore(t, { faculty = baseFaculty, course = baseCourse, history = [], config = defaultConfig } = {}) {
  // Scoped to this test's mock tracker so it's automatically restored when
  // the test finishes - each test gets a clean, independent mock instead of
  // fighting over one process-wide mock registration.
  t.mock.module(STORE_PATH, {
    namedExports: {
      findFaculty: async () => faculty,
      findCourse: async () => course,
      facultyHistory: async () => history,
      getAllocationConfig: async () => config
    }
  });
}

test('a faculty member on leave is a hard violation regardless of expertise match', async (t) => {
  mockStore(t, { faculty: { ...baseFaculty, onLeave: true, leaveReason: 'Sabbatical' } });
  const { calculateRecommendationScore } = await import('../src/tools/allocationTools.js?onleave');
  const result = await calculateRecommendationScore('F100', 'C100');
  assert.ok(result.hardViolations.some(v => v.includes('unavailable') || v.includes('leave')));
});

test('an inactive faculty account is a hard violation', async (t) => {
  mockStore(t, { faculty: { ...baseFaculty, status: 'inactive' } });
  const { calculateRecommendationScore } = await import('../src/tools/allocationTools.js?inactive');
  const result = await calculateRecommendationScore('F100', 'C100');
  assert.ok(result.hardViolations.includes('faculty account is inactive'));
});

test('an active, unencumbered faculty member with full expertise match has no hard violations', async (t) => {
  mockStore(t);
  const { calculateRecommendationScore } = await import('../src/tools/allocationTools.js?active');
  const result = await calculateRecommendationScore('F100', 'C100');
  assert.deepEqual(result.hardViolations, []);
  assert.equal(result.breakdown.expertise, 35);
  assert.equal(result.breakdown.qualification, 20);
});

test('missing required qualification is a hard violation and zeroes the qualification score', async (t) => {
  mockStore(t, { faculty: { ...baseFaculty, qualifications: ['B.Tech CSE'] } });
  const { calculateRecommendationScore } = await import('../src/tools/allocationTools.js?noqual');
  const result = await calculateRecommendationScore('F100', 'C100');
  assert.ok(result.hardViolations.includes('required qualification not met'));
  assert.equal(result.breakdown.qualification, 0);
});

test('adding this course would exceed the workload cap is a hard violation', async (t) => {
  mockStore(t, { faculty: { ...baseFaculty, currentWorkload: 16, maxWorkload: 18 } });
  const { calculateRecommendationScore } = await import('../src/tools/allocationTools.js?overload');
  const result = await calculateRecommendationScore('F100', 'C100');
  assert.ok(result.hardViolations.includes('maximum workload would be exceeded'));
});

test('administrative load hours reduce effective workload capacity', async (t) => {
  // maxWorkload 18, adminLoadHours 15 -> effective cap 3; a 4-credit course tips it over.
  mockStore(t, { faculty: { ...baseFaculty, currentWorkload: 0, maxWorkload: 18, adminLoadHours: 15 } });
  const { calculateRecommendationScore } = await import('../src/tools/allocationTools.js?adminload');
  const result = await calculateRecommendationScore('F100', 'C100');
  assert.ok(result.hardViolations.includes('maximum workload would be exceeded'));
  assert.equal(result.verified.workload.max, 3);
});

test('missing faculty or course scores zero with an explicit violation', async (t) => {
  mockStore(t, { faculty: null });
  const { calculateRecommendationScore } = await import('../src/tools/allocationTools.js?missing');
  const result = await calculateRecommendationScore('F100', 'C100');
  assert.equal(result.score, 0);
  assert.deepEqual(result.hardViolations, ['missing faculty/course']);
});
