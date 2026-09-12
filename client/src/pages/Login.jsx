import React,{useState} from 'react';
import axios from 'axios';
import {Bot,LockKeyhole,Mail,ArrowRight,ShieldCheck,Sparkles,GraduationCap} from 'lucide-react';
const API=import.meta.env.VITE_API_URL||'http://localhost:5000/api';

export default function Login(){
 const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(''); const [error,setError]=useState('');

 const enter=(token,user)=>{sessionStorage.setItem('allocation_demo_token',token);sessionStorage.setItem('allocation_user',JSON.stringify(user));window.location.assign('/dashboard');};

 const login=async()=>{
  if(!email||!password) return setError('Enter your email and password, or use the demo option below.');
  try{setBusy('login');setError('');
   const d=await axios.post(`${API}/auth/login`,{email,password});
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

 return <div className="min-h-screen bg-transparent grid place-items-center p-5">
  {/* Banner header, in the style of the reference department event page */}
  <div className="w-full max-w-md">
   <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
    <div className="px-6 pt-6 pb-5 text-center border-b border-slate-100 bg-gradient-to-b from-blue-50/70 to-white">
     <div className="text-[10px] font-bold tracking-widest text-blue-600 uppercase">CSE Department Presents</div>
     <div className="font-display text-xl font-bold text-slate-900 mt-1">Faculty Course Allocation Agent</div>
     <div className="mx-auto mt-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white grid place-items-center shadow-lg"><Bot size={30}/></div>
     <p className="text-xs text-slate-400 mt-3">Academic Allocation · 2026–27</p>
    </div>

    <div className="p-7">
     <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><ShieldCheck size={18} className="text-blue-600"/> Sign in</div>
     <p className="text-xs text-slate-500 mt-2">Sign in to access the allocation agent, faculty requests and HOD decisions.</p>

     {error&&<div className="mt-4 p-3 rounded-xl alert-error text-sm">{error}</div>}

     <label className="block mt-5 text-xs font-semibold text-slate-600">Email
      <div className="relative"><Mail size={16} className="absolute left-3 top-3.5 text-slate-400"/>
       <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@college.edu" className="field-input mt-1 w-full pl-9 pr-3 py-3 rounded-xl"/>
      </div>
     </label>
     <label className="block mt-3 text-xs font-semibold text-slate-600">Password
      <div className="relative"><LockKeyhole size={16} className="absolute left-3 top-3.5 text-slate-400"/>
       <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" className="field-input mt-1 w-full pl-9 pr-3 py-3 rounded-xl"/>
      </div>
     </label>
     <button disabled={!!busy} onClick={login} className="mt-5 w-full py-3 rounded-xl btn-primary flex items-center justify-center gap-2 disabled:opacity-50">{busy==='login'?'Signing in…':'Sign in'}<ArrowRight size={17}/></button>

     <div className="flex items-center gap-3 my-5"><div className="h-px bg-slate-200 flex-1"/><span className="text-[11px] font-semibold text-slate-400">OR</span><div className="h-px bg-slate-200 flex-1"/></div>

     <button disabled={!!busy} onClick={demo} className="w-full py-3 rounded-xl btn-outline flex items-center justify-center gap-2 disabled:opacity-50">
      <Sparkles size={17} className="text-blue-600"/>{busy==='demo'?'Starting demo…':'Continue with demo'}
     </button>
     <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-400"><GraduationCap size={14} className="mt-0.5 shrink-0"/>No account needed — the demo signs you in as the HOD with sample faculty, courses and requests already loaded.</div>
    </div>
   </div>
   <div className="text-center text-[11px] text-slate-400 mt-4">API keys and credentials stay server-side. Nothing is stored outside your session.</div>
  </div>
 </div>;
}
