import React,{useEffect,useMemo,useState} from 'react';
import {BookOpen,Clock3,Plus,Trash2,Trophy,Filter} from 'lucide-react';
import {Card,PageTitle,Modal,Field,Badge,AskAgentButton} from '../components/UI';
import {apiRequest} from '../api';

export default function Courses(){
 const [items,setItems]=useState([]),[requests,setRequests]=useState([]),[faculty,setFaculty]=useState([]),[open,setOpen]=useState(false),[error,setError]=useState('');
 const [topFilter,setTopFilter]=useState(false);
 const [form,setForm]=useState({code:'',name:'',credits:'4',theory:'3',lab:'0',hours:'5',sections:'A'});

 const load=async()=>{
  try{
   const [c,r,f]=await Promise.all([
    apiRequest({method:'GET',url:'/data/courses'}),
    apiRequest({method:'GET',url:'/data/requests'}),
    apiRequest({method:'GET',url:'/data/faculty'})
   ]);
   setItems(c.data||[]);setRequests(r.data||[]);setFaculty(f.data||[]);
  }catch(e){setError(e?.response?.data?.message||'Could not load courses')}
 };
 useEffect(()=>{load()},[]);

 const facultyName=id=>faculty.find(x=>x.facultyId===id)?.name||id;

 // Top faculty per course (moved here from Faculty Requests): the HOD-approved
 // faculty if one exists, otherwise the highest AI-recommended score for that course.
 const topByCourse=useMemo(()=>{
  const byCourse={};
  for(const r of requests){
   const cur=byCourse[r.courseId];
   const better=(a,b)=>{
    const aApproved=a.status==='approved',bApproved=b.status==='approved';
    if(aApproved!==bApproved)return aApproved?a:b;
    return (Number(a.recommendationScore)||0)>=(Number(b.recommendationScore)||0)?a:b;
   };
   byCourse[r.courseId]=cur?better(cur,r):r;
  }
  return byCourse;
 },[requests]);

 const visibleItems=topFilter?items.filter(c=>topByCourse[c.courseId]):items;
 const topCount=items.filter(c=>topByCourse[c.courseId]).length;

 const add=async()=>{
  if(!form.name.trim())return setError('Course name is required');
  try{
   const sections=form.sections.split(',').map(s=>({sectionId:`${form.code||'COURSE'}-${s.trim()}`,sectionName:s.trim(),studentCount:0,hoursPerWeek:Number(form.hours)||5}));
   const r=await apiRequest({method:'POST',url:'/data/courses',data:{courseId:form.code||undefined,courseCode:form.code||undefined,courseName:form.name,credits:Number(form.credits),theoryHours:Number(form.theory),labHours:Number(form.lab),sections,studentStrength:0}});
   setItems(v=>[...v,r.data]);setOpen(false);setForm({code:'',name:'',credits:'4',theory:'3',lab:'0',hours:'5',sections:'A'});setError('');
  }catch(e){setError(e?.response?.data?.message||'Could not add course')}
 };

 const remove=async(id)=>{
  if(!confirm('Deactivate this course?'))return;
  try{await apiRequest({method:'DELETE',url:`/data/courses/${id}`});setItems(v=>v.filter(x=>x.courseId!==id))}
  catch(e){setError(e?.response?.data?.message||'Could not remove course')}
 };

 return <div>
  <PageTitle eyebrow="ACADEMIC CATALOG" title="Courses & Sections" desc="Course requirements, sections, student strength and teaching load used by the allocation agent." action={<button type="button" onClick={()=>setOpen(true)} className="px-4 py-2.5 rounded-xl btn-primary text-sm flex gap-2 items-center"><Plus size={17}/> Add course</button>}/>
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}

  <div className="mb-4 flex items-center gap-2 flex-wrap">
   <button type="button" onClick={()=>setTopFilter(v=>!v)} className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:-translate-y-0.5 ${topFilter?'bg-amber-50 border-amber-300 text-amber-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
    <Trophy size={14}/> {topFilter?'Showing sections with top faculty':'Filter: sections with top faculty'}
    <Badge tone={topFilter?'amber':'slate'}>{topCount}</Badge>
   </button>
   {topFilter&&<button type="button" onClick={()=>setTopFilter(false)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600"><Filter size={13}/> Clear filter</button>}
  </div>

  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
   {visibleItems.map(c=>{
    const top=topByCourse[c.courseId];
    const topSectionLabel=c.sections?.[0]?.sectionName?`Section ${c.sections[0].sectionName}`:'All sections';
    return <Card key={c.courseId} className="p-5 card-hover">
     <div className="flex items-start justify-between">
      <div><div className="text-xs font-bold text-fuchsia-700">{c.courseCode}</div><h3 className="font-display font-semibold text-lg mt-1 text-slate-800">{c.courseName}</h3></div>
      <button type="button" onClick={()=>remove(c.courseId)} className="p-2 rounded-lg text-rose-700 hover:bg-rose-400/10 hover:scale-110 transition"><Trash2 size={15}/></button>
     </div>
     <div className="grid grid-cols-3 gap-2 mt-5 text-xs">
      <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">Credits</div><b className="text-sm text-slate-800">{c.credits}</b></div>
      <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">Sections</div><b className="text-sm text-slate-800">{(c.sections||[]).map(s=>s.sectionName||s).join(', ')||'A'}</b></div>
      <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">Hours</div><b className="text-sm text-slate-800">{(c.theoryHours||0)+(c.labHours||0)+(c.tutorialHours||0)}/wk</b></div>
     </div>
     <div className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-4 text-xs text-slate-500">
      <span className="flex gap-1.5 items-center"><BookOpen size={14}/> Theory {c.theoryHours||0}h</span>
      <span className="flex gap-1.5 items-center"><Clock3 size={14}/> Lab {c.labHours||0}h</span>
     </div>
     {top?<div className="mt-3 p-3 rounded-xl border border-amber-200 bg-amber-50/70">
      <div className="flex items-center justify-between gap-2">
       <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Trophy size={13}/> Top faculty · {topSectionLabel}</div>
       <Badge tone={top.status==='approved'?'green':top.status==='rejected'?'red':'amber'}>{top.status==='approved'?'HOD approved':top.status==='rejected'?'Rejected':'Top pick'}</Badge>
      </div>
      <div className="flex items-center justify-between mt-2">
       <div className="text-sm font-semibold text-blue-700">{facultyName(top.facultyId)}</div>
       <div className="text-xs font-bold text-slate-500">{top.recommendationScore??'—'}{top.recommendationScore?'/100':''}</div>
      </div>
     </div>:<div className="mt-3 text-[11px] text-slate-400">No faculty requests yet for this course.</div>}
     <div className="mt-3 flex justify-end">
      <AskAgentButton prompt={`Analyze ${c.courseCode||c.courseName} (${c.courseId}) and recommend the best faculty allocation across its sections.`} label="Ask agent about this course"/>
     </div>
    </Card>;
   })}
   {!visibleItems.length&&<div className="col-span-full p-8 text-center text-sm text-slate-500">{topFilter?'No sections have a top faculty pick yet.':'No courses yet.'}</div>}
  </div>

  <Modal open={open} title="Add course" onClose={()=>setOpen(false)}>
   <div className="grid sm:grid-cols-2 gap-3">
    <Field label="Course code" value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="CS307"/>
    <Field label="Course name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Deep Learning"/>
    <Field label="Credits" value={form.credits} onChange={e=>setForm({...form,credits:e.target.value})}/>
    <Field label="Teaching hours/week" value={form.hours} onChange={e=>setForm({...form,hours:e.target.value})}/>
    <Field label="Theory hours" value={form.theory} onChange={e=>setForm({...form,theory:e.target.value})}/>
    <Field label="Lab hours" value={form.lab} onChange={e=>setForm({...form,lab:e.target.value})}/>
    <Field label="Sections" value={form.sections} onChange={e=>setForm({...form,sections:e.target.value})}/>
   </div>
   <button type="button" onClick={add} className="mt-5 w-full py-2.5 rounded-xl btn-primary text-sm">Add course</button>
  </Modal>
 </div>;
}
