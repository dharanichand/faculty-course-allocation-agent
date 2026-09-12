import React,{useEffect,useState} from 'react';
import {Check,X,RotateCcw,Sparkles,Scale,History,GraduationCap,BriefcaseBusiness,ChevronLeft,ChevronRight} from 'lucide-react';
import {Card,PageTitle,Badge} from '../components/UI';
import {apiRequest} from '../api';

export default function AllocationReview(){
 const [items,setItems]=useState([]),[selected,setSelected]=useState(0),[override,setOverride]=useState(false),[reason,setReason]=useState(''),[overrideFaculty,setOverrideFaculty]=useState(''),[faculty,setFaculty]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 const load=async()=>{
  try{
   const [a,f]=await Promise.all([
    apiRequest({method:'GET',url:'/allocations'}),
    apiRequest({method:'GET',url:'/data/faculty'})
   ]);
   const nextItems=a.data||[];
   setItems(nextItems);
   setSelected(i=>Math.min(i,Math.max(0,nextItems.length-1)));
   setFaculty(f.data||[]);
   if(nextItems.length)setOverrideFaculty(prev=>prev||nextItems[0]?.facultyId||'');
  }catch(e){setMessage(e?.response?.data?.message||'Could not load review requests.')}
 };

 useEffect(()=>{load()},[]);

 const current=items[selected];
 const name=(id)=>faculty.find(f=>f.facultyId===id)?.name||id;
 const courseName=current?(current.courseName||current.courseId):'';

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

 if(!items.length)return <div><PageTitle eyebrow="HUMAN-IN-THE-LOOP" title="HOD Allocation Review" desc="AI recommends; the HOD decides. Review each faculty request individually."/>{message&&<div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm">{message}</div>}<Card className="p-10 text-center"><Check className="mx-auto text-emerald-600" size={36}/><h2 className="font-bold text-lg mt-3">No requests waiting for review</h2><p className="text-sm text-slate-500 mt-1">All current allocation requests have been reviewed.</p></Card></div>;

 return <div className="pb-24">
  <PageTitle eyebrow="HUMAN-IN-THE-LOOP" title="HOD Allocation Review" desc="AI recommends; the HOD decides. Review one faculty request at a time."/>
  {message&&<div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm">{message}</div>}
  <Card className="overflow-hidden">
   <div className="p-5 border-b bg-gradient-to-r from-blue-50/70 to-white">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
     <div>
      <div className="text-xs font-bold text-blue-600">{courseName} • {current.sectionId||'SECTION A'}</div>
      <h2 className="text-xl font-bold mt-1">Allocation candidate</h2>
      <p className="text-sm text-slate-500 mt-1">Faculty request from {name(current.facultyId)} • Preference #{current.preferenceRank||1}</p>
     </div>
     <div className="flex items-center gap-2"><span className="text-xs text-slate-500">Request {selected+1} of {items.length}</span><Badge tone="red">Pending review</Badge></div>
    </div>
   </div>
   <div className="p-5">
    <div className="flex items-center gap-2 text-sm font-bold mb-4"><Sparkles size={17} className="text-blue-600"/> AI recommendation: <span className="text-blue-700">{name(current.facultyId)}</span></div>
    <div className="p-5 rounded-2xl border-2 border-blue-500 bg-blue-50/40">
     <div className="flex justify-between"><div><div className="font-bold">{name(current.facultyId)}</div><div className="text-xs text-slate-500 mt-1">Faculty ID: {current.facultyId}</div></div><div className="text-right"><div className="text-2xl font-black text-[#0b1f44]">{current.recommendationScore??'—'}<span className="text-xs font-semibold text-slate-400">/100</span></div><Badge tone="green">Recommended</Badge></div></div>
     <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 text-xs">
      <div className="p-2.5 bg-white rounded-lg"><GraduationCap size={14} className="text-blue-600 mb-1"/><span className="text-slate-500">Qualification</span><b className="block">Verified</b></div>
      <div className="p-2.5 bg-white rounded-lg"><Scale size={14} className="text-blue-600 mb-1"/><span className="text-slate-500">Expertise</span><b className="block">Verified</b></div>
      <div className="p-2.5 bg-white rounded-lg"><History size={14} className="text-blue-600 mb-1"/><span className="text-slate-500">Preference</span><b className="block">#{current.preferenceRank||1}</b></div>
      <div className="p-2.5 bg-white rounded-lg"><BriefcaseBusiness size={14} className="text-blue-600 mb-1"/><span className="text-slate-500">Status</span><b className="block">{current.status}</b></div>
     </div>
    </div>
    <div className="mt-5 p-5 rounded-2xl border border-blue-100 bg-blue-50/60"><div className="flex gap-3"><Sparkles size={18} className="text-blue-600 mt-0.5"/><div><div className="font-semibold text-sm">Why this recommendation?</div><p className="text-sm text-slate-600 mt-1">{current.recommendationReason||'The backend has accepted this request for HOD review.'}</p></div></div></div>
    <div className="mt-5 flex flex-wrap gap-3">
     <button disabled={busy} onClick={()=>decide('approve')} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm flex gap-2 items-center disabled:opacity-50"><Check size={17}/> Approve recommendation</button>
     <button disabled={busy} onClick={()=>decide('reject')} className="px-5 py-2.5 rounded-xl border border-slate-200 font-semibold text-sm flex gap-2 items-center disabled:opacity-50"><X size={17}/> Reject</button>
     <button disabled={busy} onClick={()=>setOverride(true)} className="px-5 py-2.5 rounded-xl border border-blue-200 text-blue-700 font-semibold text-sm flex gap-2 items-center disabled:opacity-50"><RotateCcw size={17}/> Override</button>
    </div>
    {override&&<div className="mt-4 p-4 border border-amber-200 bg-amber-50 rounded-xl"><div className="font-semibold text-sm">Override allocation</div><div className="grid md:grid-cols-2 gap-3 mt-3"><select value={overrideFaculty} onChange={e=>setOverrideFaculty(e.target.value)} className="px-3 py-2.5 rounded-lg border border-amber-200 bg-white">{faculty.map(f=><option key={f.facultyId} value={f.facultyId}>{f.name}</option>)}</select><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for override" className="px-3 py-2.5 rounded-lg border border-amber-200 bg-white"/></div><button disabled={busy} onClick={saveOverride} className="mt-3 px-4 py-2 rounded-lg bg-[#1d4ed8] text-white text-sm font-semibold disabled:opacity-50">Save override & audit</button></div>}
   </div>
  </Card>

  {/* Bottom-right request navigation: these are separate requests, not a visual queue. */}
  <div className="fixed right-8 bottom-7 z-40 flex items-center gap-2 bg-white border border-slate-200 shadow-lg rounded-2xl p-2">
   <button type="button" disabled={busy||selected===0} onClick={goPrevious} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"><ChevronLeft size={17}/> Previous</button>
   <span className="px-2 text-xs font-semibold text-slate-500 min-w-[76px] text-center">{selected+1} / {items.length}</span>
   <button type="button" disabled={busy||selected===items.length-1} onClick={goNext} className="px-4 py-2.5 rounded-xl bg-[#1d4ed8] text-white font-semibold text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700">Next <ChevronRight size={17}/></button>
  </div>
 </div>
}
