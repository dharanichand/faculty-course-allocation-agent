import {Router} from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
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
    const token = jwt.sign({id: u._id, role: u.role, facultyId: u.facultyId}, getJwtSecret(), {expiresIn: '8h'});
    res.json({token, user: {name: u.name, email: u.email, role: u.role, facultyId: u.facultyId}});
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
    {id: 'demo-hod', role: 'hod', facultyId: null, name: 'Dr. Ananya Rao'},
    getJwtSecret(),
    {expiresIn: '8h'}
  );
  res.json({token, user: {name: 'Dr. Ananya Rao', email: 'hod@demo.local', role: 'hod'}});
});

export default r;
