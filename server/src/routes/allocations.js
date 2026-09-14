import {Router} from 'express';
import {auth,role} from '../middleware/auth.js';
import {validate} from '../middleware/validate.js';
import {idParam,bulkIdsBody,bulkRejectBody,rejectBody,overrideBody} from '../validation/schemas.js';
import Allocation from '../models/Allocation.js';
import AuditLog from '../models/AuditLog.js';
import {pendingAllocations,decideMemoryAllocation,allFaculty,allCourses,memoryRequests,pendingConflicts,findFaculty,findCourse} from '../data/store.js';
import {sendAllocationDecisionEmail,sendReassignmentEmail,sendUnassignmentEmail} from '../services/emailService.js';
import {calculateRecommendationScore} from '../tools/allocationTools.js';
import {classifyCourseAllocation} from '../services/aiAllocation.js';
import mongoose from 'mongoose';

const r=Router();
const dbReady=()=>mongoose.connection.readyState===1 && process.env.DATA_SOURCE==='mongodb';

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

r.get('/',auth,async(req,res)=>{try{res.json(await pendingAllocations())}catch(e){res.status(500).json({message:e.message})}});

r.get('/my',auth,async(req,res)=>{
 try{
  const target=req.user.role==='hod'||req.user.role==='dean'?String(req.query.facultyId||''):String(req.user.facultyId||'');
  if(!target)return res.status(400).json({message:'A faculty account is required to view proposed allocations'});
  const courseList=await allCourses(); const courses=new Map(courseList.map(c=>[c.courseId,c]));
  const rows=dbReady()?await Allocation.find({facultyId:target}).sort({createdAt:-1}).lean():memoryRequests.filter(x=>x.facultyId===target);
  res.json(rows.map(item=>({
   ...item,courseName:courses.get(item.courseId)?.courseName||item.courseId,
   statusLabel:item.status==='approved'?'Approved allocation':item.status==='pending'?'Pending HOD review':'Not selected',
   justification:item.recommendationReason||item.overrideReason||'No justification has been recorded yet.'
  })));
 }catch(e){res.status(500).json({message:e.message})}
});

