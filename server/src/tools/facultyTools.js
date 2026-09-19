import Faculty from '../models/Faculty.js';
export const getFacultyProfile=async facultyId=>Faculty.findOne({facultyId}).lean();
export const getFacultyQualifications=async facultyId=>(await getFacultyProfile(facultyId))?.qualifications||[];
export const getFacultyExpertise=async facultyId=>(await getFacultyProfile(facultyId))?.expertise||[];
export const getFacultyPreferences=async facultyId=>(await getFacultyProfile(facultyId))?.preferences||[];
export const getFacultyAvailability=async facultyId=>(await getFacultyProfile(facultyId))?.availability||[];
export const getCurrentWorkload=async facultyId=>{const f=await getFacultyProfile(facultyId);return {current:f?.currentWorkload||0,max:f?.maxWorkload||18,available:Math.max(0,(f?.maxWorkload||18)-(f?.currentWorkload||0))}};
export const isFacultyAvailable=async facultyId=>{
  const f=await getFacultyProfile(facultyId);
  if(!f)return {available:false,reason:'faculty record not found'};
  if(f.status==='inactive')return {available:false,reason:'faculty account is inactive'};
  if(f.onLeave)return {available:false,reason:f.leaveReason||'faculty is on leave/sabbatical this term'};
  return {available:true,reason:null};
};
