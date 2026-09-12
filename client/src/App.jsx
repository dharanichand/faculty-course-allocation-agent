import React,{Component,useEffect} from 'react';
import {NavLink,useLocation,useNavigate} from 'react-router-dom';
import {Routes,Route} from 'react-router-dom';
import {LayoutDashboard,BookOpen,Users,GitBranch,BrainCircuit,ClipboardCheck,ShieldCheck,FileText,Settings,Bot,LogOut} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Requests from './pages/Requests';
import Faculty from './pages/Faculty';
import Courses from './pages/Courses';
import Conflicts from './pages/Conflicts';
import AllocationReview from './pages/AllocationReview';
import AgentChat from './pages/AgentChat';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';

class PageErrorBoundary extends Component {
 state={error:null};
 static getDerivedStateFromError(error){return {error};}
 componentDidCatch(error,info){console.error('Page render error:',error,info);}
 render(){
  if(this.state.error){
   return <div className="p-8"><div className="max-w-2xl mx-auto panel rounded-2xl p-6"><h1 className="font-display text-xl font-semibold text-rose-600">This page could not be rendered</h1><p className="text-sm text-slate-500 mt-2">The rest of the application is still available. Open another section from the menu above or refresh this page.</p><pre className="mt-4 p-3 bg-rose-50 border border-rose-100 rounded-lg text-xs text-rose-600 overflow-auto">{this.state.error?.message || 'Unknown render error'}</pre></div></div>;
  }
  return this.props.children;
 }
}

const nav=[
 {to:'/',label:'Dashboard',icon:LayoutDashboard},
 {to:'/requests',label:'Faculty Requests',icon:ClipboardCheck},
 {to:'/faculty',label:'Faculty',icon:Users},
 {to:'/courses',label:'Courses & Sections',icon:BookOpen},
 {to:'/conflicts',label:'Conflicts',icon:GitBranch},
 {to:'/review',label:'HOD Review',icon:ShieldCheck},
 {to:'/agent',label:'AI Agent',icon:BrainCircuit},
 {to:'/reports',label:'Reports',icon:FileText},
];

function App(){
 const loc=useLocation(); const navigate=useNavigate();
 const user=(()=>{try{return JSON.parse(sessionStorage.getItem('allocation_user')||'null')}catch{return null}})();
 const logout=()=>{sessionStorage.removeItem('allocation_demo_token');sessionStorage.removeItem('allocation_user');window.location.assign('/login');};
 useEffect(()=>{if(!sessionStorage.getItem('allocation_demo_token'))navigate('/login',{replace:true});},[]);

 return <div className="min-h-screen bg-transparent text-slate-700">
  {/* Header: brand + status + profile on top, primary navigation as a pill row underneath — no sidebar. */}
  <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
   <div className="flex items-center px-4 sm:px-7 h-16 gap-4 max-w-[1600px] mx-auto">
    <button type="button" onClick={()=>navigate('/')} className="flex items-center gap-3 shrink-0 cursor-hover">
     <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shadow-glow"><Bot size={20}/></div>
     <div className="hidden sm:block leading-tight text-left"><div className="text-[10px] font-bold tracking-widest text-blue-600 uppercase">CSE Department Presents</div><div className="font-display font-bold text-slate-900 text-base -mt-0.5">Faculty Course Allocation Agent</div></div>
    </button>
    <div className="flex-1"/>
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/> System healthy</div>
    <div className="flex items-center gap-3 pl-2">
     <div className="text-right hidden md:block"><div className="text-sm font-semibold text-slate-800">{user?.name||'Dr. Ananya Rao'}</div><div className="text-[11px] text-slate-400">{user?.role||'Head of Department'}</div></div>
     <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center font-bold text-sm shrink-0">{(user?.name||'AR').split(' ').map(w=>w[0]).slice(0,2).join('')}</div>
     <button onClick={()=>navigate('/settings')} title="Settings" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Settings size={18}/></button>
     <button onClick={logout} title="Sign out" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600"><LogOut size={18}/></button>
    </div>
   </div>
   <nav className="border-t border-slate-100 bg-white/60">
    <div className="flex items-center gap-1.5 px-4 sm:px-7 h-14 max-w-[1600px] mx-auto overflow-x-auto no-scrollbar">
     {nav.map(n=>{const I=n.icon; return <NavLink key={n.to} to={n.to} className={({isActive})=>`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${isActive?'bg-blue-600 text-white shadow-glow':'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><I size={16}/>{n.label}</NavLink>})}
    </div>
   </nav>
  </header>

  <div className="min-h-screen">
   {loc.pathname!=='/agent'&&loc.pathname!=='/agent/chat'&&<button type="button" onClick={()=>navigate('/agent')} title="Ask the AI Allocation Agent" className={`fixed z-40 right-6 flex items-center gap-2 pl-3 pr-4 py-3 rounded-full btn-primary ${loc.pathname==='/review'?'bottom-24':'bottom-6'}`}><Bot size={19}/><span className="text-sm font-semibold hidden sm:inline">Ask AI Agent</span></button>}
   <main className="p-4 sm:p-7 max-w-[1600px] mx-auto"><PageErrorBoundary><Routes><Route path="/" element={<Dashboard/>}/><Route path="/dashboard" element={<Dashboard/>}/><Route path="/requests" element={<Requests/>}/><Route path="/faculty-requests" element={<Requests/>}/>
            <Route path="/faculty" element={<Faculty/>}/><Route path="/courses" element={<Courses/>}/><Route path="/courses-sections" element={<Courses/>}/><Route path="/conflicts" element={<Conflicts/>}/><Route path="/review" element={<AllocationReview/>}/><Route path="/hod-review" element={<AllocationReview/>}/><Route path="/agent" element={<AgentChat/>}/><Route path="/agent/chat" element={<AgentChat/>}/><Route path="/reports" element={<Reports/>}/><Route path="/settings" element={<SettingsPage/>}/></Routes></PageErrorBoundary></main>
  </div>
 </div>
}
export default App;
