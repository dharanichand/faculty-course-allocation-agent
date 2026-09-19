import mongoose from 'mongoose';
// academicYear/semester let requests from different terms coexist without
// colliding (needed for continuity rules, history, and running a fresh
// optimization per term). Optional/blank for older records.
const schema=new mongoose.Schema({facultyId:String,courseId:String,sectionId:String,syntheticKey:String,academicYear:{type:String,default:''},semester:{type:String,default:''},status:{type:String,default:'recommended'},recommendationScore:Number,recommendationReason:String,aiFlag:String,approvedBy:String,approvedAt:Date,override:Boolean,overrideReason:String,
 // ---- fields written by the automatic allocator ----
 source:String,role:String,hours:Number,preferenceRank:Number,priorityTier:Number,courseYear:String,facultyName:String,designation:String,courseName:String},{timestamps:true});
// The two access patterns that matter at scale: "all pending/candidate rows
// for one course" (scoring a course) and "all rows for one faculty in one
// term" (workload/continuity checks) - both were previously full collection scans.
schema.index({courseId:1,status:1});
schema.index({facultyId:1,status:1,academicYear:1,semester:1});
export default mongoose.model('Allocation',schema);
