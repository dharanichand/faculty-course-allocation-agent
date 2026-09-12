import React,{useEffect,useMemo,useState} from 'react';
import {Search,Filter,Plus,Trophy} from 'lucide-react';
import {Card,PageTitle,Badge,AiPill,Modal,Field} from '../components/UI';
import {apiRequest} from '../api';

const statusOptions=[
 {value:'All',label:'All statuses'},
 {value:'pending',label:'Pending'},
 {value:'approved',label:'Approved'},
 {value:'rejected',label:'Rejected'},
 {value:'High',label:'High AI score (90+)'},
];

export default function Requests(){
 const [rows,setRows]=useState([]),[faculty,setFaculty]=useState([]),[courses,setCourses]=useState([]),[q,setQ]=useState(''),[filter,setFilter]=useState('All'),[open,setOpen]=useState(false),[form,setForm]=useState({facultyId:'',courseId:'',rank:'1'}),[error,setError]=useState('');
 const load=async()=>{try{const [r,f,c]=await Promise.all([apiRequest({method:'GET',url:'/data/requests'}),apiRequest({method:'GET',url:'/data/faculty'}),apiRequest({method:'GET',url:'/data/courses'})]);setRows(r.data||[]);setFaculty(f.data||[]);setCourses(c.data||[]);if(!form.facultyId&&f.data?.length)setForm(x=>({...x,facultyId:f.data[0].facultyId}));if(!form.courseId&&c.data?.length)setForm(x=>({...x,courseId:c.data[0].courseId}))}catch(e){setError(e?.response?.data?.message||'Could not load requests')}};
 useEffect(()=>{load()},[]);
 const name=id=>faculty.find(x=>x.facultyId===id)?.name||id;
 const course=id=>courses.find(x=>x.courseId===id)?.courseName||id;
 const add=async()=>{try{const r=await apiRequest({method:'POST',url:'/data/requests',data:{...form,preferenceRank:Number(form.rank)}});setRows(v=>[r.data,...v]);setOpen(false);setError('')}catch(e){setError(e?.response?.data?.message||'Could not submit request')}};

 const filtered=rows.filter(r=>`${name(r.facultyId)} ${course(r.courseId)}`.toLowerCase().includes(q.toLowerCase())&&(filter==='All'||(filter==='High'?Number(r.recommendationScore)>=90:r.status===filter)));

 // Top faculty per subject (course): the HOD-approved faculty if one exists, otherwise the highest AI-recommended score.
 const topBySubject=useMemo(()=>{
  const bySubject={};
  for(const r of rows){
   const cur=bySubject[r.courseId];
   const better=(a,b)=>{
    const aApproved=a.status==='approved',bApproved=b.status==='approved';
    if(aApproved!==bApproved)return aApproved?a:b;
    return (Number(a.recommendationScore)||0)>=(Number(b.recommendationScore)||0)?a:b;
   };
   bySubject[r.courseId]=cur?better(cur,r):r;
  }
  return Object.values(bySubject).sort((a,b)=>course(a.courseId).localeCompare(course(b.courseId)));
 },[rows,courses]);

 return <div>
  <PageTitle eyebrow="REQUEST INTAKE" title="Faculty Requests" desc="Faculty preferences are stored in the backend and become inputs to the allocation agent." action={<button type="button" onClick={()=>setOpen(true)} className="px-4 py-2.5 rounded-xl btn-primary text-sm flex items-center gap-2"><Plus size={17}/> Add request</button>}/>
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}

  {topBySubject.length>0&&<Card className="mb-5 p-5">
   <div className="flex items-center gap-2 font-display font-semibold text-slate-800 mb-4"><Trophy size={18} className="text-amber-500"/> Top faculty by subject</div>
   <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
    {topBySubject.map(r=>{
     const c=courses.find(x=>x.courseId===r.courseId);
     const sectionLabel=c?.sections?.[0]?.sectionName?`Section ${c.sections[0].sectionName}`:'All sections';
     return <div key={r.courseId} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between gap-2">
       <div className="text-sm font-semibold text-slate-800 truncate">{course(r.courseId)}</div>
       <Badge tone={r.status==='approved'?'green':r.status==='rejected'?'red':'amber'}>{r.status==='approved'?'HOD approved':r.status==='rejected'?'Rejected':'Top pick'}</Badge>
      </div>
      <div className="text-xs text-slate-400 mt-0.5">{sectionLabel}</div>
      <div className="flex items-center justify-between mt-3">
       <div className="text-sm font-semibold text-blue-700">{name(r.facultyId)}</div>
       <div className="text-xs font-bold text-slate-500">{r.recommendationScore??'—'}{r.recommendationScore?'/100':''}</div>
      </div>
     </div>;
    })}
   </div>
  </Card>}

  <Card>
   <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
    <div className="relative flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-500"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search faculty or course..." className="field-input w-full pl-9 pr-3 py-2.5 rounded-xl outline-none"/></div>
    <label className="relative">
     <Filter size={16} className="absolute left-3 top-3 text-slate-500 pointer-events-none"/>
     <select value={filter} onChange={e=>setFilter(e.target.value)} className="field-input pl-9 pr-8 py-2.5 rounded-xl text-sm appearance-none min-w-[190px]">
      {statusOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
     </select>
    </label>
   </div>
   <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Faculty','Course','Rank','AI score','Status','Action'].map(h=><th className="px-5 py-3 font-semibold" key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={r._id} className="border-t border-slate-200"><td className="px-5 py-4 text-sm font-semibold text-slate-800">{name(r.facultyId)}</td><td className="px-5 py-4 text-sm text-slate-600">{course(r.courseId)}</td><td className="px-5 py-4 text-sm font-bold text-fuchsia-700">#{r.preferenceRank||1}</td><td className="px-5 py-4 font-bold text-slate-800">{r.recommendationScore??'—'}{r.recommendationScore&&'/100'}</td><td className="px-5 py-4"><Badge tone={r.status==='approved'?'green':r.status==='rejected'?'red':'amber'}>{r.status}</Badge></td><td className="px-5 py-4"><button type="button" onClick={()=>window.location.assign('/review')} className="text-xs font-semibold text-cyan-700 hover:text-cyan-700">Review</button></td></tr>)}</tbody></table>{!filtered.length&&<div className="p-8 text-center text-sm text-slate-500">No matching requests.</div>}</div>
  </Card>
  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><AiPill/> Requests shown here are the same records used by the review queue.</div>
  <Modal open={open} title="Add faculty request" onClose={()=>setOpen(false)}><div className="space-y-3"><label className="block text-xs font-semibold text-slate-500">Faculty<select value={form.facultyId} onChange={e=>setForm({...form,facultyId:e.target.value})} className="field-input mt-1 w-full px-3 py-2.5 rounded-xl">{faculty.map(f=><option key={f.facultyId} value={f.facultyId}>{f.name}</option>)}</select></label><label className="block text-xs font-semibold text-slate-500">Course<select value={form.courseId} onChange={e=>setForm({...form,courseId:e.target.value})} className="field-input mt-1 w-full px-3 py-2.5 rounded-xl">{courses.map(c=><option key={c.courseId} value={c.courseId}>{c.courseCode} — {c.courseName}</option>)}</select></label><Field label="Preference rank" value={form.rank} onChange={e=>setForm({...form,rank:e.target.value})}/></div><button type="button" onClick={add} className="mt-5 w-full py-2.5 rounded-xl btn-primary text-sm">Submit request</button></Modal>
 </div>;
}
