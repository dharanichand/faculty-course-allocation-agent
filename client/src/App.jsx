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
  {/* Compact single-row header: branding + navigation + health/profile controls. */}
  <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
   <div className="flex items-center gap-2 px-3 sm:px-5 h-[58px] max-w-[1800px] mx-auto overflow-x-auto no-scrollbar">
    <button type="button" onClick={()=>navigate('/')} className="flex items-center gap-2 shrink-0 cursor-hover pr-2 border-r border-slate-200">
     <img src="/branding/vignan-logo.png" alt="Vignan's" className="w-[92px] h-auto object-contain" />
     <div className="hidden xl:block leading-tight text-left min-w-[180px]">
      <div className="text-[8px] font-bold tracking-widest text-blue-600 uppercase">CSE Department Presents</div>
      <div className="font-display font-bold text-slate-900 text-[13px]">Faculty Course Allocation Agent</div>
     </div>
    </button>
    <nav className="flex items-center gap-1 shrink-0">
     {nav.map(n=>{const I=n.icon; return <NavLink key={n.to} to={n.to} title={n.label} className={({isActive})=>`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition whitespace-nowrap ${isActive?'bg-blue-600 text-white shadow-sm':'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><I size={14}/><span className="hidden lg:inline">{n.label}</span></NavLink>})}
    </nav>
    <div className="ml-auto flex items-center gap-1.5 shrink-0 pl-2 border-l border-slate-200">
     <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> System healthy</div>
     <div className="text-right hidden xl:block leading-tight"><div className="text-[11px] font-semibold text-slate-800">{user?.name||'Dr. Ananya Rao'}</div><div className="text-[9px] text-slate-400">{user?.role||'Head of Department'}</div></div>
     <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center font-bold text-xs shrink-0">{(user?.name||'AR').split(' ').map(w=>w[0]).slice(0,2).join('')}</div>
     <button onClick={()=>navigate('/settings')} title="Settings" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Settings size={16}/></button>
     <button onClick={logout} title="Sign out" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600"><LogOut size={16}/></button>
    </div>
   </div>
  </header>

  <div className="min-h-screen">
   {loc.pathname!=='/agent'&&loc.pathname!=='/agent/chat'&&<button type="button" onClick={()=>navigate('/agent')} title="Ask the AI Allocation Agent" className={`fixed z-40 right-6 flex items-center gap-2 pl-3 pr-4 py-3 rounded-full btn-primary ${loc.pathname==='/review'?'bottom-24':'bottom-6'}`}><Bot size={19}/><span className="text-sm font-semibold hidden sm:inline">Ask AI Agent</span></button>}
   <main className="p-4 sm:p-7 max-w-[1600px] mx-auto"><PageErrorBoundary><Routes><Route path="/" element={<Dashboard/>}/><Route path="/dashboard" element={<Dashboard/>}/><Route path="/requests" element={<Requests/>}/><Route path="/faculty-requests" element={<Requests/>}/>
            <Route path="/faculty" element={<Faculty/>}/><Route path="/courses" element={<Courses/>}/><Route path="/courses-sections" element={<Courses/>}/><Route path="/conflicts" element={<Conflicts/>}/><Route path="/review" element={<AllocationReview/>}/><Route path="/hod-review" element={<AllocationReview/>}/><Route path="/agent" element={<AgentChat/>}/><Route path="/agent/chat" element={<AgentChat/>}/><Route path="/reports" element={<Reports/>}/><Route path="/settings" element={<SettingsPage/>}/></Routes></PageErrorBoundary></main>
  </div>
 </div>
}
export default App;
