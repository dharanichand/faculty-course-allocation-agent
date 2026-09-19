import React,{useEffect,useMemo,useState} from 'react';
import {BookOpen,Clock3,Plus,Trash2,Trophy,Filter,Search,X,RefreshCcw,Loader2} from 'lucide-react';
import {Card,PageTitle,Modal,Field,Badge,AskAgentButton} from '../components/UI';
import {apiRequest} from '../api';
import {formatSection} from '../utils/section';

// Multiple independent filters can be combined at once: a faculty-status
// filter (chips below) plus a free-text search box across code/name/dept.
const STATUS_FILTERS=[
 {id:'all',label:'All courses'},
 {id:'top',label:'Top faculty pick'},
 {id:'approved',label:'HOD approved'},
 {id:'unassigned',label:'No faculty yet'},
];

export default function Courses(){
 const [items,setItems]=useState([]),[requests,setRequests]=useState([]),[faculty,setFaculty]=useState([]),[open,setOpen]=useState(false),[error,setError]=useState('');
 const [statusFilter,setStatusFilter]=useState('all');
 const [search,setSearch]=useState('');
 const [reassignFor,setReassignFor]=useState(null);
 const [reassignFaculty,setReassignFaculty]=useState('');
 const [reassignReason,setReassignReason]=useState('');
 const [reassignBusy,setReassignBusy]=useState(false);
 const [notice,setNotice]=useState('');
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

 const topCount=items.filter(c=>topByCourse[c.courseId]).length;
 const approvedCount=items.filter(c=>topByCourse[c.courseId]?.status==='approved').length;
 const unassignedCount=items.filter(c=>!topByCourse[c.courseId]).length;
 const filterCounts={all:items.length,top:topCount,approved:approvedCount,unassigned:unassignedCount};

 const visibleItems=useMemo(()=>{
  let out=items;
  if(statusFilter==='top')out=out.filter(c=>topByCourse[c.courseId]);
  else if(statusFilter==='approved')out=out.filter(c=>topByCourse[c.courseId]?.status==='approved');
  else if(statusFilter==='unassigned')out=out.filter(c=>!topByCourse[c.courseId]);
  const q=search.trim().toLowerCase();
  if(q){
   out=out.filter(c=>[c.courseCode,c.courseName,c.department,...(c.requiredExpertise||[])].filter(Boolean).join(' ').toLowerCase().includes(q));
  }
  return out;
 },[items,statusFilter,search,topByCourse]);

 const startReassign=(course,top)=>{
  setNotice('');
  setReassignFor(course.courseId);
  setReassignFaculty(top?.facultyId||'');
  setReassignReason('');
 };
 const cancelReassign=()=>{setReassignFor(null);setReassignFaculty('');setReassignReason('')};

 const submitReassign=async(top)=>{
  if(!top?._id||!reassignFaculty)return;
  try{
   setReassignBusy(true);setError('');
   await apiRequest({method:'POST',url:`/allocations/${top._id}/override`,data:{facultyId:reassignFaculty,reason:reassignReason||'Faculty reassigned after semester start'}});
   setNotice('Faculty reassigned. Both the previous and newly assigned faculty have been emailed.');
   cancelReassign();
   await load();
  }catch(e){setError(e?.response?.data?.message||'Could not reassign faculty')}
  finally{setReassignBusy(false)}
 };

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
  {notice&&<div className="mb-4 p-3 rounded-xl alert-success text-sm">{notice}</div>}

  <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
   <div className="relative flex-1 max-w-sm">
    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by code, name or department…" className="field-input w-full pl-9 pr-8 py-2.5 rounded-xl outline-none text-sm"/>
    {search&&<button type="button" onClick={()=>setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14}/></button>}
   </div>
   <div className="flex items-center gap-2 flex-wrap">
    <Filter size={14} className="text-slate-400 hidden sm:block"/>
    {STATUS_FILTERS.map(f=><button key={f.id} type="button" onClick={()=>setStatusFilter(f.id)} className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:-translate-y-0.5 ${statusFilter===f.id?'bg-amber-50 border-amber-300 text-amber-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
     {f.id==='top'&&<Trophy size={13}/>} {f.label}
     <Badge tone={statusFilter===f.id?'amber':'slate'}>{filterCounts[f.id]}</Badge>
    </button>)}
   </div>
  </div>

  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
   {visibleItems.map(c=>{
    const top=topByCourse[c.courseId];
    const topSectionLabel=c.sections?.[0]?(`Section ${formatSection(c.year,c.sections[0].sectionId||c.sections[0].sectionName)}`):'All sections';
    return <Card key={c.courseId} className="p-5 card-hover">
     <div className="flex items-start justify-between">
      <div><div className="text-xs font-bold text-fuchsia-700">{c.courseCode}</div><h3 className="font-display font-semibold text-lg mt-1 text-slate-800">{c.courseName}</h3></div>
      <button type="button" onClick={()=>remove(c.courseId)} className="p-2 rounded-lg text-rose-700 hover:bg-rose-400/10 hover:scale-110 transition"><Trash2 size={15}/></button>
     </div>
     <div className="grid grid-cols-3 gap-2 mt-5 text-xs">
      <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">Credits</div><b className="text-sm text-slate-800">{c.credits}</b></div>
      <div className="p-3 rounded-xl bg-slate-50"><div className="text-slate-500">Year</div><b className="text-sm text-slate-800">{c.year?`Year ${c.year}`:'—'}</b></div>
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
      {top.status==='approved'&&reassignFor!==c.courseId&&<button type="button" onClick={()=>startReassign(c,top)} className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 hover:text-amber-800"><RefreshCcw size={12}/> Reassign faculty (allowed even after semester start)</button>}
      {reassignFor===c.courseId&&<div className="mt-3 pt-3 border-t border-amber-200/70 space-y-2" onClick={e=>e.stopPropagation()}>
       <select value={reassignFaculty} onChange={e=>setReassignFaculty(e.target.value)} className="field-input w-full px-3 py-2 rounded-lg text-xs">
        <option value="">Select new faculty…</option>
        {faculty.filter(f=>f.facultyId!==top.facultyId).map(f=><option key={f.facultyId} value={f.facultyId}>{f.name}</option>)}
       </select>
       <input value={reassignReason} onChange={e=>setReassignReason(e.target.value)} placeholder="Reason for change (optional)" className="field-input w-full px-3 py-2 rounded-lg text-xs"/>
       <div className="flex gap-2">
        <button type="button" disabled={!reassignFaculty||reassignBusy} onClick={()=>submitReassign(top)} className="flex-1 py-2 rounded-lg btn-primary text-xs disabled:opacity-40 flex items-center justify-center gap-1.5">{reassignBusy?<Loader2 size={13} className="animate-spin"/>:<RefreshCcw size={13}/>} Confirm reassignment</button>
        <button type="button" disabled={reassignBusy} onClick={cancelReassign} className="btn-outline px-3 py-2 rounded-lg text-xs">Cancel</button>
       </div>
       <p className="text-[10px] text-slate-400 leading-4">The previous and newly assigned faculty are notified automatically by email.</p>
      </div>}
     </div>:<div className="mt-3 text-[11px] text-slate-400">No faculty requests yet for this course.</div>}
     <div className="mt-3 flex justify-end">
      <AskAgentButton prompt={`Analyze ${c.courseCode||c.courseName} (${c.courseId}) and recommend the best faculty allocation across its sections.`} label="Ask agent about this course"/>
     </div>
    </Card>;
   })}
   {!visibleItems.length&&<div className="col-span-full p-8 text-center text-sm text-slate-500">{search||statusFilter!=='all'?'No courses match your search and filters.':'No courses yet.'}</div>}
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
