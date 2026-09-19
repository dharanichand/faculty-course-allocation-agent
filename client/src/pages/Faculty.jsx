import React,{useEffect,useMemo,useState} from 'react';
import {Users,Plus,Search,Trash2,Download,AlertTriangle,TrendingDown,CheckCircle2} from 'lucide-react';
import {Card,PageTitle,Modal,Field,Badge,AskAgentButton} from '../components/UI';
import {apiRequest} from '../api';
import {formatSection} from '../utils/section';

const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Year sections. Faculty appear in every year they teach a course in.
// (The dataset also has 4th-year and M.Tech courses, so those faculty get the last tab.)
const YEAR_TABS=[
 {id:'all',label:'All faculty'},
 {id:'1',label:'1st Year'},
 {id:'2',label:'2nd Year'},
 {id:'3',label:'3rd Year'},
 {id:'4',label:'4th Year & M.Tech'},
];
const LOAD_FILTERS=[
 {id:'all',label:'All workloads'},
 {id:'overloaded',label:'Overloaded (above prescribed max)'},
 {id:'underloaded',label:'Very low workload'},
 {id:'balanced',label:'Balanced'},
];
const DESIGNATIONS=['Professor','Associate Professor','Assistant Professor','Assistant Professor (Contract)','CAP','Teaching Associate'];
const STATUS={
 overloaded:{tone:'red',label:'Overloaded'},
 underloaded:{tone:'amber',label:'Very low workload'},
 balanced:{tone:'green',label:'Balanced'},
 on_leave:{tone:'slate',label:'On leave'},
};
const TIER_TONE={1:'red',2:'amber',3:'blue',4:'slate'};

function csvCell(v){return `"${String(v??'').replaceAll('"','""')}"`}
function downloadFacultyCsv(rows,name='faculty_workload.csv'){
 const head=['Faculty ID','Name','Designation','Priority tier','Courses assigned','Course quota','Assigned hours/week','Prescribed min','Prescribed max','Workload status','Hours over max / under min','Years taught','Assigned courses'];
 const body=rows.map(x=>[x.facultyId,x.name,x.designation,x.tierLabel||x.priorityTier,x.assignedCount??0,x.courseQuota??'',x.assignedHours??0,x.prescribedMin??'',x.prescribedMax??'',(STATUS[x.workloadStatus]||{}).label||x.workloadStatus,x.hoursDelta||0,(x.yearGroups||[]).join('/'),(x.assignments||[]).map(a=>`${a.courseName} ${formatSection(a.year,a.sectionId)}${a.role==='co'?' (co)':''} [${a.hours}h]`).join('; ')]);
 const csv=[head,...body].map(r=>r.map(csvCell).join(',')).join('\n');
 const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}

