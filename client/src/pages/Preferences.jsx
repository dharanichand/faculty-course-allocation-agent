import React,{useEffect,useState} from 'react';
import {Save,Plus,Trash2} from 'lucide-react';
import {Card,PageTitle} from '../components/UI';
import {apiRequest} from '../api';

export default function Preferences(){
 const user=(()=>{try{return JSON.parse(sessionStorage.getItem('allocation_user')||'null')}catch{return null}})();
 const [faculty,setFaculty]=useState([]),[courses,setCourses]=useState([]),[facultyId,setFacultyId]=useState(user?.facultyId||''),[preferences,setPreferences]=useState([]),[message,setMessage]=useState(''),[error,setError]=useState('');
 const canChooseFaculty=user?.role==='hod'||user?.role==='dean';
 useEffect(()=>{Promise.all([apiRequest({method:'GET',url:'/data/faculty'}),apiRequest({method:'GET',url:'/data/courses'})]).then(([f,c])=>{
  const all=Array.isArray(f.data)?f.data:[];
  const list=canChooseFaculty?all:all.filter(x=>x.facultyId===user?.facultyId || (user?.email&&x.email===user.email) || (user?.name&&x.name===user.name));
  setFaculty(list);
  setCourses(c.data||[]);
  const matched=list.find(x=>x.facultyId===user?.facultyId) || list.find(x=>user?.email&&x.email===user.email) || list.find(x=>user?.name&&x.name===user.name);
  if(matched) setFacultyId(matched.facultyId);
  else if(!facultyId&&list.length) setFacultyId(list[0].facultyId);
  else if(!list.length&&!canChooseFaculty) setError('Faculty profile not found. Please sign out and sign in again so your faculty account can be linked.');
}).catch(e=>setError(e?.response?.data?.message||'Could not load preference data'))},[]);
 useEffect(()=>{if(!facultyId)return;apiRequest({method:'GET',url:`/data/faculty/${facultyId}/preferences`}).then(r=>setPreferences(r.data.preferences||[])).catch(e=>setError(e?.response?.data?.message||'Could not load preferences'))},[facultyId]);
 const save=async()=>{try{setError('');const ranked=preferences.map((p,i)=>({courseId:p.courseId,rank:i+1}));const r=await apiRequest({method:'PUT',url:`/data/faculty/${facultyId}/preferences`,data:{preferences:ranked}});setPreferences(r.data.preferences||[]);setMessage('Preferences saved. The HOD will re-run the automatic allocation to apply them; approved allocations are not changed.');}catch(e){setError(e?.response?.data?.message||'Could not save preferences')}};
 const add=()=>setPreferences(v=>[...v,{courseId:courses.find(c=>!v.some(p=>p.courseId===c.courseId))?.courseId||'',rank:v.length+1}]);
 const move=(i,dir)=>setPreferences(v=>{const j=i+dir;if(j<0||j>=v.length)return v;const next=[...v];[next[i],next[j]]=[next[j],next[i]];return next;});
 return <div><PageTitle eyebrow="FACULTY INPUT" title="Course Preferences" desc="Submit ranked course preferences used by the verified allocation score."/>
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}{message&&<div className="mb-4 p-3 rounded-xl alert-success text-sm">{message}</div>}
  <Card className="p-5 max-w-3xl">{canChooseFaculty&&<label className="block text-xs font-semibold text-slate-500">Faculty account<select value={facultyId} onChange={e=>setFacultyId(e.target.value)} className="field-input mt-1 w-full px-3 py-2.5 rounded-lg">{faculty.map(f=><option key={f.facultyId} value={f.facultyId}>{f.name} ({f.facultyId})</option>)}</select></label>}
   <p className="mt-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Rank order = preference order. Use the arrows to reorder; credits are fixed per subject and can't be changed here.</p>
   <div className="mt-3 space-y-2">{preferences.map((p,i)=>{const course=courses.find(c=>c.courseId===p.courseId);return <div className="flex items-center gap-2" key={`${p.courseId}-${i}`}><span className="w-7 text-center text-sm font-semibold text-slate-500">{i+1}</span><select value={p.courseId} onChange={e=>setPreferences(v=>v.map((x,j)=>j===i?{...x,courseId:e.target.value}:x))} className="field-input flex-1 px-3 py-2.5 rounded-lg text-sm"><option value="">Select course</option>{courses.map(c=><option key={c.courseId} value={c.courseId}>{c.courseCode} - {c.courseName}</option>)}</select><span title="Credits are fixed per subject" className="field-input w-24 px-3 py-2.5 rounded-lg text-sm text-center font-semibold text-slate-500 bg-slate-50 select-none">{course?Number(course.credits)||0:'—'} cr</span><div className="flex flex-col"><button type="button" title="Move up" disabled={i===0} onClick={()=>move(i,-1)} className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30">▲</button><button type="button" title="Move down" disabled={i===preferences.length-1} onClick={()=>move(i,1)} className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30">▼</button></div><button type="button" title="Remove preference" onClick={()=>setPreferences(v=>v.filter((_,j)=>j!==i))} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 size={16}/></button></div>})}</div>
   <div className="mt-5 flex gap-2"><button type="button" onClick={add} className="btn-outline px-3 py-2 rounded-lg text-sm flex items-center gap-1.5"><Plus size={15}/> Add preference</button><button type="button" onClick={save} disabled={!facultyId} className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-40"><Save size={15}/> Save preferences</button></div>
  </Card></div>;
}
