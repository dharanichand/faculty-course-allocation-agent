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