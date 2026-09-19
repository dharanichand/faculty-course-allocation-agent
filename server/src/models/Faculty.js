import mongoose from 'mongoose';
const schema=new mongoose.Schema({facultyId:{type:String,unique:true},employeeNo:String,name:String,email:String,department:String,designation:String,qualifications:[String],specializations:[String],expertise:[String],publications:[String],maxWorkload:{type:Number,default:24},currentWorkload:{type:Number,default:0},availability:[Object],
 // onLeave/leaveReason: sabbatical or other leave that makes this person
 // ineligible for a *new* allocation this term, independent of `status`
 // (which is the account-level active/inactive flag used elsewhere). Kept
 // separate so marking someone on leave doesn't also hide them from normal
 // faculty listings/searches.
 onLeave:{type:Boolean,default:false},leaveReason:String,
 // adminLoadHours: known administrative responsibilities (HoD-assigned
 // committee work, coordinator duties, etc.) that eat into teaching
 // capacity but aren't a course. Subtracted from maxWorkload before
 // scoring/optimizing, per the "subtract administrative responsibilities"
 // step of the allocation workflow.
 adminLoadHours:{type:Number,default:0},
 preferences:[Object],status:{type:String,default:'active'}},{timestamps:true});
// Narrows the department/status filter used by every list/dashboard query.
schema.index({department:1,status:1});
// Single text index covering the fields keyword search actually matches on.
schema.index({name:'text',expertise:'text',specializations:'text',qualifications:'text'});
export default mongoose.model('Faculty',schema);
