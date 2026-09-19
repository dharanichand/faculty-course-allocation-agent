import mongoose from 'mongoose';
// academicYear/semester scope which "coming semester" a course belongs to
// (e.g. academicYear:'2026-27', semester:'I'). Left optional/blank for older
// records so existing data keeps working unfiltered; new imports and the
// allocation UI should start setting these going forward.
const schema=new mongoose.Schema({courseId:{type:String,unique:true},courseCode:String,courseName:String,department:String,academicYear:{type:String,default:''},semester:{type:String,default:''},credits:Number,theoryHours:Number,labHours:Number,tutorialHours:Number,requiredExpertise:[String],requiredQualification:[String],sections:[Object],studentStrength:Number,status:{type:String,default:'open'},
 program:String,year:String,courseType:String,shortName:String,sectionCount:Number,instructorsPerSection:{type:Number,default:1},hoursPerSection:Number},{timestamps:true});
// Compound index for the common "courses for this dept/semester that are still open" query.
schema.index({department:1,academicYear:1,semester:1,status:1});
// Single text index (Mongo allows only one per collection) covering the fields
// used by keyword search, so search_courses can query the DB instead of
// loading every course into Node and filtering in JS.
schema.index({courseCode:'text',courseName:'text',requiredExpertise:'text'});
export default mongoose.model('Course',schema);
