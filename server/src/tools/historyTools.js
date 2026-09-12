import mongoose from 'mongoose';
const History=mongoose.models.TeachingHistory||mongoose.model('TeachingHistory',new mongoose.Schema({facultyId:String,courseId:String,academicYear:String,semester:String,role:String,feedbackScore:Number}));
export const getTeachingHistory=async facultyId=>History.find({facultyId}).lean();
