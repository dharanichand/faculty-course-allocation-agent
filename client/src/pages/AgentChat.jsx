import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Bot, Send, Sparkles, ShieldCheck, Wand2, Database, GitBranch, Loader2, AlertCircle } from 'lucide-react';
import { Card, PageTitle, Badge } from '../components/UI';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const starters = [
  'Show me all faculty members.',
  'Show me all courses.',
  'Show me courses with multiple faculty requests.',
  'Analyze CSE501.',
  'What happens if I assign F001 to CSE501?',
];

function errorMessage(error) {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.status === 429) return 'OpenAI API credits or usage limit has been reached.';
  if (error?.code === 'ERR_NETWORK') return 'Cannot connect to the backend. Start the server with npm run dev:server.';
  return error?.message || 'Agent request failed.';
}

export default function AgentChat() {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: 'Hello Dr. Ananya. I’m the Faculty Course Allocation Agent. Ask me about faculty, courses, requests, workload, conflicts, recommendations, or what-if assignments.',
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

  async function send(value = text) {
    const message = String(value || '').trim();
    if (!message || loading) return;

    setText('');
    setError('');
    setMessages(m => [...m, { role: 'user', text: message }]);
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
      }]);
    } catch (e) {
      const msg = errorMessage(e);
      console.error('Agent error:', e);
      setError(msg);
      setMessages(m => [...m, {
        role: 'ai',
        text: msg.includes('credits') || e?.response?.status === 429
          ? 'The Agent page is working, but the OpenAI API account has no remaining credits or has reached its usage limit.'
          : `I could not complete that request.\n\n${msg}`,
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
          <div className="px-5 py-4 border-b flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Bot size={21} /></div>
            <div>
              <div className="font-bold">Faculty Course Allocation Agent</div>
              <div className="text-xs text-slate-500">OpenAI reasoning • backend tools • HOD approval</div>
            </div>
          </div>

          <div className="flex-1 p-5 space-y-4 overflow-auto">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                <div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-[#0b1f44] text-white' : 'bg-blue-50 text-slate-700'}`}>
                  {m.role === 'ai' && <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 mb-1"><Sparkles size={12} /> Allocation Agent</div>}
                  <div className="whitespace-pre-wrap leading-6">{m.text}</div>
                  {m.toolTrace?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-100">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-blue-700 mb-2">Tools used</div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.toolTrace.map((x, j) => <span key={j} className="px-2 py-1 rounded-md bg-white/70 text-[10px] font-medium">{x.name}</span>)}
                      </div>
                    </div>
                  )}
                  {m.requiresHod && <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold">HOD review required — the agent will not finalize this allocation.</div>}
                </div>
              </div>
            ))}
            {loading && <div className="flex gap-3"><div className="bg-blue-50 rounded-2xl px-4 py-3 text-sm text-blue-700 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Agent is analyzing verified data…</div></div>}
            <div ref={endRef} />
          </div>

          <div className="px-5 pb-5">
            <div className="flex gap-2 mb-3 flex-wrap">
              {starters.map(s => <button key={s} type="button" disabled={loading} onClick={() => send(s)} className="text-xs px-3 py-2 rounded-full border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-600 text-left disabled:opacity-50">{s}</button>)}
            </div>
            <div className="flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }} placeholder="Ask the allocation agent…" className="flex-1 px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-100" />
              <button type="button" disabled={loading || !text.trim()} onClick={() => send()} className="w-12 rounded-xl bg-[#1d4ed8] disabled:opacity-40 text-white flex items-center justify-center"><Send size={18} /></button>
            </div>
            {error && <div className="mt-2 text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={13} />{error}</div>}
          </div>
        </Card>

        <Card className="p-5 h-fit">
          <div className="flex items-center gap-2 font-bold"><ShieldCheck size={18} className="text-blue-600" /> Agent guardrails</div>
          <div className="space-y-3 mt-5 text-xs text-slate-600">
            {[[Database, 'Reads verified data through backend tools'], [GitBranch, 'Runs multi-step tool calls'], [Wand2, 'Recommendation scores stay deterministic'], [ShieldCheck, 'HOD remains final authority']].map(([I, x]) => <div className="flex gap-2" key={x}><I size={16} className="text-blue-600 shrink-0" />{x}</div>)}
          </div>
          <div className="mt-5 p-3 rounded-xl bg-slate-50 text-xs"><div className="font-semibold mb-2">Workflow</div><div className="text-slate-500 leading-5">User → OpenAI → tool selection → backend data → verified results → recommendation → HOD review</div></div>
        </Card>
      </div>
    </div>
  );
}
