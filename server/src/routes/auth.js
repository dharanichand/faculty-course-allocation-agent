import {Router} from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Faculty from '../models/Faculty.js';
import {getJwtSecret} from '../config/secrets.js';
import {validate} from '../middleware/validate.js';
import {registerBody, loginBody} from '../validation/schemas.js';

const r = Router();

r.post('/register', validate({body: registerBody}), async (req, res) => {
  try {
    const {name, email, password, role, facultyId} = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const u = await User.create({name, email, passwordHash, role, facultyId});
    res.status(201).json({id: u._id, name: u.name, email: u.email, role: u.role});
  } catch (e) {
    // Duplicate email (unique index) or other validation errors -> 400, never leak internals.
    res.status(400).json({message: e.code === 11000 ? 'An account with that email already exists' : e.message});
  }
});

r.post('/login', validate({body: loginBody}), async (req, res) => {
  try {
    const u = await User.findOne({email: req.body.email});
    if (!u || u.role !== req.body.role || !(await bcrypt.compare(req.body.password, u.passwordHash))) {
      return res.status(401).json({message: 'Invalid credentials'});
    }

    // The official HOD identity is fixed across the whole application.
    if (u.role === 'hod' && u.name !== 'Dr.Phani Kumar') {
      u.name = 'Dr.Phani Kumar';
      await User.updateOne({_id:u._id}, {$set:{name:'Dr.Phani Kumar'}});
    }

    let resolvedFacultyId = u.facultyId || null;
    if (u.role === 'faculty') {
      let profile = null;
      // Email/name are the safest identity keys. A stored facultyId may be stale
      // after a dataset re-import, so do not trust it ahead of the actual account identity.
      if (u.email) profile = await Faculty.findOne({email:u.email}).lean();
      if (!profile && u.name) {
        const escaped=String(u.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        profile = await Faculty.findOne({name:new RegExp(`^${escaped}$`,'i')}).sort({createdAt:1}).lean();
      }

      if (!profile && resolvedFacultyId) {
        profile = await Faculty.findOne({$or:[{facultyId:resolvedFacultyId},{employeeNo:resolvedFacultyId}]}).lean();
      }

      if (!profile && mongoose.connection.readyState === 1) {
        const db=mongoose.connection.db;
        const rawGmail=db.collection('dataset_faculty_gmail_dataset');
        const rawPerson=db.collection('dataset_person');
        const rawFaculty=db.collection('dataset_faculty');
        let raw=null;
        if(u.email) raw=await rawGmail.findOne({email:u.email});
        if(!raw && u.email) raw=await rawPerson.findOne({email:u.email});
        if(!raw && u.name) raw=await rawGmail.findOne({faculty_name:u.name});
        if(!raw && u.name) raw=await rawPerson.findOne({full_name:u.name});
        if(raw){
          let rawFacultyId=raw.faculty_id || raw.facultyId || null;
          if(!rawFacultyId && raw.person_id){
            const fr=await rawFaculty.findOne({person_id:raw.person_id});
            rawFacultyId=fr?.faculty_id || null;
          }
          if(rawFacultyId) profile=await Faculty.findOne({facultyId:String(rawFacultyId)}).lean();
          if(!profile && raw.employee_no) profile=await Faculty.findOne({employeeNo:String(raw.employee_no)}).lean();
          if(!profile && rawFacultyId){
            profile=await Faculty.create({
              facultyId:String(rawFacultyId),name:String(raw.faculty_name||raw.full_name||u.name||'Faculty'),
              email:String(raw.email||u.email||''),department:'CSE',designation:'Faculty',
              qualifications:[],specializations:[],expertise:[],preferences:[],status:'active'
            });
          }
        }
      }
      if (profile) {
        resolvedFacultyId = String(profile.facultyId);
        if (u.facultyId !== resolvedFacultyId) await User.updateOne({_id:u._id}, {$set:{facultyId:resolvedFacultyId}});
      }
    }

    const token = jwt.sign(
      {id:u._id,role:u.role,facultyId:resolvedFacultyId,name:u.name,email:u.email},
      getJwtSecret(),{expiresIn:'8h'}
    );
    res.json({token,user:{name:u.name,email:u.email,role:u.role,facultyId:resolvedFacultyId}});
  } catch (e) {
    res.status(500).json({message:e.message});
  }
});

// RULE (security): the demo login mints a fully-privileged HOD token with no
// credential check at all. It must never be reachable unless an operator has
// explicitly opted in via ALLOW_DEMO_LOGIN=true, and that flag must default
// to false and never be set in any production/deployment doc. If it's not
// enabled, behave as if the route doesn't exist (404) rather than revealing
// that a disabled demo endpoint exists.
r.post('/demo', (req, res, next) => {
  if (process.env.ALLOW_DEMO_LOGIN !== 'true') {
    return res.status(404).json({message: 'Not found'});
  }
  next();
}, async (req, res) => {
  const token = jwt.sign(
    {id: 'demo-hod', role: 'hod', facultyId: null, name: 'Dr.Phani Kumar'},
    getJwtSecret(),
    {expiresIn: '8h'}
  );
  res.json({token, user: {name: 'Dr.Phani Kumar', email: 'hod@demo.local', role: 'hod'}});
});

export default r;
