import { Router } from 'express';
import { auth, role } from '../middleware/auth.js';
import mongoose from 'mongoose';
import Faculty from '../models/Faculty.js';
import Course from '../models/Course.js';
import Conflict from '../models/Conflict.js';
import Allocation from '../models/Allocation.js';
import AuditLog from '../models/AuditLog.js';
import { memory, memoryFaculty, memoryCourses, memoryRequests, getAllocationConfig, saveAllocationConfig, findFaculty } from '../data/store.js';

const r = Router();

const dbReady = () => mongoose.connection.readyState === 1;
const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`.toUpperCase();

const canEditConfig = user => ['hod','dean'].includes(user?.role);



r.get('/faculty', auth, async (req,res) => {
  try {
    const data = dbReady() ? await Faculty.find({ status: { $ne: 'inactive' } }).sort({name:1}).lean() : memory.faculty;
    res.json(data);
  } catch(e) { res.status(500).json({message:e.message}); }
});

r.post('/faculty', auth, role('hod'), async (req,res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({message:'Faculty name is required'});
    if (!body.facultyId || !String(body.facultyId).trim()) return res.status(400).json({message:'Faculty ID is required'});
    const email = String(body.email || '').trim();
    if (!email) return res.status(400).json({message:'Faculty email is required'});
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({message:'Enter a valid faculty email address'});
    const item = {
      facultyId: String(body.facultyId).trim(),
      name: body.name,
      email,
      department: body.department || 'CSE',
      designation: body.designation || 'Assistant Professor',
      qualifications: Array.isArray(body.qualifications) ? body.qualifications : [],
      specializations: Array.isArray(body.specializations) ? body.specializations : [],
      expertise: Array.isArray(body.expertise) ? body.expertise : [],
      maxWorkload: Number(body.maxWorkload) || 18,
      currentWorkload: Number(body.currentWorkload) || 0,
      availability: Array.isArray(body.availability) ? body.availability : [],
      onLeave: !!body.onLeave,
      leaveReason: body.onLeave ? String(body.leaveReason || '').trim() : '',
      adminLoadHours: Number(body.adminLoadHours) || 0,
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

r.get('/faculty/:id/preferences', auth, async (req,res) => {
  try {
    if (req.user.role !== 'hod' && req.user.role !== 'dean' && req.user.facultyId !== req.params.id) return res.status(403).json({message:'You may only view your own preferences'});
    const faculty = await findFaculty(req.params.id);
    if (!faculty) return res.status(404).json({message:'Faculty not found'});
    res.json({facultyId:faculty.facultyId,preferences:faculty.preferences||[]});
  } catch(e) { res.status(500).json({message:e.message}); }
});

// RULE (bug fix): saving preferences on the Faculty document was completely
// disconnected from the Allocation collection that the faculty dashboard
// ("My requests"/"Approved"/"Pending review"), the HOD Requests page, and the
// HOD Review queue all read from. A faculty member could save preferences
// forever and it would never show up anywhere as an actual request - the
// dashboard was guaranteed to show 0/0/0 for every faculty account. This
// keeps the Allocation collection in sync with whatever the faculty member
// currently has saved as their preferences:
//  - a preferred course with no existing request gets a new pending one.
//  - a course removed from the preference list has its still-undecided
//    (pending/recommended) request DELETED outright - it was withdrawn by
//    the faculty member before the HOD ever acted on it, so it must vanish
//    from "My requests", the HOD Requests page, and the Review queue, not
//    linger there mislabeled as an HOD rejection (that's a different, real
//    decision and must never be implied for something the HOD never saw).
//  - a course the HOD has already approved or rejected is left completely
//    untouched - editing preferences must never silently reverse or erase a
//    decision that was already made.
async function syncAllocationRequestsFromPreferences(facultyId, preferences) {
  const courseIds = preferences.map(p => p.courseId);
  const existing = await Allocation.find({ facultyId, courseId: { $in: courseIds } }).lean();
  const existingCourseIds = new Set(existing.map(e => e.courseId));
  const toCreate = preferences.filter(p => !existingCourseIds.has(p.courseId));
  await Promise.all([
    toCreate.length
      ? Allocation.insertMany(toCreate.map(p => ({
          facultyId,
          courseId: p.courseId,
          sectionId: '',
          status: 'pending',
          recommendationScore: null,
          recommendationReason: 'Submitted by faculty as a ranked course preference.'
        })), { ordered: false })
      : Promise.resolve(),
    Allocation.deleteMany(
      { facultyId, status: { $in: ['pending', 'recommended'] }, courseId: { $nin: courseIds } }
    )
  ]);
}

r.put('/faculty/:id/preferences', auth, async (req,res) => {
  try {
    if (req.user.role !== 'hod' && req.user.role !== 'dean' && req.user.facultyId !== req.params.id) return res.status(403).json({message:'You may only update your own preferences'});
    const preferences = Array.isArray(req.body?.preferences) ? req.body.preferences.filter(p => p?.courseId && Number(p.rank) > 0).map(p => ({courseId:String(p.courseId),rank:Number(p.rank)})) : null;
    if (!preferences) return res.status(400).json({message:'preferences must be an array of courseId and positive rank values'});
    if (dbReady()) {
      const faculty = await Faculty.findOneAndUpdate({facultyId:req.params.id},{$set:{preferences}},{new:true}).lean();
      if (!faculty) return res.status(404).json({message:'Faculty not found'});
      await syncAllocationRequestsFromPreferences(faculty.facultyId, preferences);
      return res.json({facultyId:faculty.facultyId,preferences:faculty.preferences});
    }
    const faculty = memory.faculty.find(f => f.facultyId === req.params.id);
    if (!faculty) return res.status(404).json({message:'Faculty not found'});
    faculty.preferences = preferences;
    const courseIds = preferences.map(p => p.courseId);
    for (let i = memoryRequests.length - 1; i >= 0; i--) {
      const item = memoryRequests[i];
      if (item.facultyId !== faculty.facultyId) continue;
      if (['pending','recommended'].includes(item.status) && !courseIds.includes(item.courseId)) {
        memoryRequests.splice(i, 1);
      }
    }
    for (const p of preferences) {
      if (!memoryRequests.some(item => item.facultyId === faculty.facultyId && item.courseId === p.courseId)) {
        memoryRequests.unshift({ facultyId: faculty.facultyId, courseId: p.courseId, sectionId: '', status: 'pending', recommendationScore: null, recommendationReason: 'Submitted by faculty as a ranked course preference.' });
      }
    }
    res.json({facultyId:faculty.facultyId,preferences:faculty.preferences});
  } catch(e) { res.status(400).json({message:e.message}); }
});

r.get('/allocation-config', auth, async (req,res) => {
  try { res.json(await getAllocationConfig(String(req.query.department||'CSE'))); }
  catch(e) { res.status(500).json({message:e.message}); }
});

r.put('/allocation-config', auth, async (req,res) => {
  try {
    if (!canEditConfig(req.user)) return res.status(403).json({message:'Only HOD or Dean can change allocation settings'});
    const weights = req.body?.weights || {};
    const values = Object.values(weights).map(Number);
    if (values.some(v => !Number.isFinite(v) || v < 0) || Math.round(values.reduce((a,b)=>a+b,0)) !== 100) return res.status(400).json({message:'Scoring weights must be non-negative numbers totaling 100'});
    if (!Number.isFinite(Number(req.body?.maxWorkload)) || Number(req.body.maxWorkload) <= 0) return res.status(400).json({message:'maxWorkload must be a positive number'});
    res.json(await saveAllocationConfig({department:req.body.department,weights,maxWorkload:req.body.maxWorkload},req.user.id));
  } catch(e) { res.status(400).json({message:e.message}); }
});

r.delete('/faculty/:id', auth, role('hod'), async (req,res) => {
  try {
    const facultyId = req.params.id;
    const data = dbReady()
      ? await Faculty.findOneAndUpdate({facultyId}, {$set:{status:'inactive'}}, {new:true}).lean()
      : Object.assign(memory.faculty.find(x=>x.facultyId===facultyId)||{}, {status:'inactive'});
    if (!data) return res.status(404).json({message:'Faculty not found'});

    // Cascade the removal to any allocation requests tied to this faculty, so
    // the "review count" (dashboard pie chart, HOD Review queue, Requests
    // list, Courses "unassigned" filter) reflects the change everywhere
    // rather than going stale:
    //  - requests still awaiting a decision have nothing left to evaluate, so
    //    they're dismissed.
    //  - a request that was already approved (a subject was assigned to this
    //    faculty) is reopened as pending so the course is correctly flagged
    //    as needing HOD re-review/reassignment instead of quietly staying
    //    "decided" for a faculty member who no longer exists.
    if (dbReady()) {
      await Allocation.updateMany(
        { facultyId, status: { $in: ['pending','recommended'] } },
        { $set: { status: 'rejected', overrideReason: 'Faculty removed from the system before review' } }
      );
      await Allocation.updateMany(
        { facultyId, status: 'approved' },
        { $set: { status: 'pending', recommendationReason: 'Previously assigned faculty was removed from the system. Needs reassignment.' }, $unset: { approvedBy: '', approvedAt: '' } }
      );
    } else {
      for (const item of memoryRequests) {
        if (item.facultyId !== facultyId) continue;
        if (item.status === 'pending' || item.status === 'recommended') {
          Object.assign(item, { status: 'rejected', overrideReason: 'Faculty removed from the system before review' });
        } else if (item.status === 'approved') {
          Object.assign(item, { status: 'pending', recommendationReason: 'Previously assigned faculty was removed from the system. Needs reassignment.' });
          delete item.approvedBy;
          delete item.approvedAt;
        }
      }
    }

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
      : Object.assign(memory.courses.find(x=>x.courseId===req.params.id)||{},req.body);
    if(!data)return res.status(404).json({message:'Course not found'});
    res.json(data);
  }catch(e){res.status(400).json({message:e.message});}
});

r.delete('/courses/:id', auth, role('hod'), async(req,res)=>{
  try{
    const data=dbReady()
      ? await Course.findOneAndUpdate({courseId:req.params.id},{$set:{status:'inactive'}},{new:true}).lean()
      : Object.assign(memory.courses.find(x=>x.courseId===req.params.id)||{},{status:'inactive'});
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
    if (!dbReady()) return res.json(memoryRequests);
    res.json(await Allocation.find().sort({createdAt:-1}).lean());
  } catch(e){res.status(500).json({message:e.message});}
});

r.post('/requests', auth, async (req,res) => {
  try {
    const Allocation = (await import('../models/Allocation.js')).default;
    const b=req.body||{};
    if(!b.facultyId||!b.courseId)return res.status(400).json({message:'facultyId and courseId are required'});
    if(!dbReady()){ const item={_id:`demo-request-${Date.now()}`,facultyId:b.facultyId,courseId:b.courseId,sectionId:b.sectionId||`${b.courseId}-A`,preferenceRank:Number(b.preferenceRank)||1,status:'pending',recommendationScore:null}; memoryRequests.unshift(item); return res.status(201).json(item); }
    const item=await Allocation.create({facultyId:b.facultyId,courseId:b.courseId,sectionId:b.sectionId||'',status:'pending',recommendationScore:null});
    res.status(201).json(item);
  }catch(e){res.status(400).json({message:e.message});}
});

r.get('/audit', auth, role('hod','dean'), async (req,res)=>{
  try {
    if (!dbReady()) return res.json([]);
    res.json(await AuditLog.find().sort({timestamp:-1}).limit(20).lean());
  } catch(e) { res.status(500).json({message:e.message}); }
});

export default r;
