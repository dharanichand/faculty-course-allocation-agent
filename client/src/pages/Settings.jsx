import React, { useState } from 'react';
import { Settings as SettingsIcon, KeyRound, Server, Database, Save } from 'lucide-react';
import { Card, PageTitle, Badge } from '../components/UI';

export default function Settings() {
 const [saved, setSaved] = useState(false);
 const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || 'http://localhost:5000/api');
 return <div>
  <PageTitle eyebrow="SYSTEM CONFIGURATION" title="Settings" desc="Configure the local allocation agent connection and review system status." />
  <div className="grid lg:grid-cols-2 gap-5">
   <Card className="p-6">
    <div className="flex items-center gap-2 font-bold text-lg"><KeyRound size={19} className="text-blue-600"/> Agent connection</div>
    <label className="block text-sm font-semibold mt-6 mb-2">Backend API URL</label>
    <input value={apiUrl} onChange={e=>{setApiUrl(e.target.value);setSaved(false)}} className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-100"/>
    <div className="mt-3 text-xs text-slate-500">The OpenAI API key belongs in the server <code>.env</code> file. Never put it in frontend code.</div>
    <button onClick={()=>setSaved(true)} className="mt-5 px-4 py-2.5 rounded-xl bg-[#1d4ed8] text-white flex items-center gap-2 text-sm font-semibold"><Save size={16}/> Save</button>
    {saved && <div className="mt-3 text-xs text-emerald-700 font-semibold">Settings saved for this session.</div>}
   </Card>
   <Card className="p-6">
    <div className="flex items-center gap-2 font-bold text-lg"><Server size={19} className="text-blue-600"/> System status</div>
    <div className="mt-6 space-y-4">
     <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><Server size={16}/> Backend</span><Badge tone="green">Configured</Badge></div>
     <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><Database size={16}/> Data tools</span><Badge tone="green">Enabled</Badge></div>
     <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><KeyRound size={16}/> Agent authentication</span><Badge tone="green">Demo mode</Badge></div>
    </div>
   </Card>
  </div>
 </div>;
}
