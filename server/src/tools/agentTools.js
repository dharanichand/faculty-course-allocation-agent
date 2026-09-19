import {
  findFaculty,
  searchFaculty,
  findCourse,
  searchCourses,
  courseRequests,
  facultyHistory,
  pendingConflicts
} from '../data/store.js';

import {
  calculateRecommendationScore
} from './allocationTools.js';

import {
  optimizeSemesterAllocation
} from '../services/allocationOptimizer.js';

import { buildWorkloadReport, summarizeWorkload } from '../services/workloadReport.js';
import { runAndPersistAutoAllocation } from '../services/allocationRunner.js';


// ======================================================
// GROQ / OPENAI-COMPATIBLE TOOL DEFINITIONS
// ======================================================

export const toolDefinitions = [

  {
    type: 'function',

    function: {
      name: 'search_faculty',

      description:
        'Find faculty by name, ID, expertise, specialization, or keyword.',

      parameters: {
        type: 'object',

        properties: {
          query: {
            type: 'string',
            description:
              'Faculty name, ID, expertise, specialization, or keyword.'
          }
        },

        required: ['query'],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'get_faculty_profile',

      description:
        'Retrieve verified faculty profile, qualifications, expertise, workload, availability and preferences.',

      parameters: {
        type: 'object',

        properties: {
          facultyId: {
            type: 'string',
            description:
              'Faculty ID such as F001.'
          }
        },

        required: ['facultyId'],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'search_courses',

      description:
        'Find courses by name, code, ID, or expertise.',

      parameters: {
        type: 'object',

        properties: {
          query: {
            type: 'string',
            description:
              'Course name, course code, ID, or related expertise.'
          }
        },

        required: ['query'],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'get_course_details',

      description:
        'Retrieve verified course requirements, sections, hours and student strength.',

      parameters: {
        type: 'object',

        properties: {
          courseId: {
            type: 'string',
            description:
              'Course ID such as CSE501.'
          }
        },

        required: ['courseId'],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'get_course_requests',

      description:
        'Retrieve faculty requests for a course and determine whether multiple faculty members requested it.',

      parameters: {
        type: 'object',

        properties: {
          courseId: {
            type: 'string',
            description:
              'Course ID such as CSE501.'
          }
        },

        required: ['courseId'],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'get_teaching_history',

      description:
        'Retrieve verified previous teaching history and feedback for a faculty member.',

      parameters: {
        type: 'object',

        properties: {
          facultyId: {
            type: 'string',
            description:
              'Faculty ID such as F001.'
          }
        },

        required: ['facultyId'],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'calculate_recommendation_score',

      description:
        'Run deterministic backend scoring for a faculty-course pair. Never invent or alter this score.',

      parameters: {
        type: 'object',

        properties: {
          facultyId: {
            type: 'string',
            description:
              'Faculty ID such as F001.'
          },

          courseId: {
            type: 'string',
            description:
              'Course ID such as CSE501.'
          }
        },

        required: [
          'facultyId',
          'courseId'
        ],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'analyze_course',

      description:
        'Analyze a course by retrieving all requesting faculty, calculating deterministic scores, identifying hard violations and selecting the strongest eligible candidate.',

      parameters: {
        type: 'object',

        properties: {
          courseId: {
            type: 'string',
            description:
              'Course ID such as CSE501.'
          }
        },

        required: ['courseId'],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'list_pending_conflicts',

      description:
        'List courses with multiple faculty requests that require HOD review.',

      parameters: {
        type: 'object',

        properties: {},

        required: [],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'get_gap_analysis',

      description:
        'Run the semester-wide allocation optimizer read-only and return only the courses that currently have no viable faculty (no requester, or every requester fails a hard constraint or is out of workload capacity), with reasons. Does not modify the database.',

      parameters: {
        type: 'object',

        properties: {
          academicYear: { type: 'string', description: 'Optional academic year filter, e.g. 2026-27.' },
          semester: { type: 'string', description: 'Optional semester filter, e.g. I or II.' },
          department: { type: 'string', description: 'Optional department filter, e.g. CSE.' }
        },

        required: [],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'run_semester_optimization',

      description:
        'Run the semester-wide allocation optimizer: solves every pending course together (not one at a time) so faculty workload caps are respected across courses, and returns a draft allocation plus a gap analysis of unallocated courses. This is a proposal only and never modifies the database - the HOD must apply it separately.',

      parameters: {
        type: 'object',

        properties: {
          academicYear: { type: 'string', description: 'Optional academic year filter, e.g. 2026-27.' },
          semester: { type: 'string', description: 'Optional semester filter, e.g. I or II.' },
          department: { type: 'string', description: 'Optional department filter, e.g. CSE.' }
        },

        required: [],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'get_workload_flags',

      description:
        'List faculty whose assigned weekly teaching hours are above their prescribed maximum (overloaded) or clearly below their prescribed minimum (very low / underloaded), with names, IDs, designations, hours and assigned courses. Read-only.',

      parameters: {
        type: 'object',

        properties: {
          status: { type: 'string', enum: ['overloaded', 'underloaded', 'both'], description: 'Which group to list. Defaults to both.' }
        },

        required: [],

        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'preview_auto_allocation',

      description:
        'Dry-run the automatic allocator (Professor 1 course, Associate Professor 2, others 3; conflicts resolved Professor > Associate > Assistant > others) and report the statistics. This tool MUST NOT modify the database; the HOD applies a real run with the Start Allocation button.',

      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  },


  {
    type: 'function',

    function: {
      name: 'what_if_assignment',

      description:
        'Simulate assigning a faculty member to a course. This tool MUST NOT modify the database.',

      parameters: {
        type: 'object',

        properties: {
          facultyId: {
            type: 'string',
            description:
              'Faculty ID such as F001.'
          },

          courseId: {
            type: 'string',
            description:
              'Course ID such as CSE501.'
          }
        },

        required: [
          'facultyId',
          'courseId'
        ],

        additionalProperties: false
      }
    }
  }

];


// ======================================================
// TOOL FUNCTIONS
// ======================================================

export const toolFns = {
  get_workload_flags: async ({ status = 'both' } = {}) => {
    const rows = await buildWorkloadReport();
    const pick = rows.filter(r => status === 'both' ? ['overloaded', 'underloaded'].includes(r.workloadStatus) : r.workloadStatus === status);
    return {
      summary: summarizeWorkload(rows),
      faculty: pick.map(r => ({
        facultyId: r.facultyId, name: r.name, designation: r.designation, status: r.workloadStatus,
        assignedHours: r.assignedHours, prescribedMin: r.prescribedMin, prescribedMax: r.prescribedMax,
        courses: r.assignments.map(a => `${a.courseName} ${a.sectionId}`)
      }))
    };
  },

  preview_auto_allocation: async () => runAndPersistAutoAllocation({ dryRun: true }),


  // ----------------------------------------------------
  // SEARCH FACULTY
  // ----------------------------------------------------

  search_faculty: async ({ query }) => {
    return searchFaculty(query);
  },


  // ----------------------------------------------------
  // FACULTY PROFILE
  // ----------------------------------------------------

  get_faculty_profile: async ({ facultyId }) => {
    return findFaculty(facultyId);
  },


  // ----------------------------------------------------
  // SEARCH COURSES
  // ----------------------------------------------------

  search_courses: async ({ query }) => {
    return searchCourses(query);
  },


  // ----------------------------------------------------
  // COURSE DETAILS
  // ----------------------------------------------------

  get_course_details: async ({ courseId }) => {
    return findCourse(courseId);
  },


  // ----------------------------------------------------
  // COURSE REQUESTS
  // ----------------------------------------------------

  get_course_requests: async ({ courseId }) => {
    return courseRequests(courseId);
  },


  // ----------------------------------------------------
  // TEACHING HISTORY
  // ----------------------------------------------------

  get_teaching_history: async ({ facultyId }) => {
    return facultyHistory(facultyId);
  },


  // ----------------------------------------------------
  // RECOMMENDATION SCORE
  // ----------------------------------------------------

  calculate_recommendation_score: async ({
    facultyId,
    courseId
  }) => {

    return calculateRecommendationScore(
      facultyId,
      courseId
    );

  },


  // ----------------------------------------------------
  // COURSE ANALYSIS
  // ----------------------------------------------------

  analyze_course: async ({ courseId }) => {

    const course =
      await findCourse(courseId);

    const requests =
      await courseRequests(courseId);

    const candidates = [];


    for (const request of requests) {

      const score =
        await calculateRecommendationScore(
          request.facultyId,
          courseId
        );

      candidates.push(score);
    }


    candidates.sort(
      (a, b) => b.score - a.score
    );


    const eligible =
      candidates.filter(
        candidate =>
          !candidate.hardViolations ||
          candidate.hardViolations.length === 0
      );


    return {

      course,

      requestCount:
        requests.length,

      requests,

      candidates,

      recommendation:
        eligible[0] || null,

      requiresHodReview:
        requests.length > 1 ||
        eligible.length === 0

    };

  },


  // ----------------------------------------------------
  // PENDING CONFLICTS
  // ----------------------------------------------------

  list_pending_conflicts: async () => {

    return pendingConflicts();

  },


  // ----------------------------------------------------
  // GAP ANALYSIS (read-only slice of the semester optimizer)
  // ----------------------------------------------------

  get_gap_analysis: async ({ academicYear, semester, department } = {}) => {

    const result = await optimizeSemesterAllocation({ academicYear, semester, department });

    return {
      scope: result.scope,
      coursesConsidered: result.coursesConsidered,
      coursesUnallocated: result.coursesUnallocated,
      gapAnalysis: result.gapAnalysis
    };

  },


  // ----------------------------------------------------
  // SEMESTER-WIDE OPTIMIZATION (proposal only, never writes to the DB)
  // ----------------------------------------------------

  run_semester_optimization: async ({ academicYear, semester, department } = {}) => {

    return optimizeSemesterAllocation({ academicYear, semester, department });

  },


  // ----------------------------------------------------
  // WHAT-IF SIMULATION
  // ----------------------------------------------------

  what_if_assignment: async ({
    facultyId,
    courseId
  }) => {

    const score =
      await calculateRecommendationScore(
        facultyId,
        courseId
      );


    return {

      simulation: true,

      databaseModified: false,

      facultyId,

      courseId,

      proposedScore:
        score.score,

      breakdown:
        score.breakdown,

      verified:
        score.verified,

      hardViolations:
        score.hardViolations,

      impact:
        score.hardViolations?.length
          ? 'Assignment would create a hard constraint violation.'
          : 'No hard constraint violation detected in this simulation.'

    };

  }

};