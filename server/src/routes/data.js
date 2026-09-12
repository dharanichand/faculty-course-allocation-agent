import { Router } from 'express';
import { auth, role } from '../middleware/auth.js';
import mongoose from 'mongoose';
import Faculty from '../models/Faculty.js';
import Course from '../models/Course.js';
import Conflict from '../models/Conflict.js';
import AuditLog from '../models/AuditLog.js';
import { allFaculty, allCourses, findFaculty, findCourse, allRequests, memoryRequests, addMemoryRequest } from '../data/store.js';

const r = Router();

const dbReady = () => mongoose.connection.readyState === 1;
const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`.toUpperCase();

const memory = { faculty: [], courses: [], conflicts: [] };


r.get('/faculty', auth, async (req,res) => {
  try {
    const data = dbReady() ? await Faculty.find({ status: { $ne: 'inactive' } }).sort({name:1}).lean() : await allFaculty();
    res.json(data);
  } catch(e) { res.status(500).json({message:e.message}); }
});

r.post('/faculty', auth, role('hod'), async (req,res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({message:'Faculty name is required'});
    const item = {
      facultyId: body.facultyId || uid('F'),
      name: body.name,
      department: body.department || 'CSE',
      designation: body.designation || 'Assistant Professor',
      qualifications: Array.isArray(body.qualifications) ? body.qualifications : [],
      specializations: Array.isArray(body.specializations) ? body.specializations : [],
      expertise: Array.isArray(body.expertise) ? body.expertise : [],
      maxWorkload: Number(body.maxWorkload) || 18,
      currentWorkload: Number(body.currentWorkload) || 0,
      availability: Array.isArray(body.availability) ? body.availability : [],
      preferences: Array.isArray(body.preferences) ? body.preferences : [],
      status: 'active'
    };
    if (dbReady()) {
      const existing = await Faculty.findOne({facultyId:item.facultyId});
      if (existing) {
        if (existing.status === 'inactive') {
          const reactivated = await Faculty.findOneAndUpdate({facultyId:item.facultyId}, {$set:item}, {new:true, runValidators:true}).lean();
          return res.status(201).json(reactivated);
        }
        return res.status(409).json({message:`Faculty ID ${item.facultyId} already exists`});
      }
    }
    const saved = dbReady() ? await Faculty.create(item) : (memory.faculty.some(x=>x.facultyId===item.facultyId) ? null : (memory.faculty.push(item), item));
    if (!saved) return res.status(409).json({message:`Faculty ID ${item.facultyId} already exists`});
    res.status(201).json(saved);
  } catch(e) { res.status(400).json({message:e.message}); }
});

r.put('/faculty/:id', auth, role('hod'), async (req,res) => {
  try {
    const data = dbReady()
      ? await Faculty.findOneAndUpdate({facultyId:req.params.id}, {$set:req.body}, {new:true, runValidators:true}).lean()
      : Object.assign(memory.faculty.find(x=>x.facultyId===req.params.id)||{}, req.body);
    if (!data) return res.status(404).json({message:'Faculty not found'});
    res.json(data);
  } catch(e) { res.status(400).json({message:e.message}); }
});

r.delete('/faculty/:id', auth, role('hod'), async (req,res) => {
  try {
    const data = dbReady()
      ? await Faculty.findOneAndUpdate({facultyId:req.params.id}, {$set:{status:'inactive'}}, {new:true}).lean()
      : Object.assign(memory.faculty.find(x=>x.facultyId===req.params.id)||{}, {status:'inactive'});
    if (!data) return res.status(404).json({message:'Faculty not found'});
    res.json({ok:true});
  } catch(e) { res.status(400).json({message:e.message}); }
});

r.get('/courses', auth, async (req,res) => {
  try {
    const data = dbReady() ? await Course.find({status:{$ne:'inactive'}}).sort({courseCode:1}).lean() : memory.courses;
    res.json(data);
  } catch(e) { res.status(500).json({message:e.message}); }
});

r.post('/courses', auth, role('hod'), async (req,res) => {
  try {
    const b=req.body||{};
    if(!b.courseName) return res.status(400).json({message:'Course name is required'});
    const item={
      courseId:b.courseId||uid('C'),
      courseCode:b.courseCode||b.courseId||uid('C'),
      courseName:b.courseName,
      department:b.department||'CSE',
      credits:Number(b.credits)||3,
      theoryHours:Number(b.theoryHours)||3,
      labHours:Number(b.labHours)||0,
      tutorialHours:Number(b.tutorialHours)||0,
      requiredExpertise:Array.isArray(b.requiredExpertise)?b.requiredExpertise:[],
      requiredQualification:Array.isArray(b.requiredQualification)?b.requiredQualification:[],
      sections:Array.isArray(b.sections)?b.sections:[],
      studentStrength:Number(b.studentStrength)||0,
      status:'open'
    };
    if (dbReady()) {
      const existing = await Course.findOne({courseId:item.courseId});
      if (existing) {
        if (existing.status === 'inactive') {
          const reactivated = await Course.findOneAndUpdate({courseId:item.courseId}, {$set:item}, {new:true, runValidators:true}).lean();
          return res.status(201).json(reactivated);
        }
        return res.status(409).json({message:`Course ID ${item.courseId} already exists`});
      }
    }
    const saved=dbReady()?await Course.create(item):(memory.courses.some(x=>x.courseId===item.courseId)?null:(memory.courses.push(item),item));
    if(!saved)return res.status(409).json({message:`Course ID ${item.courseId} already exists`});
    res.status(201).json(saved);
  } catch(e){res.status(400).json({message:e.message});}
});

r.put('/courses/:id', auth, role('hod'), async(req,res)=>{
  try{
    const data=dbReady()
      ? await Course.findOneAndUpdate({courseId:req.params.id},{$set:req.body},{new:true,runValidators:true}).lean()
      : Object.assign((await findCourse(req.params.id))||{},req.body);
    if(!data)return res.status(404).json({message:'Course not found'});
    res.json(data);
  }catch(e){res.status(400).json({message:e.message});}
});

r.delete('/courses/:id', auth, role('hod'), async(req,res)=>{
  try{
    const data=dbReady()
      ? await Course.findOneAndUpdate({courseId:req.params.id},{$set:{status:'inactive'}},{new:true}).lean()
      : Object.assign((await findCourse(req.params.id))||{},{status:'inactive'});
    if(!data)return res.status(404).json({message:'Course not found'});
    res.json({ok:true});
  }catch(e){res.status(400).json({message:e.message});}
});

r.get('/conflicts', auth, async(req,res)=>{
  try{
    if(dbReady()) return res.json(await Conflict.find().sort({createdAt:-1}).lean());
    res.json(memory.conflicts);
  }catch(e){res.status(500).json({message:e.message});}
});

r.post('/conflicts', auth, role('hod'), async(req,res)=>{
  try{
    const b=req.body||{};
    if(!b.type||!b.description)return res.status(400).json({message:'Conflict type and description are required'});
    const item={
      conflictId:b.conflictId||uid('X'),
      severity:b.severity||'MEDIUM',
      type:b.type,
      courseId:b.courseId||'',
      courseName:b.courseName||'',
      facultyIds:Array.isArray(b.facultyIds)?b.facultyIds:[],
      facultyNames:Array.isArray(b.facultyNames)?b.facultyNames:[],
      description:b.description,
      status:'open'
    };
    const saved=dbReady()?await Conflict.create(item):(memory.conflicts.push(item),item);
    res.status(201).json(saved);
  }catch(e){res.status(400).json({message:e.message});}
});

r.patch('/conflicts/:id/resolve', auth, role('hod'), async(req,res)=>{
  try{
    const data=dbReady()
      ? await Conflict.findOneAndUpdate({conflictId:req.params.id},{$set:{status:'resolved',resolution:req.body?.resolution||''}},{new:true}).lean()
      : Object.assign(memory.conflicts.find(x=>x.conflictId===req.params.id)||{},{status:'resolved',resolution:req.body?.resolution||''});
    if(!data)return res.status(404).json({message:'Conflict not found'});
    res.json(data);
  }catch(e){res.status(400).json({message:e.message});}
});


r.get('/requests', auth, async (req,res) => {
  try {
    const Allocation = (await import('../models/Allocation.js')).default;
    if (!dbReady()) return res.json(await allRequests());
    res.json(await Allocation.find().sort({createdAt:-1}).lean());
  } catch(e){res.status(500).json({message:e.message});}
});

r.post('/requests', auth, async (req,res) => {
  try {
    const Allocation = (await import('../models/Allocation.js')).default;
    const b=req.body||{};
    if(!b.facultyId||!b.courseId)return res.status(400).json({message:'facultyId and courseId are required'});
    if(!dbReady()){ const item={_id:`csv-request-${Date.now()}`,facultyId:b.facultyId,courseId:b.courseId,sectionId:b.sectionId||`${b.courseId}-A`,preferenceRank:Number(b.preferenceRank)||1,status:'pending',recommendationScore:null,recommendationReason:'New request submitted through the application.'}; await addMemoryRequest(item); return res.status(201).json(item); }
    const item=await Allocation.create({facultyId:b.facultyId,courseId:b.courseId,sectionId:b.sectionId||'',status:'pending',recommendationScore:null});
    res.status(201).json(item);
  }catch(e){res.status(400).json({message:e.message});}
});

r.get('/audit', auth, async (req,res)=>{
  try {
    if (!dbReady()) return res.json([]);
    res.json(await AuditLog.find().sort({timestamp:-1}).limit(20).lean());
  } catch(e) { res.status(500).json({message:e.message}); }
});

export default r;
