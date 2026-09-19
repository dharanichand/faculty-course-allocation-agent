import React,{useEffect,useMemo,useState} from 'react';
import {Check,X,RotateCcw,Sparkles,Scale,History,GraduationCap,BriefcaseBusiness,ChevronLeft,ChevronRight,Square,CheckSquare,Wand2,Loader2,Search,AlertTriangle} from 'lucide-react';
import {Card,PageTitle,Badge,AskAgentButton} from '../components/UI';
import {apiRequest} from '../api';
import {formatSection} from '../utils/section';

const PAGE_SIZE=25;
const TIER_TONE={1:'red',2:'amber',3:'blue',4:'slate'};
const STATUS_LABEL={overloaded:'Overloaded',underloaded:'Very low workload',balanced:'Balanced',on_leave:'On leave'};

// "Name (ID)" - the review screen must never show a bare ID.
const who=(name,id)=>name?`${name} (${id})`:String(id||'');

export default function AllocationReview(){
 const [items,setItems]=useState([]),[currentId,setCurrentId]=useState(null),[selectedIds,setSelectedIds]=useState([]);
 const [override,setOverride]=useState(false),[reason,setReason]=useState(''),[bulkReason,setBulkReason]=useState(''),[overrideFaculty,setOverrideFaculty]=useState('');
 const [faculty,setFaculty]=useState([]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loaded,setLoaded]=useState(false);
 const [search,setSearch]=useState(''),[tierFilter,setTierFilter]=useState('all'),[page,setPage]=useState(0);
 const [runResult,setRunResult]=useState(null);

 const load=async()=>{
  try{
   const [a,f]=await Promise.all([
    apiRequest({method:'GET',url:'/allocations'}),
    apiRequest({method:'GET',url:'/data/faculty'})
   ]);
   const next=a.data||[];
   setItems(next);
   setFaculty(f.data||[]);
   setSelectedIds(prev=>prev.filter(id=>next.some(x=>x._id===id)));
   setCurrentId(prev=>next.some(x=>x._id===prev)?prev:(next[0]?._id||null));
  }catch(e){setMessage(e?.response?.data?.message||'Could not load review requests.')}
  finally{setLoaded(true)}
 };
 useEffect(()=>{load()},[]);

 const visible=useMemo(()=>{
  const q=search.trim().toLowerCase();
  return items.filter(x=>(tierFilter==='all'||String(x.priorityTier)===tierFilter)
   &&(!q||`${x.facultyName} ${x.facultyId} ${x.courseName} ${x.courseId} ${x.sectionId} ${x.designation}`.toLowerCase().includes(q)));
 },[items,search,tierFilter]);
 const pageCount=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));
 const pageRows=visible.slice(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE);
 useEffect(()=>{setPage(p=>Math.min(p,pageCount-1))},[pageCount]);

 const current=items.find(x=>x._id===currentId)||null;
 const currentIndex=current?visible.findIndex(x=>x._id===current._id):-1;
 const facultyOf=id=>faculty.find(f=>f.facultyId===id);

 const afterDecision=(remaining)=>{
  const next=remaining||[];
  const pos=Math.min(Math.max(currentIndex,0),Math.max(0,next.length-1));
  setItems(next);
  setOverride(false);setReason('');
  setSelectedIds(prev=>prev.filter(id=>next.some(x=>x._id===id)));
  setCurrentId(next[pos]?._id||null);
 };

 const decide=async(action)=>{
  if(!current)return;
  try{
   setBusy(true);setMessage('');
   const url=action==='approve'?`/allocations/${current._id}/approve`:`/allocations/${current._id}/reject`;
   const response=await apiRequest({method:'POST',url,data:action==='reject'?{reason}:undefined});
   afterDecision(response.data?.remaining);
   setMessage(`${who(current.facultyName,current.facultyId)} - ${current.courseName} ${action==='approve'?'approved':'rejected'}.`);
  }catch(e){setMessage(e?.response?.data?.message||'Decision failed.')}
  finally{setBusy(false)}
 };

 const allVisibleSelected=visible.length>0&&visible.every(x=>selectedIds.includes(x._id));
 const toggleSelected=id=>setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
 const toggleAllVisible=()=>setSelectedIds(prev=>allVisibleSelected?prev.filter(id=>!visible.some(x=>x._id===id)):[...new Set([...prev,...visible.map(x=>x._id)])]);

 const bulkDecide=async(action)=>{
  if(!selectedIds.length)return;
  if(action==='approve'&&selectedIds.length>25&&!window.confirm(`Approve ${selectedIds.length} allocations?`))return;
  try{
   setBusy(true);setMessage('');
   const url=action==='approve'?'/allocations/bulk-approve':'/allocations/bulk-reject';
   const count=selectedIds.length;
   const response=await apiRequest({method:'POST',url,data:action==='reject'?{ids:selectedIds,reason:bulkReason}:{ids:selectedIds},timeout:120000});
   afterDecision(response.data?.remaining);
   setSelectedIds([]);setBulkReason('');
   setMessage(`${response.data?.updated||count} allocation(s) ${action==='approve'?'approved':'rejected'}.`);
  }catch(e){setMessage(e?.response?.data?.message||`Bulk ${action} failed.`)}
  finally{setBusy(false)}
 };

 const saveOverride=async()=>{
  if(!current||!overrideFaculty)return;
  try{
   setBusy(true);setMessage('');
   const response=await apiRequest({method:'POST',url:`/allocations/${current._id}/override`,data:{facultyId:overrideFaculty,reason}});
   afterDecision(response.data?.remaining);
   setMessage('Override approved and recorded in the audit log.');
  }catch(e){setMessage(e?.response?.data?.message||'Override failed.')}
  finally{setBusy(false)}
 };

 const runAuto=async()=>{
  if(!window.confirm('Run the automatic allocation now? Undecided recommendations are re-generated; approved allocations are kept.'))return;
  try{
   setBusy(true);setMessage('');
   const r=await apiRequest({method:'POST',url:'/allocations/auto-allocate',timeout:120000});
   setRunResult(r.data);
   await load();
   setMessage(`Automatic allocation finished: ${r.data?.created??r.data?.stats?.assignments??0} recommendation(s) created.`);
  }catch(e){setMessage(e?.response?.data?.message||'Automatic allocation failed.')}
  finally{setBusy(false)}
 };

 const go=step=>{
  const idx=Math.min(Math.max(currentIndex+step,0),visible.length-1);
  if(visible[idx]){setCurrentId(visible[idx]._id);setPage(Math.floor(idx/PAGE_SIZE));setOverride(false);setMessage('')}
 };

 const toolbar=<Card className="mb-4 p-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="flex flex-wrap items-center gap-2">
    <button type="button" disabled={busy} onClick={runAuto} className="px-4 py-2 rounded-lg btn-primary text-sm font-semibold flex items-center gap-2 disabled:opacity-50">{busy?<Loader2 size={15} className="animate-spin"/>:<Wand2 size={15}/>} Run automatic allocation</button>
    <span className="text-xs text-slate-500">Professor 1 course · Associate 2 · others 3 — conflicts resolved by designation priority.</span>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs text-slate-500">{selectedIds.length} selected</span>
    <button type="button" disabled={busy||!selectedIds.length} onClick={()=>bulkDecide('approve')} className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-xs flex items-center gap-1.5 disabled:opacity-40"><Check size={15}/> Accept selected</button>
    <button type="button" disabled={busy||!selectedIds.length} onClick={()=>bulkDecide('reject')} className="px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-semibold text-xs flex items-center gap-1.5 disabled:opacity-40"><X size={15}/> Reject selected</button>
   </div>
  </div>
  {selectedIds.length>0&&<input value={bulkReason} onChange={e=>setBulkReason(e.target.value)} placeholder="Optional reason for bulk rejection" className="field-input mt-3 w-full px-3 py-2 rounded-lg text-sm"/>}
 </Card>;

 const runSummary=runResult&&<Card className="mb-4 p-4 border border-emerald-200">
  <div className="flex items-start justify-between gap-3">
   <div className="text-sm text-slate-700">
    <b className="text-slate-900">Automatic allocation result</b>
    <div className="mt-1 text-xs text-slate-600">{runResult.stats?.assignments} assignments for {runResult.stats?.faculty} faculty · {runResult.stats?.fromPreference} from preferences · {runResult.stats?.autoFilled} auto-filled · {runResult.stats?.conflictsResolved} seat conflicts resolved by priority · {runResult.stats?.overloaded} overloaded · {runResult.stats?.underloaded} very low workload{runResult.stats?.sectionsWithoutInstructor?` · ${runResult.stats.sectionsWithoutInstructor} section(s) still without an instructor`:''}</div>
   </div>
   <button type="button" onClick={()=>setRunResult(null)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
  </div>
 </Card>;

 if(!loaded)return <div><PageTitle eyebrow="HUMAN-IN-THE-LOOP" title="HOD Allocation Review" desc="Loading..."/>{message&&<div className="p-3 rounded-xl alert-info text-sm">{message}</div>}</div>;

 if(!items.length)return <div><PageTitle eyebrow="HUMAN-IN-THE-LOOP" title="HOD Allocation Review" desc="The agent allocates automatically; the HOD reviews, approves, rejects or overrides."/>
  {message&&<div className="mb-4 p-3 rounded-xl alert-info text-sm">{message}</div>}
  {toolbar}{runSummary}
  <Card className="p-10 text-center"><Check className="mx-auto text-emerald-700" size={36}/><h2 className="font-display font-semibold text-lg mt-3 text-slate-800">No allocations waiting for review</h2><p className="text-sm text-slate-500 mt-1">Everything has been decided. Use “Run automatic allocation” to generate recommendations for any open seats.</p></Card></div>;

 const cf=current?facultyOf(current.facultyId):null;
 const overrideTarget=facultyOf(overrideFaculty);
 const overrideTotal=overrideTarget&&current?Number(overrideTarget.assignedHours||0)+(overrideTarget.facultyId===current.facultyId?0:Number(current.hours||0)):null;
 const overrideExceeds=!!overrideTarget&&overrideTarget.facultyId!==current?.facultyId&&overrideTotal>Number(overrideTarget.prescribedMax||0);
 const overrideOverQuota=!!overrideTarget&&overrideTarget.facultyId!==current?.facultyId&&Number(overrideTarget.assignedCount||0)+1>Number(overrideTarget.courseQuota||99);

 return <div className="pb-24">
  <PageTitle eyebrow="HUMAN-IN-THE-LOOP" title="HOD Allocation Review" desc="The agent allocates automatically; the HOD reviews, approves, rejects or overrides."/>
  {message&&<div className="mb-4 p-3 rounded-xl alert-info text-sm">{message}</div>}
  {toolbar}{runSummary}

  {current&&<Card className="overflow-hidden mb-5">
   <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-fuchsia-500/8 to-transparent">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
     <div>
      <div className="text-xs font-bold text-fuchsia-700">{current.courseName} • {formatSection(current.courseYear,current.sectionId)||'SECTION'}{current.role==='co'?' • Co-instructor':current.role==='lead'?' • Lead instructor':''}</div>
      <h2 className="font-display text-xl font-semibold mt-1 text-slate-800">{who(current.facultyName,current.facultyId)}</h2>
      <p className="text-sm text-slate-500 mt-1">{current.designation||'Faculty'} • {current.preferenceRank?`Preference #${current.preferenceRank}`:'Auto-assigned (no matching preference)'}</p>
     </div>
     <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-slate-500">Review {currentIndex+1} of {visible.length}</span>
      <Badge tone={TIER_TONE[current.priorityTier]||'slate'}>Priority {current.priorityTier}: {current.tierLabel}</Badge>
      <AskAgentButton prompt={`What happens if I assign ${current.facultyName} (${current.facultyId}) to ${current.courseName} (${current.courseId}) ${current.sectionId||''}? Check workload and conflicts before I decide.`} label="Ask agent"/>
     </div>
    </div>
   </div>
   <div className="p-5">
    <div className="p-5 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/5">
     <div className="flex justify-between gap-3">
      <div>
       <div className="flex items-center gap-2 text-sm font-bold text-slate-700"><Sparkles size={17} className="text-fuchsia-700"/> AI recommendation</div>
       <div className="font-semibold text-slate-800 mt-2 text-lg">{current.facultyName||'(name unavailable)'} <span className="text-slate-500 font-medium">({current.facultyId})</span></div>
       <div className="text-xs text-slate-500 mt-1">Faculty ID: {current.facultyId} • {current.designation}</div>
      </div>
      <div className="text-right"><div className="font-display text-2xl font-bold text-slate-900">{current.recommendationScore??'—'}<span className="text-xs font-semibold text-slate-500">/100</span></div><Badge tone="green">Recommended</Badge></div>
     </div>
     <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 text-xs">
      <div className="p-2.5 bg-slate-50 rounded-lg"><GraduationCap size={14} className="text-cyan-700 mb-1"/><span className="text-slate-500">Course hours</span><b className="block text-slate-700">{current.hours||0} h/week</b></div>
      <div className="p-2.5 bg-slate-50 rounded-lg"><Scale size={14} className="text-cyan-700 mb-1"/><span className="text-slate-500">Faculty workload</span><b className="block text-slate-700">{cf?.assignedHours??'—'} h (prescribed {cf?.prescribedMin}–{cf?.prescribedMax})</b></div>
      <div className="p-2.5 bg-slate-50 rounded-lg"><History size={14} className="text-cyan-700 mb-1"/><span className="text-slate-500">Preference</span><b className="block text-slate-700">{current.preferenceRank?`#${current.preferenceRank}`:'Auto'}</b></div>
      <div className="p-2.5 bg-slate-50 rounded-lg"><BriefcaseBusiness size={14} className="text-cyan-700 mb-1"/><span className="text-slate-500">Workload status</span><b className="block text-slate-700">{STATUS_LABEL[current.facultyWorkloadStatus]||'—'}</b></div>
     </div>
    </div>
    <div className="mt-5 p-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5"><div className="flex gap-3"><Sparkles size={18} className="text-cyan-700 mt-0.5"/><div><div className="font-semibold text-sm text-slate-800">Why this recommendation?</div><p className="text-sm text-slate-500 mt-1">{current.recommendationReason||'The automatic allocator selected this faculty member.'}</p></div></div></div>
    <div className="mt-5 flex flex-wrap gap-3">
     <button disabled={busy} onClick={()=>decide('approve')} className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm flex gap-2 items-center disabled:opacity-50 transition"><Check size={17}/> Approve recommendation</button>
     <button disabled={busy} onClick={()=>decide('reject')} className="btn-outline px-5 py-2.5 rounded-xl font-semibold text-sm flex gap-2 items-center disabled:opacity-50"><X size={17}/> Reject</button>
     <button disabled={busy} onClick={()=>{setOverride(true);setOverrideFaculty(o=>o||current.facultyId)}} className="px-5 py-2.5 rounded-xl border border-cyan-400/30 text-cyan-700 hover:bg-cyan-400/10 font-semibold text-sm flex gap-2 items-center disabled:opacity-50 transition"><RotateCcw size={17}/> Override</button>
    </div>
    {override&&<div className="mt-4 p-4 border border-amber-400/25 bg-amber-400/5 rounded-xl"><div className="font-semibold text-sm text-slate-800">Override allocation</div>
     <div className="grid md:grid-cols-2 gap-3 mt-3">
      <select value={overrideFaculty} onChange={e=>setOverrideFaculty(e.target.value)} className="field-input px-3 py-2.5 rounded-lg">{faculty.map(f=><option key={f.facultyId} value={f.facultyId}>{f.name} ({f.facultyId}) — {f.designation} — {f.assignedHours||0}/{f.prescribedMax}h</option>)}</select>
      <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for override" className="field-input px-3 py-2.5 rounded-lg"/>
     </div>
     {(overrideExceeds||overrideOverQuota)&&<div className="mt-3 text-xs text-amber-700 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0"/><span>{who(overrideTarget.name,overrideTarget.facultyId)} would reach {overrideTotal} h/week{overrideExceeds?` (prescribed maximum ${overrideTarget.prescribedMax} h)`:''}{overrideOverQuota?` and ${Number(overrideTarget.assignedCount)+1} courses (quota ${overrideTarget.courseQuota})`:''}. They will be flagged as overloaded.</span></div>}
     <button disabled={busy} onClick={saveOverride} className="mt-3 px-4 py-2 rounded-lg btn-primary text-sm disabled:opacity-50">Save override & audit</button></div>}
   </div>
  </Card>}

  <Card className="overflow-hidden">
   <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3 md:items-center justify-between">
    <div className="relative flex-1 max-w-xl"><Search size={16} className="absolute left-3 top-3 text-slate-500"/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="Search by faculty name, ID, course or section..." className="field-input w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"/></div>
    <div className="flex items-center gap-2">
     <select value={tierFilter} onChange={e=>{setTierFilter(e.target.value);setPage(0)}} className="field-input px-3 py-2.5 rounded-xl text-sm">
      <option value="all">All designations</option><option value="1">Professor</option><option value="2">Associate Professor</option><option value="3">Assistant Professor</option><option value="4">Other faculty</option>
     </select>
     <span className="text-xs text-slate-500 whitespace-nowrap">{visible.length} of {items.length} requests</span>
    </div>
   </div>
   <div className="overflow-x-auto">
    <table className="w-full text-left">
     <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
      <th className="px-4 py-3 w-10"><button type="button" onClick={toggleAllVisible} aria-label="Select all visible">{allVisibleSelected?<CheckSquare size={17} className="text-fuchsia-700"/>:<Square size={17} className="text-slate-400"/>}</button></th>
      {['Faculty (name & ID)','Designation','Course / section','Pref','Hours','Score'].map(h=><th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
     </tr></thead>
     <tbody>{pageRows.map(x=><tr key={x._id} onClick={()=>{setCurrentId(x._id);setOverride(false);window.scrollTo({top:0,behavior:'smooth'})}} className={`border-t border-slate-200 cursor-pointer hover:bg-slate-50 ${x._id===currentId?'bg-fuchsia-500/5':''}`}>
      <td className="px-4 py-3" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(x._id)} onChange={()=>toggleSelected(x._id)} className="h-4 w-4 accent-fuchsia-700"/></td>
      <td className="px-4 py-3"><div className="text-sm font-semibold text-slate-800">{x.facultyName||'(name unavailable)'}</div><div className="text-xs text-slate-500">ID {x.facultyId}</div></td>
      <td className="px-4 py-3"><Badge tone={TIER_TONE[x.priorityTier]||'slate'}>{x.designation||x.tierLabel}</Badge></td>
      <td className="px-4 py-3"><div className="text-sm text-slate-700">{x.courseName}</div><div className="text-xs text-slate-500">{formatSection(x.courseYear,x.sectionId)}{x.role==='co'?' · co-instructor':''}</div></td>
      <td className="px-4 py-3 text-sm font-bold text-fuchsia-700">{x.preferenceRank?`#${x.preferenceRank}`:<span className="text-slate-400 font-medium">Auto</span>}</td>
      <td className="px-4 py-3 text-sm text-slate-700">{x.hours||0} h</td>
      <td className="px-4 py-3 text-sm font-semibold text-slate-800">{x.recommendationScore??'—'}</td>
     </tr>)}</tbody>
    </table>
    {!visible.length&&<div className="p-8 text-center text-sm text-slate-500">No requests match the current filter.</div>}
   </div>
   {visible.length>PAGE_SIZE&&<div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
    <span>Page {page+1} of {pageCount}</span>
    <div className="flex gap-2"><button type="button" disabled={page===0} onClick={()=>setPage(p=>p-1)} className="btn-outline px-3 py-1.5 rounded-lg disabled:opacity-40">Previous page</button><button type="button" disabled={page>=pageCount-1} onClick={()=>setPage(p=>p+1)} className="btn-outline px-3 py-1.5 rounded-lg disabled:opacity-40">Next page</button></div>
   </div>}
  </Card>

  {/* Bottom-right request navigation across the (filtered) queue. */}
  <div className="fixed right-8 bottom-7 z-40 flex items-center gap-2 panel-solid shadow-2xl rounded-2xl p-2">
   <button type="button" disabled={busy||currentIndex<=0} onClick={()=>go(-1)} className="btn-outline px-4 py-2.5 rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft size={17}/> Previous</button>
   <span className="px-2 text-xs font-semibold text-slate-500 min-w-[76px] text-center">{currentIndex+1} / {visible.length}</span>
   <button type="button" disabled={busy||currentIndex>=visible.length-1} onClick={()=>go(1)} className="btn-primary px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">Next <ChevronRight size={17}/></button>
  </div>
 </div>
}