export default function Faculty(){
 const [items,setItems]=useState([]),[q,setQ]=useState(''),[open,setOpen]=useState(false),[error,setError]=useState('');
 const [year,setYear]=useState('all'),[load,setLoad]=useState('all'),[designation,setDesignation]=useState('all');
 const [form,setForm]=useState({id:'',name:'',email:'',designation:'Assistant Professor',expertise:'',onLeave:false,leaveReason:'',adminLoadHours:''});

 const reload=async()=>{try{const r=await apiRequest({method:'GET',url:'/data/faculty'});setItems(r.data||[])}catch(e){setError(e?.response?.data?.message||'Could not load faculty')}};
 useEffect(()=>{reload()},[]);

 const add=async()=>{
  if(!form.id.trim())return setError('Faculty ID is required');
  if(!form.name.trim())return setError('Faculty name is required');
  if(!form.email.trim())return setError('Faculty email is required');
  if(!EMAIL_RE.test(form.email.trim()))return setError('Enter a valid faculty email address');
  try{
   const list=form.expertise.split(',').map(x=>x.trim()).filter(Boolean);
   await apiRequest({method:'POST',url:'/data/faculty',data:{facultyId:form.id.trim(),name:form.name,email:form.email.trim(),designation:form.designation,expertise:list,specializations:list,qualifications:['M.Tech'],department:'CSE',onLeave:!!form.onLeave,leaveReason:form.leaveReason,adminLoadHours:Number(form.adminLoadHours)||0}});
   await reload();
   setForm({id:'',name:'',email:'',designation:'Assistant Professor',expertise:'',onLeave:false,leaveReason:'',adminLoadHours:''});
   setOpen(false);setError('');
  }catch(e){setError(e?.response?.data?.message||'Could not add faculty. Check the backend connection.')}
 };
 const remove=async(id)=>{
  if(!confirm('Deactivate this faculty member?'))return;
  try{await apiRequest({method:'DELETE',url:`/data/faculty/${id}`});setItems(v=>v.filter(x=>x.facultyId!==id))}
  catch(e){setError(e?.response?.data?.message||'Could not remove faculty')}
 };

 // Counts shown on the tabs / filter chips are computed on the *other* active filters.
 const matches=(x,{y=year,l=load,d=designation,text=q}={})=>{
  if(y!=='all'&&!(x.yearGroups||[]).includes(y))return false;
  if(l!=='all'&&x.workloadStatus!==l)return false;
  if(d!=='all'&&x.designation!==d)return false;
  const t=text.trim().toLowerCase();
  return !t||`${x.facultyId} ${x.name} ${x.designation} ${(x.expertise||[]).join(' ')} ${(x.assignments||[]).map(a=>a.courseName).join(' ')}`.toLowerCase().includes(t);
 };
 const visible=useMemo(()=>items.filter(x=>matches(x)),[items,year,load,designation,q]);
 const yearCount=id=>items.filter(x=>matches(x,{y:id})).length;
 const loadCount=id=>items.filter(x=>matches(x,{l:id})).length;
 const overloaded=items.filter(x=>x.workloadStatus==='overloaded').length;
 const underloaded=items.filter(x=>x.workloadStatus==='underloaded').length;
 const designationsPresent=[...new Set([...DESIGNATIONS,...items.map(x=>x.designation).filter(Boolean)])];

 return <div>
  <PageTitle eyebrow="FACULTY DIRECTORY" title="Faculty" desc="Faculty grouped by the year they teach, with assigned courses, weekly hours and workload flags. Preferences and courses are allocated automatically by the agent." action={<button type="button" onClick={()=>setOpen(true)} className="px-4 py-2.5 rounded-xl btn-primary text-sm flex items-center gap-2"><Plus size={17}/> Add faculty</button>}/>
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}

  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
   <button type="button" onClick={()=>setLoad('all')} className="text-left"><Card className="p-4"><div className="text-xs text-slate-500">Total faculty</div><div className="font-display text-2xl font-semibold text-slate-900">{items.length}</div></Card></button>
   <button type="button" onClick={()=>setLoad('overloaded')} className="text-left"><Card className="p-4"><div className="text-xs text-slate-500 flex items-center gap-1"><AlertTriangle size={13} className="text-rose-600"/> Overloaded</div><div className="font-display text-2xl font-semibold text-rose-700">{overloaded}</div></Card></button>
   <button type="button" onClick={()=>setLoad('underloaded')} className="text-left"><Card className="p-4"><div className="text-xs text-slate-500 flex items-center gap-1"><TrendingDown size={13} className="text-amber-600"/> Very low workload</div><div className="font-display text-2xl font-semibold text-amber-700">{underloaded}</div></Card></button>
   <button type="button" onClick={()=>setLoad('balanced')} className="text-left"><Card className="p-4"><div className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 size={13} className="text-emerald-600"/> Balanced</div><div className="font-display text-2xl font-semibold text-emerald-700">{items.filter(x=>x.workloadStatus==='balanced').length}</div></Card></button>
  </div>

  <Card>
   <div className="px-4 pt-4 flex flex-wrap gap-2 border-b border-slate-200">
    {YEAR_TABS.map(t=><button key={t.id} type="button" onClick={()=>setYear(t.id)} className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 -mb-px transition ${year===t.id?'border-blue-600 text-blue-700 bg-blue-50/60':'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label} <span className="ml-1 text-xs font-medium opacity-70">({yearCount(t.id)})</span></button>)}
   </div>
   <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row gap-3 lg:items-center">
    <div className="relative flex-1 max-w-xl"><Search size={17} className="absolute left-3 top-3 text-slate-500"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name, ID, expertise or course..." className="field-input w-full pl-9 pr-3 py-2.5 rounded-xl outline-none"/></div>
    <select value={load} onChange={e=>setLoad(e.target.value)} className="field-input px-3 py-2.5 rounded-xl text-sm">{LOAD_FILTERS.map(f=><option key={f.id} value={f.id}>{f.label} ({loadCount(f.id)})</option>)}</select>
    <select value={designation} onChange={e=>setDesignation(e.target.value)} className="field-input px-3 py-2.5 rounded-xl text-sm"><option value="all">All designations</option>{designationsPresent.map(d=><option key={d} value={d}>{d}</option>)}</select>
    <button type="button" onClick={()=>downloadFacultyCsv(visible,`faculty_${year==='all'?'all':`year${year}`}_${load}.csv`)} className="btn-outline px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 whitespace-nowrap"><Download size={15}/> Download ({visible.length})</button>
   </div>
   <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
    {visible.map(x=>{
     const st=STATUS[x.workloadStatus]||STATUS.balanced;
     const inYear=year==='all'?x.assignments:(x.assignments||[]).filter(a=>a.yearGroup===year);
     return <div key={x.facultyId} className="p-4 rounded-2xl border border-slate-200 bg-white/[0.02] card-hover group">
      <div className="flex items-center gap-3">
       <div className="w-11 h-11 rounded-xl bg-cyan-400/10 text-cyan-700 flex items-center justify-center icon-pop"><Users size={20}/></div>
       <div className="min-w-0">
        <div className="font-semibold text-slate-800 truncate">{x.name}</div>
        <div className="text-xs text-slate-500">ID {x.facultyId}</div>
       </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Badge tone={TIER_TONE[x.priorityTier]||'slate'}>{x.designation}</Badge>{x.preferenceSource==='synthetic'&&<Badge tone="slate">Preferences: generated</Badge>}</div>
      <div className="mt-4 text-xs text-slate-500">Assigned courses ({x.assignedCount||0} of {x.courseQuota??'—'}){year!=='all'&&` · showing ${YEAR_TABS.find(t=>t.id===year)?.label}`}</div>
      <div className="mt-1 space-y-1">{(inYear||[]).map(a=><div key={a.allocationId} className="text-xs text-slate-700 flex justify-between gap-2"><span className="truncate">{a.courseName} <span className="text-slate-400">{formatSection(a.year,a.sectionId)}{a.role==='co'?' · co':''}</span></span><span className="text-slate-500 shrink-0">{a.hours}h{a.status==='approved'?' ✓':''}</span></div>)}{!(inYear||[]).length&&<div className="text-xs text-slate-400">No courses assigned yet</div>}</div>
      <div className="mt-3 flex flex-wrap gap-2 items-center justify-between">
       <div className="flex flex-wrap gap-2">
        <Badge tone={st.tone}>{x.assignedHours||0} h / {x.prescribedMin}–{x.prescribedMax} h</Badge>
        <Badge tone={st.tone}>{st.label}{x.workloadStatus==='overloaded'?` (+${x.hoursDelta} h)`:''}</Badge>
        {x.onLeave&&<Badge tone="red">On leave{x.leaveReason?`: ${x.leaveReason}`:''}</Badge>}
        {!!x.adminLoadHours&&<Badge tone="amber">Admin load {x.adminLoadHours}h</Badge>}
       </div>
       <button type="button" onClick={()=>remove(x.facultyId)} className="p-2 rounded-lg text-rose-700 hover:bg-rose-400/10" title="Deactivate"><Trash2 size={15}/></button>
      </div>
      {x.additionalDuties&&<div className="mt-2 text-[11px] text-slate-400">Duties: {x.additionalDuties}</div>}
      <div className="mt-3 flex justify-end"><AskAgentButton prompt={`Analyze ${x.name} (${x.facultyId}) and tell me their current workload, expertise fit and best course matches.`} label="Ask agent"/></div>
     </div>;
    })}
    {!visible.length&&<div className="md:col-span-2 xl:col-span-3 py-10 text-center text-sm text-slate-500">No faculty match the current filters.</div>}
   </div>
  </Card>

  <Modal open={open} title="Add faculty" onClose={()=>setOpen(false)}><div className="space-y-3">
   <Field label="Faculty ID" required value={form.id} onChange={e=>setForm({...form,id:e.target.value})} placeholder="02194"/>
   <Field label="Faculty name" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Dr. New Faculty"/>
   <Field label="Email" type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="faculty@vignan.ac.in"/>
   <label className="block"><span className="block text-xs font-semibold text-slate-500 mb-1.5">Designation</span><select value={form.designation} onChange={e=>setForm({...form,designation:e.target.value})} className="field-input w-full px-3 py-2.5 rounded-xl">{DESIGNATIONS.map(d=><option key={d}>{d}</option>)}</select></label>
   <Field label="Expertise" value={form.expertise} onChange={e=>setForm({...form,expertise:e.target.value})} placeholder="Machine Learning, AI"/>
   <Field label="Administrative load (hours/week)" type="number" value={form.adminLoadHours} onChange={e=>setForm({...form,adminLoadHours:e.target.value})} placeholder="0"/>
   <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.onLeave} onChange={e=>setForm({...form,onLeave:e.target.checked})}/> On leave / sabbatical this term</label>
   {form.onLeave&&<Field label="Leave reason" value={form.leaveReason} onChange={e=>setForm({...form,leaveReason:e.target.value})} placeholder="Sabbatical, medical leave, etc."/>}
  </div><button type="button" onClick={add} className="mt-5 w-full py-2.5 rounded-xl btn-primary text-sm">Add faculty</button></Modal>
 </div>;
}
