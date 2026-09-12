import React,{useEffect,useState} from 'react';
import {Check,X,RotateCcw,Sparkles,Scale,History,GraduationCap,BriefcaseBusiness,ChevronLeft,ChevronRight} from 'lucide-react';
import {Card,PageTitle,Badge,AskAgentButton} from '../components/UI';
import {apiRequest} from '../api';

export default function AllocationReview(){
 const [items,setItems]=useState([]),[selected,setSelected]=useState(0),[override,setOverride]=useState(false),[reason,setReason]=useState(''),[overrideFaculty,setOverrideFaculty]=useState(''),[faculty,setFaculty]=useState([]),[courses,setCourses]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 const load=async()=>{
  try{
   const [a,f,c]=await Promise.all([
    apiRequest({method:'GET',url:'/allocations'}),
    apiRequest({method:'GET',url:'/data/faculty'}),
    apiRequest({method:'GET',url:'/data/courses'})
   ]);
   const nextItems=a.data||[];
   setItems(nextItems);
   setSelected(i=>Math.min(i,Math.max(0,nextItems.length-1)));
   setFaculty(f.data||[]);
   setCourses(c.data||[]);
   if(nextItems.length)setOverrideFaculty(prev=>prev||nextItems[0]?.facultyId||'');
  }catch(e){setMessage(e?.response?.data?.message||'Could not load review requests.')}
 };

 useEffect(()=>{load()},[]);

 const current=items[selected];
 const name=(id)=>faculty.find(f=>f.facultyId===id)?.name||id;
 const courseName=current?(current.courseName||courses.find(c=>c.courseId===current.courseId)?.courseName||current.courseId):'';

 const removeCurrentAndAdvance=(remaining)=>{
  const next=remaining||[];
  setItems(next);
  setOverride(false);
  setReason('');
  // Keep the same screen position when possible so the next request appears.
  // If the last request was processed, move back to the new last request.
  setSelected(prev=>Math.min(prev,Math.max(0,next.length-1)));
 };

 const decide=async(action)=>{
  if(!current)return;
  try{
   setBusy(true);setMessage('');
   const url=action==='approve'?`/allocations/${current._id}/approve`:`/allocations/${current._id}/reject`;
   const response=await apiRequest({method:'POST',url,data:action==='reject'?{reason}:undefined});
   removeCurrentAndAdvance(response.data?.remaining||[]);
   setMessage(`Request ${action==='approve'?'approved':'rejected'}. It has been removed from HOD Review.`);
  }catch(e){setMessage(e?.response?.data?.message||'Decision failed.')}
  finally{setBusy(false)}
 };

 const saveOverride=async()=>{
  if(!current||!overrideFaculty)return;
  try{
   setBusy(true);setMessage('');
   const response=await apiRequest({method:'POST',url:`/allocations/${current._id}/override`,data:{facultyId:overrideFaculty,reason}});
   removeCurrentAndAdvance(response.data?.remaining||[]);
   setMessage('Override approved. This request has been removed from HOD Review.');
  }catch(e){setMessage(e?.response?.data?.message||'Override failed.')}
  finally{setBusy(false)}
 };

 const goPrevious=()=>{if(!busy)setSelected(i=>Math.max(0,i-1));setOverride(false);setMessage('')};
 const goNext=()=>{if(!busy)setSelected(i=>Math.min(items.length-1,i+1));setOverride(false);setMessage('')};

 if(!items.length)return <div><PageTitle eyebrow="HUMAN-IN-THE-LOOP" title="HOD Allocation Review" desc="AI recommends; the HOD decides. Review each faculty request individually."/>{message&&<div className="mb-4 p-3 rounded-xl alert-info text-sm">{message}</div>}<Card className="p-10 text-center"><Check className="mx-auto text-emerald-700" size={36}/><h2 className="font-display font-semibold text-lg mt-3 text-slate-800">No requests waiting for review</h2><p className="text-sm text-slate-500 mt-1">All current allocation requests have been reviewed.</p></Card></div>;

 return <div className="pb-24">
  <PageTitle eyebrow="HUMAN-IN-THE-LOOP" title="HOD Allocation Review" desc="AI recommends; the HOD decides. Review one faculty request at a time."/>
  {message&&<div className="mb-4 p-3 rounded-xl alert-info text-sm">{message}</div>}
  <Card className="overflow-hidden">
   <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-fuchsia-500/8 to-transparent">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
     <div>
      <div className="text-xs font-bold text-fuchsia-700">{courseName} • {current.sectionId||'SECTION A'}</div>
      <h2 className="font-display text-xl font-semibold mt-1 text-slate-800">Allocation candidate</h2>
      <p className="text-sm text-slate-500 mt-1">Faculty request from {name(current.facultyId)} • Preference #{current.preferenceRank||1}</p>
     </div>
     <div className="flex items-center gap-2"><span className="text-xs text-slate-500">Request {selected+1} of {items.length}</span><Badge tone="red">Pending review</Badge><AskAgentButton prompt={`What happens if I assign ${name(current.facultyId)} (${current.facultyId}) to ${courseName} (${current.courseId})? Check workload and conflicts before I decide.`} label="Ask agent"/></div>
    </div>
   </div>
   <div className="p-5">
    <div className="flex items-center gap-2 text-sm font-bold mb-4 text-slate-700"><Sparkles size={17} className="text-fuchsia-700"/> AI recommendation: <span className="text-fuchsia-700">{name(current.facultyId)}</span></div>
    <div className="p-5 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/5">
     <div className="flex justify-between"><div><div className="font-semibold text-slate-800">{name(current.facultyId)}</div><div className="text-xs text-slate-500 mt-1">Faculty ID: {current.facultyId}</div></div><div className="text-right"><div className="font-display text-2xl font-bold text-slate-900">{current.recommendationScore??'—'}<span className="text-xs font-semibold text-slate-500">/100</span></div><Badge tone="green">Recommended</Badge></div></div>
     <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 text-xs">
      <div className="p-2.5 bg-slate-50 rounded-lg"><GraduationCap size={14} className="text-cyan-700 mb-1"/><span className="text-slate-500">Qualification</span><b className="block text-slate-700">Verified</b></div>
      <div className="p-2.5 bg-slate-50 rounded-lg"><Scale size={14} className="text-cyan-700 mb-1"/><span className="text-slate-500">Expertise</span><b className="block text-slate-700">Verified</b></div>
      <div className="p-2.5 bg-slate-50 rounded-lg"><History size={14} className="text-cyan-700 mb-1"/><span className="text-slate-500">Preference</span><b className="block text-slate-700">#{current.preferenceRank||1}</b></div>
      <div className="p-2.5 bg-slate-50 rounded-lg"><BriefcaseBusiness size={14} className="text-cyan-700 mb-1"/><span className="text-slate-500">Status</span><b className="block text-slate-700">{current.status}</b></div>
     </div>
    </div>
    <div className="mt-5 p-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5"><div className="flex gap-3"><Sparkles size={18} className="text-cyan-700 mt-0.5"/><div><div className="font-semibold text-sm text-slate-800">Why this recommendation?</div><p className="text-sm text-slate-500 mt-1">{current.recommendationReason||'The backend has accepted this request for HOD review.'}</p></div></div></div>
    <div className="mt-5 flex flex-wrap gap-3">
     <button disabled={busy} onClick={()=>decide('approve')} className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm flex gap-2 items-center disabled:opacity-50 transition"><Check size={17}/> Approve recommendation</button>
     <button disabled={busy} onClick={()=>decide('reject')} className="btn-outline px-5 py-2.5 rounded-xl font-semibold text-sm flex gap-2 items-center disabled:opacity-50"><X size={17}/> Reject</button>
     <button disabled={busy} onClick={()=>setOverride(true)} className="px-5 py-2.5 rounded-xl border border-cyan-400/30 text-cyan-700 hover:bg-cyan-400/10 font-semibold text-sm flex gap-2 items-center disabled:opacity-50 transition"><RotateCcw size={17}/> Override</button>
    </div>
    {override&&<div className="mt-4 p-4 border border-amber-400/25 bg-amber-400/5 rounded-xl"><div className="font-semibold text-sm text-slate-800">Override allocation</div><div className="grid md:grid-cols-2 gap-3 mt-3"><select value={overrideFaculty} onChange={e=>setOverrideFaculty(e.target.value)} className="field-input px-3 py-2.5 rounded-lg">{faculty.map(f=><option key={f.facultyId} value={f.facultyId}>{f.name}</option>)}</select><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for override" className="field-input px-3 py-2.5 rounded-lg"/></div><button disabled={busy} onClick={saveOverride} className="mt-3 px-4 py-2 rounded-lg btn-primary text-sm disabled:opacity-50">Save override & audit</button></div>}
   </div>
  </Card>

  {/* Bottom-right request navigation: these are separate requests, not a visual queue. */}
  <div className="fixed right-8 bottom-7 z-40 flex items-center gap-2 panel-solid shadow-2xl rounded-2xl p-2">
   <button type="button" disabled={busy||selected===0} onClick={goPrevious} className="btn-outline px-4 py-2.5 rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft size={17}/> Previous</button>
   <span className="px-2 text-xs font-semibold text-slate-500 min-w-[76px] text-center">{selected+1} / {items.length}</span>
   <button type="button" disabled={busy||selected===items.length-1} onClick={goNext} className="btn-primary px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">Next <ChevronRight size={17}/></button>
  </div>
 </div>
}
