import React,{useEffect,useMemo,useState} from 'react';
import {Layers,Users2,BookOpen} from 'lucide-react';
import {Card,PageTitle,Badge} from '../components/UI';
import {apiRequest} from '../api';
import {sectionNumberOf,yearNumberOf} from '../utils/section';

// Year tabs shown in a fixed, sensible order regardless of what's in the data.
const YEAR_ORDER=['I','II','III','IV'];
const YEAR_LABEL={I:'1st Year',II:'2nd Year',III:'3rd Year',IV:'4th Year'};

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

 // Best allocation (approved wins, else the highest-scoring recommendation)
 // for a given course+section-number combination.
 const bestByCourseSection=useMemo(()=>{
  const m={};
  for(const r of requests){
   const num=sectionNumberOf(r.sectionId);
   if(!num)continue;
   const key=`${r.courseId}|${num}`;
   const better=(a,b)=>{
    const aApproved=a.status==='approved',bApproved=b.status==='approved';
    if(aApproved!==bApproved)return aApproved?a:b;
    return (Number(a.recommendationScore)||0)>=(Number(b.recommendationScore)||0)?a:b;
   };
   m[key]=m[key]?better(m[key],r):r;
  }
  return m;
 },[requests]);

 const yearsPresent=useMemo(()=>{
  const present=new Set(courses.map(c=>c.year).filter(Boolean));
  return YEAR_ORDER.filter(y=>present.has(y));
 },[courses]);

 const visibleYears=yearFilter==='all'?yearsPresent:yearsPresent.filter(y=>y===yearFilter);

 // For a year: every distinct section number that appears across that year's
 // courses, each with the list of courses (subjects) offered in it and the
 // faculty currently assigned to each subject in that specific section.
 const groupsByYear=useMemo(()=>{
  const out={};
  for(const year of visibleYears){
   const coursesInYear=courses.filter(c=>c.year===year);
   const sectionNums=new Set();
   for(const c of coursesInYear)for(const s of (c.sections||[]))sectionNums.add(sectionNumberOf(s.sectionId||s.sectionName));
   const sorted=[...sectionNums].filter(Boolean).sort((a,b)=>Number(a)-Number(b));
   out[year]=sorted.map(num=>({
    num,
    label:`${yearNumberOf(year)}S${num}`,
    subjects:coursesInYear.filter(c=>(c.sections||[]).some(s=>sectionNumberOf(s.sectionId||s.sectionName)===num)).map(c=>{
     const alloc=bestByCourseSection[`${c.courseId}|${num}`];
     return {
      courseId:c.courseId,courseCode:c.courseCode||c.courseId,courseName:c.courseName,
      facultyId:alloc?.facultyId||null,facultyLabel:alloc?facultyName(alloc.facultyId):null,
      status:alloc?.status||null
     };
    })
   }));
  }
  return out;
 },[visibleYears,courses,bestByCourseSection,faculty]);

 return <div>
  <PageTitle eyebrow="TIMETABLE VIEW" title="Sections" desc="Every section, the subjects taught in it and the faculty currently assigned to each subject." />
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}

  <div className="mb-5 flex items-center gap-2 flex-wrap">
   <button type="button" onClick={()=>setYearFilter('all')} className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:-translate-y-0.5 ${yearFilter==='all'?'bg-blue-50 border-blue-300 text-blue-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>All years</button>
   {yearsPresent.map(y=><button key={y} type="button" onClick={()=>setYearFilter(y)} className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:-translate-y-0.5 ${yearFilter===y?'bg-blue-50 border-blue-300 text-blue-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{YEAR_LABEL[y]||`Year ${y}`}</button>)}
  </div>

  {visibleYears.map(year=><div key={year} className="mb-8">
   <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700"><Layers size={15}/> {YEAR_LABEL[year]||`Year ${year}`}</div>
   <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
    {(groupsByYear[year]||[]).map(sec=><Card key={sec.label} className="p-5 card-hover">
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
       <div className="shrink-0 text-right">
        {sub.facultyLabel?<>
         <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 justify-end"><Users2 size={12}/> {sub.facultyLabel}</div>
         <Badge tone={sub.status==='approved'?'green':'amber'}>{sub.status==='approved'?'HOD approved':'Recommended'}</Badge>
        </>:<Badge tone="slate">No faculty yet</Badge>}
       </div>
      </div>)}
      {!sec.subjects.length&&<div className="text-xs text-slate-400">No subjects mapped to this section.</div>}
     </div>
    </Card>)}
    {!(groupsByYear[year]||[]).length&&<div className="col-span-full p-6 text-center text-sm text-slate-500">No sections found for this year.</div>}
   </div>
  </div>)}
  {!visibleYears.length&&<div className="p-8 text-center text-sm text-slate-500">No section data available yet.</div>}
 </div>;
}
