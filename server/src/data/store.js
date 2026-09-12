import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Faculty from '../models/Faculty.js';
import Course from '../models/Course.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const dbReady = () => mongoose.connection.readyState === 1 && process.env.DATA_SOURCE === 'mongodb';

function csv(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    return Object.fromEntries(headers.map((h,i) => [h, cols[i] ?? '']));
  });
}

const peopleRows = csv('person.csv');
const deptRows = csv('department.csv');
const facultyRows = csv('faculty.csv');
const expertiseRows = csv('faculty_expertise.csv');
const courseRows = csv('course.csv');
const versionRows = csv('course_version.csv');
const sectionRows = csv('section.csv');
const offeringRows = csv('course_offering.csv');
const workloadRows = csv('faculty_workload.csv');
const candidateRows = csv('faculty_allocation_candidates.csv');

const deptById = new Map(deptRows.map(x => [x.department_id, x.department_code]));
const personById = new Map(peopleRows.map(x => [x.person_id, x]));
const expertiseByFaculty = new Map();
for (const x of expertiseRows) {
  if (!expertiseByFaculty.has(x.faculty_id)) expertiseByFaculty.set(x.faculty_id, []);
  expertiseByFaculty.get(x.faculty_id).push(x.area);
}
const workloadByFaculty = new Map(workloadRows.map(x => [x.faculty_id, x]));
const versionById = new Map(versionRows.map(x => [x.course_version_id, x]));
const sectionById = new Map(sectionRows.map(x => [x.section_id, x]));
const courseById = new Map(courseRows.map(x => [x.course_id, x]));
const offeringById = new Map(offeringRows.map(x => [x.course_offering_id, x]));

