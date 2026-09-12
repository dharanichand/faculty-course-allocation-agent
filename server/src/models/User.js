import mongoose from 'mongoose';
const schema=new mongoose.Schema({name:String,email:{type:String,unique:true},passwordHash:String,role:{type:String,enum:['faculty','hod'],default:'faculty'},facultyId:String},{timestamps:true});export default mongoose.model('User',schema);
