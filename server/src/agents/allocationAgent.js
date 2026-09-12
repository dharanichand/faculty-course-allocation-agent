import {toolFns} from '../tools/agentTools.js';
import {pendingAllocations, decideMemoryAllocation, allRequests, courseRequests, findCourse} from '../data/store.js';

export async function runAllocationAnalysis({facultyIds=[],courseId}){
  const result=await toolFns.analyze_course({courseId});
  if(facultyIds.length){result.candidates=[];for(const facultyId of facultyIds)result.candidates.push(await toolFns.calculate_recommendation_score({facultyId,courseId}));result.candidates.sort((a,b)=>b.score-a.score);result.recommendation=result.candidates.find(x=>x.hardViolations.length===0)||null;}
  return result;
}
export async function whatIf({facultyId,courseId}){return toolFns.what_if_assignment({facultyId,courseId});}

export async function runFullAllocation(){
  const pending=await pendingAllocations();
  const grouped=new Map();
  for(const r of pending){const a=grouped.get(r.courseId)||[];a.push(r);grouped.set(r.courseId,a);}
  let approved=0, escalated=0, rejected=0;
  const details=[];
  for(const [courseId,rows] of grouped){
    const scored=[];
    for(const r of rows){const s=await toolFns.calculate_recommendation_score({facultyId:r.facultyId,courseId});scored.push({...r,score:s.score,hardViolations:s.hardViolations||[]});}
    scored.sort((a,b)=>b.score-a.score);
    const best=scored[0], second=scored[1];
    const clear=best && best.hardViolations.length===0 && (scored.length===1 || best.score-second.score>=8) && best.score>=75;
    if(clear){await decideMemoryAllocation(best._id,'approved',{approvedBy:'AI_AGENT',approvedAt:new Date().toISOString(),recommendationScore:best.score,recommendationReason:'Auto-allocated by the deterministic allocation agent because the top verified candidate met workload/eligibility constraints with a clear score margin.'});approved++;for(const other of rows.filter(x=>x._id!==best._id))await decideMemoryAllocation(other._id,'rejected',{approvedBy:'AI_AGENT',recommendationReason:'Not selected because another eligible candidate had the stronger verified score.'});details.push({courseId,status:'auto-approved',facultyId:best.facultyId,score:best.score});}
    else {escalated++;for(const r of rows)await decideMemoryAllocation(r._id,'recommended',{recommendationScore:scored.find(x=>x._id===r._id)?.score||r.recommendationScore});details.push({courseId,status:'hod-review',candidates:scored.length});}
  }
  return {ok:true,processed:pending.length,approved,rejected:pending.length-approved-escalated,escalated,remaining:(await pendingAllocations()).length,details};
}
