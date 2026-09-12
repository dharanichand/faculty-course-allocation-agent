import {findFaculty,findCourse,facultyHistory,courseRequests} from '../data/store.js';
export async function calculateRecommendationScore(facultyId,courseId){
  const [f,c,h,reqs]=await Promise.all([findFaculty(facultyId),findCourse(courseId),facultyHistory(facultyId),courseRequests(courseId)]);
  if(!f||!c)return {facultyId,courseId,score:0,hardViolations:['missing faculty/course'],breakdown:{expertise:0,qualification:0,preference:0,continuity:0,feedback:0}};
  const request=reqs.find(r=>String(r.facultyId)===String(facultyId));
  if(request){
    const hard=[];
    if((f.currentWorkload||0)+(c.theoryHours||0)+(c.labHours||0)+(c.tutorialHours||0)>(f.maxWorkload||18))hard.push('maximum workload would be exceeded');
    return {facultyId,courseId,score:Math.round((request.matchScore||0)*100),breakdown:{expertise:Math.round((request.expertiseMatch||0)*40),qualification:25,preference:Math.round((request.preferenceFit||0)*15),continuity:0,feedback:Math.round((request.availabilityFit||0)*20)},hardViolations:hard,verified:{faculty:f.name,course:c.courseName,expertisePercent:Math.round((request.expertiseMatch||0)*100),preferenceRank:request.preferenceRank,workload:{current:f.currentWorkload||0,added:(c.theoryHours||0)+(c.labHours||0)+(c.tutorialHours||0),max:f.maxWorkload||18,available:Math.max(0,(f.maxWorkload||18)-(f.currentWorkload||0))},matchedExpertise:f.expertise||[],qualifications:f.qualifications||[]},source:'college-aligned CSV candidate evidence'};
  }
  const reqExp=c.requiredExpertise||[],exp=f.expertise||[];const matched=reqExp.filter(x=>exp.some(e=>e.toLowerCase().includes(x.toLowerCase())));const expertisePercent=reqExp.length?Math.round(matched.length/reqExp.length*100):100;
  const expertise=Math.round(expertisePercent*.4), qualification=25, preference=0, continuity=h.some(x=>String(x.courseId)===String(courseId))?10:0, feedback=0;
  const added=(c.theoryHours||0)+(c.labHours||0)+(c.tutorialHours||0),current=f.currentWorkload||0,max=f.maxWorkload||18,hardViolations=[];if(current+added>max)hardViolations.push('maximum workload would be exceeded');
  return {facultyId,courseId,score:expertise+qualification+preference+continuity+feedback,breakdown:{expertise,qualification,preference,continuity,feedback},hardViolations,verified:{faculty:f.name,course:c.courseName,expertisePercent,preferenceRank:99,workload:{current,added,max,available:Math.max(0,max-current)},matchedExpertise:matched,qualifications:f.qualifications||[]},source:'derived from verified CSV faculty/course data'};
}
