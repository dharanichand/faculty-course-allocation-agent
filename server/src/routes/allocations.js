import {Router} from 'express';
import {auth,role} from '../middleware/auth.js';
import {validate} from '../middleware/validate.js';
import {idParam,bulkIdsBody,bulkRejectBody,rejectBody,overrideBody} from '../validation/schemas.js';
import Allocation from '../models/Allocation.js';
import Faculty from '../models/Faculty.js';
import Course from '../models/Course.js';
import AuditLog from '../models/AuditLog.js';
import {pendingAllocations,decideMemoryAllocation,allFaculty,allCourses,memoryRequests,pendingConflicts,findFaculty,findCourse,applyWorkloadDelta,hoursForCourse} from '../data/store.js';
import {optimizeSemesterAllocation} from '../services/allocationOptimizer.js';
import {narrateDraftInBatches} from '../services/aiAllocation.js';
import crypto from 'crypto';
import {sendAllocationDecisionEmail,sendReassignmentEmail,sendUnassignmentEmail} from '../services/emailService.js';
import {calculateRecommendationScore} from '../tools/allocationTools.js';
import {classifyCourseAllocation} from '../services/aiAllocation.js';
import {runAndPersistAutoAllocation} from '../services/allocationRunner.js';
import {buildWorkloadReport,summarizeWorkload} from '../services/workloadReport.js';
import {TIER_LABELS} from '../services/autoAllocator.js';
import mongoose from 'mongoose';

const r=Router();
const dbReady=()=>mongoose.connection.readyState===1;

