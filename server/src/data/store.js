import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import Faculty from '../models/Faculty.js';
import Course from '../models/Course.js';
import Allocation from '../models/Allocation.js';
import mongoose from 'mongoose';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const DATA_DIR=path.resolve(__dirname,'../../data');
const dbReady=()=>mongoose.connection.readyState===1;
const csv=(name)=>XLSX.utils.sheet_to_json(XLSX.readFile(path.join(DATA_DIR,name),{raw:false}).Sheets[XLSX.readFile(path.join(DATA_DIR,name),{raw:false}).SheetNames[0]],{defval:''});

let loaded=false;
let faculty=[]; let courses=[]; let requests=[]; let history=[]; let workloads=[]; let expertise=[]; let offerings=[]; let sections=[];

function num(v,d=0){const n=Number(v); return Number.isFinite(n)?n:d;}
function bool(v){return String(v).toLowerCase()==='true'||v===true||v==='1';}
function loadCsvData(){
  if(loaded)return;
  const people=csv('person.csv');
  const depts=csv('department.csv');
  const personById=new Map(people.map(x=>[x.person_id,x]));
  const deptById=new Map(depts.map(x=>[x.department_id,x]));
  workloads=csv('faculty_workload.csv');
  expertise=csv('faculty_expertise.csv');
  sections=csv('section.csv');
  offerings=csv('course_offering.csv');
  const courseVersions=csv('course_version.csv');
  const courseByVersion=new Map();
  for(const x of courseVersions) courseByVersion.set(x.course_version_id,x);

  const rawFaculty=csv('faculty.csv');
  faculty=rawFaculty.map(f=>{
    const p=personById.get(f.person_id)||{};
    const d=deptById.get(f.department_id)||{};
    const ex=expertise.filter(e=>e.faculty_id===f.faculty_id).map(e=>e.area).filter(Boolean);
    const w=workloads.find(x=>x.faculty_id===f.faculty_id)||{};
    return {
      facultyId:f.employee_no || f.faculty_id,
      sourceFacultyId:f.faculty_id,
      name:p.full_name || f.employee_no,
      email:p.email||'', department:d.department_code||d.name||f.department_id,
      departmentId:f.department_id, designation:f.designation, cadre:f.cadre,
      employmentType:f.employment_type, qualifications:f.highest_qualification?[f.highest_qualification]:[],
      highestQualification:f.highest_qualification, isPhdHolder:bool(f.is_phd_holder),
      expertise:[...new Set(ex)], specializations:[...new Set(ex)],
      currentWorkload:num(w.total_weighted_load), maxWorkload:18,
      workloadStatus:w.status||'WITHIN_NORM', availability:[], preferences:[], status:String(f.status||'ACTIVE').toLowerCase()
    };
  });
  const facultyBySource=new Map(faculty.map(f=>[f.sourceFacultyId,f]));
  const rawCourses=csv('course.csv');
  const rawSections=sections;
  const offeringByCourse=new Map();
  for(const o of offerings){
    const cv=courseByVersion.get(o.course_version_id); if(!cv)continue;
    const arr=offeringByCourse.get(cv.course_id)||[]; arr.push(o); offeringByCourse.set(cv.course_id,arr);
  }
  courses=rawCourses.map(c=>{
    const dept=deptById.get(c.owning_department_id)||{};
    const versions=courseVersions.filter(v=>v.course_id===c.course_id);
    const first=versions[0]||{};
    const offs=offeringByCourse.get(c.course_id)||[];
    const secs=offs.map(o=>rawSections.find(s=>s.section_id===o.section_id)).filter(Boolean);
    const required=[];
    const title=String(c.title||'');
    const keywordMap={
      'machine learning':['Machine Learning'],'deep learning':['Deep Learning'],'database':['Databases'],'data mining':['Data Mining'],
      'cloud':['Cloud Computing'],'cyber':['Cyber Security'],'network':['Networks'],'artificial intelligence':['AI'],
      'natural language':['NLP'],'computer vision':['Computer Vision'],'embedded':['Embedded Systems'],'power systems':['Power Systems'],
      'control systems':['Control Systems'],'thermodynamics':['Thermodynamics'],'cad/cam':['CAD/CAM'],'structural':['Structural Engineering'],
      'business analytics':['Business Analytics'],'management':['Management'],'programming':['Programming'],'data structures':['Data Structures']
    };
    const low=title.toLowerCase(); for(const [k,v] of Object.entries(keywordMap))if(low.includes(k))required.push(...v);
    return {courseId:c.course_code||c.course_id, sourceCourseId:c.course_id, courseCode:c.course_code||c.course_id, courseName:c.title,
      department:dept.department_code||dept.name||c.owning_department_id, departmentId:c.owning_department_id,
      credits:num(first.credits,3), theoryHours:num(first.lecture_hours), labHours:num(first.practical_hours), tutorialHours:num(first.tutorial_hours),
      requiredExpertise:[...new Set(required)], requiredQualification:['M.Tech'],
      sections:secs.map(s=>({sectionId:s.section_id,sectionName:s.code,studentCount:num(s.strength),hoursPerWeek:num(first.lecture_hours)+num(first.practical_hours)+num(first.tutorial_hours)})),
      studentStrength:secs.reduce((a,s)=>a+num(s?.strength),0), status:String(c.is_active).toLowerCase()==='true'?'open':'inactive'};
  });
  const courseBySource=new Map(courses.map(c=>[c.sourceCourseId,c]));
  const rawCandidates=csv('faculty_allocation_candidates.csv');
  requests=rawCandidates.map((r,i)=>{
    const f=facultyBySource.get(r.faculty_id);
    const o=offerings.find(x=>x.course_offering_id===r.course_offering_id);
    const cv=o?courseByVersion.get(o.course_version_id):null;
    const c=cv?courseBySource.get(cv.course_id):null;
    return {_id:r.candidate_id||`csv-request-${i+1}`,facultyId:f?.facultyId||r.faculty_id,sourceFacultyId:r.faculty_id,
      courseId:c?.courseId||cv?.course_code||cv?.course_id||r.course_offering_id,sourceCourseId:cv?.course_id||'',courseOfferingId:r.course_offering_id,
      sectionId:o?.section_id||'',preferenceRank:num(r.preference_rank,1),recommendationScore:Math.round(num(r.match_score)*100),
      matchScore:num(r.match_score),expertiseMatch:num(r.expertise_match),workloadFit:num(r.workload_fit),availabilityFit:num(r.availability_fit),
      preferenceFit:num(r.preference_fit),conflictRisk:num(r.conflict_risk),proposedByAgent:bool(r.proposed_by_agent),
      recommendationReason:'Matched against verified faculty expertise and workload data from the college-aligned dataset.',
      status:String(r.status||'PENDING_REVIEW').toLowerCase()==='pending_review'?'pending':String(r.status||'pending').toLowerCase()};
  });
  // The CSV is the source of truth in CSV mode. If a candidate row is malformed, keep it visible rather than dropping it.
  requests=requests.filter(Boolean);
  loaded=true;
  console.log(`CSV dataset loaded: ${faculty.length} faculty, ${courses.length} courses, ${requests.length} allocation requests.`);
}

