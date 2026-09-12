import React,{Component,useState} from 'react';
import {NavLink,useLocation,useNavigate} from 'react-router-dom';
import {Routes,Route} from 'react-router-dom';
import {LayoutDashboard,BookOpen,Users,GitBranch,BrainCircuit,ClipboardCheck,ShieldCheck,FileText,Settings,Menu,X,LogOut,Bot,Sparkles,ChevronRight} from 'lucide-react';
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
   return <div className="p-8"><div className="max-w-2xl mx-auto bg-white border border-red-200 rounded-2xl p-6 shadow-sm"><h1 className="text-xl font-bold text-red-700">This page could not be rendered</h1><p className="text-sm text-slate-600 mt-2">The rest of the application is still available. Open another section from the sidebar or refresh this page.</p><pre className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-red-600 overflow-auto">{this.state.error?.message || 'Unknown render error'}</pre></div></div>;
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
 const [open,setOpen]=useState(false); const loc=useLocation(); const navigate=useNavigate();
 return <div className="min-h-screen bg-[#f4f8fd] text-[#102b54]">
  <aside className={`fixed z-40 inset-y-0 left-0 w-72 bg-[#0b1f44] text-white transform transition-transform lg:translate-x-0 ${open?'translate-x-0':'-translate-x-full'} lg:static lg:fixed`}>
   <div className="h-full flex flex-col">
    <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center"><Bot size={25}/></div>
      <div><div className="font-bold tracking-tight">Allocation Agent</div><div className="text-[11px] text-blue-200">AGENTIC AI • 2026</div></div>
      <button className="ml-auto lg:hidden" onClick={()=>setOpen(false)}><X size={20}/></button>
    </div>
    <div className="px-4 pt-6 text-[10px] uppercase tracking-[.18em] text-blue-200/70">Workspace</div>
    <nav className="px-3 mt-2 space-y-1 flex-1">{nav.map(n=>{const I=n.icon; return <NavLink key={n.to} to={n.to} onClick={()=>setOpen(false)} className={({isActive})=>`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition ${isActive?'bg-white text-[#0b1f44] shadow-lg shadow-black/10 font-semibold':'text-blue-100 hover:bg-white/10'}`}><I size={18}/><span className="flex-1">{n.label}</span>{n.badge&&<span className="text-[11px] min-w-5 h-5 px-1.5 rounded-full bg-blue-400/20 text-blue-100 flex items-center justify-center">{n.badge}</span>}</NavLink>})}</nav>
    <div className="p-4"><div className="rounded-2xl bg-white/8 border border-white/10 p-4"><div className="flex gap-3"><Sparkles size={18} className="text-sky-300 mt-0.5"/><div><div className="text-sm font-semibold">AI status</div><div className="text-xs text-blue-200 mt-1">Agent online • tools ready</div></div></div></div><button onClick={()=>navigate('/settings')} className="w-full mt-3 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-blue-100 hover:bg-white/10"><Settings size={17}/>Settings</button></div>
   </div>
  </aside>
  <div className="lg:pl-72 min-h-screen">
   <header className="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center px-4 sm:px-7 gap-4">
    <button className="lg:hidden p-2 rounded-lg hover:bg-slate-100" onClick={()=>setOpen(true)}><Menu/></button>
    <div className="flex-1"><div className="text-xs text-slate-500">CSE Department / Academic Allocation</div><div className="font-semibold text-sm sm:text-base">Faculty Course Allocation • 2026–27</div></div>
    <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-emerald-500"/> System healthy</div>
    <div className="flex items-center gap-3"><div className="text-right hidden md:block"><div className="text-sm font-semibold">Dr. Ananya Rao</div><div className="text-[11px] text-slate-500">Head of Department</div></div><div className="w-10 h-10 rounded-full bg-[#dbeafe] text-[#1e3a8a] flex items-center justify-center font-bold">AR</div></div>
   </header>
   <main className="p-4 sm:p-7 max-w-[1600px] mx-auto"><PageErrorBoundary><Routes><Route path="/" element={<Dashboard/>}/><Route path="/dashboard" element={<Dashboard/>}/><Route path="/requests" element={<Requests/>}/><Route path="/faculty-requests" element={<Requests/>}/>
            <Route path="/faculty" element={<Faculty/>}/><Route path="/courses" element={<Courses/>}/><Route path="/courses-sections" element={<Courses/>}/><Route path="/conflicts" element={<Conflicts/>}/><Route path="/review" element={<AllocationReview/>}/><Route path="/hod-review" element={<AllocationReview/>}/><Route path="/agent" element={<AgentChat/>}/><Route path="/agent/chat" element={<AgentChat/>}/><Route path="/reports" element={<Reports/>}/><Route path="/settings" element={<SettingsPage/>}/></Routes></PageErrorBoundary></main>
  </div>
 </div>
}
export default App;