async function resolveFacultyId(user){
  if(!user || user.role!=='faculty') return String(user?.facultyId||'');
  // Prefer the normalized Faculty collection. A stale JWT may still carry an
  // old/missing facultyId, so also resolve by email/name.
  let profile=null;
  if(user.facultyId){
    profile=await findFaculty(user.facultyId);
  }
  if(!profile && user.email){
    profile=await findFaculty(user.email);
    if(!profile && dbReady()) profile=await Faculty.findOne({email:user.email}).lean();
  }
  if(!profile && user.name && dbReady()){
    const escaped=String(user.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    profile=await Faculty.findOne({name:new RegExp(`^${escaped}$`,'i')}).lean();
  }
  // Last-resort identity bridge for the large imported dataset. This maps
  // college-email/person identities to the normalized Faculty UUID used by
  // Allocation records.
  if(!profile && dbReady()){
    const rawGmail=mongoose.connection.db.collection('dataset_faculty_gmail_dataset');
    const rawPerson=mongoose.connection.db.collection('dataset_person');
    const rawFaculty=mongoose.connection.db.collection('dataset_faculty');
    let raw=null;
    if(user.email) raw=await rawGmail.findOne({email:user.email});
    if(!raw && user.email) raw=await rawPerson.findOne({email:user.email});
    if(!raw && user.name) raw=await rawGmail.findOne({faculty_name:user.name});
    if(!raw && user.name) raw=await rawPerson.findOne({full_name:user.name});
    if(raw){
      const rawFacultyId=raw.faculty_id || raw.facultyId;
      if(rawFacultyId) profile=await Faculty.findOne({facultyId:String(rawFacultyId)}).lean();
      if(!profile && raw.employee_no) profile=await Faculty.findOne({employeeNo:String(raw.employee_no)}).lean();
      if(!profile && raw.person_id){
        const fr=await rawFaculty.findOne({person_id:raw.person_id});
        if(fr?.faculty_id) profile=await Faculty.findOne({facultyId:String(fr.faculty_id)}).lean();
      }
    }
  }
  return profile?.facultyId ? String(profile.facultyId) : String(user.facultyId||'');
}

// Best-effort email notifications: allocation decisions must never fail (or be
// slowed down) because Brevo is unreachable or unconfigured, so every call is
// wrapped and errors are only logged.
async function notifyDecision(item,decision,reason=''){
 try{
  if(!item?.facultyId)return;
  const [faculty,course]=await Promise.all([findFaculty(item.facultyId),findCourse(item.courseId)]);
  if(!faculty?.email)return;
  await sendAllocationDecisionEmail({email:faculty.email,name:faculty.name,courseId:item.courseId,courseName:course?.courseName||item.courseId,decision,reason});
 }catch(e){console.error('Allocation decision email failed:',e.message);}
}

async function notifyReassignment(courseId,sectionId,previousFacultyId,newFacultyId,reason=''){
 try{
  const course=await findCourse(courseId);
  const [prevFaculty,newFaculty]=await Promise.all([
   previousFacultyId && previousFacultyId!==newFacultyId ? findFaculty(previousFacultyId) : null,
   findFaculty(newFacultyId)
  ]);
  const tasks=[];
  if(newFaculty?.email)tasks.push(sendReassignmentEmail({email:newFaculty.email,name:newFaculty.name,courseId,courseName:course?.courseName||courseId,sectionId,previousFacultyName:prevFaculty?.name||'',reason}));
  if(prevFaculty?.email)tasks.push(sendUnassignmentEmail({email:prevFaculty.email,name:prevFaculty.name,courseId,courseName:course?.courseName||courseId,newFacultyName:newFaculty?.name||'',reason}));
  await Promise.allSettled(tasks);
 }catch(e){console.error('Reassignment email failed:',e.message);}
}

// HOD review queue. Every row carries the faculty NAME and ID together (plus
// designation, priority tier, course, section and workload) so the UI never has
// to show a bare ID.
async function enrichAllocations(rows){
  const ids=[...new Set(rows.map(x=>x.facultyId).filter(Boolean))];
  const [profiles,courses,report]=await Promise.all([
   ids.length?Faculty.find({facultyId:{$in:ids}}).select('facultyId name designation priorityTier courseQuota').lean():[],
   Course.find({}).select('courseId courseName year program hoursPerSection').lean(),
   buildWorkloadReport({includeInactive:true})
  ]);
  const byFaculty=new Map(profiles.map(f=>[f.facultyId,f]));
  const byCourse=new Map(courses.map(c=>[c.courseId,c]));
  const load=new Map(report.map(f=>[f.facultyId,f]));
  return rows.map(x=>{
   const f=byFaculty.get(x.facultyId)||{},c=byCourse.get(x.courseId)||{},l=load.get(x.facultyId)||{};
   const tier=Number(x.priorityTier)||Number(f.priorityTier)||4;
   return {...x,
    facultyName:f.name||x.facultyName||'',
    designation:f.designation||x.designation||'',
    priorityTier:tier,tierLabel:TIER_LABELS[tier]||'Other faculty',
    courseName:c.courseName||x.courseName||x.courseId,
    courseYear:c.year||x.courseYear||'',program:c.program||'',
    hours:Number(x.hours)||Number(c.hoursPerSection)||0,
    facultyAssignedHours:l.assignedHours??null,facultyAssignedCount:l.assignedCount??null,
    facultyQuota:Number(f.courseQuota)||null,
    facultyPrescribedMin:l.prescribedMin??null,facultyPrescribedMax:l.prescribedMax??null,facultyWorkloadStatus:l.workloadStatus||''
   };
  });
}

// The undecided queue, enriched and sorted by priority tier -> faculty name -> course.
// Used by GET / AND by every approve/reject/override response so names never disappear.
async function remainingQueue(){
  const enriched=await enrichAllocations(await pendingAllocations());
  enriched.sort((a,b)=>a.priorityTier-b.priorityTier||String(a.facultyName).localeCompare(String(b.facultyName))||String(a.courseName).localeCompare(String(b.courseName))||String(a.sectionId).localeCompare(String(b.sectionId)));
  return enriched;
}

r.get('/',auth,async(req,res)=>{try{
  res.json(await remainingQueue());
 }catch(e){res.status(500).json({message:e.message})}});

r.get('/my',auth,async(req,res)=>{
 try{
  const target=req.user.role==='hod'||req.user.role==='dean'?String(req.query.facultyId||''):await resolveFacultyId(req.user);
  if(!target)return res.status(400).json({message:'A faculty account is required to view proposed allocations'});
  const courseList=await allCourses(); const courses=new Map(courseList.map(c=>[c.courseId,c]));
  const rows=dbReady()?await Allocation.find({facultyId:target}).sort({createdAt:-1}).lean():memoryRequests.filter(x=>x.facultyId===target);
  res.json(rows.map(item=>({
   ...item,courseName:courses.get(item.courseId)?.courseName||item.courseId,
   statusLabel:item.status==='approved'?'Approved allocation':(item.status==='pending'||item.status==='recommended')?'Recommended - pending HOD approval':'Not selected',hours:Number(item.hours)||Number(courses.get(item.courseId)?.hoursPerSection)||0,roleLabel:item.role==='co'?'Co-instructor':item.role==='lead'?'Lead instructor':'',
   justification:item.recommendationReason||item.overrideReason||'No justification has been recorded yet.'
  })));
 }catch(e){res.status(500).json({message:e.message})}
});

r.get('/notifications',auth,async(req,res)=>{
 try{
  if(req.user.role!=='faculty')return res.status(403).json({message:'Faculty access is required'});
  const facultyId=await resolveFacultyId(req.user);
  if(!facultyId)return res.status(403).json({message:'Faculty account is not linked to a Faculty profile'});
  const courses=new Map((await allCourses()).map(c=>[c.courseId,c]));
  const rows=dbReady()?await Allocation.find({facultyId}).sort({updatedAt:-1,createdAt:-1}).limit(30).lean():memoryRequests.filter(x=>x.facultyId===facultyId).slice(-30).reverse();
  res.json(rows.map(item=>({
   id:String(item._id),
   type:item.status==='approved'?'success':item.status==='rejected'?'warning':'info',
   title:item.status==='approved'?'Allocation approved':item.status==='rejected'?'Allocation update':'Review pending',
   message:item.status==='approved'?`${courses.get(item.courseId)?.courseName||item.courseId} has been approved for you.`:item.status==='rejected'?(item.overrideReason||`Your request for ${courses.get(item.courseId)?.courseName||item.courseId} was not selected.`):`Your request for ${courses.get(item.courseId)?.courseName||item.courseId} is waiting for HOD review.`,
   reason:item.recommendationReason||item.overrideReason||'',
   courseId:item.courseId,
   timestamp:item.updatedAt||item.createdAt||new Date().toISOString()
  })));
 }catch(e){res.status(500).json({message:e.message})}
});

r.get('/export',auth,role('hod','dean'),async(req,res)=>{
 try{
  const rows=dbReady()?await Allocation.find({status:'approved'}).sort({courseId:1}).lean():memoryRequests.filter(x=>x.status==='approved');
  const courses=new Map((await allCourses()).map(c=>[c.courseId,c])); const faculty=new Map((await allFaculty()).map(f=>[f.facultyId,f]));
  const data=rows.map(x=>({allocationId:String(x._id),courseId:x.courseId,courseName:courses.get(x.courseId)?.courseName||x.courseId,sectionId:x.sectionId||'',facultyId:x.facultyId,facultyName:faculty.get(x.facultyId)?.name||x.facultyId,designation:faculty.get(x.facultyId)?.designation||x.designation||'',courseYear:courses.get(x.courseId)?.year||x.courseYear||'',role:x.role||'',hours:Number(x.hours)||0,status:'approved',justification:x.recommendationReason||x.overrideReason||''}));
  if(String(req.query.format||'json').toLowerCase()==='csv'){
   const fields=['allocationId','courseId','courseName','courseYear','sectionId','role','facultyId','facultyName','designation','hours','status','justification'];
   const quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;
   const csv=[fields.join(','),...data.map(row=>fields.map(field=>quote(row[field])).join(','))].join('\n');
   res.type('text/csv').attachment('approved_allocations.csv').send(csv); return;
  }
  res.json({generatedAt:new Date().toISOString(),approvedOnly:true,allocations:data});
 }catch(e){res.status(500).json({message:e.message})}
});

r.get('/course/:courseId/candidates',auth,role('hod','dean'),async(req,res)=>{
 try{
  const rows=dbReady()?await Allocation.find({courseId:req.params.courseId,status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean():memoryRequests.filter(x=>x.courseId===req.params.courseId&&['pending','recommended'].includes(x.status));
  const candidates=await Promise.all([...new Map(rows.map(row=>[row.facultyId,row])).values()].map(row=>calculateRecommendationScore(row.facultyId,req.params.courseId)));
  candidates.sort((a,b)=>b.score-a.score);
  const closeCall=candidates.length>1&&candidates[0].score-candidates[1].score<8;
  res.json({courseId:req.params.courseId,closeCall,threshold:8,candidates});
 }catch(e){res.status(500).json({message:e.message})}
});

r.get('/dashboard',auth,async(req,res)=>{
 try{
  const [report,cs,ps]=await Promise.all([buildWorkloadReport(),allCourses(),pendingAllocations()]);
  // Average assigned hours per designation - a readable chart for 100+ faculty.
  // Ordered by real seniority (as the Faculty WL sheet's own designation
  // categories rank), not by whatever order faculty happen to load in.
  const DESIGNATION_ORDER=['Professor','Associate Professor','Assistant Professor','Assistant Professor (Contract)','Contract Faculty (Limited Load)','Teaching Associate'];
  const rankOf=name=>{const i=DESIGNATION_ORDER.indexOf(name);return i===-1?DESIGNATION_ORDER.length:i};
  const groups=new Map();
  for(const f of report){const k=f.designation||'Other';const g=groups.get(k)||{name:k,total:0,n:0,max:f.prescribedMax};g.total+=f.assignedHours;g.n++;groups.set(k,g)}
  const workload=[...groups.values()].sort((a,b)=>rankOf(a.name)-rankOf(b.name)||a.name.localeCompare(b.name)).map(g=>({name:g.name.replace('Assistant Professor','Asst. Prof.').replace('Associate Professor','Assoc. Prof.'),hours:Math.round(g.total/g.n*10)/10,max:g.max}));
  const conflicts=await pendingConflicts();
  const requestsCount=await Allocation.countDocuments({});
  const pending=(await enrichAllocations(ps.slice(0,8)));
  res.json({faculty:report.length,courses:cs.length,requests:requestsCount,pendingReview:ps.length,conflicts:conflicts.length,workload,workloadSummary:summarizeWorkload(report),pending});
 }catch(e){res.status(500).json({message:e.message})}
});

// Per-faculty workload report. ?status=overloaded|underloaded|balanced|all
r.get('/workload-report',auth,role('hod','dean'),async(req,res)=>{
 try{
  const status=String(req.query.status||'all').toLowerCase();
  const rows=await buildWorkloadReport();
  const filtered=status==='all'?rows:rows.filter(x=>x.workloadStatus===status);
  res.json({generatedAt:new Date().toISOString(),summary:summarizeWorkload(rows),status,rows:filtered.map(x=>({
   facultyId:x.facultyId,name:x.name,designation:x.designation,tierLabel:x.tierLabel,priorityTier:x.priorityTier,quota:x.courseQuota,
   assignedCount:x.assignedCount,assignedHours:x.assignedHours,prescribedMin:x.prescribedMin,prescribedMax:x.prescribedMax,
   workloadStatus:x.workloadStatus,hoursDelta:x.hoursDelta,yearGroups:x.yearGroups,
   courses:x.assignments.map(a=>`${a.courseName} ${a.sectionId}${a.role==='co'?' (co-instructor)':''} [${a.hours}h]`).join('; ')
  }))});
 }catch(e){res.status(500).json({message:e.message})}
});

// ==========================================================================
// AI-DRIVEN "Start Allocation" run.
// One button, no manual course-by-course clicking: every course that still
// has pending faculty requests is scored deterministically (calculateRecommendationScore),
// then the verified scores are handed to Groq (classifyCourseAllocation) which
// decides auto_approve vs escalate. The Groq decision is never trusted blindly -
// the backend re-checks hard violations before writing anything to the database.
// If Groq is unavailable, a local deterministic version of the same rule set
// is used so the button always finishes and nothing is left silently unprocessed.
// ==========================================================================
// AUTOMATIC ALLOCATION. One click, no manual course-by-course picking: the
// allocator (services/autoAllocator.js) reads every faculty preference, applies
// the designation quotas (Professor 1 / Associate 2 / others 3) and resolves
// conflicts by priority (Professor > Associate > Assistant > others). Results
// are stored as "recommended" for HOD review; approved rows are kept as-is.
async function handleAutoAllocate(req,res){
 try{
  const dryRun=String(req.query?.dryRun||req.body?.dryRun||'')==='true';
  const result=await runAndPersistAutoAllocation({actor:req.user?.id||'hod',actorRole:req.user?.role||'hod',dryRun});
  const remaining=dryRun?[]:await pendingAllocations();
  res.json({ok:true,...result,coursesProcessed:result.stats.assignments,remainingCount:remaining.length});
 }catch(e){res.status(500).json({message:e.message})}
}
r.post('/auto-allocate',auth,role('hod'),handleAutoAllocate);
r.post('/run-ai',auth,role('hod'),handleAutoAllocate); // legacy endpoint name used by the dashboard

// ==========================================================================
// SEMESTER-WIDE OPTIMIZATION (Agent 3 workflow steps 6-8)
//
// run-ai above still exists unchanged for reviewing/auto-deciding courses
// one at a time. This is the whole-semester version: it solves every
// pending course together as one constrained assignment (see
// services/allocationOptimizer.js) so workload caps are respected across
// courses, not just within one, and it produces the gap-analysis output the
// project spec calls for (courses with no suitable faculty) - which nothing
// in the original code generated at all.
//
// It is a PROPOSAL ONLY: nothing is written to the database until the HOD
// explicitly applies the draft via /optimize/:jobId/apply, or approves
// individual rows the normal way. This matches the guardrail already in the
// spec photo: "the optimiser proposes; a human decides."
//
// It runs as a background job (in-memory job map, no new infra/dependency)
// instead of blocking the HTTP request for the whole run - a full semester
// can mean dozens of courses and several batched LLM narration calls, and a
// synchronous multi-second/minute request is exactly the kind of thing that
// times out or feels broken on a large dataset.
// ==========================================================================
const optimizationJobs=new Map();

r.post('/optimize',auth,role('hod'),async(req,res)=>{
 const jobId=crypto.randomUUID();
 const {academicYear,semester,department}=req.body||{};
 optimizationJobs.set(jobId,{status:'running',createdAt:new Date(),scope:{academicYear,semester,department}});
 res.status(202).json({ok:true,jobId,status:'running'});

 (async()=>{
  try{
   const result=await optimizeSemesterAllocation({academicYear,semester,department});
   const narrated=await narrateDraftInBatches(result);
   optimizationJobs.set(jobId,{status:'done',createdAt:optimizationJobs.get(jobId)?.createdAt||new Date(),scope:result.scope,result:{...result,...narrated}});
  }catch(e){
   optimizationJobs.set(jobId,{status:'error',createdAt:optimizationJobs.get(jobId)?.createdAt||new Date(),error:e.message});
  }
 })();
});

r.get('/optimize/:jobId',auth,role('hod'),(req,res)=>{
 const job=optimizationJobs.get(req.params.jobId);
 if(!job)return res.status(404).json({message:'No optimization job found with that id.'});
 res.json(job);
});

// Applies some or all of a completed draft: writes the chosen allocations to
// 'approved', rejects other pending requests for the same course, updates
// workload, and logs an audit entry per row - i.e. the same effects a normal
// approve click has, just for many rows from one draft at once. Passing
// courseIds lets the HOD apply only the rows they're comfortable with and
// leave the rest for manual review, which is the "low friction override"
// guardrail from the spec: nothing here is all-or-nothing.
r.post('/optimize/:jobId/apply',auth,role('hod'),async(req,res)=>{
 try{
  const job=optimizationJobs.get(req.params.jobId);
  if(!job||job.status!=='done')return res.status(404).json({message:'No completed optimization job found with that id.'});
  const courseIds=Array.isArray(req.body?.courseIds)&&req.body.courseIds.length?new Set(req.body.courseIds):null;
  const rows=job.result.draftAllocations.filter(a=>!courseIds||courseIds.has(a.courseId));
  const applied=[];
  for(const row of rows){
   if(!row.allocationId)continue;
   if(dbReady()){
    const doc=await Allocation.findById(row.allocationId);
    if(!doc||!['pending','recommended'].includes(doc.status))continue;
    await Allocation.updateMany({courseId:row.courseId,status:{$in:['pending','recommended']}},{$set:{status:'rejected',overrideReason:'Semester optimization selected another candidate for this course.'}});
    await Allocation.findByIdAndUpdate(row.allocationId,{$set:{status:'approved',approvedBy:req.user.id,approvedAt:new Date(),recommendationScore:row.score,recommendationReason:row.justification}});
    await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'OPTIMIZER_APPLY_ALLOCATION',entityType:'allocation',entityId:String(row.allocationId),newValue:{...row,status:'approved'},reason:row.justification});
    await applyWorkloadDelta(row.facultyId,hoursForCourse(await findCourse(row.courseId)));
    notifyDecision({...doc.toObject(),facultyId:row.facultyId,courseId:row.courseId},'approved',row.justification);
    applied.push(row.courseId);
   }
  }
  const remaining=await remainingQueue();
  res.json({ok:true,applied,remaining});
 }catch(e){res.status(400).json({message:e.message})}
});

// Lightweight read-only version of the gap-analysis half of /optimize, for
// dashboards/reports that just want "what can't be covered right now"
// without needing to apply anything.
r.get('/gap-analysis',auth,role('hod','dean'),async(req,res)=>{
 try{
  const {academicYear,semester,department}=req.query||{};
  const result=await optimizeSemesterAllocation({academicYear,semester,department});
  res.json({generatedAt:result.generatedAt,scope:result.scope,coursesConsidered:result.coursesConsidered,coursesUnallocated:result.coursesUnallocated,gapAnalysis:result.gapAnalysis});
 }catch(e){res.status(500).json({message:e.message})}
});

r.post('/bulk-approve',auth,role('hod'),validate({body:bulkIdsBody}),async(req,res)=>{
 try{
  const ids=req.body.ids;
  if(dbReady()){
   const docs=await Allocation.find({_id:{$in:ids},status:{$in:['pending','recommended']}});
   if(!docs.length)return res.status(404).json({message:'No selected pending allocations found.'});
   const result=await Allocation.updateMany({_id:{$in:docs.map(x=>x._id)},status:{$in:['pending','recommended']}},{$set:{status:'approved',approvedBy:req.user.id,approvedAt:new Date()}});
   // Batched: one insert for the audit trail and one bulkWrite for workload, instead of
   // 2-3 database round-trips per row (which made "approve all" take minutes).
   await AuditLog.insertMany(docs.map(d=>({actor:req.user.id,actorRole:'hod',action:'APPROVE_ALLOCATION',entityType:'allocation',entityId:String(d._id),newValue:{...d.toObject(),status:'approved',approvedBy:req.user.id}})),{ordered:false});
   const courseIds=[...new Set(docs.map(d=>d.courseId))];
   const courseDocs=await Course.find({courseId:{$in:courseIds}}).lean();
   const hoursByCourse=new Map(courseDocs.map(c=>[c.courseId,hoursForCourse(c)]));
   const delta=new Map();
   for(const d of docs)delta.set(d.facultyId,(delta.get(d.facultyId)||0)+(Number(d.hours)||hoursByCourse.get(d.courseId)||0));
   if(delta.size)await Faculty.bulkWrite([...delta].map(([facultyId,h])=>({updateOne:{filter:{facultyId},update:{$inc:{currentWorkload:h}}}})));
   Promise.allSettled(docs.map(d=>notifyDecision(d,'approved')));
   const remaining=await remainingQueue();
   return res.json({ok:true,updated:result.modifiedCount,remaining});
  }
  let updated=0;
  const notified=[];
  for(const id of ids){
   const item=await decideMemoryAllocation(id,'approved',{approvedBy:req.user.id,approvedAt:new Date()});
   if(item){updated++;notified.push(item);}
  }
  Promise.allSettled(notified.map(item=>notifyDecision(item,'approved')));
  return res.json({ok:true,updated,remaining:await pendingAllocations()});
 }catch(e){res.status(400).json({message:e.message})}
});

r.post('/bulk-reject',auth,role('hod'),validate({body:bulkRejectBody}),async(req,res)=>{
 try{
  const ids=req.body.ids;
  const reason=req.body.reason||'Rejected in bulk by HOD';
  if(dbReady()){
   const docs=await Allocation.find({_id:{$in:ids},status:{$in:['pending','recommended']}});
   if(!docs.length)return res.status(404).json({message:'No selected pending allocations found.'});
   const result=await Allocation.updateMany({_id:{$in:docs.map(x=>x._id)},status:{$in:['pending','recommended']}},{$set:{status:'rejected',overrideReason:reason}});
   for(const d of docs){
    await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'REJECT_ALLOCATION',entityType:'allocation',entityId:String(d._id),newValue:{...d.toObject(),status:'rejected',overrideReason:reason},reason});
   }
   Promise.allSettled(docs.map(d=>notifyDecision(d,'rejected',reason)));
   const remaining=await remainingQueue();
   return res.json({ok:true,updated:result.modifiedCount,remaining});
  }
  let updated=0;
  const notified=[];
  for(const id of ids){
   const item=await decideMemoryAllocation(id,'rejected',{overrideReason:reason});
   if(item){updated++;notified.push(item);}
  }
  Promise.allSettled(notified.map(item=>notifyDecision(item,'rejected',reason)));
  return res.json({ok:true,updated,remaining:await pendingAllocations()});
 }catch(e){res.status(400).json({message:e.message})}
});