function number(v, fallback=0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function requiredExpertise(title='') {
  const t = title.toLowerCase();
  const rules = [
    ['machine learning','Machine Learning'],['deep learning','Deep Learning'],['artificial intelligence','Artificial Intelligence'],
    ['natural language','Natural Language Processing'],['data mining','Data Mining'],['database','Database Systems'],
    ['cloud','Cloud Computing'],['cyber','Cyber Security'],['network','Networks'],['embedded','Embedded Systems'],
    ['vlsi','VLSI'],['power','Power Systems'],['control','Control Systems'],['thermodynamic','Thermodynamics'],
    ['cad','CAD/CAM'],['structural','Structural Engineering'],['business analytics','Business Analytics'],
    ['management','Management'],['programming','Programming'],['data structure','Data Structures'],
    ['computer vision','Computer Vision'],['web','Web Technologies'],['operating systems','Operating Systems']
  ];
  const found = rules.filter(([k]) => t.includes(k)).map(([,v]) => v);
  return found.length ? [found[0]] : ['Programming'];
}

function normalizeFaculty(row) {
  const person = personById.get(row.person_id) || {};
  const expertise = expertiseByFaculty.get(row.faculty_id) || [];
  const workload = workloadByFaculty.get(row.faculty_id) || {};
  const q = row.highest_qualification || '';
  const qualifications = row.is_phd_holder === 'true' || row.is_phd_holder === true
    ? ['Ph.D', q].filter(Boolean)
    : [q || 'M.Tech'];
  const current = number(workload.total_weighted_load);
  const max = 18;
  return {
    facultyId: row.faculty_id,
    name: person.full_name || row.employee_no,
    department: deptById.get(row.department_id) || row.department_id,
    designation: row.designation || 'Assistant Professor',
    qualifications: [...new Set(qualifications)],
    specializations: expertise.slice(0,5),
    expertise,
    maxWorkload: max,
    currentWorkload: current,
    availability: [],
    preferences: [],
    status: String(row.status || 'ACTIVE').toLowerCase() === 'active' ? 'active' : 'inactive',
    employeeNo: row.employee_no
  };
}

function normalizeCourse(row) {
  const versions = versionRows.filter(v => v.course_id === row.course_id);
  const relevant = versions[0] || {};
  const sections = offeringRows
    .filter(o => o.course_version_id && versions.some(v => v.course_version_id === o.course_version_id))
    .map(o => sectionById.get(o.section_id))
    .filter(Boolean)
    .reduce((acc,s) => {
      if (!acc.some(x => x.sectionId === s.section_id)) {
        acc.push({sectionId:s.section_id, sectionName:s.code, studentCount:number(s.strength), hoursPerWeek:0});
      }
      return acc;
    }, []);
  const hours = number(relevant.lecture_hours) + number(relevant.tutorial_hours) + number(relevant.practical_hours);
  const studentStrength = sections.length ? Math.max(...sections.map(s => s.studentCount)) : 0;
  return {
    courseId: row.course_id,
    courseCode: row.course_code,
    courseName: row.title,
    department: deptById.get(row.owning_department_id) || row.owning_department_id,
    credits: number(relevant.credits,3),
    theoryHours: number(relevant.lecture_hours),
    labHours: number(relevant.practical_hours),
    tutorialHours: number(relevant.tutorial_hours),
    requiredExpertise: requiredExpertise(row.title),
    requiredQualification: ['M.Tech'],
    sections: sections.length ? sections : [{sectionId:`${row.course_code}-A`,sectionName:'A',studentCount:studentStrength,hoursPerWeek:hours}],
    studentStrength,
    status: 'open'
  };
}

const fileFaculty = facultyRows.map(normalizeFaculty);
const fileCourses = courseRows.map(normalizeCourse);

export const memoryFaculty = fileFaculty.length ? fileFaculty : [];
export const memoryCourses = fileCourses.length ? fileCourses : [];

// Compatibility exports for existing routes/pages.
export const memoryRequests = candidateRows.map((r,i) => {
  const offering = offeringById.get(r.course_offering_id) || {};
  const version = versionById.get(offering.course_version_id) || {};
  const course = courseById.get(version.course_id);
  return {
    _id: r.candidate_id || `dataset-request-${i+1}`,
    facultyId: r.faculty_id,
    courseId: course?.course_id || version.course_id || '',
    sectionId: offering.section_id || '',
    preferenceRank: Math.max(1, Math.min(5, i % 5 + 1)),
    status: String(r.status || 'PENDING_REVIEW').toLowerCase() === 'pending_review' ? 'pending' : String(r.status || 'pending').toLowerCase(),
    recommendationScore: Math.round(number(r.match_score) * 100),
    recommendationReason: `Agent candidate score ${Math.round(number(r.match_score)*100)}/100 using expertise, workload, availability, preference and conflict-risk signals.`,
    proposedByAgent: true
  };
});

const autoConflicts = memoryCourses.map(c => {
  const count = memoryRequests.filter(r => r.courseId === c.courseId && ['pending','recommended'].includes(r.status)).length;
  return count > 1 ? {
    conflictId: `AUTO-${c.courseCode}`,
    severity: count >= 4 ? 'HIGH' : 'MEDIUM',
    type: 'Multiple faculty requests',
    courseId: c.courseId,
    courseName: c.courseName,
    facultyIds: [...new Set(memoryRequests.filter(r => r.courseId === c.courseId && ['pending','recommended'].includes(r.status)).map(r => r.facultyId))].slice(0,10),
    facultyNames: [...new Set(memoryRequests.filter(r => r.courseId === c.courseId && ['pending','recommended'].includes(r.status)).map(r => memoryFaculty.find(f => f.facultyId === r.facultyId)?.name || r.facultyId))].slice(0,10),
    description: `${count} pending allocation candidates exist for this course. The agent can rank them, but final selection requires HOD review.`,
    status: 'open'
  } : null;
}).filter(Boolean);
export const memory = { faculty: memoryFaculty, courses: memoryCourses, conflicts: autoConflicts };

export async function allFaculty() {
  return dbReady()
    ? Faculty.find({status:{$ne:'inactive'}}).sort({name:1}).lean()
    : memory.faculty.filter(f => f.status !== 'inactive');
}

export async function findFaculty(id) {
  const s = String(id || '').trim().toLowerCase();
  if (dbReady()) {
    return Faculty.findOne({$or:[{facultyId:id},{name:new RegExp(`^${String(id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i')}, {employeeNo:id}]}).lean();
  }
  return memory.faculty.find(f => [f.facultyId,f.employeeNo,f.name].some(v => String(v||'').toLowerCase() === s));
}

export async function searchFaculty(q) {
  const s = String(q||'').toLowerCase().trim();
  const data = await allFaculty();
  if (!s) return data.slice(0,20);
  return data.filter(f => [f.facultyId,f.employeeNo,f.name,f.department,f.designation,...(f.expertise||[]),...(f.specializations||[]),...(f.qualifications||[])].join(' ').toLowerCase().includes(s)).slice(0,20);
}

export async function allCourses() {
  return dbReady() ? Course.find({status:{$ne:'inactive'}}).sort({courseCode:1}).lean() : memory.courses.filter(c => c.status !== 'inactive');
}

function resolveCourse(id) {
  const s = String(id||'').trim().toLowerCase();
  return memory.courses.find(c => String(c.courseId).toLowerCase() === s || String(c.courseCode).toLowerCase() === s || String(c.courseName).toLowerCase() === s);
}

export async function findCourse(id) {
  if (dbReady()) {
    return Course.findOne({$or:[{courseId:id},{courseCode:id}]}).lean();
  }
  return resolveCourse(id);
}

export async function searchCourses(q) {
  const s=String(q||'').toLowerCase().trim();
  const data=await allCourses();
  if(!s) return data.slice(0,20);
  return data.filter(c => [c.courseId,c.courseCode,c.courseName,c.department,...(c.requiredExpertise||[])].join(' ').toLowerCase().includes(s)).slice(0,20);
}

function resolvedCourseId(courseId) {
  const c=resolveCourse(courseId);
  return c?.courseId || courseId;
}

export async function courseRequests(courseId) {
  if (dbReady()) return (await import('../models/Allocation.js')).default.find({$or:[{courseId},{courseCode:courseId}],status:{$in:['pending','recommended']}}).lean();
  const cid=resolvedCourseId(courseId);
  return memoryRequests.filter(r=>r.courseId===cid && ['pending','recommended'].includes(r.status));
}

export async function pendingAllocations() {
  if (dbReady()) return (await import('../models/Allocation.js')).default.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
  return memoryRequests.filter(r=>['pending','recommended'].includes(r.status));
}

export async function decideMemoryAllocation(id,status,patch={}) {
  const item=memoryRequests.find(r=>r._id===id);
  if(!item)return null;
  Object.assign(item,{status,...patch});
  return item;
}

export async function facultyHistory(facultyId) {
  if (dbReady()) return [];
  return [];
}

export async function pendingConflicts() {
  const out=[];
  for (const c of memory.courses) {
    const r=memoryRequests.filter(x=>x.courseId===c.courseId && ['pending','recommended'].includes(x.status));
    if(r.length>1) out.push({courseId:c.courseId,courseName:c.courseName,count:r.length,requests:r});
  }
  return out;
}
