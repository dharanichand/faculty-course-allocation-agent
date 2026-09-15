import React,{useEffect,useMemo,useState} from 'react';
import {Bell,CheckCircle2,AlertTriangle,Clock3,Info,CheckCheck,ArrowRight} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Card,PageTitle,Badge} from '../components/UI';
import {apiRequest} from '../api';

const READ_KEY='fcaa_read_notifications';

function readIds(){
  try{return new Set(JSON.parse(localStorage.getItem(READ_KEY)||'[]'))}catch{return new Set()}
}
function saveRead(ids){localStorage.setItem(READ_KEY,JSON.stringify([...ids].slice(-300)));}

function formatTime(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  return new Intl.DateTimeFormat(undefined,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
}

function Icon({type}){
  if(type==='success')return <CheckCircle2 size={19}/>;
  if(type==='warning')return <AlertTriangle size={19}/>;
  if(type==='info')return <Clock3 size={19}/>;
  return <Info size={19}/>;
}

export default function Notifications(){
 const [items,setItems]=useState([]),[read,setRead]=useState(()=>readIds()),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=()=>{
  setLoading(true); setError('');
  apiRequest({method:'GET',url:'/allocations/notifications'})
   .then(r=>setItems(Array.isArray(r.data)?r.data:[]))
   .catch(e=>setError(e?.response?.data?.message||'Could not load notifications'))
   .finally(()=>setLoading(false));
 };
 useEffect(()=>{load();},[]);
 const unread=useMemo(()=>items.filter(x=>!read.has(x.id)),[items,read]);



 const markRead=(id)=>{
  const next=new Set(read); next.add(id); setRead(next); saveRead(next); window.dispatchEvent(new Event('fcaa-notifications-read'));
 };
 const markAll=()=>{
  const next=new Set(read); items.forEach(x=>next.add(x.id)); setRead(next); saveRead(next); window.dispatchEvent(new Event('fcaa-notifications-read'));
 };
 return <div className="w-full max-w-[1100px] mx-auto">
   <PageTitle eyebrow="FACULTY WORKSPACE" title="Notification Center" desc="Stay updated on your course allocation requests and HOD decisions."/>
   <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
     <div className="flex items-center gap-2"><Badge tone={unread.length?'blue':'green'}>{unread.length} unread</Badge><span className="text-xs text-slate-500">{items.length} total notifications</span></div>
     <div className="flex gap-2">
       <button type="button" onClick={load} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50">Refresh</button>
       {items.length>0&&<button type="button" onClick={markAll} disabled={!unread.length} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><CheckCheck size={14}/> Mark all read</button>}
     </div>
   </div>
   {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}
   <Card className="overflow-hidden">
    {loading?<div className="py-14 text-center text-sm text-slate-500">Loading notifications...</div>:
     !items.length?<div className="py-16 text-center"><div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><Bell size={22}/></div><h2 className="mt-4 font-display font-semibold text-slate-800">You're all caught up</h2><p className="mt-1 text-sm text-slate-500">Updates about your allocation requests will appear here.</p><Link to="/my-allocation" className="inline-flex items-center gap-1 mt-4 text-xs font-semibold text-blue-700">View my allocation <ArrowRight size={13}/></Link></div>:
     <div className="divide-y divide-slate-100">{items.map(item=>{
       const isUnread=!read.has(item.id);
       return <button type="button" key={item.id} onClick={()=>markRead(item.id)} className={`w-full text-left p-4 sm:p-5 transition hover:bg-slate-50 ${isUnread?'bg-blue-50/40':''}`}>
        <div className="flex gap-3">
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${item.type==='success'?'bg-emerald-50 text-emerald-600':item.type==='warning'?'bg-amber-50 text-amber-600':'bg-blue-50 text-blue-600'}`}><Icon type={item.type}/></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-800">{item.title}</h3>{isUnread&&<span className="w-2 h-2 rounded-full bg-blue-600" title="Unread"/>}</div>
            <p className="text-sm text-slate-600 mt-1">{item.message}</p>
            {item.reason&&<p className="text-xs text-slate-500 mt-2">{item.reason}</p>}
            <p className="text-[11px] text-slate-400 mt-2">{formatTime(item.timestamp)}</p>
          </div>
        </div>
       </button>
     })}</div>}
   </Card>
 </div>;
}
