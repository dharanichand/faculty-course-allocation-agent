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
 const save=async()=>{try{setError('');const r=await apiRequest({method:'PUT',url:`/data/faculty/${facultyId}/preferences`,data:{preferences}});setPreferences(r.data.preferences||[]);setMessage('Preferences saved. Your ranked courses have been filed as requests for HOD review.');}catch(e){setError(e?.response?.data?.message||'Could not save preferences')}};
 const add=()=>setPreferences(v=>[...v,{courseId:courses.find(c=>!v.some(p=>p.courseId===c.courseId))?.courseId||'',rank:v.length+1}]);
 return <div><PageTitle eyebrow="FACULTY INPUT" title="Course Preferences" desc="Submit ranked course preferences used by the verified allocation score."/>
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}{message&&<div className="mb-4 p-3 rounded-xl alert-success text-sm">{message}</div>}
  <Card className="p-5 max-w-3xl">{canChooseFaculty&&<label className="block text-xs font-semibold text-slate-500">Faculty account<select value={facultyId} onChange={e=>setFacultyId(e.target.value)} className="field-input mt-1 w-full px-3 py-2.5 rounded-lg">{faculty.map(f=><option key={f.facultyId} value={f.facultyId}>{f.name} ({f.facultyId})</option>)}</select></label>}
   <div className="mt-5 space-y-2">{preferences.map((p,i)=><div className="flex items-center gap-2" key={`${p.courseId}-${i}`}><span className="w-7 text-center text-sm font-semibold text-slate-500">{i+1}</span><select value={p.courseId} onChange={e=>setPreferences(v=>v.map((x,j)=>j===i?{...x,courseId:e.target.value}:x))} className="field-input flex-1 px-3 py-2.5 rounded-lg text-sm"><option value="">Select course</option>{courses.map(c=><option key={c.courseId} value={c.courseId}>{c.courseCode} - {c.courseName}</option>)}</select><input type="number" min="1" value={p.rank} onChange={e=>setPreferences(v=>v.map((x,j)=>j===i?{...x,rank:e.target.value}:x))} className="field-input w-20 px-3 py-2.5 rounded-lg text-sm"/><button type="button" title="Remove preference" onClick={()=>setPreferences(v=>v.filter((_,j)=>j!==i))} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 size={16}/></button></div>)}</div>
   <div className="mt-5 flex gap-2"><button type="button" onClick={add} className="btn-outline px-3 py-2 rounded-lg text-sm flex items-center gap-1.5"><Plus size={15}/> Add preference</button><button type="button" onClick={save} disabled={!facultyId} className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-40"><Save size={15}/> Save preferences</button></div>
  </Card></div>;
}
