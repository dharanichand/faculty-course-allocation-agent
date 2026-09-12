import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Send, Sparkles, ShieldCheck, Wand2, Database, GitBranch, Loader2, AlertCircle, Mic } from 'lucide-react';
import { Card, PageTitle, Badge } from '../components/UI';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const starters = [
  'Show me all faculty members.',
  'Show me all courses.',
  'Show me courses with multiple faculty requests.',
  'Analyze CS101.',
  'What happens if I assign FAC0001 to CS101?',
];

function errorMessage(error) {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.status === 429) return 'OpenAI API credits or usage limit has been reached.';
  if (error?.code === 'ERR_NETWORK') return 'Cannot connect to the backend. Start the server with npm run dev:server.';
  return error?.message || 'Agent request failed.';
}

// Robot avatar, drawn to match the assistant character used across the department's AI day materials.
function RobotAvatar({ size = 96 }) {
  return (
    <svg viewBox="0 0 120 130" width={size} height={size * (130 / 120)}>
      <ellipse cx="60" cy="122" rx="22" ry="5" fill="#0f172a" opacity="0.08" />
      <rect x="30" y="18" width="60" height="46" rx="23" fill="#ffffff" stroke="#dbe4f3" strokeWidth="2" />
      <rect x="44" y="34" width="32" height="14" rx="7" fill="#0f172a" />
      <rect x="49" y="37" width="4" height="8" rx="2" fill="#60a5fa" />
      <rect x="67" y="37" width="4" height="8" rx="2" fill="#60a5fa" />
      <path d="M30 40 q-8 0 -8 8 t8 8" fill="none" stroke="#dbe4f3" strokeWidth="3" />
      <path d="M90 40 q8 0 8 8 t-8 8" fill="none" stroke="#dbe4f3" strokeWidth="3" />
      <rect x="38" y="70" width="44" height="42" rx="20" fill="#f1f6fd" stroke="#dbe4f3" strokeWidth="2" />
      <rect x="20" y="76" width="9" height="26" rx="4.5" fill="#e2e8f0" />
      <rect x="91" y="76" width="9" height="26" rx="4.5" fill="#e2e8f0" />
    </svg>
  );
}

