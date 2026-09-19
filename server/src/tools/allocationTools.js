import {findFaculty,findCourse,facultyHistory,getAllocationConfig} from '../data/store.js';
const sequencePart = value => {const match=String(value||'').match(/(.+?)\s+part\s+([ivx]+|\d+)$/i);return match?{base:match[1].trim().toLowerCase(),part:match[2].toLowerCase()}:null;};
const previousPart = part => {if(/^\d+$/.test(part))return String(Math.max(0,Number(part)-1));const order=['i','ii','iii','iv'];const index=order.indexOf(part);return index>0?order[index-1]:null;};

// Pure scoring function: no DB access, only plain objects in / a plain
// result out. Kept separate from calculateRecommendationScore() below so
// the scoring math can be unit-tested without a MongoDB connection, and so
// the optimizer or anything else can score a hypothetical (faculty, course)
// pair it already has in memory without a round-trip to the DB.
//   faculty        - Faculty document (plain object)
//   course         - Course document (plain object)
//   history        - array of this faculty's past allocation records
//                     (each optionally carrying a feedbackScore)
//   historyCourses - array of Course documents, one per `history` entry,
//                     same order (used for the continuity/sequence check)
//   config         - AllocationConfig-shaped object ({weights, maxWorkload})
export function computeScore(faculty, course, history, historyCourses, config){
 const f=faculty, c=course, h=history||[], config_=config||{};
 if(!f||!c)return {facultyId:f?.facultyId,courseId:c?.courseId,score:0,hardViolations:['missing faculty/course'],breakdown:{expertise:0,publication:0,qualification:0,preference:0,continuity:0,feedback:0}};
 const facultyId=f.facultyId, courseId=c.courseId;
 const weights=config_.weights||{}; const reqExp=c.requiredExpertise||[]; const exp=f.expertise||[]; const pubs=f.publications||[];
 const matched=reqExp.filter(x=>exp.some(e=>e.toLowerCase().includes(x.toLowerCase()))); const matchedPublications=reqExp.filter(x=>pubs.some(e=>e.toLowerCase().includes(x.toLowerCase())));
 const expertisePercent=reqExp.length?Math.round(matched.length/reqExp.length*100):100; const publicationPercent=reqExp.length?Math.round(matchedPublications.length/reqExp.length*100):100;
 const expertise=Math.round(expertisePercent*Number(weights.expertise||35)/100); const publication=Math.round(publicationPercent*Number(weights.publication||15)/100);
 const reqQ=c.requiredQualification||[]; const qualification=reqQ.length?(reqQ.some(x=>(f.qualifications||[]).some(q=>q.toLowerCase().includes(x.toLowerCase())))?Number(weights.qualification||20):0):Number(weights.qualification||20);
 const pref=(f.preferences||[]).find(p=>String(p.courseId)===String(courseId)); const rank=pref?.rank??99; const preference=rank===1?Number(weights.preference||15):rank===2?Math.round(Number(weights.preference||15)*.7):rank<99?Math.round(Number(weights.preference||15)*.4):0;
 const currentSequence=sequencePart(c.courseName); const taughtExact=h.some(x=>String(x.courseId)===String(courseId)); const priorSequence=currentSequence&&previousPart(currentSequence.part); const taughtPrior=priorSequence&&(historyCourses||[]).some(previous=>{const item=sequencePart(previous?.courseName);return item?.base===currentSequence.base&&item.part===priorSequence;});
 const continuity=taughtPrior?Number(weights.continuity||10):taughtExact?Math.round(Number(weights.continuity||10)*.5):0;
 const feedback=Math.min(Number(weights.feedback||5),Math.max(0,Number(h.find(x=>String(x.courseId)===String(courseId))?.feedbackScore||0)));
 const added=Number(c.credits)||((c.theoryHours||0)+(c.tutorialHours||0)+(c.labHours||0))||3; const current=Number(f.currentWorkload)||0;
 const nominalMax=Number(config_.maxWorkload)||Number(f.maxWorkload)||18;
 // Administrative load (committee work, coordinator duties, etc.) eats into
 // teaching capacity before we ever look at a course, per the "subtract
 // administrative responsibilities" step of the allocation workflow.
 const adminLoad=Number(f.adminLoadHours)||0; const max=Math.max(0,nominalMax-adminLoad);
 const hardViolations=[];
 if(!qualification)hardViolations.push('required qualification not met');
 if(current+added>max)hardViolations.push('maximum workload would be exceeded');
 // A faculty member on leave/sabbatical is a hard exclusion, not a scoring
 // penalty - they should never be proposed for a *new* allocation this
 // term, however good the expertise match looks on paper.
 if(f.onLeave)hardViolations.push(f.leaveReason?`faculty is on leave (${f.leaveReason})`:'faculty is on leave/sabbatical this term');
 return {facultyId,courseId,score:expertise+publication+qualification+preference+continuity+feedback,breakdown:{expertise,publication,qualification,preference,continuity,feedback},hardViolations,verified:{faculty:f.name,course:c.courseName,expertisePercent,publicationPercent,preferenceRank:rank,continuity:{taughtExact,taughtPrior,sequence:currentSequence?.base||null},workload:{current,added,nominalMax,adminLoad,max,available:Math.max(0,max-current)},onLeave:!!f.onLeave,matchedExpertise:matched,matchedPublications,qualifications:f.qualifications||[]}};
}

// DB-backed wrapper used everywhere in the app. Fetches the records, then
// delegates all the actual math to computeScore() above.
export async function calculateRecommendationScore(facultyId,courseId){
 const [f,c,h,config]=await Promise.all([findFaculty(facultyId),findCourse(courseId),facultyHistory(facultyId),getAllocationConfig()]);
 if(!f||!c)return {facultyId,courseId,score:0,hardViolations:['missing faculty/course'],breakdown:{expertise:0,publication:0,qualification:0,preference:0,continuity:0,feedback:0}};
 const historyCourses=await Promise.all(h.map(x=>findCourse(x.courseId)));
 return computeScore(f,c,h,historyCourses,config);
}
