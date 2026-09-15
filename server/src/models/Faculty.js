import mongoose from 'mongoose';
const schema=new mongoose.Schema({facultyId:{type:String,unique:true},employeeNo:String,name:String,email:String,department:String,designation:String,qualifications:[String],specializations:[String],expertise:[String],publications:[String],maxWorkload:{type:Number,default:24},currentWorkload:{type:Number,default:0},availability:[Object],preferences:[Object],status:{type:String,default:'active'}},{timestamps:true});
// Narrows the department/status filter used by every list/dashboard query.
schema.index({department:1,status:1});
// Single text index covering the fields keyword search actually matches on.
schema.index({name:'text',expertise:'text',specializations:'text',qualifications:'text'});
export default mongoose.model('Faculty',schema);
