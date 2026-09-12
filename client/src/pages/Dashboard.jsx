import React,{useEffect,useState} from 'react';
import {Users,BookOpen,ClipboardCheck,AlertTriangle,CheckCircle2,BrainCircuit,ArrowUpRight} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Card,PageTitle,Stat,Badge,Progress,AiPill,SectionHeader} from '../components/UI';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,PieChart,Pie,Cell} from 'recharts';
import {apiRequest} from '../api';

const tooltipStyle={backgroundColor:'#ffffff',border:'1px solid #e2e8f0',borderRadius:12,fontSize:12,color:'#0f172a',boxShadow:'0 12px 30px -12px rgba(15,23,42,.25)'};

export default function Dashboard(){

 const [data,setData]=useState({faculty:0,courses:0,requests:0,pendingReview:0,workload:[],pending:[]});
 const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 const load=async()=>{try{setLoading(true);const r=await apiRequest({method:'GET',url:'/allocations/dashboard'});setData(r.data)}catch(e){setError(e?.response?.data?.message||'Backend unavailable. Start the server and refresh.')}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const workload=data.workload||[]; const totalRequests=Number(data.requests||0); const pendingRequests=Number(data.pendingReview||0); const decidedRequests=Math.max(totalRequests-pendingRequests,0); const pieColors=['#f43f5e','#2563eb']; const pref=[{name:'Pending review',value:pendingRequests,color:pieColors[0]},{name:'Reviewed / decided',value:decidedRequests,color:pieColors[1]}]; const pieTotal=pendingRequests+decidedRequests||1;
 return <div className="grid-bg -m-4 sm:-m-7 p-4 sm:p-7 min-h-[calc(100vh-64px)]">
  <PageTitle eyebrow="HOD COMMAND CENTER" title="Faculty Course Allocation" desc="Manage real faculty, courses, requests, conflicts and AI recommendations from one workspace." action={<Link to="/review" className="inline-flex items-center px-4 py-2.5 rounded-xl btn-primary text-sm">Start allocation review</Link>}/>
  {error&&<div className="mb-4 p-3 rounded-xl alert-error text-sm">{error}</div>}
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
   <Link to="/faculty" className="block text-left"><Stat label="Total faculty" value={loading?'…':data.faculty} sub="Manage faculty" icon={Users}/></Link>
   <Link to="/courses" className="block text-left"><Stat label="Courses" value={loading?'…':data.courses} sub="Manage courses & sections" icon={BookOpen} tone="blue"/></Link>
   <Link to="/requests" className="block text-left"><Stat label="Requests" value={loading?'…':data.requests} sub="View faculty requests" icon={ClipboardCheck}/></Link>
   <Link to="/review" className="block text-left"><Stat label="Pending review" value={loading?'…':data.pendingReview} sub="Requires HOD action" icon={AlertTriangle} tone="amber"/></Link>
  </div>
  <div className="grid xl:grid-cols-3 gap-5 mt-5">
   <Card className="xl:col-span-2 p-5"><div className="flex items-center justify-between mb-4"><h2 className="font-display font-semibold text-slate-800">Workload distribution</h2><Link to="/faculty" className="text-xs font-semibold text-cyan-700 flex items-center gap-1 hover:text-cyan-700">View all faculty</Link></div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={workload} margin={{left:-18,right:8,top:8,bottom:0}}><XAxis dataKey="name" tick={{fontSize:11,fill:'#64748b'}} axisLine={{stroke:'rgba(15,23,42,.12)'}} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/><Tooltip cursor={{fill:'rgba(15,23,42,.04)'}} contentStyle={tooltipStyle}/><defs><linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#1d4ed8"/></linearGradient></defs><Bar dataKey="hours" radius={[6,6,0,0]} fill="url(#barFill)"/></BarChart></ResponsiveContainer></div><div className="flex gap-5 text-xs text-slate-500"><span>Target max: 18 hrs</span><span>Live backend data</span></div></Card>
   <Card className="p-5"><SectionHeader title="Review status"/><p className="text-xs text-slate-500 -mt-2 mb-2">Shows how many faculty requests are still waiting for HOD action.</p>
    <div className="h-44 relative">
     <ResponsiveContainer><PieChart margin={{top:4,right:4,bottom:4,left:4}}><Pie data={pref} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={4} stroke="none">{pref.map((x,i)=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip formatter={(value,name)=>[value,name]} contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer>
     <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <div className="font-display text-2xl font-semibold text-slate-900">{totalRequests}</div>
      <div className="text-[11px] text-slate-500">total requests</div>
     </div>
    </div>
    <div className="grid grid-cols-2 gap-2 mt-2">{pref.map((x)=><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" key={x.name}><div className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{background:x.color}}/>{x.name}</div><div className="font-display text-lg font-semibold text-slate-900 mt-0.5">{x.value} <span className="text-[11px] font-normal text-slate-500">· {Math.round((x.value/pieTotal)*100)}%</span></div></div>)}</div>
    <div className="mt-3 text-[11px] text-slate-500 leading-4"><b className="text-slate-600">Pending review</b> = requests waiting for HOD approval or rejection. <b className="text-slate-600">Reviewed / decided</b> = requests already processed.</div>
   </Card>
  </div>
  <div className="grid xl:grid-cols-3 gap-5 mt-5">
   <Card className="xl:col-span-2 p-5"><div className="flex items-center justify-between mb-4"><h2 className="font-display font-semibold text-slate-800">AI allocation insights</h2><Link to="/agent" className="text-xs font-semibold text-cyan-700 hover:text-cyan-700">Open AI Agent →</Link></div><div className="space-y-3"><Link to="/agent" className="w-full text-left p-4 rounded-xl bg-fuchsia-500/8 border border-fuchsia-400/20 flex gap-3 hover:bg-fuchsia-500/12"><div className="w-9 h-9 rounded-lg bg-slate-100 text-fuchsia-700 flex items-center justify-center shrink-0"><BrainCircuit size={18}/></div><div className="flex-1"><div className="flex items-center gap-2"><b className="text-sm text-slate-800">Agent-assisted allocation analysis</b><AiPill/></div><p className="text-xs text-slate-500 mt-1">The agent uses the faculty, course, request and workload data stored by the application.</p></div><ArrowUpRight size={16} className="text-fuchsia-700"/></Link><Link to="/conflicts" className="w-full text-left p-4 rounded-xl border border-slate-200 flex gap-3 hover:bg-slate-50"><div className="w-9 h-9 rounded-lg bg-emerald-400/10 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={18}/></div><div><b className="text-sm text-slate-800">Review constraints and conflicts</b><p className="text-xs text-slate-500 mt-1">Open conflicts before approving recommendations.</p></div></Link></div></Card>
   <Card className="p-5"><div className="flex items-center justify-between mb-4"><h2 className="font-display font-semibold text-slate-800">Review queue</h2><Link to="/review" className="text-xs font-semibold text-cyan-700 hover:text-cyan-700">View all →</Link></div><div className="space-y-1">{(data.pending||[]).slice(0,4).map((x)=><Link to="/review" className="w-full text-left py-3 border-b last:border-0 border-slate-200 flex items-center justify-between" key={x._id}><div><b className="text-sm text-slate-800">{x.courseId}</b><div className="text-xs text-slate-500">Faculty {x.facultyId}</div></div><Badge tone="red">Pending</Badge></Link>)}{!data.pending?.length&&<p className="text-sm text-slate-500 py-5">No allocations waiting for HOD review.</p>}</div></Card>
  </div>
  <Card className="mt-5 p-5"><SectionHeader title="Allocation readiness"/><div className="grid md:grid-cols-4 gap-5"><div><div className="flex justify-between text-xs mb-2 text-slate-500"><span>Requests</span><b className="text-slate-700">{data.requests?Math.round((data.requests-data.pendingReview)/data.requests*100):0}%</b></div><Progress value={data.requests?((data.requests-data.pendingReview)/data.requests*100):0}/></div><div><div className="flex justify-between text-xs mb-2 text-slate-500"><span>Faculty loaded</span><b className="text-slate-700">{data.faculty?100:0}%</b></div><Progress value={data.faculty?100:0}/></div><div><div className="flex justify-between text-xs mb-2 text-slate-500"><span>Courses loaded</span><b className="text-slate-700">{data.courses?100:0}%</b></div><Progress value={data.courses?100:0}/></div><div><div className="flex justify-between text-xs mb-2 text-slate-500"><span>HOD decisions</span><b className="text-slate-700">{data.requests?Math.round((data.requests-data.pendingReview)/data.requests*100):0}%</b></div><Progress value={data.requests?((data.requests-data.pendingReview)/data.requests*100):0}/></div></div></Card>
 </div>
}
