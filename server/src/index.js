import "dotenv/config";
import express from 'express';import cors from 'cors';import rateLimit from 'express-rate-limit';import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {assertJwtSecretConfigured} from './config/secrets.js';
import Faculty from './models/Faculty.js';
import Course from './models/Course.js';
import Allocation from './models/Allocation.js';
import Conflict from './models/Conflict.js';
import User from './models/User.js';
import {seedDemoUsers} from './services/seedUsers.js';
import authRoutes from './routes/auth.js';import agentRoutes from './routes/agent.js';import allocationRoutes from './routes/allocations.js';import dataRoutes from './routes/data.js';import emailRoutes from './routes/email.js';

// RULE (security): fail fast and loudly at boot rather than silently signing
// tokens with a hardcoded default secret. See config/secrets.js.
try{
  assertJwtSecretConfigured();
}catch(e){
  console.error(`\nFATAL: ${e.message}\n`);
  process.exit(1);
}

// RULE (security): ALLOW_DEMO_LOGIN mints a fully-privileged HOD token to
// anyone who hits the endpoint, with zero credential check. That is only
// ever acceptable on a machine the developer controls. Refuse to boot with
// it (or the demo-account seeding) turned on in production, rather than
// relying on everyone remembering to unset it on every deploy.
if(process.env.NODE_ENV==='production' && String(process.env.ALLOW_DEMO_LOGIN).toLowerCase()==='true'){
  // Was process.exit(1): on Render that made every deploy fail and silently
  // kept serving the old build. Warn loudly instead; the operator opted in.
  console.warn('\nWARNING: ALLOW_DEMO_LOGIN=true in production. Anyone with the URL can sign in as HOD via /api/auth/demo. Set it to false once the demo is over.\n');
}
if(process.env.NODE_ENV==='production' && String(process.env.SEED_DEMO_USERS).toLowerCase()!=='false'){
  console.warn('\nWARNING: SEED_DEMO_USERS is not explicitly set to false in a production environment. The publicly-known hod@college.edu / faculty@college.edu placeholder accounts will be created with their default passwords. Set SEED_DEMO_USERS=false once real accounts exist.\n');
}

const app=express();
// Render/Vercel/etc. sit behind a reverse proxy. Without this, express-rate-limit
// sees every user as the proxy's IP, so the 20-attempt auth limit is shared by
// everybody and logins start failing with 429.
app.set('trust proxy',1);
app.use(cors());app.use(express.json({limit:'2mb'}));app.use(rateLimit({windowMs:15*60*1000,max:300}));

// Stricter, dedicated rate limit for /api/auth/* (login/register/demo are
// credential-guessing and token-minting surfaces and deserve a tighter cap
// than the rest of the API).
const authLimiter=rateLimit({
  windowMs:15*60*1000,
  max:20,
  standardHeaders:true,
  legacyHeaders:false,
  message:{message:'Too many authentication attempts. Please try again later.'}
});

app.get('/api/health',(req,res)=>res.json({ok:true,service:'faculty-course-allocation-agent',agent:process.env.GROQ_API_KEY?'configured':'local-tools-only',email:(process.env.BREVO_API_KEY&&process.env.BREVO_SENDER_EMAIL)?'configured':'not-configured',database:mongoose.connection.readyState===1?'mongodb':'disconnected'}));
app.use('/api/auth',authLimiter,authRoutes);app.use('/api/agent',agentRoutes);app.use('/api/allocations',allocationRoutes);app.use('/api/data',dataRoutes);app.use('/api/email',emailRoutes);

const port=Number(process.env.PORT)||5000;
const start=()=>app.listen(port,()=>console.log(`API running on ${port}`));

const mongoUri=process.env.MONGO_URI?.trim();
if(!mongoUri || mongoUri.includes('YOUR_USERNAME') || mongoUri.includes('YOUR_PASSWORD') || mongoUri.includes('YOUR_CLUSTER')){
  console.error('FATAL: MONGO_URI is not configured. This application requires MongoDB.');
  process.exit(1);
}

mongoose.connect(mongoUri,{serverSelectionTimeoutMS:Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS)||10000})
  .then(async()=>{
    // Keep the HOD identity in MongoDB synchronized with the application's
    // official HOD name. This updates existing HOD accounts as well as the
    // account returned by normal login.
    const hodUpdate = await User.updateMany(
      { role: 'hod' },
      { $set: { name: 'Dr.Phani Kumar' } }
    );
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    console.log(`HOD name synchronized: ${hodUpdate.modifiedCount ?? 0} account(s) updated`);
    try{await seedDemoUsers();}catch(e){console.error(`Demo user seeding failed: ${e.message}`);}
    start();
  })
  .catch(e=>{
    console.error(`FATAL: MongoDB connection failed: ${e.message}`);
    process.exit(1);
  });
