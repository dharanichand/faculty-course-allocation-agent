import {toolFns} from '../tools/agentTools.js';
export async function runAllocationAnalysis({facultyIds=[],courseId}){const result=await toolFns.analyze_course({courseId});if(facultyIds.length){result.candidates=[];for(const facultyId of facultyIds)result.candidates.push(await toolFns.calculate_recommendation_score({facultyId,courseId}));result.candidates.sort((a,b)=>b.score-a.score);result.recommendation=result.candidates.find(x=>x.hardViolations.length===0)||null;}return result;}
export async function whatIf({facultyId,courseId}){return toolFns.what_if_assignment({facultyId,courseId});}
