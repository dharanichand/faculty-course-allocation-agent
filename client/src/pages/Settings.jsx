import React, { useEffect, useState } from 'react';
import { KeyRound, Server, Database, Save, SlidersHorizontal } from 'lucide-react';
import { Card, PageTitle, Badge } from '../components/UI';
import { apiRequest } from '../api';

export default function Settings() {
 const [saved, setSaved] = useState(false);
 const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || 'http://localhost:5000/api');
 const [config,setConfig]=useState({department:'CSE',weights:{expertise:35,publication:15,qualification:20,preference:15,continuity:10,feedback:5},maxWorkload:18});
 const [configMessage,setConfigMessage]=useState('');
 useEffect(()=>{apiRequest({method:'GET',url:'/data/allocation-config'}).then(r=>setConfig(r.data)).catch(()=>{})},[]);
 const saveConfig=async()=>{try{const r=await apiRequest({method:'PUT',url:'/data/allocation-config',data:config});setConfig(r.data);setConfigMessage('Allocation rules saved.')}catch(e){setConfigMessage(e?.response?.data?.message||'Could not save allocation rules.')}};
 return <div>
  <PageTitle eyebrow="SYSTEM CONFIGURATION" title="Settings" desc="Configure the local allocation agent connection and review system status." />
  <div className="grid lg:grid-cols-2 gap-5">
   <Card className="p-6">
    <div className="flex items-center gap-2 font-display font-semibold text-lg text-slate-800"><KeyRound size={19} className="text-fuchsia-700"/> Agent connection</div>
    <label className="block text-sm font-semibold mt-6 mb-2 text-slate-600">Backend API URL</label>
    <input value={apiUrl} onChange={e=>{setApiUrl(e.target.value);setSaved(false)}} className="field-input w-full px-4 py-3 rounded-xl outline-none"/>
    <div className="mt-3 text-xs text-slate-500">The OpenAI API key belongs in the server <code className="text-slate-500">.env</code> file. Never put it in frontend code.</div>
    <button onClick={()=>setSaved(true)} className="mt-5 px-4 py-2.5 rounded-xl btn-primary flex items-center gap-2 text-sm"><Save size={16}/> Save</button>
    {saved && <div className="mt-3 text-xs text-emerald-700 font-semibold">Settings saved for this session.</div>}
    </Card>
    <Card className="p-6 lg:col-span-2">
     <div className="flex items-center gap-2 font-display font-semibold text-lg text-slate-800"><SlidersHorizontal size={19} className="text-fuchsia-700"/> Allocation scoring and workload rules</div>
     <p className="text-xs text-slate-500 mt-2">HOD/Dean settings used by the backend verifier. Weights must total 100.</p>
     <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">{Object.entries(config.weights||{}).map(([key,value])=><label className="text-xs font-semibold text-slate-500 capitalize" key={key}>{key}<input type="number" min="0" value={value} onChange={e=>setConfig(v=>({...v,weights:{...v.weights,[key]:e.target.value}}))} className="field-input mt-1 w-full px-3 py-2 rounded-lg"/></label>)}</div>
     <label className="block text-xs font-semibold text-slate-500 mt-4 max-w-xs">Maximum workload hours<input type="number" min="1" value={config.maxWorkload} onChange={e=>setConfig(v=>({...v,maxWorkload:e.target.value}))} className="field-input mt-1 w-full px-3 py-2 rounded-lg"/></label>
     <button type="button" onClick={saveConfig} className="mt-5 px-4 py-2.5 rounded-xl btn-primary flex items-center gap-2 text-sm"><Save size={16}/> Save allocation rules</button>{configMessage&&<div className="mt-3 text-xs text-emerald-700 font-semibold">{configMessage}</div>}
    </Card>
   <Card className="p-6">
    <div className="flex items-center gap-2 font-display font-semibold text-lg text-slate-800"><Server size={19} className="text-fuchsia-700"/> System status</div>
    <div className="mt-6 space-y-4">
     <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-slate-600"><Server size={16}/> Backend</span><Badge tone="green">Configured</Badge></div>
     <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-slate-600"><Database size={16}/> Data tools</span><Badge tone="green">Enabled</Badge></div>
     <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-slate-600"><KeyRound size={16}/> Agent authentication</span><Badge tone="green">Demo mode</Badge></div>
    </div>
   </Card>
  </div>
 </div>;
}
