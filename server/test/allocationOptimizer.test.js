// Tests for the whole-semester optimizer: it should never assign a course
// to a candidate carrying a hard violation (including "on leave"), never
// push a faculty member over capacity, and report gaps honestly.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const STORE_PATH = new URL('../src/data/store.js', import.meta.url).href;
const SCORE_PATH = new URL('../src/tools/allocationTools.js', import.meta.url).href;

test('a faculty member with a hard violation (e.g. on leave) is never assigned, even as top scorer', async (t) => {
  const pending = [
    { _id: 'a1', facultyId: 'F_ON_LEAVE', courseId: 'C1' },
    { _id: 'a2', facultyId: 'F_OK', courseId: 'C1' }
  ];
  const courses = [{ courseId: 'C1', courseName: 'Cloud Computing', credits: 4 }];
  const facultyByI = {
    F_ON_LEAVE: { facultyId: 'F_ON_LEAVE', maxWorkload: 18, currentWorkload: 0 },
    F_OK: { facultyId: 'F_OK', maxWorkload: 18, currentWorkload: 0 }
  };

  t.mock.module(STORE_PATH, {
    namedExports: {
      pendingAllocations: async () => pending,
      allCourses: async () => courses,
      findFaculty: async (id) => facultyByI[id],
      hoursForCourse: (course) => Number(course?.credits) || 3
    }
  });

  t.mock.module(SCORE_PATH, {
    namedExports: {
      // F_ON_LEAVE scores much higher but carries a hard violation; F_OK is
      // the only real eligible candidate and must be the one assigned.
      calculateRecommendationScore: async (facultyId, courseId) => {
        if (facultyId === 'F_ON_LEAVE') {
          return { facultyId, courseId, score: 95, breakdown: {}, hardViolations: ['faculty is on leave/sabbatical'] };
        }
        return { facultyId, courseId, score: 60, breakdown: {}, hardViolations: [] };
      }
    }
  });

  const { optimizeSemesterAllocation } = await import('../src/services/allocationOptimizer.js?onleave-excluded');
  const result = await optimizeSemesterAllocation({});

  assert.equal(result.coursesAllocated, 1);
  assert.equal(result.draftAllocations[0].facultyId, 'F_OK');
  assert.ok(!result.draftAllocations.some(a => a.facultyId === 'F_ON_LEAVE'));
});

test('a course with no eligible candidate at all is reported in gap analysis, not silently dropped', async (t) => {
  const pending = [{ _id: 'a1', facultyId: 'F_ON_LEAVE', courseId: 'C1' }];
  const courses = [{ courseId: 'C1', courseName: 'Cloud Computing', credits: 4 }];

  t.mock.module(STORE_PATH, {
    namedExports: {
      pendingAllocations: async () => pending,
      allCourses: async () => courses,
      findFaculty: async () => ({ maxWorkload: 18, currentWorkload: 0 }),
      hoursForCourse: (course) => Number(course?.credits) || 3
    }
  });

  t.mock.module(SCORE_PATH, {
    namedExports: {
      calculateRecommendationScore: async (facultyId, courseId) => ({
        facultyId, courseId, score: 95, breakdown: {}, hardViolations: ['faculty is on leave/sabbatical']
      })
    }
  });

  const { optimizeSemesterAllocation } = await import('../src/services/allocationOptimizer.js?gap-analysis');
  const result = await optimizeSemesterAllocation({});

  assert.equal(result.coursesAllocated, 0);
  assert.equal(result.coursesUnallocated, 1);
  assert.equal(result.gapAnalysis[0].courseId, 'C1');
  assert.match(result.gapAnalysis[0].reason, /hard constraint/);
});

test('capacity is respected: a faculty member is not double-booked past their remaining workload', async (t) => {
  // Faculty has room for exactly one 4-credit course (maxWorkload 18, currentWorkload 14 -> 4 hrs free).
  const pending = [
    { _id: 'a1', facultyId: 'F1', courseId: 'C1' },
    { _id: 'a2', facultyId: 'F1', courseId: 'C2' }
  ];
  const courses = [
    { courseId: 'C1', courseName: 'Course One', credits: 4 },
    { courseId: 'C2', courseName: 'Course Two', credits: 4 }
  ];

  t.mock.module(STORE_PATH, {
    namedExports: {
      pendingAllocations: async () => pending,
      allCourses: async () => courses,
      findFaculty: async () => ({ maxWorkload: 18, currentWorkload: 14 }),
      hoursForCourse: (course) => Number(course?.credits) || 3
    }
  });

  t.mock.module(SCORE_PATH, {
    namedExports: {
      calculateRecommendationScore: async (facultyId, courseId) => ({
        facultyId, courseId, score: 80, breakdown: {}, hardViolations: []
      })
    }
  });

  const { optimizeSemesterAllocation } = await import('../src/services/allocationOptimizer.js?capacity');
  const result = await optimizeSemesterAllocation({});

  assert.equal(result.coursesAllocated, 1);
  assert.equal(result.coursesUnallocated, 1);
});
