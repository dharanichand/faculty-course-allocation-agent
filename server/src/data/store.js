import mongoose from 'mongoose';
import Faculty from '../models/Faculty.js';
import Course from '../models/Course.js';
import Allocation from '../models/Allocation.js';
import Conflict from '../models/Conflict.js';

// MongoDB is the single source of truth. There is intentionally no CSV,
// XLSX, filesystem dataset, or local-memory fallback in this module.
const dbReady = () => mongoose.connection.readyState === 1;

export const memoryFaculty = [];
export const memoryCourses = [];
export const memoryRequests = [];
export const syntheticRequests = [];
export const memory = { faculty: [], courses: [], conflicts: [] };

export const defaultAllocationConfig = {
  department: 'CSE',
  weights: { expertise: 35, publication: 15, qualification: 20, preference: 15, continuity: 10, feedback: 5 },
  maxWorkload: 24
};

function requireMongo() {
  if (!dbReady()) throw new Error('MongoDB is not connected');
}

export async function getAllocationConfig(department = 'CSE') {
  requireMongo();
  const Config = (await import('../models/AllocationConfig.js')).default;
  return (await Config.findOne({ department }).lean()) || defaultAllocationConfig;
}

export async function saveAllocationConfig(input, updatedBy = '') {
  requireMongo();
  const Config = (await import('../models/AllocationConfig.js')).default;
  const config = {
    department: input.department || 'CSE',
    weights: { ...defaultAllocationConfig.weights, ...(input.weights || {}) },
    maxWorkload: Number(input.maxWorkload) || defaultAllocationConfig.maxWorkload,
    updatedBy
  };
  return Config.findOneAndUpdate(
    { department: config.department },
    { $set: config },
    { upsert: true, new: true, runValidators: true }
  ).lean();
}

export async function allFaculty() {
  requireMongo();
  return Faculty.find({ status: { $ne: 'inactive' } }).sort({ name: 1 }).lean();
}