r.get('/notifications',auth,async(req,res)=>{
 try{
  if(req.user.role!=='faculty'||!req.user.facultyId)return res.status(403).json({message:'Faculty access is required'});
  const courses=new Map((await allCourses()).map(c=>[c.courseId,c]));
  const rows=dbReady()?await Allocation.find({facultyId:req.user.facultyId}).sort({updatedAt:-1,createdAt:-1}).limit(30).lean():memoryRequests.filter(x=>x.facultyId===req.user.facultyId).slice(-30).reverse();
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
  const data=rows.map(x=>({allocationId:String(x._id),courseId:x.courseId,courseName:courses.get(x.courseId)?.courseName||x.courseId,sectionId:x.sectionId||'',facultyId:x.facultyId,facultyName:faculty.get(x.facultyId)?.name||x.facultyId,status:'approved',justification:x.recommendationReason||x.overrideReason||''}));
  if(String(req.query.format||'json').toLowerCase()==='csv'){
   const fields=['allocationId','courseId','courseName','sectionId','facultyId','facultyName','status','justification'];
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
  const [fs,cs,ps]=await Promise.all([allFaculty(),allCourses(),pendingAllocations()]);
  const workload=fs.map(f=>({name:(f.name||'').replace(/^Dr\.\s*/,'').split(' ')[0],hours:Number(f.currentWorkload)||0,max:Number(f.maxWorkload)||18}));
  const conflicts=await pendingConflicts();
  const requestsCount=dbReady()?await Allocation.countDocuments({status:{$in:['pending','recommended']}}):memoryRequests.filter(r=>['pending','recommended'].includes(r.status)).length;
  res.json({faculty:fs.length,courses:cs.length,requests:requestsCount,pendingReview:ps.length,conflicts:conflicts.length,workload,pending:ps});
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
r.post('/run-ai',auth,role('hod'),async(req,res)=>{
 try{
  const [pending,courses]=await Promise.all([pendingAllocations(),allCourses()]);
  const courseById=new Map(courses.map(c=>[c.courseId,c]));

  const byCourse=new Map();
  for(const item of pending){
   if(!byCourse.has(item.courseId))byCourse.set(item.courseId,[]);
   byCourse.get(item.courseId).push(item);
  }

  const results=[];
  const aiConfigured=!!process.env.GROQ_API_KEY;

  for(const [courseId,requests] of byCourse){
   const course=courseById.get(courseId)||await findCourse(courseId);
   const facultyIds=[...new Set(requests.map(x=>x.facultyId))];
   const candidates=[];
   for(const facultyId of facultyIds)candidates.push(await calculateRecommendationScore(facultyId,courseId));
   candidates.sort((a,b)=>b.score-a.score);

   let ai=await classifyCourseAllocation({course,candidates});
   let usedAi=!!ai;

   if(!ai){
    // Deterministic fallback mirroring the same rules the AI is instructed to follow,
    // used only when GROQ_API_KEY is missing or the API call failed.
    const eligible=candidates.filter(c=>!c.hardViolations||c.hardViolations.length===0);
    let decision='escalate',approvedFacultyId=null;
    if(eligible.length===1&&eligible[0].score>=75){decision='auto_approve';approvedFacultyId=eligible[0].facultyId;}
    else if(eligible.length>1&&eligible[0].score>=75&&(eligible[0].score-eligible[1].score)>=8){decision='auto_approve';approvedFacultyId=eligible[0].facultyId;}
    ai={
     courseId,decision,approvedFacultyId,
     candidates:candidates.map(c=>({facultyId:c.facultyId,flag:(c.hardViolations&&c.hardViolations.length)?'conflict':(c.score>=75?'perfect':'compromise'),reason:(c.hardViolations&&c.hardViolations.length)?c.hardViolations.join('; '):`Deterministic score ${c.score}/100.`})),
     summary:decision==='auto_approve'?`Deterministic scoring auto-approved ${approvedFacultyId} (AI service unavailable).`:'Escalated for HOD review (AI service unavailable).'
    };
   }

   // Hard safety re-check: never write an approval the backend itself cannot verify.
   const winner=candidates.find(c=>c.facultyId===ai.approvedFacultyId);
   const safeApprove=ai.decision==='auto_approve'&&winner&&(!winner.hardViolations||winner.hardViolations.length===0);

   if(safeApprove){
    for(const reqItem of requests){
     if(reqItem.facultyId===winner.facultyId){
      if(dbReady()){
       await Allocation.findByIdAndUpdate(reqItem._id,{$set:{status:'approved',approvedBy:req.user.id,approvedAt:new Date(),recommendationScore:winner.score,recommendationReason:ai.summary}});
       await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'AI_AUTO_APPROVE_ALLOCATION',entityType:'allocation',entityId:String(reqItem._id),newValue:{...reqItem,status:'approved'},reason:ai.summary});
      }else{
       await decideMemoryAllocation(reqItem._id,'approved',{approvedBy:req.user.id,approvedAt:new Date(),recommendationScore:winner.score,recommendationReason:ai.summary});
      }
      notifyDecision(reqItem,'approved',ai.summary);
     }else{
      const rejectReason='AI agent auto-approved another candidate for this course.';
      if(dbReady()){
       await Allocation.findByIdAndUpdate(reqItem._id,{$set:{status:'rejected',overrideReason:rejectReason}});
      }else{
       await decideMemoryAllocation(reqItem._id,'rejected',{overrideReason:rejectReason});
      }
      notifyDecision(reqItem,'rejected',rejectReason);
     }
    }
    results.push({courseId,courseName:course?.courseName||courseId,decision:'auto_approved',approvedFacultyId:winner.facultyId,approvedFacultyName:winner.verified?.faculty||winner.facultyId,score:winner.score,summary:ai.summary,usedAi});
   }else{
    // Escalate: leave the requests pending for HOD review, but attach the AI's
    // reasoning to each candidate request so the Review queue shows it.
    for(const reqItem of requests){
     const c=ai.candidates?.find(x=>x.facultyId===reqItem.facultyId);
     const patch={recommendationReason:c?.reason||ai.summary,aiFlag:c?.flag||'conflict'};
     if(dbReady()){
      await Allocation.findByIdAndUpdate(reqItem._id,{$set:patch});
     }else{
      const it=memoryRequests.find(x=>x._id===reqItem._id);
      if(it)Object.assign(it,patch);
     }
    }
    results.push({courseId,courseName:course?.courseName||courseId,decision:'escalated',summary:ai.summary,candidateCount:candidates.length,usedAi});
   }
  }

  const remaining=await pendingAllocations();
  res.json({ok:true,aiConfigured,coursesProcessed:results.length,results,remaining});
 }catch(e){res.status(500).json({message:e.message})}
});

r.post('/bulk-approve',auth,role('hod'),validate({body:bulkIdsBody}),async(req,res)=>{
 try{
  const ids=req.body.ids;
  if(dbReady()){
   const docs=await Allocation.find({_id:{$in:ids},status:{$in:['pending','recommended']}});
   if(!docs.length)return res.status(404).json({message:'No selected pending allocations found.'});
   const result=await Allocation.updateMany({_id:{$in:docs.map(x=>x._id)},status:{$in:['pending','recommended']}},{$set:{status:'approved',approvedBy:req.user.id,approvedAt:new Date()}});
   for(const d of docs){
    await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'APPROVE_ALLOCATION',entityType:'allocation',entityId:String(d._id),newValue:{...d.toObject(),status:'approved',approvedBy:req.user.id}});
   }
   Promise.allSettled(docs.map(d=>notifyDecision(d,'approved')));
   const remaining=await Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
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
   const remaining=await Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
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
   notifyDecision(item,'approved');
   const remaining=await Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
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
   const remaining=await Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
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
   const courseId=item.courseId,sectionId=item.sectionId;
   item.status='approved';item.override=true;item.overrideReason=reason;item.facultyId=req.body.facultyId;item.approvedBy=req.user.id;item.approvedAt=new Date();await item.save();
   await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'OVERRIDE_ALLOCATION',entityType:'allocation',entityId:String(item._id),newValue:item.toObject(),reason});
   notifyReassignment(courseId,sectionId,previousFacultyId,req.body.facultyId,reason);
   const remaining=await Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
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
