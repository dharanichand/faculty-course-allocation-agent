import React,{useEffect,useMemo,useState} from 'react';
import {Layers,Users2,BookOpen} from 'lucide-react';
import {Card,PageTitle,Badge} from '../components/UI';
import {apiRequest} from '../api';
import {sectionNumberOf,sectionNumbersOf,sectionLabelOf,yearNumberOf} from '../utils/section';

// Tabs shown in a fixed, sensible order regardless of what's in the data.
// M.Tech courses are kept apart from the B.Tech years (they are a separate cohort).
const GROUP_ORDER=['I','II','III','IV','MTECH'];
const GROUP_LABEL={I:'1st Year',II:'2nd Year',III:'3rd Year',IV:'4th Year',MTECH:'M.Tech'};
const groupOf=c=>String(c.program||'').startsWith('M')?'MTECH':c.year;
const groupPrefix=g=>g==='MTECH'?'M':yearNumberOf(g);

export default function Sections(){
 const [courses,setCourses]=useState([]),[requests,setRequests]=useState([]),[faculty,setFaculty]=useState([]);
 const [error,setError]=useState('');
 const [yearFilter,setYearFilter]=useState('all');

 useEffect(()=>{
  (async()=>{
   try{
    const [c,r,f]=await Promise.all([
     apiRequest({method:'GET',url:'/data/courses'}),
     apiRequest({method:'GET',url:'/data/requests'}),
     apiRequest({method:'GET',url:'/data/faculty'})
    ]);
    setCourses(c.data||[]);setRequests(r.data||[]);setFaculty(f.data||[]);
   }catch(e){setError(e?.response?.data?.message||'Could not load sections')}
  })();
 },[]);

 const facultyName=id=>faculty.find(x=>x.facultyId===id)?.name||id;

 // Every counted allocation (rejected ones are not "assigned") keyed by course + section number.
 // One section can have several faculty (theory lead + tutorial/lab co-instructors), and one
 // row can cover several sections ("12,19,4,7"), so each key holds a list.
 const {byCourseSection,unnumberedByCourse}=useMemo(()=>{
  const m={},u={};
  for(const r of requests){
   if(r.status==='rejected')continue;
   const nums=sectionNumbersOf(r.sectionId);
   if(!nums.length){ if(r.sectionId){(u[r.courseId]=u[r.courseId]||[]).push(r)} continue; }
   for(const n of nums){const key=`${r.courseId}|${n}`;(m[key]=m[key]||[]).push(r)}
  }
  return {byCourseSection:m,unnumberedByCourse:u};
 },[requests]);

 const groupsPresent=useMemo(()=>{
  const present=new Set(courses.map(groupOf).filter(Boolean));
  return GROUP_ORDER.filter(y=>present.has(y));
 },[courses]);
 const visibleGroups=yearFilter==='all'?groupsPresent:groupsPresent.filter(y=>y===yearFilter);

 // For a year: every distinct section number that appears across that year's courses
 // (or in an assignment of one of them), each with the subjects taught in it and the
 // faculty assigned to each subject in that specific section.
 const groupsByYear=useMemo(()=>{
  const out={};
  for(const year of visibleGroups){
   const inGroup=courses.filter(c=>groupOf(c)===year);
   const nums=new Set();
   for(const c of inGroup){
    for(const s of (c.sections||[])){const n=sectionNumberOf(s.sectionId||s.sectionName);if(n)nums.add(Number(n))}
    for(const key of Object.keys(byCourseSection)){if(key.startsWith(`${c.courseId}|`))nums.add(Number(key.split('|')[1]))}
   }
   const sorted=[...nums].sort((a,b)=>a-b);
   const staff=(courseId,num)=>{
    const seen=new Set();
    return (byCourseSection[`${courseId}|${num}`]||[]).filter(a=>{const k=`${a.facultyId}|${a.sheetRow??a._id}`;if(seen.has(k))return false;seen.add(k);return true})
     .map(a=>({key:String(a._id),facultyId:a.facultyId,label:facultyName(a.facultyId),status:a.status,hours:a.hours,batch:sectionLabelOf(a.sectionId)}));
   };
   const prefix=groupPrefix(year);
   out[year]=sorted.map(num=>({
    num,label:`${prefix}S${num}`,
    subjects:inGroup.map(c=>({c,staff:staff(c.courseId,num)}))
     .filter(({c,staff})=>staff.length||(c.sections||[]).some(s=>sectionNumberOf(s.sectionId||s.sectionName)===String(num)))
     .map(({c,staff})=>({courseId:c.courseId,courseCode:c.courseCode||c.courseId,courseName:c.courseName,staff}))
   }));
   // Assignments whose section is a branch batch ("EEE", "Food Tech") have no section number.
   const other=inGroup.flatMap(c=>(unnumberedByCourse[c.courseId]||[]).map(a=>({c,a})));
   if(other.length)out[year].push({num:'other',label:'Branch-specific batches',other});
  }
  return out;
 },[visibleGroups,courses,byCourseSection,unnumberedByCourse,faculty]);

 return <div>
  <PageTitle eyebrow="TIMETABLE VIEW" title="Sections" desc="Every section, the subjects taught in it and the faculty assigned to each subject (as in the workload sheet)." />
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}

  <div className="mb-5 flex items-center gap-2 flex-wrap">
   <button type="button" onClick={()=>setYearFilter('all')} className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:-translate-y-0.5 ${yearFilter==='all'?'bg-blue-50 border-blue-300 text-blue-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>All years</button>
   {groupsPresent.map(y=><button key={y} type="button" onClick={()=>setYearFilter(y)} className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:-translate-y-0.5 ${yearFilter===y?'bg-blue-50 border-blue-300 text-blue-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{GROUP_LABEL[y]||`Year ${y}`}</button>)}
  </div>

  {visibleGroups.map(year=><div key={year} className="mb-8">
   <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700"><Layers size={15}/> {GROUP_LABEL[year]||`Year ${year}`}</div>
   <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
    {(groupsByYear[year]||[]).map(sec=>sec.num==='other'
     ?<Card key="other" className="p-5 card-hover">
       <div className="flex items-center justify-between"><div className="font-display font-semibold text-lg text-slate-800">{sec.label}</div><Badge tone="blue">{sec.other.length} assignment{sec.other.length===1?'':'s'}</Badge></div>
       <div className="mt-4 space-y-2.5">{sec.other.map(({c,a})=><div key={a._id} className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-50">
        <div className="min-w-0"><div className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-700"><BookOpen size={12}/> {c.courseCode||c.courseId}</div><div className="text-sm text-slate-700 truncate">{c.courseName} · {sectionLabelOf(a.sectionId)}</div></div>
        <div className="shrink-0 text-right"><div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 justify-end"><Users2 size={12}/> {facultyName(a.facultyId)}</div><Badge tone={a.status==='approved'?'green':'amber'}>{a.status==='approved'?'Approved':'Recommended'}</Badge></div>
       </div>)}</div>
      </Card>
     :<Card key={sec.label} className="p-5 card-hover">
     <div className="flex items-center justify-between">
      <div className="font-display font-semibold text-lg text-slate-800">Section {sec.label}</div>
      <Badge tone="blue">{sec.subjects.length} subject{sec.subjects.length===1?'':'s'}</Badge>
     </div>
     <div className="mt-4 space-y-2.5">
      {sec.subjects.map(sub=><div key={sub.courseId} className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-50">
       <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-700"><BookOpen size={12}/> {sub.courseCode}</div>
        <div className="text-sm text-slate-700 truncate">{sub.courseName}</div>
       </div>
       <div className="shrink-0 text-right space-y-1">
        {sub.staff.length?sub.staff.map(s=><div key={s.key}>
         <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 justify-end"><Users2 size={12}/> {s.label}{s.hours?<span className="text-slate-400 font-normal">· {s.hours}h</span>:null}</div>
         <Badge tone={s.status==='approved'?'green':'amber'}>{s.status==='approved'?'Approved':'Recommended'}</Badge>
        </div>):<Badge tone="slate">No faculty yet</Badge>}
       </div>
      </div>)}
      {!sec.subjects.length&&<div className="text-xs text-slate-400">No subjects mapped to this section.</div>}
     </div>
    </Card>)}
    {!(groupsByYear[year]||[]).length&&<div className="col-span-full p-6 text-center text-sm text-slate-500">No sections found for this year.</div>}
   </div>
  </div>)}
  {!visibleGroups.length&&<div className="p-8 text-center text-sm text-slate-500">No section data available yet.</div>}
 </div>;
}
