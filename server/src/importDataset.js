import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import Faculty from './models/Faculty.js';
import Course from './models/Course.js';
import Allocation from './models/Allocation.js';
import Conflict from './models/Conflict.js';
import AllocationConfig from './models/AllocationConfig.js';
import {memoryFaculty,memoryCourses,memoryRequests,memory} from './data/store.js';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const mongoUri=process.env.MONGO_URI;
if(!mongoUri){console.error('MONGO_URI is missing from .env');process.exit(1);}
const dataDir=path.join(__dirname,'..','data');

function parseCSVLine(line){
 const result=[];let current='';let quoted=false;
 for(let i=0;i<line.length;i++){
  const char=line[i];
  if(char==='"'){
   if(quoted&&line[i+1]==='"'){current+='"';i++;}else quoted=!quoted;
  }else if(char===','&&!quoted){result.push(current);current='';}else current+=char;
 }
 result.push(current);return result;
}
function parseCSV(filePath){
 const text=fs.readFileSync(filePath,'utf8').replace(/^\uFEFF/,'');
 const lines=text.split(/\r?\n/).filter(line=>line.trim());
 if(!lines.length)return [];
 const headers=parseCSVLine(lines[0]).map(header=>header.trim());
 return lines.slice(1).map(line=>{const values=parseCSVLine(line);return Object.fromEntries(headers.map((header,index)=>[header,values[index]??'']));});
}

const files={
 'academic_year.csv':'academic_year','agent.csv':'agent','agent_tool.csv':'agent_tool','batch.csv':'batch',
 'course.csv':'course','course_offering.csv':'course_offering','course_version.csv':'course_version',
 'department.csv':'department','faculty.csv':'faculty','faculty_allocation_candidates.csv':'faculty_allocation_candidates',
 'faculty_expertise.csv':'faculty_expertise','faculty_gmail_dataset.csv':'faculty_gmail_dataset',
 'faculty_workload.csv':'faculty_workload','person.csv':'person','programme.csv':'programme',
 'regulation.csv':'regulation','section.csv':'section','term.csv':'term'
};

async function replaceRawDataset(db){
 for(const [file,collection] of Object.entries(files)){
  const filePath=path.join(dataDir,file);const target=`dataset_${collection}`;
  await db.collection(target).deleteMany({});
  if(!fs.existsSync(filePath))continue;
  const rows=parseCSV(filePath);
  if(rows.length)await db.collection(target).insertMany(rows,{ordered:true});
  console.log(`Imported ${file}: ${rows.length} -> ${target}`);
 }
}

async function importDataset(){
 try{
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri,{serverSelectionTimeoutMS:10000});
  console.log('MongoDB connected.');
  const db=mongoose.connection.db;

    const legacyCollections=['academicyears','agents','agenttools','batches','courseofferings','courseversions','departments','facultyallocationcandidates','facultyexpertises','facultygmails','facultyworkloads','people','programmes','regulations','sections','terms'];
    for(const collection of legacyCollections)await db.collection(collection).drop().catch(()=>{});

  // Replace only imported application data. Accounts, audit history, settings,
  // and other user-owned records are intentionally preserved.
  await Promise.all([
   Faculty.deleteMany({}),Course.deleteMany({}),Allocation.deleteMany({}),Conflict.deleteMany({})
  ]);
  await replaceRawDataset(db);

  if(memoryFaculty.length)await Faculty.insertMany(memoryFaculty,{ordered:true});
  if(memoryCourses.length)await Course.insertMany(memoryCourses,{ordered:true});
  await AllocationConfig.updateOne({department:'CSE'},{$set:{maxWorkload:24}},{upsert:true});
  const requests=memoryRequests.filter(item=>!item.syntheticKey).map(item=>({
   facultyId:item.facultyId,courseId:item.courseId,sectionId:item.sectionId||'',status:['pending','recommended','approved','rejected'].includes(item.status)?item.status:'pending',
   recommendationScore:item.recommendationScore,recommendationReason:item.recommendationReason,syntheticKey:undefined,override:false
  }));
  if(requests.length)await Allocation.insertMany(requests,{ordered:true});
  if(memory.conflicts.length)await Conflict.insertMany(memory.conflicts,{ordered:true});

  const counts={
   faculty:await Faculty.countDocuments(),courses:await Course.countDocuments(),allocations:await Allocation.countDocuments(),conflicts:await Conflict.countDocuments(),
   rawFaculty:await db.collection('dataset_faculty').countDocuments(),rawCourses:await db.collection('dataset_course').countDocuments(),rawCandidates:await db.collection('dataset_faculty_allocation_candidates').countDocuments()
  };
  console.table(counts);
  console.log('DATASET REPLACEMENT COMPLETE');
  await mongoose.disconnect();
 }catch(error){
  console.error('DATASET REPLACEMENT FAILED:',error);
  await mongoose.disconnect().catch(()=>{});
  process.exitCode=1;
 }
}

importDataset();
