import React,{useEffect,useState} from 'react';
import {Users,BookOpen,ClipboardCheck,AlertTriangle,GitBranch,CheckCircle2,BrainCircuit,ArrowUpRight,Bot,Sparkles,Wand2,Loader2} from 'lucide-react';
import {Link,useNavigate} from 'react-router-dom';
import {Card,Stat,Badge,Progress,AiPill,SectionHeader,Tilt3D,Modal} from '../components/UI';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,PieChart,Pie,Cell} from 'recharts';
import {apiRequest} from '../api';
import {formatSection} from '../utils/section';

const tooltipStyle={backgroundColor:'#ffffff',border:'1px solid #e2e8f0',borderRadius:12,fontSize:12,color:'#0f172a',boxShadow:'0 12px 30px -12px rgba(15,23,42,.25)'};

// The four data domains orbiting the central AI agent node in the hero graphic.
// Each node is a real button (a Link) so the graphic doubles as navigation.
const orbitNodes=[
 {label:'Faculty',icon:Users,angle:-90,color:'#2563eb',to:'/faculty'},
 {label:'Courses',icon:BookOpen,angle:0,color:'#7c3aed',to:'/courses'},
 {label:'Requests',icon:ClipboardCheck,angle:90,color:'#0d9488',to:'/requests'},
 {label:'Conflicts',icon:GitBranch,angle:180,color:'#ea580c',to:'/conflicts'},
];

// Fixed canvas + a single responsive scale keeps every node's position,
// spacing and size proportional at any screen size.
const CANVAS=280, CENTER=140, RADIUS=104;

function AgentOrbitGraphic(){
 return <div className="relative w-full h-full min-h-[240px] flex items-center justify-center select-none overflow-visible">
  <div className="relative scale-[0.72] sm:scale-90 lg:scale-100 origin-center" style={{width:CANVAS,height:CANVAS}}>
   <svg className="absolute inset-0" width={CANVAS} height={CANVAS} viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
    <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="rgba(37,99,235,.16)" strokeDasharray="3 7"/>
    <circle cx={CENTER} cy={CENTER} r={RADIUS-32} fill="none" stroke="rgba(37,99,235,.09)"/>
   </svg>
   <div className="absolute inset-0 hero-orbit">
    {orbitNodes.map(n=>{
     const rad=n.angle*Math.PI/180;
     const x=CENTER+RADIUS*Math.cos(rad),y=CENTER+RADIUS*Math.sin(rad);
     const I=n.icon;
    return <div key={n.label} className="absolute hero-orbit-rev pointer-events-auto" style={{left:x,top:y}}>
     <Link to={n.to} title={`Go to ${n.label}`} aria-label={`Go to ${n.label}`} className="group/node flex items-center gap-1.5 pl-1.5 pr-3.5 py-1.5 rounded-full bg-white border border-slate-200 shadow-md cursor-pointer transition-all hover:shadow-xl hover:border-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
       <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover/node:scale-110" style={{background:`${n.color}1a`,color:n.color}}><I size={16}/></span>
       <span className="text-[12px] font-semibold text-slate-700 whitespace-nowrap">{n.label}</span>
      </Link>
     </div>;
    })}
   </div>
   <div className="absolute inset-0 flex items-center justify-center z-10 hero-node pointer-events-none">
    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-xl ring-4 ring-white">
     <Bot size={22} className="text-white"/>
    </div>
   </div>
  </div>
 </div>;
}