export default function AgentChat() {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: 'Hi, I\u2019m Buji, your Faculty Course Allocation assistant. Ask me about faculty, courses, requests, workload, conflicts, recommendations, or what-if assignments.',
      time: 'now',
    },
  ]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function checkBackend() {
      try {
        const r = await axios.get(`${API}/health`, { timeout: 5000 });
        if (!cancelled) setReady(Boolean(r.data?.ok));
      } catch {
        if (!cancelled) setReady(false);
      }
    }
    checkBackend();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function getToken() {
    const cached = sessionStorage.getItem('allocation_demo_token');
    if (cached) return cached;
    const r = await axios.post(`${API}/auth/demo`, {}, { timeout: 10000 });
    if (!r.data?.token) throw new Error('Backend did not return an authentication token.');
    sessionStorage.setItem('allocation_demo_token', r.data.token);
    return r.data.token;
  }

  function stamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function send(value = text) {
    const message = String(value || '').trim();
    if (!message || loading) return;

    setText('');
    setError('');
    setMessages(m => [...m, { role: 'user', text: message, time: stamp() }]);
    setLoading(true);

    try {
      const token = await getToken();
      const r = await axios.post(
        `${API}/agent/chat`,
        { message, threadId: 'hod-demo-session' },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 120000 }
      );

      setMessages(m => [...m, {
        role: 'ai',
        text: r.data?.answer || 'The agent returned no answer.',
        requiresHod: Boolean(r.data?.requiresHod),
        toolTrace: Array.isArray(r.data?.toolTrace) ? r.data.toolTrace : [],
        time: stamp(),
      }]);
    } catch (e) {
      const msg = errorMessage(e);
      console.error('Agent error:', e);
      setError(msg);
      setMessages(m => [...m, {
        role: 'ai',
        text: msg.includes('credits') || e?.response?.status === 429
          ? 'The Agent page is working, but the AI provider account has no remaining credits or has reached its usage limit.'
          : `I could not complete that request.\n\n${msg}`,
        time: stamp(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageTitle
        eyebrow="AGENT ORCHESTRATOR"
        title="AI Allocation Agent"
        desc="Tool-calling allocation assistant backed by your verified faculty and course data."
        action={
          <Badge tone={ready ? 'green' : 'amber'}>
            <span className={`w-2 h-2 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {ready ? 'Backend connected' : 'Backend offline'}
          </Badge>
        }
      />

      <div className="grid xl:grid-cols-[1fr_330px] gap-5">
        <Card className="min-h-[650px] flex flex-col overflow-hidden">
          {/* Hero, styled after the reference assistant landing panel */}
          <div className="px-6 py-7 text-center bg-gradient-to-b from-blue-50 to-white border-b border-slate-100">
            <RobotAvatar />
            <div className="font-display font-semibold text-slate-900 mt-2">Faculty Course Allocation Agent</div>
            <div className="text-xs text-slate-500 mt-1">Ask me about faculty, courses, requests, workload &amp; conflicts</div>
          </div>

          <div className="flex-1 p-5 space-y-4 overflow-auto">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                <div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white' : 'bg-slate-50 border border-slate-200 text-slate-700'}`}>
                  <div className={`flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider mb-1 ${m.role === 'user' ? 'text-blue-100' : 'text-blue-600'}`}>
                    <span className="flex items-center gap-1.5">{m.role === 'ai' && <Sparkles size={12} />}{m.role === 'user' ? 'You' : 'Assistant'}</span>
                    {m.time && <span className={`font-medium normal-case ${m.role === 'user' ? 'text-blue-100/80' : 'text-slate-400'}`}>{m.time}</span>}
                  </div>
                  <div className="whitespace-pre-wrap leading-6">{m.text}</div>
                  {m.toolTrace?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-blue-600 mb-2">Tools used</div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.toolTrace.map((x, j) => <span key={j} className="px-2 py-1 rounded-md bg-white border border-slate-200 text-[10px] font-medium text-slate-500">{x.name}</span>)}
                      </div>
                    </div>
                  )}
                  {m.requiresHod && <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">HOD review required — the agent will not finalize this allocation.</div>}
                </div>
              </div>
            ))}
            {loading && <div className="flex gap-3"><div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-blue-600 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Agent is analyzing verified data…</div></div>}
            <div ref={endRef} />
          </div>

          <div className="px-5 pb-4">
            <div className="flex gap-2 mb-3 flex-wrap">
              {starters.map(s => <button key={s} type="button" disabled={loading} onClick={() => send(s)} className="text-xs px-3 py-2 rounded-full border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-700 text-left disabled:opacity-50 transition">{s}</button>)}
            </div>
            <div className="flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }} placeholder="Start the assistant to start chatting" className="field-input flex-1 px-4 py-3 rounded-xl outline-none" />
              <button type="button" disabled={loading || !text.trim()} onClick={() => send()} className="w-12 rounded-xl btn-primary disabled:opacity-40 flex items-center justify-center"><Send size={18} /></button>
            </div>
            {error && <div className="mt-2 text-xs text-rose-600 flex items-center gap-1.5"><AlertCircle size={13} />{error}</div>}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${loading ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`} />{loading ? 'Thinking…' : 'Standby'}</span>
            <span className="flex items-center gap-1.5"><Mic size={13} /> Voice + transcript (assistant &amp; your speech)</span>
          </div>
        </Card>

        <Card className="p-5 h-fit">
          <div className="flex items-center gap-2 font-display font-semibold text-slate-800"><ShieldCheck size={18} className="text-blue-600" /> Agent guardrails</div>
          <div className="space-y-3 mt-5 text-xs text-slate-500">
            {[[Database, 'Reads verified data through backend tools'], [GitBranch, 'Runs multi-step tool calls'], [Wand2, 'Recommendation scores stay deterministic'], [ShieldCheck, 'HOD remains final authority']].map(([I, x]) => <div className="flex gap-2" key={x}><I size={16} className="text-blue-600 shrink-0" />{x}</div>)}
          </div>
          <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"><div className="font-semibold mb-2 text-slate-700">Workflow</div><div className="text-slate-500 leading-5">User → AI reasoning → tool selection → backend data → verified results → recommendation → HOD review</div></div>
        </Card>
      </div>
    </div>
  );
}
