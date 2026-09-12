import {getFacultyProfile,getCurrentWorkload} from './facultyTools.js';import {getCourseDetails} from './courseTools.js';
export const calculateWorkload=async facultyId=>getCurrentWorkload(facultyId);
export const checkWorkloadViolation=async(facultyId,courseId)=>{const w=await getCurrentWorkload(facultyId);const c=await getCourseDetails(courseId);const hours=(c?.theoryHours||0)+(c?.labHours||0)+(c?.tutorialHours||0);return {violation:w.current+hours>w.max,current:w.current,added:hours,max:w.max}};
