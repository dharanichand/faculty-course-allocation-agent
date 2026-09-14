import "dotenv/config";
import express from 'express';import cors from 'cors';import rateLimit from 'express-rate-limit';import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {assertJwtSecretConfigured} from './config/secrets.js';
import Faculty from './models/Faculty.js';
import Course from './models/Course.js';
import Allocation from './models/Allocation.js';
import Conflict from './models/Conflict.js';
import User from './models/User.js';
import {memory,memoryFaculty,memoryRequests} from './data/store.js';
import authRoutes from './routes/auth.js';import agentRoutes from './routes/agent.js';import allocationRoutes from './routes/allocations.js';import dataRoutes from './routes/data.js';import emailRoutes from './routes/email.js';

// RULE (security): fail fast and loudly at boot rather than silently signing
// tokens with a hardcoded default secret. See config/secrets.js.
try{
  assertJwtSecretConfigured();
}catch(e){
  console.error(`\nFATAL: ${e.message}\n`);
  process.exit(1);
}

const app=express();
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

app.get('/api/health',(req,res)=>res.json({ok:true,service:'faculty-course-allocation-agent',agent:process.env.GROQ_API_KEY?'configured':'local-tools-only',email:(process.env.BREVO_API_KEY&&process.env.BREVO_SENDER_EMAIL)?'configured':'not-configured',database:mongoose.connection.readyState===1?'connected':'local-memory'}));
app.use('/api/auth',authLimiter,authRoutes);app.use('/api/agent',agentRoutes);app.use('/api/allocations',allocationRoutes);app.use('/api/data',dataRoutes);app.use('/api/email',emailRoutes);

const port=Number(process.env.PORT)||5000;
const start=()=>app.listen(port,()=>console.log(`API running on ${port}`));

async function seedMongo(){
  if(process.env.DATA_SOURCE!=='mongodb' || mongoose.connection.readyState!==1) return;
  const [facultyCount,courseCount,allocationCount,conflictCount]=await Promise.all([
    Faculty.countDocuments(),Course.countDocuments(),Allocation.countDocuments(),Conflict.countDocuments()
  ]);
  if(!facultyCount && memory.faculty.length) await Faculty.insertMany(memory.faculty,{ordered:false});
  for(const faculty of memoryFaculty) await Faculty.updateOne({facultyId:faculty.facultyId},{$set:{publications:faculty.publications,preferences:faculty.preferences,maxWorkload:faculty.maxWorkload}});
  if(process.env.DEMO_MODE==='true'){
   const defaultUsers=[
    {name:'Dr. Ananya Rao',email:'hod@college.edu',password:'hod12345',role:'hod'},
    {name:memoryFaculty[0]?.name||'Demo Faculty',email:'faculty@college.edu',password:'faculty12345',role:'faculty',facultyId:memoryFaculty[0]?.facultyId}
   ];
   for(const account of defaultUsers){
    if(!account.facultyId&&account.role==='faculty')continue;
    await User.findOneAndUpdate(
     {email:account.email},
     {$set:{name:account.name,role:account.role,facultyId:account.facultyId,passwordHash:await bcrypt.hash(account.password,12)}},
     {upsert:true,new:true,setDefaultsOnInsert:true}
    );
   }
  }
  if(!courseCount && memory.courses.length) await Course.insertMany(memory.courses,{ordered:false});
  for(const course of memory.courses) await Course.updateOne({courseId:course.courseId},{$set:{requiredExpertise:course.requiredExpertise,requiredQualification:course.requiredQualification}});
  if(!allocationCount && memoryRequests.length) await Allocation.insertMany(memoryRequests.map(({_id,...r})=>({...r,_id:undefined})),{ordered:false});
  if(!conflictCount && memory.conflicts.length) await Conflict.insertMany(memory.conflicts,{ordered:false});
  console.log(`MongoDB seed check: faculty=${await Faculty.countDocuments()}, courses=${await Course.countDocuments()}, allocations=${await Allocation.countDocuments()}, conflicts=${await Conflict.countDocuments()}`);
}
const mongoUri=process.env.MONGO_URI?.trim();
if(!mongoUri || mongoUri.includes('YOUR_USERNAME') || mongoUri.includes('YOUR_PASSWORD') || mongoUri.includes('YOUR_CLUSTER')){
  console.log('MongoDB URI not configured. Starting in local-memory mode.');
  start();
}else{
  mongoose.connect(mongoUri,{serverSelectionTimeoutMS:10000}).then(async()=>{await seedMongo();start()}).catch(e=>{console.error('MongoDB unavailable:',e.message);console.log('Starting in local-memory mode.');start();});
}
