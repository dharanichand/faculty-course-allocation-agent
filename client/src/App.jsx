import React,{Component,useEffect} from 'react';
import {NavLink,useLocation,useNavigate} from 'react-router-dom';
import {Routes,Route} from 'react-router-dom';
import {LayoutDashboard,BookOpen,Users,GitBranch,BrainCircuit,ClipboardCheck,ShieldCheck,FileText,Settings,Bot,LogOut,SlidersHorizontal,UserCheck} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Requests from './pages/Requests';
import Faculty from './pages/Faculty';
import FacultyProfile from './pages/FacultyProfile';
import Courses from './pages/Courses';
import Conflicts from './pages/Conflicts';
import AllocationReview from './pages/AllocationReview';
import AgentChat from './pages/AgentChat';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';
import Preferences from './pages/Preferences';
import MyAllocation from './pages/MyAllocation';

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
 {to:'/preferences',label:'Preferences',icon:SlidersHorizontal},
 {to:'/my-allocation',label:'My allocation',icon:UserCheck},
];

function App(){
 const loc=useLocation(); const navigate=useNavigate();
 const user=(()=>{try{return JSON.parse(sessionStorage.getItem('allocation_user')||'null')}catch{return null}})();
 const visibleNav=user?.role==='hod'
  ? nav.filter(item=>!['/preferences','/my-allocation'].includes(item.to))
  : user?.role==='faculty'
   ? nav.filter(item=>['/','/preferences','/my-allocation'].includes(item.to))
   : nav;
 const logout=()=>{sessionStorage.removeItem('allocation_demo_token');sessionStorage.removeItem('allocation_user');window.location.assign('/login');};
 useEffect(()=>{if(!sessionStorage.getItem('allocation_demo_token'))navigate('/login',{replace:true});},[]);

 // Header height is fixed (not sticky) so it can never be scrolled out of view;
 // HEADER_H must match the space reserved below it so page content never
 // slides underneath the fixed bar.
 const HEADER_H=112;

 return <div className="h-screen overflow-hidden bg-transparent text-slate-700">
    {/* Fixed, full-width header that stays fully visible while the page scrolls. */}
  <header className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm" style={{height:HEADER_H}}>
   <div className="h-14 flex items-center justify-between gap-3 px-3 sm:px-5 max-w-[1800px] mx-auto">
    <button type="button" onClick={()=>navigate('/')} className="flex items-center gap-2 shrink-0 cursor-hover">
     <img src="/branding/vignan-logo.png" alt="Vignan's" className="w-20 sm:w-[100px] h-auto object-contain" />
     <div className="hidden md:block leading-tight text-left">
      <div className="text-[10px] font-bold tracking-widest text-blue-600 uppercase">CSE Department Presents</div>
      <div className="font-display font-bold text-slate-900 text-[14px]">Faculty Course Allocation Agent</div>
     </div>
    </button>
    <div className="flex items-center gap-2 shrink-0">
     <div className="text-right leading-tight"><div className="text-[12px] font-semibold text-slate-800">{user?.name||'Dr. Ananya Rao'}</div><div className="hidden sm:block text-[10px] text-slate-400">{user?.role||'Head of Department'}</div></div>
     <div className="hidden sm:flex w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white items-center justify-center font-bold text-xs">{(user?.name||'AR').split(' ').map(w=>w[0]).slice(0,2).join('')}</div>
     <button onClick={()=>navigate('/settings')} title="Settings" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Settings size={17}/></button>
     <button onClick={logout} title="Sign out" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600"><LogOut size={17}/></button>
    </div>
   </div>
   <nav className="h-14 grid grid-cols-5 sm:grid-cols-10 items-center gap-1 px-2 sm:px-4 border-t border-slate-100 max-w-[1800px] mx-auto overflow-hidden">
    {visibleNav.map(n=>{const I=n.icon; return <NavLink key={n.to} to={n.to} title={n.label} aria-label={n.label} className={({isActive})=>`min-w-0 flex items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] sm:text-[11px] font-semibold transition text-center leading-tight ${isActive?'bg-blue-600 text-white shadow-sm':'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><I size={14}/><span>{n.label}</span></NavLink>})}
   </nav>
  </header>

  <div className="h-screen overflow-hidden" style={{paddingTop:HEADER_H}}>
  {user?.role!=='faculty'&&loc.pathname!=='/agent'&&loc.pathname!=='/agent/chat'&&<button type="button" onClick={()=>navigate('/agent')} title="Ask the AI Allocation Agent" className={`fixed z-40 right-6 flex items-center gap-2 pl-3 pr-4 py-3 rounded-full btn-primary ${loc.pathname==='/review'?'bottom-24':'bottom-6'}`}><Bot size={19}/><span className="text-sm font-semibold hidden sm:inline">Ask AI Agent</span></button>}
   <main className="h-[calc(100vh-112px)] overflow-y-auto overscroll-contain p-4 sm:p-7 max-w-[1600px] mx-auto"><PageErrorBoundary><Routes><Route path="/" element={<Dashboard/>}/><Route path="/dashboard" element={<Dashboard/>}/><Route path="/requests" element={<Requests/>}/><Route path="/faculty-requests" element={<Requests/>}/>
            <Route path="/faculty" element={user?.role==='faculty'?<FacultyProfile/>:<Faculty/>}/><Route path="/courses" element={<Courses/>}/><Route path="/courses-sections" element={<Courses/>}/><Route path="/conflicts" element={<Conflicts/>}/><Route path="/review" element={<AllocationReview/>}/><Route path="/hod-review" element={<AllocationReview/>}/><Route path="/agent" element={<AgentChat/>}/><Route path="/agent/chat" element={<AgentChat/>}/><Route path="/reports" element={<Reports/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="/preferences" element={<Preferences/>}/><Route path="/my-allocation" element={<MyAllocation/>}/></Routes></PageErrorBoundary></main>
  </div>
 </div>
}
export default App;
