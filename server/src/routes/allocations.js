import {Router} from 'express';
import {auth,role} from '../middleware/auth.js';
import Allocation from '../models/Allocation.js';
import AuditLog from '../models/AuditLog.js';
import {pendingAllocations,decideMemoryAllocation,allFaculty,allCourses,memoryRequests,pendingConflicts} from '../data/store.js';
import mongoose from 'mongoose';

const r=Router();
const dbReady=()=>mongoose.connection.readyState===1 && process.env.DATA_SOURCE==='mongodb';

r.get('/',auth,async(req,res)=>{try{res.json(await pendingAllocations())}catch(e){res.status(500).json({message:e.message})}});

r.get('/dashboard',auth,async(req,res)=>{
 try{
  const [fs,cs,ps]=await Promise.all([allFaculty(),allCourses(),pendingAllocations()]);
  const workload=fs.map(f=>({name:(f.name||'').replace(/^Dr\.\s*/,'').split(' ')[0],hours:Number(f.currentWorkload)||0,max:Number(f.maxWorkload)||18}));
  const conflicts=await pendingConflicts();
  const requestsCount=dbReady()?await Allocation.countDocuments():memoryRequests.length;
  res.json({faculty:fs.length,courses:cs.length,requests:requestsCount,pendingReview:ps.length,conflicts:conflicts.length,workload,pending:ps});
 }catch(e){res.status(500).json({message:e.message})}
});

r.post('/bulk-approve',auth,role('hod'),async(req,res)=>{
 try{
  const ids=Array.isArray(req.body?.ids)?req.body.ids.filter(Boolean):[];
  if(!ids.length)return res.status(400).json({message:'Select at least one allocation.'});
  if(dbReady()){
   const docs=await Allocation.find({_id:{$in:ids},status:{$in:['pending','recommended']}});
   if(!docs.length)return res.status(404).json({message:'No selected pending allocations found.'});
   const result=await Allocation.updateMany({_id:{$in:docs.map(x=>x._id)},status:{$in:['pending','recommended']}},{$set:{status:'approved',approvedBy:req.user.id,approvedAt:new Date()}});
   for(const d of docs){
    await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'APPROVE_ALLOCATION',entityType:'allocation',entityId:String(d._id),newValue:{...d.toObject(),status:'approved',approvedBy:req.user.id}});
   }
   const remaining=await Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
   return res.json({ok:true,updated:result.modifiedCount,remaining});
  }
  let updated=0;
  for(const id of ids){
   const item=await decideMemoryAllocation(id,'approved',{approvedBy:req.user.id,approvedAt:new Date()});
   if(item)updated++;
  }
  return res.json({ok:true,updated,remaining:await pendingAllocations()});
 }catch(e){res.status(400).json({message:e.message})}
});

r.post('/bulk-reject',auth,role('hod'),async(req,res)=>{
 try{
  const ids=Array.isArray(req.body?.ids)?req.body.ids.filter(Boolean):[];
  if(!ids.length)return res.status(400).json({message:'Select at least one allocation.'});
  const reason=req.body?.reason||'Rejected in bulk by HOD';
  if(dbReady()){
   const docs=await Allocation.find({_id:{$in:ids},status:{$in:['pending','recommended']}});
   if(!docs.length)return res.status(404).json({message:'No selected pending allocations found.'});
   const result=await Allocation.updateMany({_id:{$in:docs.map(x=>x._id)},status:{$in:['pending','recommended']}},{$set:{status:'rejected',overrideReason:reason}});
   for(const d of docs){
    await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'REJECT_ALLOCATION',entityType:'allocation',entityId:String(d._id),newValue:{...d.toObject(),status:'rejected',overrideReason:reason},reason});
   }
   const remaining=await Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
   return res.json({ok:true,updated:result.modifiedCount,remaining});
  }
  let updated=0;
  for(const id of ids){
   const item=await decideMemoryAllocation(id,'rejected',{overrideReason:reason});
   if(item)updated++;
  }
  return res.json({ok:true,updated,remaining:await pendingAllocations()});
 }catch(e){res.status(400).json({message:e.message})}
});

r.post('/:id/approve',auth,role('hod'),async(req,res)=>{
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
   item=await Allocation.findById(req.params.id).lean();
   await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'APPROVE_ALLOCATION',entityType:'allocation',entityId:String(item._id),newValue:item});
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
  return res.json({ok:true,allocation:item,remaining:await pendingAllocations()});
 }catch(e){res.status(400).json({message:e.message})}
});

r.post('/:id/reject',auth,role('hod'),async(req,res)=>{
 try{
  let item;
  if(dbReady()){
   item=await Allocation.findById(req.params.id);
   if(!item)return res.status(404).json({message:'Allocation not found'});
   const reason=req.body?.reason||'';
   const match={courseId:item.courseId,sectionId:item.sectionId,facultyId:item.facultyId,status:{$in:['pending','recommended']}};
   await Allocation.updateMany(match,{$set:{status:'rejected',overrideReason:reason}});
   item=await Allocation.findById(req.params.id).lean();
   await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'REJECT_ALLOCATION',entityType:'allocation',entityId:String(item._id),newValue:item,reason});
   const remaining=await Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
   return res.json({ok:true,allocation:item,remaining});
  }
  item=await decideMemoryAllocation(req.params.id,'rejected',{overrideReason:req.body?.reason||''});
  if(!item)return res.status(404).json({message:'Allocation not found'});
  for(const other of memoryRequests){
   if(other._id!==item._id && other.courseId===item.courseId && other.sectionId===item.sectionId && other.facultyId===item.facultyId && ['pending','recommended'].includes(other.status)){
    Object.assign(other,{status:'rejected',overrideReason:req.body?.reason||''});
   }
  }
  return res.json({ok:true,allocation:item,remaining:await pendingAllocations()});
 }catch(e){res.status(400).json({message:e.message})}
});

r.post('/:id/override',auth,role('hod'),async(req,res)=>{
 try{
  if(!req.body?.facultyId)return res.status(400).json({message:'facultyId is required'});
  let item;
  if(dbReady()){
   item=await Allocation.findById(req.params.id);
   if(!item)return res.status(404).json({message:'Allocation not found'});
   const reason=req.body.reason||'';
   item.status='approved';item.override=true;item.overrideReason=reason;item.facultyId=req.body.facultyId;item.approvedBy=req.user.id;item.approvedAt=new Date();await item.save();
   await AuditLog.create({actor:req.user.id,actorRole:'hod',action:'OVERRIDE_ALLOCATION',entityType:'allocation',entityId:String(item._id),newValue:item.toObject(),reason});
   const remaining=await Allocation.find({status:{$in:['pending','recommended']}}).sort({createdAt:1}).lean();
   return res.json({ok:true,allocation:item,remaining});
  }
  item=await decideMemoryAllocation(req.params.id,'approved',{override:true,overrideReason:req.body.reason||'',facultyId:req.body.facultyId,approvedBy:req.user.id,approvedAt:new Date()});
  if(!item)return res.status(404).json({message:'Allocation not found'});
  return res.json({ok:true,allocation:item,remaining:await pendingAllocations()});
 }catch(e){res.status(400).json({message:e.message})}
});

export default r;
