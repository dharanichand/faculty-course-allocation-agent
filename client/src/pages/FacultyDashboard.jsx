import React,{useEffect,useState} from 'react';
import {BookOpen,CheckCircle2,Clock3,UserRound} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Card,PageTitle,Badge,Stat} from '../components/UI';
import {apiRequest} from '../api';

export default function FacultyDashboard(){
 const [items,setItems]=useState([]),[error,setError]=useState('');
 const user=(()=>{try{return JSON.parse(sessionStorage.getItem('allocation_user')||'null')}catch{return null}})();
 useEffect(()=>{apiRequest({method:'GET',url:'/allocations/my'}).then(r=>setItems(r.data||[])).catch(e=>setError(e?.response?.data?.message||'Could not load your dashboard'))},[]);
 const approved=items.filter(item=>item.status==='approved').length;
 const pending=items.filter(item=>item.status==='pending'||item.status==='recommended').length;
 return <div className="w-full max-w-[1600px] mx-auto"><PageTitle eyebrow="FACULTY WORKSPACE" title={`Welcome, ${user?.name||'Faculty'}`} desc="Your personal allocation status and academic profile."/>
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><Stat label="My requests" value={items.length} sub="Your submitted requests" icon={BookOpen}/><Stat label="Approved" value={approved} sub="HOD-approved subjects" icon={CheckCircle2} tone="blue"/><Stat label="Pending review" value={pending} sub="Awaiting HOD decision" icon={Clock3} tone="amber"/><Stat label="Account" value="Faculty" sub="Personal workspace" icon={UserRound}/></div>
    <Card className="mt-5 p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display font-semibold text-slate-800">My proposed allocations</h2><p className="text-xs text-slate-500 mt-1">Only your own requests and decisions are shown.</p></div><Link to="/my-allocation" className="text-xs font-semibold text-blue-700">View details</Link></div><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">{items.slice(0,6).map(item=><div key={item._id} className="min-h-28 flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><div className="text-sm font-semibold text-slate-800">{item.courseName||item.courseId}</div><div className="text-xs text-slate-500 mt-1">{item.sectionId||'Section pending'}</div></div><div className="flex items-end justify-between gap-2"><p className="text-xs text-slate-500 line-clamp-2">{item.justification}</p><Badge tone={item.status==='approved'?'green':item.status==='pending'?'amber':'red'}>{item.statusLabel||item.status}</Badge></div></div>)}{!items.length&&<div className="md:col-span-2 xl:col-span-3 py-10 text-center text-sm text-slate-500">No allocation requests are linked to this account yet.</div>}</div></Card>
 </div>;
}
