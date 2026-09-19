import React,{useState} from 'react';
import axios from 'axios';
import {Bot,LockKeyhole,Mail,ArrowRight,ShieldCheck,Sparkles,GraduationCap,UserRound,Landmark} from 'lucide-react';
const API=import.meta.env.VITE_API_URL||'http://localhost:5000/api';

export default function Login(){
 const [email,setEmail]=useState('hod@college.edu'); const [password,setPassword]=useState('hod12345');
 const [role,setRole]=useState('hod');
 const [busy,setBusy]=useState(''); const [error,setError]=useState('');
 const chooseRole=nextRole=>{setRole(nextRole);setEmail(nextRole==='hod'?'hod@college.edu':'faculty@college.edu');setPassword(nextRole==='hod'?'hod12345':'faculty12345');setError('');};

 const enter=(token,user)=>{sessionStorage.setItem('allocation_demo_token',token);sessionStorage.setItem('allocation_user',JSON.stringify(user));window.location.assign('/dashboard');};

 const login=async()=>{
  if(!email||!password) return setError('Enter your email and password, or use the demo option below.');
  try{setBusy('login');setError('');
    const d=await axios.post(`${API}/auth/login`,{email,password,role});
   enter(d.data.token,d.data.user);
  }catch(e){setError(e?.response?.data?.message||'Could not sign in. Check your credentials or use the demo option.')}
  finally{setBusy('')}
 };

 const demo=async()=>{
  try{setBusy('demo');setError('');
   const d=await axios.post(`${API}/auth/demo`);
   enter(d.data.token,d.data.user);
  }catch(e){setError(e?.response?.data?.message||'Could not start the demo. Please make sure the server is running.')}
  finally{setBusy('')}
 };

 return <div className="min-h-screen overflow-y-auto bg-transparent grid place-items-center p-3 sm:p-5">
  {/* Banner header, in the style of the reference department event page */}
  <div className="w-full max-w-md">
  <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
   <div className="px-5 pt-4 pb-3 text-center border-b border-slate-100 bg-gradient-to-b from-blue-50/70 to-white">
     <div className="text-[10px] font-bold tracking-widest text-blue-600 uppercase">CSE Department Presents</div>
     <div className="font-display text-xl font-bold text-slate-900 mt-1">Faculty Course Allocation Agent</div>
    <div className="mx-auto mt-3 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white grid place-items-center shadow-lg"><Bot size={24}/></div>
    <p className="text-xs text-slate-400 mt-2">Academic Allocation · 2026–27</p>
    </div>

    <div className="p-5">
     <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><ShieldCheck size={18} className="text-blue-600"/> Sign in</div>
      <p className="text-xs text-slate-500 mt-2">Sign in to access the allocation agent, faculty requests and HOD decisions.</p>

     {error&&<div className="mt-4 p-3 rounded-xl alert-error text-sm">{error}</div>}

    <div className="grid grid-cols-2 gap-2 mt-4" role="group" aria-label="Sign in as">
    <button type="button" onClick={()=>chooseRole('hod')} className={`p-2.5 rounded-xl border text-left transition ${role==='hod'?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Landmark size={17}/><span className="block text-sm font-semibold mt-0.5">HOD</span></button>
    <button type="button" onClick={()=>chooseRole('faculty')} className={`p-2.5 rounded-xl border text-left transition ${role==='faculty'?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><UserRound size={17}/><span className="block text-sm font-semibold mt-0.5">Faculty</span></button>
    </div>

     <label className="block mt-3 text-xs font-semibold text-slate-600">Email
      <div className="relative"><Mail size={16} className="absolute left-3 top-3.5 text-slate-400"/>
       <input value={email} onChange={e=>setEmail(e.target.value)} placeholder={role==='hod'?'hod@college.edu':'faculty@college.edu'} className="field-input mt-1 w-full pl-9 pr-3 py-2.5 rounded-xl"/>
      </div>
     </label>
     <label className="block mt-2 text-xs font-semibold text-slate-600">Password
      <div className="relative"><LockKeyhole size={16} className="absolute left-3 top-3.5 text-slate-400"/>
       <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={role==='hod'?'hod12345':'faculty12345'} className="field-input mt-1 w-full pl-9 pr-3 py-2.5 rounded-xl"/>
      </div>
     </label>
    <div className="mt-2 inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Placeholders are login credentials</div>
    <button disabled={!!busy} onClick={login} className="mt-3 w-full py-2.5 rounded-xl btn-primary flex items-center justify-center gap-2 disabled:opacity-50">{busy==='login'?'Signing in…':'Sign in'}<ArrowRight size={17}/></button>

    <div className="flex items-center gap-3 my-3"><div className="h-px bg-slate-200 flex-1"/><span className="text-[11px] font-semibold text-slate-400">OR</span><div className="h-px bg-slate-200 flex-1"/></div>
    <button disabled={!!busy} onClick={demo} className="w-full py-2.5 rounded-xl btn-outline flex items-center justify-center gap-2 disabled:opacity-50"><Sparkles size={17} className="text-blue-600"/>{busy==='demo'?'Starting demo…':'Continue as demo'}</button>

      <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-400"><GraduationCap size={14} className="mt-0.5 shrink-0"/>No account needed — the demo signs you in as the HOD with sample faculty, courses and requests already loaded.</div>
    </div>
   </div>
   <div className="text-center text-[11px] text-slate-400 mt-4">API keys and credentials stay server-side. Nothing is stored outside your session.</div>
  </div>
 </div>;
}
