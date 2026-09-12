import mongoose from 'mongoose';
const schema=new mongoose.Schema({facultyId:String,courseId:String,sectionId:String,status:{type:String,default:'recommended'},recommendationScore:Number,recommendationReason:String,approvedBy:String,approvedAt:Date,override:Boolean,overrideReason:String},{timestamps:true});export default mongoose.model('Allocation',schema);
