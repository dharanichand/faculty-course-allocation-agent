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

export async function searchFaculty(q) {
  const s = String(q || '').toLowerCase().trim();
  const data = await allFaculty();
  if (!s) return data.slice(0, 20);
  return data.filter(f => [
    f.facultyId, f.employeeNo, f.name, f.department, f.designation,
    ...(f.expertise || []), ...(f.specializations || []), ...(f.qualifications || [])
  ].join(' ').toLowerCase().includes(s)).slice(0, 20);
}

export async function allCourses() {
  requireMongo();
  return Course.find({ status: { $ne: 'inactive' } }).sort({ courseCode: 1 }).lean();
}

export async function findCourse(id) {
  requireMongo();
  return Course.findOne({ $or: [{ courseId: id }, { courseCode: id }] }).lean();
}

export async function searchCourses(q) {
  const s = String(q || '').toLowerCase().trim();
  const data = await allCourses();
  if (!s) return data.slice(0, 20);
  return data.filter(c => [c.courseId, c.courseCode, c.courseName, c.department, ...(c.requiredExpertise || [])]
    .join(' ').toLowerCase().includes(s)).slice(0, 20);
}

export async function courseRequests(courseId) {
  requireMongo();
  return Allocation.find({
    courseId,
    status: { $in: ['pending', 'recommended'] }
  }).lean();
}

export async function pendingAllocations() {
  requireMongo();
  return Allocation.find({ status: { $in: ['pending', 'recommended'] } })
    .sort({ createdAt: 1 }).lean();
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
