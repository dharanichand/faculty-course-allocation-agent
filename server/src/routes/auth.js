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

    // Faculty accounts must be linked to the real Faculty collection record.
    // Resolve stale/missing IDs from the normalized Faculty collection first,
    // then fall back to the imported dataset and create the application
    // profile when necessary. This prevents the Faculty Portal from showing
    // "Faculty not found" for valid faculty accounts.
    let resolvedFacultyId = u.facultyId || null;
    if (u.role === 'faculty') {
      let profile = resolvedFacultyId
        ? await Faculty.findOne({$or:[{facultyId:resolvedFacultyId},{employeeNo:resolvedFacultyId}]})
        : null;
      if (!profile) profile = await Faculty.findOne({email:u.email}).sort({createdAt:1});
      if (!profile && u.name) profile = await Faculty.findOne({name:new RegExp(`^${String(u.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')}).sort({createdAt:1});

      // If the app collection has not yet been populated, use the imported
      // faculty-gmail dataset as the authoritative identity mapping.
      if (!profile && mongoose.connection.readyState === 1) {
        const raw = mongoose.connection.db.collection('dataset_faculty_gmail_dataset');
        const rawProfile = await raw.findOne({$or:[
          {email:u.email},
          {employee_no:resolvedFacultyId},
          {faculty_name:u.name}
        ]});
        if (rawProfile) {
          const appFacultyId = String(rawProfile.employee_no || rawProfile.faculty_id || '').trim();
          if (appFacultyId) {
            profile = await Faculty.findOne({$or:[{facultyId:appFacultyId},{employeeNo:appFacultyId}]});
            if (!profile) {
              profile = await Faculty.create({
                facultyId:appFacultyId,
                name:String(rawProfile.faculty_name || u.name || '').trim(),
                email:String(rawProfile.email || u.email || '').trim(),
                department:'CSE',
                designation:'Faculty',
                qualifications:[],specializations:[],expertise:[],
                preferences:[],status:'active'
              });
            }
          }
        }
      }

      if (profile) {
        resolvedFacultyId = profile.facultyId;
        if (u.facultyId !== resolvedFacultyId) await User.updateOne({_id:u._id}, {$set:{facultyId:resolvedFacultyId}});
      }
    }

    const token = jwt.sign({id: u._id, role: u.role, facultyId: resolvedFacultyId, name: u.name, email: u.email}, getJwtSecret(), {expiresIn: '8h'});
    res.json({token, user: {name: u.name, email: u.email, role: u.role, facultyId: resolvedFacultyId}});
  } catch (e) {
    res.status(500).json({message: e.message});
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