r.post('/:id/approve',auth,role('hod'),validate({params:idParam}),async(req,res)=>{
 try{
  let item;
  if(dbReady()){
   item=await Allocation.findById(req.params.id);
   if(!item)return res.status(404).json({message:'Allocation not found'});

   // Approving a faculty request must clear that request from the HOD queue.
   // Also clear accidental duplicate pending records for the same course/section/faculty.
   const match={
    courseId:item.courseId,
    sectionId:item.sectionId,
    facultyId:item.facultyId,
    status:{$in:['pending','recommended']}
   };
   await Allocation.updateMany(match,{$set:{status:'approved',approvedBy:req.user.id,approvedAt:new Date()}});
    await Allocation.updateMany({courseId:item.courseId,sectionId:item.sectionId,status:{$in:['pending','recommended']},_id:{$ne:item._id}},{$set:{status:'rejected',overrideReason:'Another candidate was selected by the HOD.'}});
   item=await Allocation.findById(req.params.id).lean();
   await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'APPROVE_ALLOCATION',entityType:'allocation',entityId:String(item._id),newValue:item});
   await applyWorkloadDelta(item.facultyId,hoursForCourse(await findCourse(item.courseId)));
   notifyDecision(item,'approved');
   const remaining=await remainingQueue();
   return res.json({ok:true,allocation:item,remaining});
  }

  item=await decideMemoryAllocation(req.params.id,'approved',{approvedBy:req.user.id,approvedAt:new Date()});
  if(!item)return res.status(404).json({message:'Allocation not found'});
  // Clear duplicate pending records representing the same faculty/course request.
  for(const other of memoryRequests){
   if(other._id!==item._id && other.courseId===item.courseId && other.sectionId===item.sectionId && other.facultyId===item.facultyId && ['pending','recommended'].includes(other.status)){
    Object.assign(other,{status:'approved',approvedBy:req.user.id,approvedAt:new Date()});
   }
  }
    for(const other of memoryRequests){
     if(other._id!==item._id&&other.courseId===item.courseId&&other.sectionId===item.sectionId&&['pending','recommended'].includes(other.status))Object.assign(other,{status:'rejected',overrideReason:'Another candidate was selected by the HOD.'});
    }
  notifyDecision(item,'approved');
  return res.json({ok:true,allocation:item,remaining:await pendingAllocations()});
 }catch(e){res.status(400).json({message:e.message})}
});

