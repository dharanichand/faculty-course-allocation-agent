import "dotenv/config";
import express from 'express';import cors from 'cors';import rateLimit from 'express-rate-limit';import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';import agentRoutes from './routes/agent.js';import allocationRoutes from './routes/allocations.js';import dataRoutes from './routes/data.js';

const app=express();
app.use(cors());app.use(express.json({limit:'2mb'}));app.use(rateLimit({windowMs:15*60*1000,max:300}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'faculty-course-allocation-agent',agent:process.env.GROQ_API_KEY?'configured':'local-tools-only',database:mongoose.connection.readyState===1?'connected':'local-memory'}));
app.use('/api/auth',authRoutes);app.use('/api/agent',agentRoutes);app.use('/api/allocations',allocationRoutes);app.use('/api/data',dataRoutes);

const port=Number(process.env.PORT)||5000;
const start=()=>app.listen(port,()=>console.log(`API running on ${port}`));
const mongoUri=process.env.MONGO_URI?.trim();
if(!mongoUri || mongoUri.includes('YOUR_USERNAME') || mongoUri.includes('YOUR_PASSWORD') || mongoUri.includes('YOUR_CLUSTER')){
  console.log('MongoDB URI not configured. Starting in local-memory mode.');
  start();
}else{
  mongoose.connect(mongoUri,{serverSelectionTimeoutMS:2000}).then(start).catch(e=>{console.error('MongoDB unavailable:',e.message);console.log('Starting in local-memory mode.');start();});
}