loadCsvData();

export const memoryRequests=requests;
export async function allFaculty(){if(dbReady())return Faculty.find({status:{$ne:'inactive'}}).lean(); loadCsvData(); return faculty.filter(f=>f.status!=='inactive');}
export async function findFaculty(id){if(dbReady())return Faculty.findOne({$or:[{facultyId:id},{employeeNo:id}]}).lean(); loadCsvData(); return faculty.find(f=>f.facultyId===id||f.sourceFacultyId===id);}
export async function searchFaculty(q){loadCsvData();const s=String(q||'').toLowerCase();return (await allFaculty()).filter(f=>[f.facultyId,f.sourceFacultyId,f.name,f.department,...f.expertise,...f.specializations].join(' ').toLowerCase().includes(s)).slice(0,25);}
export async function allCourses(){if(dbReady())return Course.find({status:'open'}).lean(); loadCsvData(); return courses.filter(c=>c.status!=='inactive');}
export async function findCourse(id){if(dbReady())return Course.findOne({$or:[{courseId:id},{courseCode:id}]}).lean(); loadCsvData(); return courses.find(c=>c.courseId===id||c.courseCode===id||c.sourceCourseId===id);}
export async function searchCourses(q){loadCsvData();const s=String(q||'').toLowerCase();return (await allCourses()).filter(c=>[c.courseId,c.courseCode,c.sourceCourseId,c.courseName,c.department,...c.requiredExpertise].join(' ').toLowerCase().includes(s)).slice(0,25);}
export async function courseRequests(courseId){if(dbReady())return Allocation.find({courseId,status:{$in:['pending','recommended']}}).lean(); loadCsvData(); return requests.filter(r=>String(r.courseId).toLowerCase()===String(courseId).toLowerCase()&&['pending','recommended'].includes(r.status));}
export async function pendingAllocations(){if(dbReady())return Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean(); loadCsvData(); return requests.filter(r=>['pending','recommended'].includes(r.status));}
export async function allRequests(){if(dbReady())return Allocation.find().sort({createdAt:-1}).lean(); loadCsvData(); return requests;}
export async function decideMemoryAllocation(id,status,patch={}){loadCsvData();const item=requests.find(r=>r._id===id);if(!item)return null;Object.assign(item,{status,...patch});return item;}
export async function addMemoryRequest(item){loadCsvData();requests.unshift(item);return item;}
export async function facultyHistory(facultyId){return historyFor(facultyId);}
function historyFor(facultyId){
  // The provided large dataset has no teaching-history table, so use an empty verified history rather than inventing one.
  return [];
}
export async function pendingConflicts(){loadCsvData();const map=new Map();for(const r of requests.filter(x=>['pending','recommended'].includes(x.status))){const key=r.courseId;const arr=map.get(key)||[];arr.push(r);map.set(key,arr);}const out=[];for(const [courseId,rs] of map){if(rs.length>1){const c=await findCourse(courseId);out.push({courseId,courseName:c?.courseName||courseId,count:rs.length,requests:rs});}}return out;}
export function getCsvStats(){loadCsvData();return {faculty:faculty.length,courses:courses.length,requests:requests.length,pendingReview:requests.filter(r=>['pending','recommended'].includes(r.status)).length,reviewed:requests.filter(r=>!['pending','recommended'].includes(r.status)).length};}