export async function findFaculty(id) {
  requireMongo();
  const escaped = String(id || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Faculty.findOne({
    $or: [
      { facultyId: id },
      { employeeNo: id },
      { name: new RegExp(`^${escaped}$`, 'i') }
    ]
  }).lean();
}

// --------------------------------------------------------------------------
// SCALABLE SEARCH
// Previously this pulled the entire collection into Node with .find() and
// filtered it with JS .includes(), then threw away everything past 20 -
// meaning every keystroke in the faculty/course search shipped and scanned
// the whole table. At real university scale (thousands of faculty/course
// records across departments) this is the first thing that gets slow.
//
// Fix: query MongoDB directly with pagination. Try the text index first
// (fast, indexed, scales to large collections) since it covers the common
// "search by name/expertise/code word" case; if that finds nothing (e.g. an
// ID fragment or partial substring that text search's word-tokenizer won't
// match), fall back to a bounded regex query so short/partial queries still
// work. Both paths use .limit() at the DB level instead of loading
// everything and slicing in memory.
//
// Note for further scale-up: true "contains anywhere" substring search over
// millions of rows needs a trigram index (e.g. MongoDB Atlas Search) rather
// than a regex scan - the regex fallback here is fine for a
// department/college-sized dataset but is the next thing to swap out if the
// faculty table grows into the tens of thousands.
// --------------------------------------------------------------------------
export async function searchFaculty(q, { page = 1, limit = 20, department } = {}) {
  requireMongo();
  const s = String(q || '').trim();
  const base = { status: { $ne: 'inactive' }, ...(department ? { department } : {}) };
  const skip = Math.max(0, (Number(page) || 1) - 1) * (Number(limit) || 20);

  if (!s) {
    return Faculty.find(base).sort({ name: 1 }).skip(skip).limit(Number(limit) || 20).lean();
  }

  const textHits = await Faculty.find({ ...base, $text: { $search: s } })
    .select({ score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip).limit(Number(limit) || 20).lean();
  if (textHits.length) return textHits;

  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped, 'i');
  return Faculty.find({
    ...base,
    $or: [{ facultyId: rx }, { employeeNo: rx }, { name: rx }, { designation: rx }, { expertise: rx }, { specializations: rx }, { qualifications: rx }]
  }).skip(skip).limit(Number(limit) || 20).lean();
}

export async function allCourses(scope = {}) {
  requireMongo();
  const filter = { status: { $ne: 'inactive' } };
  if (scope.department) filter.department = scope.department;
  if (scope.academicYear) filter.academicYear = scope.academicYear;
  if (scope.semester) filter.semester = scope.semester;
  return Course.find(filter).sort({ courseCode: 1 }).lean();
}

export async function findCourse(id) {
  requireMongo();
  return Course.findOne({ $or: [{ courseId: id }, { courseCode: id }] }).lean();
}

// Same DB-level text-search-then-regex-fallback pattern as searchFaculty, see note above.
export async function searchCourses(q, { page = 1, limit = 20, department, academicYear, semester } = {}) {
  requireMongo();
  const s = String(q || '').trim();
  const base = { status: { $ne: 'inactive' } };
  if (department) base.department = department;
  if (academicYear) base.academicYear = academicYear;
  if (semester) base.semester = semester;
  const skip = Math.max(0, (Number(page) || 1) - 1) * (Number(limit) || 20);

  if (!s) {
    return Course.find(base).sort({ courseCode: 1 }).skip(skip).limit(Number(limit) || 20).lean();
  }

  const textHits = await Course.find({ ...base, $text: { $search: s } })
    .select({ score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip).limit(Number(limit) || 20).lean();
  if (textHits.length) return textHits;

  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped, 'i');
  return Course.find({
    ...base,
    $or: [{ courseId: rx }, { courseCode: rx }, { courseName: rx }, { department: rx }, { requiredExpertise: rx }]
  }).skip(skip).limit(Number(limit) || 20).lean();
}

// courseId/pendingAllocations now take an optional {academicYear, semester}
// scope so a semester-wide optimization run (and future terms' history) don't
// collide with each other. Omitting the scope keeps old callers working
// exactly as before, unfiltered, so nothing existing breaks.
export async function courseRequests(courseId, scope = {}) {
  requireMongo();
  const filter = { courseId, status: { $in: ['pending', 'recommended'] } };
  if (scope.academicYear) filter.academicYear = scope.academicYear;
  if (scope.semester) filter.semester = scope.semester;
  return Allocation.find(filter).lean();
}

export async function pendingAllocations(scope = {}) {
  requireMongo();
  const filter = { status: { $in: ['pending', 'recommended'] } };
  if (scope.academicYear) filter.academicYear = scope.academicYear;
  if (scope.semester) filter.semester = scope.semester;
  return Allocation.find(filter).sort({ createdAt: 1 }).lean();
}

// --------------------------------------------------------------------------
// WORKLOAD BOOKKEEPING
// Faculty.currentWorkload was being read by calculateRecommendationScore's
// hard-violation check but was never actually incremented anywhere when an
// allocation got approved. That meant the "would exceed max workload" check
// only ever saw the number a faculty record was seeded with - a faculty
// member could be auto-approved for several courses in the same run (or
// across separate runs/HOD clicks) and silently blow past their cap with no
// hard violation ever firing. These two helpers make workload state real.
// Both are best-effort (never throw) so a bookkeeping hiccup can't break an
// approval the HOD already made.
// --------------------------------------------------------------------------
export function hoursForCourse(course) {
  if (!course) return 0;
  if (Number(course.hoursPerSection)) return Number(course.hoursPerSection);
  return Number(course.credits) || ((Number(course.theoryHours) || 0) + (Number(course.tutorialHours) || 0) + (Number(course.labHours) || 0)) || 3;
}

export async function applyWorkloadDelta(facultyId, deltaHours) {
  if (!dbReady() || !facultyId || !deltaHours) return;
  try {
    await Faculty.findOneAndUpdate({ facultyId }, { $inc: { currentWorkload: deltaHours } });
  } catch (e) {
    console.error('applyWorkloadDelta failed (non-fatal):', e.message);
  }
}

// Kept for backwards compatibility with older route code. In MongoDB-only
// mode decisions are made by the route using Allocation.findByIdAndUpdate.
export async function decideMemoryAllocation() {
  throw new Error('Local-memory allocations are disabled; use MongoDB Allocation updates');
}

export async function facultyHistory(facultyId) {
  requireMongo();
  const History = mongoose.models.TeachingHistory || mongoose.model(
    'TeachingHistory',
    new mongoose.Schema({
      facultyId: String, courseId: String, academicYear: String,
      semester: String, role: String, feedbackScore: Number
    })
  );
  return History.find({ facultyId }).lean();
}

export async function pendingConflicts() {
  requireMongo();
  return Conflict.find({ status: { $ne: 'resolved' } }).sort({ createdAt: -1 }).lean();
}
