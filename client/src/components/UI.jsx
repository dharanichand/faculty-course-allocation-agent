import React from 'react';
import {ChevronRight,Sparkles,X} from 'lucide-react';

export const Card=({children,className=''})=><div className={`panel rounded-2xl ${className}`}>{children}</div>;

export const PageTitle=({eyebrow,title,desc,action})=><div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
  <div>
    {eyebrow&&<div className="eyebrow mb-2"><span className="eyebrow-dot"/>{eyebrow}</div>}
    <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
    {desc&&<p className="text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">{desc}</p>}
  </div>
  {action}
</div>;

const badgeTones={
  blue:'bg-blue-50 text-blue-700 border border-blue-200',
  green:'bg-emerald-50 text-emerald-700 border border-emerald-200',
  amber:'bg-amber-50 text-amber-700 border border-amber-200',
  red:'bg-rose-50 text-rose-700 border border-rose-200',
  slate:'bg-slate-100 text-slate-600 border border-slate-200',
};
export const Badge=({children,tone='blue'})=><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${badgeTones[tone]||badgeTones.blue}`}>{children}</span>;

const statTones={
  blue:{bar:'from-blue-500 to-blue-500/30',chip:'bg-blue-50 text-blue-700'},
  amber:{bar:'from-amber-400 to-amber-500/30',chip:'bg-amber-50 text-amber-700'},
  green:{bar:'from-emerald-400 to-emerald-500/30',chip:'bg-emerald-50 text-emerald-700'},
  red:{bar:'from-rose-400 to-rose-500/30',chip:'bg-rose-50 text-rose-700'},
};
export const Stat=({label,value,sub,icon:Icon,tone='blue'})=>{
  const t=statTones[tone]||statTones.blue;
  return <Card className="p-5 relative overflow-hidden">
    <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${t.bar}`}/>
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="font-display text-2xl font-semibold text-slate-900 mt-1">{value}</div>
        <div className="text-xs text-slate-400 mt-1">{sub}</div>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.chip}`}><Icon size={19}/></div>
    </div>
  </Card>;
};

export const SectionHeader=({title,link,onClick})=><div className="flex items-center justify-between mb-4">
  <h2 className="font-display font-semibold text-slate-800">{title}</h2>
  {link&&<button type="button" onClick={onClick} className="text-xs font-semibold text-blue-600 flex items-center gap-1 hover:text-blue-700">{link}<ChevronRight size={14}/></button>}
</div>;

export const Progress=({value})=><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{width:`${Math.min(value,100)}%`}}/></div>;

export const AiPill=()=> <Badge><Sparkles size={12}/> AI analyzed</Badge>;

export function Modal({open,title,onClose,children}){
  if(!open)return null;
  return <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}>
    <div className="w-full max-w-lg panel-solid rounded-2xl shadow-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-display font-semibold text-slate-800">{title}</h2>
        <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18}/></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>;
}

export const Field=({label,...props})=><label className="block">
  <span className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</span>
  <input {...props} className={`field-input w-full px-3 py-2.5 rounded-xl outline-none ${props.className||''}`}/>
</label>;
