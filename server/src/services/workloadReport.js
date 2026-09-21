import Faculty from '../models/Faculty.js';
import Course from '../models/Course.js';
import Allocation from '../models/Allocation.js';
import {workloadStatus, TIER_LABELS, UNDERLOAD_FACTOR} from './autoAllocator.js';

// Which "year section" of the Faculty page a course belongs to.
// B.Tech I/II/III -> 1/2/3.  B.Tech IV and every M.Tech course -> '4' (Final year & M.Tech).
export function yearGroupOf(course) {
  if (!course) return null;
  if (String(course.program || '').startsWith('M')) return '4';
  return ({I: '1', II: '2', III: '3', IV: '4'})[course.year] || null;
}

const COUNTED = ['approved', 'recommended'];

// One row per active faculty member with their assigned courses, weekly hours
// and workload status (overloaded / underloaded / balanced). Single source of
// truth for the Faculty page, dashboard chart, reports and the AI agent.
export async function buildWorkloadReport({includeInactive = false} = {}) {
  const [faculty, courses, allocs] = await Promise.all([
    Faculty.find(includeInactive ? {} : {status: {$ne: 'inactive'}}).sort({name: 1}).lean(),
    Course.find({}).lean(),
    Allocation.find({status: {$in: COUNTED}}).lean()
  ]);
  const courseById = new Map(courses.map(c => [c.courseId, c]));
  const byFaculty = new Map();
  for (const a of allocs) {
    if (!byFaculty.has(a.facultyId)) byFaculty.set(a.facultyId, []);
    byFaculty.get(a.facultyId).push(a);
  }
  return faculty.map(f => {
    const mine = (byFaculty.get(f.facultyId) || []).map(a => {
      const c = courseById.get(a.courseId);
      return {
        allocationId: String(a._id), courseId: a.courseId, courseName: c?.courseName || a.courseName || a.courseId,
        shortName: c?.shortName || '', sectionId: a.sectionId || '', sectionLabel: a.sectionLabel || '', role: a.role || '',
        students: a.students ?? null, sheetRow: a.sheetRow ?? null,
        hours: Number(a.hours) || Number(c?.hoursPerSection) || 0, status: a.status,
        year: c?.year || a.courseYear || '', program: c?.program || '', yearGroup: yearGroupOf(c),
        preferenceRank: a.preferenceRank ?? null
      };
    });
    const hours = mine.reduce((n, a) => n + a.hours, 0);
    const max = Number(f.prescribedMax) || Number(f.maxWorkload) || 18;
    const min = Number(f.prescribedMin) || Number(f.minWorkload) || 0;
    const status = workloadStatus({hours, min, max, onLeave: !!f.onLeave});
    return {
      ...f,
      tierLabel: TIER_LABELS[f.priorityTier] || 'Other faculty',
      // assignedCount = distinct COURSES (a faculty member with 3 sections of Machine
      // Learning teaches one course); assignedRows = individual section assignments.
      assignedCount: new Set(mine.map(a => a.courseId)).size, assignedRows: mine.length, assignedHours: hours,
      prescribedMin: min, prescribedMax: max,
      workloadStatus: status,
      belowPrescribedMin: !f.onLeave && min > 0 && hours < min,
      hoursDelta: hours > max ? hours - max : hours < min ? hours - min : 0,
      yearGroups: [...new Set(mine.map(a => a.yearGroup).filter(Boolean))].sort(),
      assignments: mine.sort((a, b) => a.courseName.localeCompare(b.courseName) || (a.sheetRow ?? 0) - (b.sheetRow ?? 0) || a.sectionId.localeCompare(b.sectionId))
    };
  });
}

export function summarizeWorkload(rows) {
  const by = s => rows.filter(r => r.workloadStatus === s).length;
  return {
    faculty: rows.length, overloaded: by('overloaded'), underloaded: by('underloaded'), balanced: by('balanced'),
    onLeave: by('on_leave'), unassigned: rows.filter(r => !r.assignedCount).length,
    underloadRule: `below ${Math.round(UNDERLOAD_FACTOR * 100)}% of the prescribed minimum weekly hours`
  };
}