export default function Dashboard(){

 const [data,setData]=useState({faculty:0,courses:0,requests:0,pendingReview:0,workload:[],pending:[]});
 const navigate=useNavigate();
 const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 const load=async()=>{try{setLoading(true);const r=await apiRequest({method:'GET',url:'/allocations/dashboard'});setData(r.data)}catch(e){setError(e?.response?.data?.message||'Backend unavailable. Start the server and refresh.')}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const workload=data.workload||[]; const totalRequests=Number(data.requests||0); const pendingRequests=Number(data.pendingReview||0); const decidedRequests=Math.max(totalRequests-pendingRequests,0); const pieColors=['#f43f5e','#2563eb']; const pref=[{name:'Pending review',value:pendingRequests,color:pieColors[0]},{name:'Reviewed / decided',value:decidedRequests,color:pieColors[1]}]; const pieTotal=pendingRequests+decidedRequests||1;

 // ---- AI "Start Allocation" run: one button that hands every pending
 // request to the Groq-backed classifier on the server (server/src/services/aiAllocation.js)
 // and applies its verified decisions. No client-side allocation logic here —
 // this just triggers the backend agent and shows what it did. ----
 const [aiRunning,setAiRunning]=useState(false);
 const [aiResult,setAiResult]=useState(null);
 const [aiModalOpen,setAiModalOpen]=useState(false);
 const [aiError,setAiError]=useState('');
 const startAllocation=async()=>{
  try{
   setAiRunning(true);setAiError('');
   const r=await apiRequest({method:'POST',url:'/allocations/auto-allocate',timeout:120000});
   setAiResult(r.data);
   setAiModalOpen(true);
   load();
  }catch(e){setAiError(e?.response?.data?.message||'AI allocation run failed. Check the backend connection.')}
  finally{setAiRunning(false)}
 };

 return <div className="grid-bg -m-4 sm:-m-7 p-4 sm:p-7 min-h-[calc(100vh-112px)]">
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}
  {aiError&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{aiError}</div>}

  {/* Hero: light command-center banner (soft blue/white, matching the CSE Agentic AI Day
      styling) with an animated agent/orbit graphic instead of a plain title row. */}
  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-50 via-white to-blue-50 border border-blue-100">
   {/* Soft ambient glow kept OUTSIDE the orbit graphic and at low opacity so it never
       washes out or overlaps the orbit icons — this is what caused the earlier overlap. */}
   <div className="hero-blob w-72 h-72 bg-blue-400/10 -top-16 -left-16"/>
   <div className="hero-blob w-72 h-72 bg-cyan-400/10 -bottom-20 -right-10"/>
   <div className="grid lg:grid-cols-[1.2fr_1fr] items-center relative">
    <div className="p-7 sm:p-10 relative z-10">
     <div className="eyebrow text-blue-600"><span className="eyebrow-dot"/>HOD COMMAND CENTER</div>
     <h1 className="font-display text-2xl sm:text-4xl font-semibold tracking-tight mt-2 text-slate-900">Faculty Course Allocation</h1>
     <p className="text-sm sm:text-base text-slate-600 mt-3 max-w-xl leading-relaxed">One workspace for real faculty, courses, requests, conflicts and AI recommendations — the agent watches every domain shown in the graphic and surfaces what needs your decision.</p>
     <div className="flex flex-wrap items-center gap-3 mt-6">
    <button type="button" onClick={startAllocation} disabled={aiRunning} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-primary text-sm disabled:opacity-60">
     {aiRunning?<Loader2 size={15} className="animate-spin"/>:<Wand2 size={15}/>} {aiRunning?'Allocating...':'Start Allocation'}
      </button>
      <Link to="/review" className="inline-flex items-center px-4 py-2.5 rounded-xl btn-outline text-sm">Review queue</Link>
      <Link to="/agent" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-outline text-sm"><Sparkles size={15}/> Ask the AI agent</Link>
     </div>
    </div>
    <div className="relative h-64 lg:h-full min-h-[220px] z-10"><AgentOrbitGraphic/></div>
   </div>
  </div>

  <Modal open={aiModalOpen} title="Automatic allocation" onClose={()=>setAiModalOpen(false)}>
   {aiResult&&<div>
    <p className="text-sm text-slate-600 mb-3">The agent allocated courses to every faculty member (Professor 1 course, Associate Professor 2, others 3) and resolved seat conflicts by designation priority. Nothing is final until the HOD approves it.</p>
    <div className="grid grid-cols-2 gap-2 text-sm">
     {[['Faculty allocated',aiResult.stats?.faculty],['Recommendations',aiResult.stats?.assignments],['From preferences',aiResult.stats?.fromPreference],['Auto-filled',aiResult.stats?.autoFilled],['Conflicts resolved by priority',aiResult.stats?.conflictsResolved],['Sections without instructor',aiResult.stats?.sectionsWithoutInstructor],['Overloaded faculty',aiResult.stats?.overloaded],['Very low workload',aiResult.stats?.underloaded]].map(([k,v])=><div key={k} className="p-3 rounded-xl border border-slate-200 bg-slate-50"><div className="text-[11px] text-slate-500">{k}</div><b className="text-slate-800 text-lg">{v??0}</b></div>)}
    </div>
    <div className="mt-4 flex gap-2"><button type="button" onClick={()=>{setAiModalOpen(false);navigate('/review')}} className="btn-primary px-4 py-2 rounded-lg text-sm">Open HOD review</button><Link to="/conflicts" onClick={()=>setAiModalOpen(false)} className="btn-outline px-4 py-2 rounded-lg text-sm">View conflicts</Link></div>
   </div>}
  </Modal>

  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
   <Tilt3D><Link to="/faculty" className="block text-left"><Stat label="Total faculty" value={loading?'…':data.faculty} sub="Manage faculty" icon={Users}/></Link></Tilt3D>
   <Tilt3D><Link to="/courses" className="block text-left"><Stat label="Courses" value={loading?'…':data.courses} sub="Manage courses & sections" icon={BookOpen} tone="blue"/></Link></Tilt3D>
   <Tilt3D><Link to="/requests" className="block text-left"><Stat label="Requests" value={loading?'…':data.requests} sub="View faculty requests" icon={ClipboardCheck}/></Link></Tilt3D>
   <Tilt3D><Link to="/review" className="block text-left"><Stat label="Pending review" value={loading?'…':data.pendingReview} sub="Requires HOD action" icon={AlertTriangle} tone="amber"/></Link></Tilt3D>
  </div>

  <div className="grid xl:grid-cols-3 gap-5 mt-5">
   <Tilt3D max={3} className="xl:col-span-2"><Card className="p-5 card-hover"><div className="flex items-center justify-between mb-4"><h2 className="font-display font-semibold text-slate-800">Workload by designation</h2><Link to="/faculty" className="text-xs font-semibold text-cyan-700 flex items-center gap-1 hover:text-cyan-700">View all faculty</Link></div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={workload} margin={{left:-18,right:8,top:8,bottom:0}}><XAxis dataKey="name" tick={{fontSize:11,fill:'#64748b'}} axisLine={{stroke:'rgba(15,23,42,.12)'}} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/><Tooltip cursor={{fill:'rgba(15,23,42,.04)'}} contentStyle={tooltipStyle}/><defs><linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#1d4ed8"/></linearGradient></defs><Bar dataKey="hours" radius={[6,6,0,0]} fill="url(#barFill)"/></BarChart></ResponsiveContainer></div><div className="flex gap-5 text-xs text-slate-500"><span>Average assigned hours/week by designation</span><span className="text-rose-600">{data.workloadSummary?.overloaded??0} overloaded</span><span className="text-amber-600">{data.workloadSummary?.underloaded??0} very low workload</span></div></Card></Tilt3D>
   <Tilt3D max={3}><Card className="p-5 card-hover"><SectionHeader title="Review status"/><p className="text-xs text-slate-500 -mt-2 mb-2">Shows how many faculty requests are still waiting for HOD action.</p>
    <div className="h-44 relative">
     <ResponsiveContainer><PieChart margin={{top:4,right:4,bottom:4,left:4}}><Pie data={pref} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={4} stroke="none">{pref.map((x,i)=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip formatter={(value,name)=>[value,name]} contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer>
     <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <div className="font-display text-2xl font-semibold text-slate-900">{totalRequests}</div>
      <div className="text-[11px] text-slate-500">total requests</div>
     </div>
    </div>
    <div className="grid grid-cols-2 gap-2 mt-2">{pref.map((x)=><Link to={x.name==='Pending review'?'/review':'/requests'} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" key={x.name}><div className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{background:x.color}}/>{x.name}</div><div className="font-display text-lg font-semibold text-slate-900 mt-0.5">{x.value} <span className="text-[11px] font-normal text-slate-500">· {Math.round((x.value/pieTotal)*100)}%</span></div></Link>)}</div>
    <div className="mt-3 text-[11px] text-slate-500 leading-4"><b className="text-slate-600">Pending review</b> = requests waiting for HOD approval or rejection. <b className="text-slate-600">Reviewed / decided</b> = requests already processed.</div>
   </Card></Tilt3D>
  </div>

  <div className="grid xl:grid-cols-3 gap-5 mt-5">
   <Tilt3D max={3} className="xl:col-span-2"><Card className="p-5 card-hover"><div className="flex items-center justify-between mb-4"><h2 className="font-display font-semibold text-slate-800">AI allocation insights</h2><Link to="/agent" className="text-xs font-semibold text-cyan-700 hover:text-cyan-700">Open AI Agent →</Link></div><div className="space-y-3"><Link to="/agent" className="w-full text-left p-4 rounded-xl bg-fuchsia-500/8 border border-fuchsia-400/20 flex gap-3 hover:bg-fuchsia-500/12 card-hover"><div className="icon-pop w-9 h-9 rounded-lg bg-slate-100 text-fuchsia-700 flex items-center justify-center shrink-0"><BrainCircuit size={18}/></div><div className="flex-1"><div className="flex items-center gap-2"><b className="text-sm text-slate-800">Agent-assisted allocation analysis</b><AiPill/></div><p className="text-xs text-slate-500 mt-1">The agent uses the faculty, course, request and workload data stored by the application.</p></div><ArrowUpRight size={16} className="text-fuchsia-700"/></Link><Link to="/conflicts" className="w-full text-left p-4 rounded-xl border border-slate-200 flex gap-3 hover:bg-slate-50 card-hover"><div className="icon-pop w-9 h-9 rounded-lg bg-emerald-400/10 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={18}/></div><div><b className="text-sm text-slate-800">Review constraints and conflicts</b><p className="text-xs text-slate-500 mt-1">Open conflicts before approving recommendations.</p></div></Link></div></Card></Tilt3D>
   <Tilt3D max={3}><Card className="p-5 card-hover"><div className="flex items-center justify-between mb-4"><h2 className="font-display font-semibold text-slate-800">Review queue</h2><Link to="/review" className="text-xs font-semibold text-cyan-700 hover:text-cyan-700">View all →</Link></div><div className="space-y-1">{(data.pending||[]).slice(0,4).map((x)=><Link to="/review" className="w-full text-left py-3 border-b last:border-0 border-slate-200 flex items-center justify-between" key={x._id}><div><b className="text-sm text-slate-800">{x.facultyName?`${x.facultyName} (${x.facultyId})`:`Faculty ${x.facultyId}`}</b><div className="text-xs text-slate-500">{x.courseName||x.courseId}{x.sectionId?` · ${formatSection(x.courseYear,x.sectionId)}`:''}</div></div><Badge tone="red">Pending</Badge></Link>)}{!data.pending?.length&&<p className="text-sm text-slate-500 py-5">No allocations waiting for HOD review.</p>}</div></Card></Tilt3D>
  </div>

  <Card className="mt-5 p-5"><SectionHeader title="Allocation readiness"/><div className="grid md:grid-cols-4 gap-5"><div><div className="flex justify-between text-xs mb-2 text-slate-500"><span>Requests</span><b className="text-slate-700">{data.requests?Math.round((data.requests-data.pendingReview)/data.requests*100):0}%</b></div><Progress value={data.requests?((data.requests-data.pendingReview)/data.requests*100):0}/></div><div><div className="flex justify-between text-xs mb-2 text-slate-500"><span>Faculty loaded</span><b className="text-slate-700">{data.faculty?100:0}%</b></div><Progress value={data.faculty?100:0}/></div><div><div className="flex justify-between text-xs mb-2 text-slate-500"><span>Courses loaded</span><b className="text-slate-700">{data.courses?100:0}%</b></div><Progress value={data.courses?100:0}/></div><div><div className="flex justify-between text-xs mb-2 text-slate-500"><span>HOD decisions</span><b className="text-slate-700">{data.requests?Math.round((data.requests-data.pendingReview)/data.requests*100):0}%</b></div><Progress value={data.requests?((data.requests-data.pendingReview)/data.requests*100):0}/></div></div></Card>
 </div>
}
