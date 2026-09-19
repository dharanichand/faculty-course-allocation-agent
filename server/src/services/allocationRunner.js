import Faculty from '../models/Faculty.js';
import Course from '../models/Course.js';
import Allocation from '../models/Allocation.js';
import Conflict from '../models/Conflict.js';
import AuditLog from '../models/AuditLog.js';
import {runAutoAllocation} from './autoAllocator.js';

// Loads everything from MongoDB, runs the automatic allocator and (unless
// dryRun) replaces the still-undecided proposals with the new ones.
//  * approved allocations are LOCKED: they keep their seat and count towards quotas
//  * rejected (faculty, course) pairs are never proposed again
//  * pending / recommended rows are replaced
export async function runAndPersistAutoAllocation({actor = 'system', actorRole = 'system', dryRun = false} = {}) {
  const [faculty, courses, approved, rejected] = await Promise.all([
    Faculty.find({status: {$ne: 'inactive'}}).lean(),
    Course.find({status: {$ne: 'inactive'}}).lean(),
    Allocation.find({status: 'approved'}).lean(),
    Allocation.find({status: 'rejected'}).select('facultyId courseId').lean()
  ]);
  if (!faculty.length || !courses.length) {
    throw new Error('No faculty or courses found. Import the dataset first (npm run import:workload).');
  }
  const result = runAutoAllocation({
    faculty, courses,
    locked: approved.map(a => ({facultyId: a.facultyId, courseId: a.courseId, sectionId: a.sectionId})),
    blocked: rejected.map(a => ({facultyId: a.facultyId, courseId: a.courseId}))
  });
  const summary = {
    generatedAt: new Date().toISOString(), dryRun, stats: result.stats,
    uncovered: result.uncovered, conflicts: result.conflicts.map(c => ({courseId: c.courseId, courseName: c.courseName, description: c.description, severity: c.severity}))
  };
  if (dryRun) return {...summary, sample: result.assignments.slice(0, 20)};

  const courseById = new Map(courses.map(c => [c.courseId, c]));
  await Allocation.deleteMany({status: {$in: ['pending', 'recommended']}});
  const docs = result.assignments.map(a => ({
    facultyId: a.facultyId, courseId: a.courseId, sectionId: a.sectionId, status: 'recommended',
    academicYear: courseById.get(a.courseId)?.academicYear || '', semester: courseById.get(a.courseId)?.semester || '',
    recommendationScore: a.score, recommendationReason: a.reason, aiFlag: a.source === 'preference' ? 'preference' : 'auto-fill',
    source: 'auto', role: a.role, hours: a.hours, preferenceRank: a.preferenceRank, priorityTier: a.priorityTier,
    courseYear: a.courseYear, facultyName: a.facultyName, designation: a.designation, courseName: a.courseName
  }));
  if (docs.length) await Allocation.insertMany(docs, {ordered: false});

  await Conflict.deleteMany({conflictId: /^AUTO-/});
  if (result.conflicts.length) await Conflict.insertMany(result.conflicts, {ordered: false});

  await AuditLog.create({
    actor: String(actor), actorRole, action: 'AUTO_ALLOCATION_RUN', entityType: 'allocation', entityId: 'batch',
    newValue: result.stats, reason: `Automatic allocation created ${docs.length} recommendation(s); ${result.conflicts.length} seat conflict(s) resolved by designation priority.`
  });
  return {...summary, created: docs.length};
}