r.post('/:id/reject',auth,role('hod'),validate({params:idParam,body:rejectBody}),async(req,res)=>{
 try{
  let item;
  if(dbReady()){
   item=await Allocation.findById(req.params.id);
   if(!item)return res.status(404).json({message:'Allocation not found'});
   const reason=req.body.reason||'';
   const match={courseId:item.courseId,sectionId:item.sectionId,facultyId:item.facultyId,status:{$in:['pending','recommended']}};
   await Allocation.updateMany(match,{$set:{status:'rejected',overrideReason:reason}});
   item=await Allocation.findById(req.params.id).lean();
   await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'REJECT_ALLOCATION',entityType:'allocation',entityId:String(item._id),newValue:item,reason});
   notifyDecision(item,'rejected',reason);
   const remaining=await remainingQueue();
   return res.json({ok:true,allocation:item,remaining});
  }
  item=await decideMemoryAllocation(req.params.id,'rejected',{overrideReason:req.body.reason||''});
  if(!item)return res.status(404).json({message:'Allocation not found'});
  for(const other of memoryRequests){
   if(other._id!==item._id && other.courseId===item.courseId && other.sectionId===item.sectionId && other.facultyId===item.facultyId && ['pending','recommended'].includes(other.status)){
    Object.assign(other,{status:'rejected',overrideReason:req.body.reason||''});
   }
  }
  notifyDecision(item,'rejected',req.body.reason||'');
  return res.json({ok:true,allocation:item,remaining:await pendingAllocations()});
 }catch(e){res.status(400).json({message:e.message})}
});

