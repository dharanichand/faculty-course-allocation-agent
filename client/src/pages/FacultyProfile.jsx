import React,{useEffect,useState} from 'react';
import {BriefcaseBusiness,Mail,UserRound,GraduationCap} from 'lucide-react';
import {Card,PageTitle,Badge} from '../components/UI';
import {apiRequest} from '../api';

export default function FacultyProfile(){
 const user=(()=>{try{return JSON.parse(sessionStorage.getItem('allocation_user')||'null')}catch{return null}})();
 const [faculty,setFaculty]=useState(null),[error,setError]=useState('');
 useEffect(()=>{apiRequest({method:'GET',url:'/data/faculty'}).then(r=>setFaculty((r.data||[]).find(item=>item.facultyId===user?.facultyId)||null)).catch(e=>setError(e?.response?.data?.message||'Could not load your faculty profile'))},[user?.facultyId]);
 return <div className="max-w-2xl mx-auto"><PageTitle eyebrow="MY FACULTY PROFILE" title="My Faculty Data" desc="Your profile, expertise and workload information used by the allocation agent."/>
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}
  {!error&&!faculty&&<Card className="p-8 text-center text-sm text-slate-500">No faculty profile is linked to this account.</Card>}
  {faculty&&<Card className="p-6 sm:p-8"><div className="flex flex-col items-center text-center"><div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-700 grid place-items-center"><UserRound size={30}/></div><h2 className="font-display text-2xl font-semibold text-slate-900 mt-4">{faculty.name}</h2><p className="text-sm text-slate-500 mt-1">{faculty.designation} · {faculty.department}</p><Badge tone="green">{faculty.status}</Badge></div><div className="grid sm:grid-cols-2 gap-3 mt-7"><div className="p-4 rounded-xl bg-slate-50"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Mail size={15}/> Email</div><div className="text-sm font-semibold text-slate-800 mt-2 break-all">{faculty.email||'Not available'}</div></div><div className="p-4 rounded-xl bg-slate-50"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><BriefcaseBusiness size={15}/> Workload</div><div className="text-sm font-semibold text-slate-800 mt-2">{faculty.currentWorkload||0} / {faculty.maxWorkload||18} hours</div></div></div><div className="mt-5 p-4 rounded-xl border border-slate-200"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><GraduationCap size={15}/> Qualifications</div><div className="flex flex-wrap gap-2 mt-3">{(faculty.qualifications||[]).map(item=><span className="text-xs rounded-full bg-blue-50 text-blue-700 px-2.5 py-1" key={item}>{item}</span>)}</div></div><div className="mt-5"><div className="text-xs font-semibold text-slate-500">Expertise</div><div className="flex flex-wrap gap-2 mt-3">{(faculty.expertise||[]).map(item=><span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1" key={item}>{item}</span>)}</div></div></Card>}
 </div>;
}
