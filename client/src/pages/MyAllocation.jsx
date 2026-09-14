import React,{useEffect,useState} from 'react';
import {Card,PageTitle,Badge} from '../components/UI';
import {apiRequest} from '../api';

export default function MyAllocation(){
 const [items,setItems]=useState([]),[error,setError]=useState('');
 useEffect(()=>{apiRequest({method:'GET',url:'/allocations/my'}).then(r=>setItems(r.data||[])).catch(e=>setError(e?.response?.data?.message||'Could not load your proposed allocations'))},[]);
 return <div><PageTitle eyebrow="FACULTY VIEW" title="My Proposed Allocations" desc="Your allocation status and reasoning. Other faculty scoring details are private."/>
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}
  {!error&&!items.length&&<Card className="p-8 text-center text-sm text-slate-500">No proposed allocations are available for this faculty account.</Card>}
  <div className="space-y-3">{items.map(item=><Card className="p-5" key={item._id}><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold text-blue-700">{item.courseId} {item.sectionId&&`• ${item.sectionId}`}</div><h2 className="font-display text-lg font-semibold text-slate-800 mt-1">{item.courseName}</h2></div><Badge tone={item.status==='approved'?'green':item.status==='pending'?'amber':'red'}>{item.statusLabel}</Badge></div><p className="mt-4 text-sm text-slate-600">{item.justification}</p>{item.status!=='approved'&&<div className="mt-3 text-xs text-slate-500">The HOD review decision is still pending or this request was not selected.</div>}</Card>)}</div>
 </div>;
}