r.post('/:id/override',auth,role('hod'),validate({params:idParam,body:overrideBody}),async(req,res)=>{
 try{
  let item;
  if(dbReady()){
   item=await Allocation.findById(req.params.id);
   if(!item)return res.status(404).json({message:'Allocation not found'});
   const reason=req.body.reason||'';
   const previousFacultyId=item.facultyId;
   const wasApproved=item.status==='approved';
   const courseId=item.courseId,sectionId=item.sectionId;
   item.status='approved';item.override=true;item.overrideReason=reason;item.facultyId=req.body.facultyId;item.approvedBy=req.user.id;item.approvedAt=new Date();await item.save();
   await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'OVERRIDE_ALLOCATION',entityType:'allocation',entityId:String(item._id),newValue:item.toObject(),reason});
   // Move the workload hours off the previous faculty (only if they'd actually
   // been credited with this course already) and onto the new one.
   const overrideHours=hoursForCourse(await findCourse(courseId));
   if(wasApproved && previousFacultyId && previousFacultyId!==req.body.facultyId) await applyWorkloadDelta(previousFacultyId,-overrideHours);
   if(previousFacultyId!==req.body.facultyId) await applyWorkloadDelta(req.body.facultyId,overrideHours);
   notifyReassignment(courseId,sectionId,previousFacultyId,req.body.facultyId,reason);
   const remaining=await remainingQueue();
   return res.json({ok:true,allocation:item,remaining});
  }
  {
   const existing=memoryRequests.find(x=>x._id===req.params.id);
   const previousFacultyId=existing?.facultyId;
   const courseId=existing?.courseId,sectionId=existing?.sectionId;
   item=await decideMemoryAllocation(req.params.id,'approved',{override:true,overrideReason:req.body.reason||'',facultyId:req.body.facultyId,approvedBy:req.user.id,approvedAt:new Date()});
   if(!item)return res.status(404).json({message:'Allocation not found'});
   notifyReassignment(courseId,sectionId,previousFacultyId,req.body.facultyId,req.body.reason||'');
   return res.json({ok:true,allocation:item,remaining:await pendingAllocations()});
  }
 }catch(e){res.status(400).json({message:e.message})}
});

export default r;
