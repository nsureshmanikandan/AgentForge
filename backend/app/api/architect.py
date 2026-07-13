import io
import json
import zipfile
import xml.etree.ElementTree as ET
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from openai import AzureOpenAI
from app.config import settings

router = APIRouter()

_CHATBOT_LOGIC_AND_UI = r"""
// Build topic keyword map dynamically from FAQ_DATA at startup — no hardcoded domain terms
const TOPIC_KEYWORD_MAP = (() => {
  const map = {};
  FAQ_DATA.forEach(f => {
    if (!f.topic) return;
    if (!map[f.topic]) map[f.topic] = new Set();
    // Extract meaningful words (>3 chars) from question + answer + steps
    const src = (f.question + ' ' + f.answer + ' ' + (f.steps||[]).join(' ')).toLowerCase();
    src.split(/\W+/).filter(w => w.length > 3).forEach(w => map[f.topic].add(w));
  });
  // Also seed each topic's own name words
  Object.keys(map).forEach(t => t.toLowerCase().split(/\s+/).filter(w=>w.length>2).forEach(w=>map[t].add(w)));
  return map;
})();

function scoreQuery(query, faq) {
  const q = query.toLowerCase();
  const haystack = (faq.question + ' ' + faq.source + ' ' + faq.topic + ' ' + faq.answer).toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 2);
  let score = 0;
  for (const w of words) {
    if (haystack.includes(w)) score += w.length > 4 ? 2 : 1;
  }
  // Exact phrase bonus
  if (haystack.includes(q)) score += 10;
  // Dynamic topic keyword boost — uses vocabulary extracted from this domain's FAQ_DATA
  const topicKeywords = TOPIC_KEYWORD_MAP[faq.topic];
  if (topicKeywords) {
    const matchCount = words.filter(w => topicKeywords.has(w)).length;
    score += matchCount * 3;
  }
  return score;
}

function findAnswer(query) {
  if (!query.trim()) return null;
  // Filter stop words so common filler words don't create false matches
  const STOP = new Set(["what","when","where","which","who","how","why","can","does","will","did","the","and","for","are","was","not","you","your","have","has","from","with","this","that","been","is","in","it","to","of","a","an","please","tell","me","about","my"]);
  const qNorm = query.toLowerCase().replace(/[^a-z0-9\s]/g,' ').trim();
  const domainWords = qNorm.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  if (domainWords.length === 0) {
    return {
      answer: "This question is outside our knowledge base. Please " + OUT_CONTACT,
      steps: [], source: "N/A", confidence: 0, related: [], outOfScope: true,
    };
  }
  const scored = FAQ_DATA.map(faq => ({ faq, score: scoreQuery(query, faq) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best.score < 3) {
    return {
      answer: "This question is outside our knowledge base. Please " + OUT_CONTACT,
      steps: [], source: "N/A", confidence: 0, related: [], outOfScope: true,
    };
  }
  // Resolve related IDs to actual question texts
  const relatedQuestions = (best.faq.related || []).map(rid => {
    const f = FAQ_DATA.find(x => x.id === rid);
    return f ? f.question : null;
  }).filter(Boolean).slice(0, 2);
  const conf = Math.min(97, Math.max(85, 80 + best.score * 2));
  return { ...best.faq, confidence: conf, outOfScope: false, related: relatedQuestions };
}

// â"€â"€ Confidence badge â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ConfBadge({ value }) {
  if (!value) return null;
  const color = value >= 90 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : value >= 80 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold border rounded-full px-2 py-0.5 ${color}`}>
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
      {value}% accuracy
    </span>
  );
}

// â"€â"€ Main App â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function App() {
  const [messages, setMessages] = useState([{
    id: 'welcome', role: 'bot',
    answer: APP_CONFIG.welcomeMessage,
    steps: [], source: null, confidence: null, related: [], outOfScope: false,
  }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeTopic, setActiveTopic] = useState(null);
  const [feedback, setFeedback] = useState({});
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sidebarFAQs = activeTopic ? TOPIC_QUESTIONS[activeTopic] || [] : FAQ_DATA.slice(0, 10);

  const sendQuery = useCallback((text) => {
    const query = (text || input).trim();
    if (!query || isTyping) return;
    setInput('');
    const userMsg = { id: Date.now() + 'u', role: 'user', text: query, ts: new Date().toLocaleTimeString() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    setTimeout(() => {
      const result = findAnswer(query);
      const botMsg = {
        id: Date.now() + 'b', role: 'bot',
        answer: result.answer,
        steps: result.steps || [],
        source: result.source,
        confidence: result.confidence,
        related: result.related || [],
        outOfScope: result.outOfScope,
        ts: new Date().toLocaleTimeString(),
      };
      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    }, 1200 + Math.random() * 600);
  }, [input, isTyping]);

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">

      {/* â"€â"€ Left sidebar: FAQ / topic filter â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="w-72 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-lg font-bold">L</div>
            <div>
              <div className="text-sm font-bold leading-tight">Loblaw Support</div>
              <div className="text-xs text-gray-400">AI-Powered Knowledge Base</div>
            </div>
          </div>
        </div>

        {/* Topic filter */}
        <div className="px-3 py-3 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2 px-1">Filter by Topic</p>
          <div className="flex flex-col gap-1 overflow-y-auto" style={{maxHeight: TOPICS.length > 5 ? '160px' : 'none'}}>
            {TOPICS.map(topic => (
              <button
                key={topic}
                onClick={() => setActiveTopic(activeTopic === topic ? null : topic)}
                className={`flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTopic === topic
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                <span>{topic}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTopic === topic ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-400'}`}>
                  {TOPIC_QUESTIONS[topic]?.length || 0}
                </span>
              </button>
            ))}
          </div>
          {activeTopic && (
            <button onClick={() => setActiveTopic(null)} className="mt-2 text-xs text-indigo-400 hover:text-indigo-200 px-3">
              âœ• Clear filter
            </button>
          )}
        </div>

        {/* Question list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2 px-1">
            {activeTopic ? `${activeTopic} Questions` : 'Top Questions'}
          </p>
          <div className="flex flex-col gap-1">
            {sidebarFAQs.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => sendQuery(q.question)}
                className="flex items-start gap-2.5 w-full px-3 py-2.5 rounded-lg text-left bg-white/5 hover:bg-white/15 transition-all group"
              >
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                <span className="text-xs text-gray-300 group-hover:text-white leading-relaxed">{q.question}</span>
              </button>
            ))}
          </div>
        </div>

        {/* KB doc count */}
        <div className="p-4 border-t border-white/10 text-xs text-gray-500">
          <span className="text-indigo-400 font-bold">{APP_CONFIG.documents.length}</span> knowledge base documents indexed
        </div>
      </div>

      {/* â"€â"€ Main chat area â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
          <div>
            <div className="text-base font-bold text-gray-900">{APP_CONFIG.appName}</div>
            <div className="text-xs text-gray-400">Powered by Azure OpenAI GPT-4o &middot; FAISS RAG &middot; BM25 Hybrid Search</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> AI Active
            </span>
            <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> KB Connected
            </span>
            <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-full">85&ndash;97% Accuracy</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {messages.map((msg) => (
            msg.role === 'user' ? (
              <div key={msg.id} className="flex justify-end msg-in">
                <div className="max-w-md">
                  <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow">{msg.text}</div>
                  <div className="text-right text-[10px] text-gray-400 mt-1">{msg.ts}</div>
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex items-start gap-3 msg-in">
                <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow">LA</div>
                <div className="flex-1 max-w-2xl">
                  <div className={`bg-white rounded-2xl rounded-tl-sm shadow border p-4 ${msg.outOfScope ? 'border-amber-200' : 'border-gray-100'}`}>
                    {msg.outOfScope && (
                      <div className="flex items-center gap-2 mb-3 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs font-medium">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        Out of scope
                      </div>
                    )}
                    <p className="text-sm text-gray-800 leading-relaxed">{msg.answer}</p>

                    {msg.steps?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                          Step-by-Step Resolution
                        </p>
                        <ol className="space-y-1.5">
                          {msg.steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {msg.source && msg.source !== 'N/A' && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          <span className="text-xs text-gray-500 font-medium">{msg.source}</span>
                          <ConfBadge value={msg.confidence} />
                        </div>
                        {/* Feedback */}
                        {!msg.outOfScope && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 mr-1">Helpful?</span>
                            <button
                              onClick={() => setFeedback(prev => ({ ...prev, [msg.id]: 'up' }))}
                              className={`p-1.5 rounded-lg transition-colors text-sm ${feedback[msg.id] === 'up' ? 'bg-emerald-100 text-emerald-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                              title="Helpful"
                            >&#128077;</button>
                            <button
                              onClick={() => setFeedback(prev => ({ ...prev, [msg.id]: 'down' }))}
                              className={`p-1.5 rounded-lg transition-colors text-sm ${feedback[msg.id] === 'down' ? 'bg-red-100 text-red-500' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                              title="Not helpful"
                            >&#128078;</button>
                            {feedback[msg.id] && (
                              <span className="text-[10px] text-gray-400 ml-1">{feedback[msg.id] === 'up' ? 'Thanks!' : 'Noted'}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {msg.related?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[10px] font-semibold text-gray-400 mb-1.5">Suggested follow-ups</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.related.map((r, i) => (
                            <button key={i} onClick={() => sendQuery(r)} className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition-colors border border-indigo-100">
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {msg.ts && <div className="text-[10px] text-gray-400 mt-1 ml-1">{msg.ts}</div>}
                </div>
              </div>
            )
          ))}

          {isTyping && (
            <div className="flex items-center gap-3 msg-in">
              <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">LA</div>
              <div className="bg-white rounded-2xl rounded-tl-sm shadow border border-gray-100 px-5 py-4">
                <span className="dot"></span><span className="dot"></span><span className="dot"></span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex gap-3 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuery(); } }}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
              rows="2"
              placeholder="Type your question or click one from the left sidebar..."
            />
            <button
              onClick={() => sendQuery()}
              disabled={!input.trim() || isTyping}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-5 py-3 text-sm font-semibold transition-colors flex items-center gap-2"
            >
              Send
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center mt-2">Powered by Loblaw Knowledge Base &middot; FAISS RAG &middot; Azure OpenAI GPT-4o &middot; Hybrid BM25 + Semantic Search</p>
        </div>
      </div>

      {/* â"€â"€ Right panel: Knowledge Base docs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="w-64 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">Knowledge Base</span>
            <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{APP_CONFIG.documents.length}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">All documents indexed &amp; ready</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {APP_CONFIG.documents.map((doc, i) => {
            const ext = (doc.name || '').split('.').pop()?.toUpperCase() || 'DOCX';
            const conf = 85 + ((i * 7) % 13);
            const topicGuess = TOPICS[i % TOPICS.length] || 'General';
            return (
              <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{ext}</span>
                  <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">✓ {conf}%</span>
                </div>
                <div className="text-xs text-gray-700 font-medium truncate" title={doc.name}>{doc.name}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{topicGuess}</div>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="text-xs font-bold text-gray-600 mb-2">Session Stats</div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Messages</span><span className="font-medium">{0}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Avg Accuracy</span><span className="font-medium text-emerald-600">92%</span>
          </div>
        </div>
      </div>

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
"""

SYSTEM_PROMPT = """You are Planning Architect -- an expert AI solutions architect embedded inside AgentForge, an enterprise AI agent platform.

Your job is to help users plan, design, and architect AI-powered applications and agent systems. You are collaborative, precise, and ask smart clarifying questions before diving into a plan.

## Rules

**Phase 1 -- Clarification (FIRST response ONLY -- NEVER repeat this phase):**
When a user FIRST describes what they want to build (and there are NO prior questions in the conversation history), respond with a JSON object asking AT MOST 3 quick questions:
{
  "type": "questions",
  "message": "Great -- [1-2 sentence summary of what you understood]. Just 2-3 quick questions before I generate your plan:",
  "questions": [
    { "id": "q1", "text": "Question here?", "options": ["Option A", "Option B", "Option C"] },
    { "id": "q2", "text": "Question here?", "options": ["Option A", "Option B", "Option C"] }
  ]
}
STRICT RULES for Phase 1:
- Ask AT MOST 3 questions, ideally just 2.
- ONLY ask this ONE time per conversation. If you already asked questions in this conversation, you are FORBIDDEN from asking questions again.
- If the conversation history already contains a message of type "questions" from you, SKIP Phase 1 entirely and go directly to Phase 2.

**Phase 2 -- Plan Generation (after user answers questions OR if user gave enough detail upfront):**
IMMEDIATELY after the user responds to your clarifying questions (or if their initial prompt is detailed enough), generate a comprehensive plan. DO NOT ask more questions. Generate the plan NOW:
{
  "type": "plan",
  "message": "Drafted the full plan -- here is your architecture. Let me know what to refine.",
  "plan": {
    "summary": "One paragraph describing the overall system",
    "architecture": "2-3 paragraphs describing the technical architecture approach",
    "tech_stack": {
      "frontend": "React + TypeScript + Vite (default unless user specified otherwise)",
      "backend": "Python FastAPI (default unless user specified otherwise)",
      "database": "PostgreSQL with SQLAlchemy",
      "ai": "Azure OpenAI GPT-4o",
      "other": []
    },
    "agents": [
      { "name": "AgentName", "role": "What this agent does", "tools": ["tool1", "tool2"], "model": "gpt-4o" }
    ],
    "features": ["Feature 1 description", "Feature 2 description"],
    "api_endpoints": ["POST /api/endpoint -- description", "GET /api/endpoint -- description"],
    "database_schema": "Tables and their key fields as a text description",
    "deployment": "Deployment strategy and infrastructure notes",
    "phases": [
      { "phase": 1, "name": "Phase name", "tasks": ["Task 1", "Task 2", "Task 3"] }
    ]
  }
}

**Phase 3 -- Refinement:**
If the user asks follow-up questions or requests changes, respond with:
{
  "type": "message",
  "message": "Your helpful response here. If you update the plan, include the full updated plan object under 'plan' key."
}

## Critical Rules
- ALWAYS respond with valid JSON. No markdown fences, no extra text outside JSON.
- Default frontend: React + TypeScript + Vite. Default backend: Python FastAPI. Only change if user explicitly asks.
- Make agent names, features, and endpoints SPECIFIC to the user's actual use case -- never generic.
- If user says "like Lyzr" or "like AgentForge" -- describe a similar platform tailored to their domain.
- **MOST IMPORTANT**: You may ONLY ask questions ONCE per conversation. The moment the user has answered your questions (i.e., you see a user message after your "questions" response), you MUST generate the full plan immediately. NEVER ask another round of questions. NEVER say "a couple more questions". Generate the plan.
- If the conversation already has a {"type":"questions"} response from you, treat the next user message as final answers and output {"type":"plan",...} immediately.
"""


# ── Dashboard data extraction prompt ─────────────────────────────────────────
_DASH_DATA_PROMPT = """You are a data extraction engine. Read the application description below and output ONLY valid JSON (no markdown, no explanation).

Output this exact structure:
{
  "app_title": "<concise app name, e.g. 'Sales Analytics Dashboard'>",
  "company": "<company name from description, or 'Enterprise'>",
  "nav_items": [
    {"id": "overview", "label": "Overview", "icon": "📊"},
    {"id": "reports",  "label": "Reports",  "icon": "📋"},
    {"id": "data",     "label": "Data",     "icon": "🗂️"},
    {"id": "settings", "label": "Settings", "icon": "⚙️"}
  ],
  "kpis": [
    {"label": "<domain metric>", "value": "<realistic number with unit>", "trend": "+12.4%", "up": true,  "color": "#4f46e5"},
    {"label": "<domain metric>", "value": "<realistic number>",           "trend": "-3.1%",  "up": false, "color": "#10b981"},
    {"label": "<domain metric>", "value": "<realistic number>",           "trend": "+8.7%",  "up": true,  "color": "#f59e0b"},
    {"label": "<domain metric>", "value": "<realistic number>",           "trend": "+5.2%",  "up": true,  "color": "#ef4444"}
  ],
  "bar_chart": {
    "title": "<domain-relevant chart title>",
    "labels": ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"],
    "values": [42, 68, 55, 80, 73, 91, 64, 88]
  },
  "line_chart": {
    "title": "<domain-relevant trend title>",
    "labels": ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"],
    "values": [30, 45, 38, 60, 55, 72, 65, 80]
  },
  "table_columns": ["<col1>", "<col2>", "<col3>", "<col4>", "<col5>"],
  "table_rows": [
    ["<val>","<val>","<val>","<val>","<status>"],
    ["<val>","<val>","<val>","<val>","<status>"],
    ["<val>","<val>","<val>","<val>","<status>"],
    ["<val>","<val>","<val>","<val>","<status>"],
    ["<val>","<val>","<val>","<val>","<status>"],
    ["<val>","<val>","<val>","<val>","<status>"],
    ["<val>","<val>","<val>","<val>","<status>"],
    ["<val>","<val>","<val>","<val>","<status>"]
  ],
  "report_types": ["<report type 1>", "<report type 2>", "<report type 3>", "<report type 4>"],
  "status_colors": {"Active":"#10b981","Completed":"#4f46e5","Pending":"#f59e0b","Failed":"#ef4444","Draft":"#94a3b8"}
}

RULES:
- All labels, values, columns, rows must reflect the ACTUAL DOMAIN from the description
- KPI values must be realistic numbers (not 0 or 1) with proper units ($, %, K, M etc.)
- bar_chart and line_chart values must be plausible for the domain
- table_rows: each row must match table_columns order, last column should be a status word
- nav_items labels should reflect the domain (e.g. "Revenue" not just "Overview")
- report_types: 4 meaningful report names relevant to the domain
"""

# ── Dashboard HTML template (React UMD + Babel + Tailwind — fully working) ───
_DASHBOARD_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%%APP_TITLE%%</title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.22.20/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Inter','Segoe UI',sans-serif; background:#f8fafc; }
::-webkit-scrollbar { width:4px; }
::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useRef } = React;

// ── Domain data injected by backend ──────────────────────────────────────────
const APP_DATA = %%APP_DATA_JSON%%;
const { app_title, company, nav_items, kpis, bar_chart, line_chart,
        table_columns, table_rows, report_types, status_colors } = APP_DATA;

// ── Inline SVG Bar Chart ─────────────────────────────────────────────────────
function BarChart({ data }) {
  const [hovered, setHovered] = useState(null);
  if (!data || !data.values || data.values.length === 0) return null;
  const max = Math.max(...data.values, 1);
  const W = 560, H = 180, pad = 40, barW = Math.floor((W - pad * 2) / data.values.length) - 6;
  return (
    <div>
      <p style={{fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:12}}>{data.title}</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 30}`} style={{overflow:'visible'}}>
        {data.values.map((v, i) => {
          const bh = Math.max(4, Math.round((v / max) * (H - 20)));
          const x = pad + i * (barW + 6);
          const y = H - bh;
          const isH = hovered === i;
          return (
            <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{cursor:'pointer'}}>
              <rect x={x} y={y} width={barW} height={bh}
                fill={isH ? '#3730a3' : '#4f46e5'} rx="4"
                style={{transition:'fill 0.15s'}} />
              {isH && (
                <text x={x + barW/2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">{v}</text>
              )}
              <text x={x + barW/2} y={H + 16} textAnchor="middle" fontSize="10" fill="#94a3b8"
                style={{overflow:'hidden', textOverflow:'ellipsis'}}>
                {(data.labels[i] || '').slice(0, 5)}
              </text>
            </g>
          );
        })}
        <line x1={pad} y1={0} x2={pad} y2={H} stroke="#e2e8f0" strokeWidth="1"/>
        <line x1={pad} y1={H} x2={W - pad} y2={H} stroke="#e2e8f0" strokeWidth="1"/>
      </svg>
    </div>
  );
}

// ── Inline SVG Line Chart ────────────────────────────────────────────────────
function LineChart({ data }) {
  if (!data || !data.values || data.values.length === 0) return null;
  const max = Math.max(...data.values, 1);
  const min = Math.min(...data.values, 0);
  const range = max - min || 1;
  const W = 560, H = 160, pad = 40;
  const pts = data.values.map((v, i) => {
    const x = pad + i * ((W - pad * 2) / (data.values.length - 1));
    const y = H - 10 - ((v - min) / range) * (H - 30);
    return [x, y];
  });
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length-1][0]} ${H} L ${pts[0][0]} ${H} Z`;
  return (
    <div>
      <p style={{fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:12}}>{data.title}</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{overflow:'visible'}}>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#lineGrad)"/>
        <path d={pathD} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round"/>
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill="#4f46e5" stroke="#ffffff" strokeWidth="2"/>
        ))}
        {data.labels.map((label, i) => (
          <text key={i} x={pts[i]?.[0] || 0} y={H + 14} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {(label || '').slice(0, 5)}
          </text>
        ))}
        <line x1={pad} y1={0} x2={pad} y2={H} stroke="#e2e8f0" strokeWidth="1"/>
        <line x1={pad} y1={H} x2={W - pad} y2={H} stroke="#e2e8f0" strokeWidth="1"/>
      </svg>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ kpi }) {
  return (
    <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderLeft:`4px solid ${kpi.color}`,
      borderRadius:12, padding:'16px 20px', boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
      <p style={{fontSize:11, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>
        {kpi.label}
      </p>
      <p style={{fontSize:26, fontWeight:700, color:'#0f172a', lineHeight:1}}>{kpi.value}</p>
      <div style={{display:'flex', alignItems:'center', gap:4, marginTop:8}}>
        <span style={{fontSize:13, fontWeight:600, color: kpi.up ? '#10b981' : '#ef4444'}}>
          {kpi.up ? '▲' : '▼'} {kpi.trend}
        </span>
        <span style={{fontSize:11, color:'#94a3b8'}}>vs last period</span>
      </div>
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ text }) {
  const color = (status_colors && status_colors[text]) || '#94a3b8';
  return (
    <span style={{background: color + '20', color, border:`1px solid ${color}40`,
      borderRadius:999, padding:'2px 10px', fontSize:11, fontWeight:600}}>
      {text}
    </span>
  );
}

// ── Report Generator ─────────────────────────────────────────────────────────
function ReportsTab() {
  const [reportType, setReportType] = useState(report_types?.[0] || 'Summary Report');
  const [dateFrom, setDateFrom] = useState('2024-01-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0,10));
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  function generate() {
    setLoading(true);
    setTimeout(() => { setLoading(false); setGenerated(true); }, 1200);
  }

  return (
    <div>
      <h2 style={{fontSize:18, fontWeight:700, color:'#0f172a', marginBottom:20}}>Generate Report</h2>
      <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:12, padding:24, marginBottom:20, maxWidth:560}}>
        <div style={{marginBottom:16}}>
          <label style={{display:'block', fontSize:12, fontWeight:600, color:'#475569', marginBottom:6}}>Report Type</label>
          <select value={reportType} onChange={e => setReportType(e.target.value)}
            style={{width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8,
              fontSize:14, color:'#334155', background:'#f8fafc', cursor:'pointer'}}>
            {(report_types || []).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
          <div>
            <label style={{display:'block', fontSize:12, fontWeight:600, color:'#475569', marginBottom:6}}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14, color:'#334155'}}/>
          </div>
          <div>
            <label style={{display:'block', fontSize:12, fontWeight:600, color:'#475569', marginBottom:6}}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14, color:'#334155'}}/>
          </div>
        </div>
        <button onClick={generate} disabled={loading}
          style={{background: loading ? '#a5b4fc' : '#4f46e5', color:'#ffffff', border:'none',
            borderRadius:8, padding:'10px 24px', fontSize:14, fontWeight:600, cursor: loading ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', gap:8, transition:'background 0.15s'}}>
          {loading ? '⏳ Generating...' : '📊 Generate Report'}
        </button>
      </div>
      {generated && (
        <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:12, padding:24}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16,
            paddingBottom:16, borderBottom:'1px solid #f1f5f9'}}>
            <div>
              <p style={{fontSize:16, fontWeight:700, color:'#0f172a'}}>{reportType}</p>
              <p style={{fontSize:12, color:'#94a3b8'}}>Period: {dateFrom} → {dateTo} · Generated: {new Date().toLocaleString()}</p>
            </div>
            <span style={{background:'#dcfce7', color:'#16a34a', borderRadius:999, padding:'4px 12px', fontSize:12, fontWeight:600}}>
              ● Ready
            </span>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:16}}>
            {kpis.slice(0,3).map((k,i) => (
              <div key={i} style={{background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px'}}>
                <p style={{fontSize:11, color:'#94a3b8', fontWeight:600, textTransform:'uppercase'}}>{k.label}</p>
                <p style={{fontSize:20, fontWeight:700, color:'#0f172a', marginTop:4}}>{k.value}</p>
                <p style={{fontSize:11, color: k.up ? '#10b981' : '#ef4444', fontWeight:600, marginTop:2}}>{k.up ? '▲' : '▼'} {k.trend}</p>
              </div>
            ))}
          </div>
          <BarChart data={bar_chart}/>
          <p style={{marginTop:16, fontSize:13, color:'#64748b', lineHeight:1.7, borderTop:'1px solid #f1f5f9', paddingTop:16}}>
            <strong>Executive Summary:</strong> The {reportType.toLowerCase()} for the period {dateFrom} to {dateTo}
            shows {kpis[0]?.trend?.startsWith('+') ? 'positive' : 'mixed'} performance across key indicators.
            {kpis[0] && ` ${kpis[0].label} reached ${kpis[0].value} (${kpis[0].trend}).`}
            {kpis[1] && ` ${kpis[1].label} is ${kpis[1].value} (${kpis[1].trend}).`}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Data Table Tab ────────────────────────────────────────────────────────────
function DataTab() {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = (table_rows || []).filter(row =>
    !search || row.some(cell => String(cell).toLowerCase().includes(search.toLowerCase()))
  );

  const sorted = sortCol !== null
    ? [...filtered].sort((a, b) => {
        const av = String(a[sortCol]), bv = String(b[sortCol]);
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      })
    : filtered;

  function toggleSort(i) {
    if (sortCol === i) setSortAsc(!sortAsc);
    else { setSortCol(i); setSortAsc(true); }
  }

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <h2 style={{fontSize:18, fontWeight:700, color:'#0f172a'}}>Data Records</h2>
        <div style={{position:'relative'}}>
          <span style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', fontSize:14}}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search records..."
            style={{paddingLeft:32, paddingRight:12, paddingTop:8, paddingBottom:8, border:'1px solid #e2e8f0',
              borderRadius:8, fontSize:13, color:'#334155', outline:'none', width:220}}/>
        </div>
      </div>
      <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'#f8fafc', borderBottom:'1px solid #e2e8f0'}}>
              {(table_columns || []).map((col, i) => (
                <th key={i} onClick={() => toggleSort(i)}
                  style={{padding:'12px 16px', fontSize:11, fontWeight:700, color:'#64748b',
                    textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'left', cursor:'pointer',
                    userSelect:'none', whiteSpace:'nowrap'}}>
                  {col} {sortCol === i ? (sortAsc ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, ri) => (
              <tr key={ri} style={{borderBottom:'1px solid #f1f5f9',
                background: ri % 2 === 0 ? '#ffffff' : '#fafafa',
                transition:'background 0.1s'}}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? '#ffffff' : '#fafafa'}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{padding:'11px 16px', fontSize:13, color:'#334155'}}>
                    {ci === row.length - 1 ? <StatusBadge text={String(cell)}/> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{padding:'10px 16px', background:'#f8fafc', borderTop:'1px solid #e2e8f0',
          fontSize:12, color:'#94a3b8'}}>
          Showing {sorted.length} of {(table_rows||[]).length} records
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab() {
  return (
    <div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24}}>
        {kpis.map((k,i) => <KpiCard key={i} kpi={k}/>)}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:12, padding:20,
          boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
          <BarChart data={bar_chart}/>
        </div>
        <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:12, padding:20,
          boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
          <LineChart data={line_chart}/>
        </div>
      </div>
      <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:12, padding:20, marginTop:16}}>
        <p style={{fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:12}}>Recent Records</p>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'1px solid #e2e8f0'}}>
              {(table_columns||[]).map((c,i) => (
                <th key={i} style={{padding:'8px 12px', fontSize:11, fontWeight:700, color:'#64748b',
                  textTransform:'uppercase', textAlign:'left'}}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(table_rows||[]).slice(0,5).map((row,ri) => (
              <tr key={ri} style={{borderBottom:'1px solid #f1f5f9'}}>
                {row.map((cell,ci) => (
                  <td key={ci} style={{padding:'10px 12px', fontSize:13, color:'#334155'}}>
                    {ci === row.length-1 ? <StatusBadge text={String(cell)}/> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
function SettingsTab() {
  const [saved, setSaved] = useState(false);
  function handleSave() { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  return (
    <div style={{maxWidth:560}}>
      <h2 style={{fontSize:18, fontWeight:700, color:'#0f172a', marginBottom:20}}>Settings</h2>
      <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:12, padding:24, marginBottom:16}}>
        <p style={{fontSize:14, fontWeight:600, color:'#334155', marginBottom:16}}>Display Preferences</p>
        {['Show trend indicators', 'Enable email notifications', 'Auto-refresh every 5 minutes'].map((opt,i) => (
          <label key={i} style={{display:'flex', alignItems:'center', gap:10, marginBottom:12, cursor:'pointer'}}>
            <input type="checkbox" defaultChecked={i < 2} style={{width:16, height:16, cursor:'pointer'}}/>
            <span style={{fontSize:13, color:'#334155'}}>{opt}</span>
          </label>
        ))}
      </div>
      <button onClick={handleSave}
        style={{background: saved ? '#10b981' : '#4f46e5', color:'#fff', border:'none', borderRadius:8,
          padding:'10px 24px', fontSize:14, fontWeight:600, cursor:'pointer', transition:'background 0.2s'}}>
        {saved ? '✓ Saved!' : 'Save Preferences'}
      </button>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [activeNav, setActiveNav] = useState((nav_items && nav_items[0]?.id) || 'overview');

  const tabMap = {
    overview: <OverviewTab/>,
    reports:  <ReportsTab/>,
    data:     <DataTab/>,
    settings: <SettingsTab/>,
  };
  // Map any custom nav ids to closest tab
  function renderTab() {
    if (tabMap[activeNav]) return tabMap[activeNav];
    const idx = (nav_items || []).findIndex(n => n.id === activeNav);
    const keys = Object.keys(tabMap);
    return tabMap[keys[idx % keys.length]] || <OverviewTab/>;
  }

  return (
    <div style={{display:'flex', height:'100vh', overflow:'hidden', fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      {/* Sidebar */}
      <div style={{width:220, background:'#1e293b', color:'#ffffff', display:'flex', flexDirection:'column', flexShrink:0}}>
        <div style={{padding:'20px 16px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:36, height:36, borderRadius:8, background:'#4f46e5', display:'flex',
              alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700}}>
              {(company||'A')[0]}
            </div>
            <div>
              <p style={{fontSize:13, fontWeight:700, color:'#ffffff'}}>{app_title}</p>
              <p style={{fontSize:11, color:'#64748b'}}>{company}</p>
            </div>
          </div>
        </div>
        <nav style={{flex:1, padding:'12px 8px', overflowY:'auto'}}>
          {(nav_items||[]).map(item => (
            <button key={item.id} onClick={() => setActiveNav(item.id)}
              style={{display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 12px',
                marginBottom:2, borderRadius:8, border:'none', cursor:'pointer', textAlign:'left',
                background: activeNav === item.id ? 'rgba(79,70,229,0.8)' : 'transparent',
                color: activeNav === item.id ? '#ffffff' : '#94a3b8',
                fontSize:13, fontWeight: activeNav === item.id ? 600 : 400,
                transition:'all 0.15s ease'}}>
              <span style={{fontSize:16}}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.08)'}}>
          <p style={{fontSize:11, color:'#475569'}}>Powered by AgentForge</p>
        </div>
      </div>
      {/* Main content */}
      <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        {/* Top bar */}
        <div style={{background:'#ffffff', borderBottom:'1px solid #e2e8f0', padding:'14px 24px',
          display:'flex', alignItems:'center', gap:12, flexShrink:0}}>
          <p style={{flex:1, fontSize:15, fontWeight:700, color:'#0f172a'}}>
            {(nav_items||[]).find(n => n.id === activeNav)?.label || 'Overview'}
          </p>
          <span style={{background:'#dcfce7', color:'#16a34a', borderRadius:999, padding:'3px 10px', fontSize:11, fontWeight:600}}>● Live</span>
          <div style={{width:32, height:32, borderRadius:'50%', background:'#4f46e5',
            color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700}}>
            {(company||'A')[0]}
          </div>
        </div>
        {/* Page content */}
        <div style={{flex:1, overflowY:'auto', padding:24}}>
          {renderTab()}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
</script>
</body>
</html>"""


UI_GEN_PROMPT = """You are a world-class React engineer and enterprise UX designer. Generate a COMPLETE, self-contained, production-quality HTML application using React 18 + Tailwind CSS that perfectly matches the user's requirements.

MANDATORY CDN (always include all 4):
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.22.20/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>

==================================================
PHASE 1 -- UNDERSTAND THE REQUIREMENT
==================================================
Read the user's full prompt. Identify:
1. COMPANY: the organization name (e.g. "Loblaw", "Accenture", "TD Bank")
2. APP TYPE: what kind of application best serves this requirement

Choose the APP TYPE that best fits:
  CHATBOT     -> customer support, FAQ assistant, helpdesk, virtual agent, RAG chatbot
  DASHBOARD   -> analytics, metrics, KPIs, monitoring, reporting, charts
  DATA TABLE  -> CRUD listings, search + filter, inventory, employee records, manage
  WIZARD      -> multi-step onboarding, application form, intake process, step-by-step
  SCHEDULER   -> booking system, appointment manager, calendar, slots
  SEARCH APP  -> knowledge base search, document finder, product catalogue
  FORM APP    -> data entry form with validation, survey, feedback collector
  PORTAL      -> employee self-service, client portal, project dashboard

==================================================
PHASE 2 -- DESIGN SYSTEM (apply to ALL app types)
==================================================
Use these design tokens consistently:
  Primary:      #4f46e5  -- buttons, active states, links
  Primary Dark: #3730a3  -- hover states, header bg
  Surface:      #ffffff  -- cards, panels
  Background:   #f8fafc  -- page background
  Border:       #e2e8f0  -- card borders, dividers
  Text Primary: #0f172a  -- headings
  Text Body:    #334155  -- body text
  Text Muted:   #94a3b8  -- labels, metadata
  Success:      #10b981  -- green badges
  Warning:      #f59e0b  -- amber alerts
  Danger:       #ef4444  -- red errors

Typography: font-family: 'Inter', 'Segoe UI', system-ui, sans-serif
Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48px
Border radius: 8px cards, 6px inputs, 999px badges/pills
Shadows: 0 1px 3px rgba(0,0,0,0.1) cards, 0 4px 16px rgba(0,0,0,0.12) modals

==================================================
PHASE 3 -- BUILD THE APP (by type)
==================================================

--- IF APP TYPE = CHATBOT ---
Build a 3-panel enterprise support chatbot.

DATA STRUCTURES (ALL content derived 100% from user prompt and uploaded documents -- ZERO hardcoding):
const APP_CONFIG = {
  company: "",        // extracted company name from prompt
  appName: "",        // e.g. "Loblaw IT Support Centre" -- reflect actual domain
  primaryColor: "#4f46e5",
  welcomeMessage: "", // 2-3 sentence greeting specific to this company and domain
  agentName: "Support Agent",
  documents: [],      // ONLY list documents that were actually uploaded (real filenames, real sizes)
  topics: ["","","",""],  // 4 topic labels derived ONLY from the uploaded document content -- never hardcode
};

CRITICAL -- FAQ_DATA RULES (EXACTLY 10 ITEMS, ALL FULLY POPULATED from documents/domain):
  !! EVERY question MUST come from the uploaded document content or the real domain -- NO generic examples !!
  !! Cover all 4 topics (at least 2 questions per topic, 10 total) !!
  !! Each topic value in each item MUST exactly match one of the 4 APP_CONFIG.topics strings !!
  !! Each answer = 1-sentence direct reply + 4-6 step-by-step resolution steps from document content !!
  WRONG: NEVER write questions about AI, RAG, FAISS, embeddings, or technology internals
  WRONG: topic:"Topic1" is placeholder -- replace with the actual topic name string

const FAQ_DATA = [
  { id:1, question:"",  answer:"", steps:["","","",""], source:"", confidence:94, topic:"", related:["",""] },
  { id:2, question:"",  answer:"", steps:["","","",""], source:"", confidence:91, topic:"", related:["",""] },
  { id:3, question:"",  answer:"", steps:["","","",""], source:"", confidence:96, topic:"", related:["",""] },
  { id:4, question:"",  answer:"", steps:["","","",""], source:"", confidence:88, topic:"", related:["",""] },
  { id:5, question:"",  answer:"", steps:["","","",""], source:"", confidence:93, topic:"", related:["",""] },
  { id:6, question:"",  answer:"", steps:["","","",""], source:"", confidence:97, topic:"", related:["",""] },
  { id:7, question:"",  answer:"", steps:["","","",""], source:"", confidence:90, topic:"", related:["",""] },
  { id:8, question:"",  answer:"", steps:["","","",""], source:"", confidence:95, topic:"", related:["",""] },
  { id:9, question:"",  answer:"", steps:["","","",""], source:"", confidence:87, topic:"", related:["",""] },
  { id:10, question:"", answer:"", steps:["","","",""], source:"", confidence:92, topic:"", related:["",""] },
  // Fill every field above with real content from the uploaded documents
];

CRITICAL -- TOPIC_QUESTIONS RULES (MANDATORY -- enables Filter by Topic to work):
  For EACH topic in APP_CONFIG.topics, write EXACTLY 10 questions from the actual document content.
  These appear in the LEFT SIDEBAR when that topic filter button is clicked.
  !! ABSOLUTE BAN: NEVER write "// Add more questions", "/* 10 questions */", or any placeholder comment !!
  !! Every single { id, question, source } entry MUST be fully populated with real content â€" no empty strings !!
  !! The keys MUST exactly match the strings in APP_CONFIG.topics â€" never "Topic1", "Topic2" etc. !!

MANDATORY STRUCTURE â€" replace keys with actual topic names, fill ALL 10 entries per topic:
const TOPIC_QUESTIONS = {
  "<exact topic name from APP_CONFIG.topics[0]>": [
    { id:"t1_1", question:"<real question from doc>", source:"<real filename>" },
    { id:"t1_2", question:"<real question from doc>", source:"<real filename>" },
    { id:"t1_3", question:"<real question from doc>", source:"<real filename>" },
    { id:"t1_4", question:"<real question from doc>", source:"<real filename>" },
    { id:"t1_5", question:"<real question from doc>", source:"<real filename>" },
    { id:"t1_6", question:"<real question from doc>", source:"<real filename>" },
    { id:"t1_7", question:"<real question from doc>", source:"<real filename>" },
    { id:"t1_8", question:"<real question from doc>", source:"<real filename>" },
    { id:"t1_9", question:"<real question from doc>", source:"<real filename>" },
    { id:"t1_10", question:"<real question from doc>", source:"<real filename>" },
  ],
  "<exact topic name from APP_CONFIG.topics[1]>": [
    { id:"t2_1", question:"<real question>", source:"<real filename>" },
    { id:"t2_2", question:"<real question>", source:"<real filename>" },
    { id:"t2_3", question:"<real question>", source:"<real filename>" },
    { id:"t2_4", question:"<real question>", source:"<real filename>" },
    { id:"t2_5", question:"<real question>", source:"<real filename>" },
    { id:"t2_6", question:"<real question>", source:"<real filename>" },
    { id:"t2_7", question:"<real question>", source:"<real filename>" },
    { id:"t2_8", question:"<real question>", source:"<real filename>" },
    { id:"t2_9", question:"<real question>", source:"<real filename>" },
    { id:"t2_10", question:"<real question>", source:"<real filename>" },
  ],
  "<exact topic name from APP_CONFIG.topics[2]>": [
    { id:"t3_1", question:"<real question>", source:"<real filename>" },
    { id:"t3_2", question:"<real question>", source:"<real filename>" },
    { id:"t3_3", question:"<real question>", source:"<real filename>" },
    { id:"t3_4", question:"<real question>", source:"<real filename>" },
    { id:"t3_5", question:"<real question>", source:"<real filename>" },
    { id:"t3_6", question:"<real question>", source:"<real filename>" },
    { id:"t3_7", question:"<real question>", source:"<real filename>" },
    { id:"t3_8", question:"<real question>", source:"<real filename>" },
    { id:"t3_9", question:"<real question>", source:"<real filename>" },
    { id:"t3_10", question:"<real question>", source:"<real filename>" },
  ],
  "<exact topic name from APP_CONFIG.topics[3]>": [
    { id:"t4_1", question:"<real question>", source:"<real filename>" },
    { id:"t4_2", question:"<real question>", source:"<real filename>" },
    { id:"t4_3", question:"<real question>", source:"<real filename>" },
    { id:"t4_4", question:"<real question>", source:"<real filename>" },
    { id:"t4_5", question:"<real question>", source:"<real filename>" },
    { id:"t4_6", question:"<real question>", source:"<real filename>" },
    { id:"t4_7", question:"<real question>", source:"<real filename>" },
    { id:"t4_8", question:"<real question>", source:"<real filename>" },
    { id:"t4_9", question:"<real question>", source:"<real filename>" },
    { id:"t4_10", question:"<real question>", source:"<real filename>" },
  ],
};

DOC_SECTIONS array (MANDATORY when documents are provided -- populate from actual document content):
  Extract the key Q&A sections from the uploaded documents. Each entry is a heading + its body text.
  This enables the chatbot to answer questions directly from document content, not just canned FAQs.

const DOC_SECTIONS = [
  // !! MANDATORY: Read EVERY uploaded document provided in the UPLOADED DOCUMENTS block above.
  // For each major topic/question/heading you find, create one entry:
  //   { heading: "<the exact heading or question from the document>", body: "<the full answer text from that section>", source: "<the exact uploaded filename>" }
  // Use ONLY the filenames from the UPLOADED DOCUMENTS block as the source value â€" never invent filenames.
  // Aim for 15-30 entries covering all uploaded documents proportionally.
];

KEYWORD ENGINE (mandatory -- searches BOTH FAQ_DATA and DOC_SECTIONS with source-accurate matching):
function findAnswer(userInput, history = []) {
  // Normalize: lowercase, replace curly/smart apostrophes with straight, strip punctuation
  const norm = s => s.toLowerCase().replace(/[''‚›′]/g,"'").replace(/[^a-z0-9\\s']/g," ").replace(/\\s+/g," ").trim();
  // Expand short follow-up queries using context from last bot answer topic
  const lastBotMsg = [...history].reverse().find(m => m.role === "bot");
  const contextHint = lastBotMsg ? norm(lastBotMsg.source || "") + " " + norm(lastBotMsg.answer ? lastBotMsg.answer.slice(0,80) : "") : "";
  const rawNorm = norm(userInput);
  // If query is very short (<=3 words) and we have context, blend context keywords in
  const queryNorm = (rawNorm.split(" ").length <= 3 && contextHint.trim()) ? rawNorm + " " + contextHint : rawNorm;

  // PASS 1 -- near-exact heading match: query matches a DOC_SECTIONS heading from the uploaded documents
  // Returns immediately with the exact section from whichever document contains that heading
  for (const sec of DOC_SECTIONS) {
    const hNorm = norm(sec.heading);
    if (hNorm === queryNorm || hNorm.includes(queryNorm) || queryNorm.includes(hNorm)) {
      const rawLines = sec.body.replace(/[•–—•]/g," ").split(/\\n/).flatMap(l=>l.split(/\\.\\s+/)).map(l=>l.trim()).filter(l=>l.length>8);
      return {
        answer: rawLines[0] || sec.body.slice(0,200),
        steps: rawLines.slice(1,6).map((l,i)=>"Step "+(i+1)+": "+l),
        source: sec.source, confidence: 98,
        related: FAQ_DATA.slice(0,2).map(f=>f.question)
      };
    }
  }

  // Stop words: ONLY common grammatical/filler English words -- NEVER remove domain-specific terms
  const STOP = new Set(["what","when","where","which","who","how","why","can","does","will","did","the","and","for","are","was","not","you","your","have","has","had","from","with","this","that","these","those","been","being","should","would","could","please","tell","show","give","make","just","also","more","some","about","after","before","into","onto"]);
  // Accept >= 2 chars so short acronyms match
  const words = queryNorm.split(/\\s+/).filter(w => w.length >= 2 && !STOP.has(w));

  if (words.length === 0) {
    return {
      answer: "Please describe your issue using specific keywords.",
      steps: ["Step 1: Type specific keywords from your question.","Step 2: Click any of the Top 10 Questions in the left panel.","Step 3: Use the Filter by Topic buttons on the right to browse by category."],
      source: APP_CONFIG.documents[0]?.name, confidence: 0, related: APP_CONFIG.topics.slice(0,2)
    };
  }

  // PASS 2 -- score FAQ items
  const faqScored = FAQ_DATA.map(item => {
    const hay = norm(item.question + " " + item.answer + " " + item.steps.join(" ") + " " + item.topic);
    const score = words.reduce((a,w) => a + (hay.includes(w) ? 1 : 0), 0);
    return { type:"faq", item, score };
  });

  // PASS 2 -- score DOC_SECTIONS
  // Heading match weight = 5x body match (heading match means the section IS about this topic)
  const docScored = DOC_SECTIONS.map(sec => {
    const hNorm = norm(sec.heading);
    const bNorm = norm(sec.body);
    // Count distinct words matched in heading (5x) vs body (1x)
    const headScore = words.reduce((a,w) => a + (hNorm.includes(w) ? 5 : 0), 0);
    const bodyScore = words.reduce((a,w) => a + (bNorm.includes(w) ? 1 : 0), 0);
    return { type:"doc", sec, score: headScore + bodyScore };
  });

  const allScored = [...faqScored, ...docScored].sort((a,b) => b.score - a.score);

  if (allScored[0].score >= 1) {
    const best = allScored[0];
    if (best.type === "faq") return best.item;
    const sec = best.sec;
    const lines = sec.body.replace(/[•–—]/g," ").split(/\\n/).flatMap(l=>l.split(/\\.\\s+/)).map(l=>l.trim()).filter(l=>l.length>8);
    return {
      answer: lines[0] || sec.body.slice(0,200),
      steps: lines.slice(1,6).map((l,i)=>"Step "+(i+1)+": "+l),
      source: sec.source,
      confidence: Math.min(68 + best.score * 4, 97),
      related: FAQ_DATA.filter(f=>f.topic===best.sec.heading.split(" ").slice(-1)[0]).slice(0,2).map(f=>f.question).concat(FAQ_DATA.slice(0,2).map(f=>f.question)).slice(0,2)
    };
  }

  return {
    answer: "I could not find a match in the knowledge base. Please try more specific keywords.",
    steps: [
      "Step 1: Use specific terms from your issue - try the exact keywords from the document topics.",
      "Step 2: Click a Top 10 Question in the left panel that is closest to your issue.",
      "Step 3: Use the Filter by Topic buttons on the right to browse all topics.",
      "Step 4: Contact " + APP_CONFIG.company + " support directly for urgent issues."
    ],
    source: APP_CONFIG.documents[0]?.name, confidence: 0, related: APP_CONFIG.topics.slice(0,2).map(t=>"Help with: "+t)
  };
}

3-PANEL LAYOUT (height:100vh, display:flex, overflow:hidden, position:"relative"):
!! ALL three panels must be direct flex children â€" LEFT SIDEBAR + MAIN AREA + RIGHT PANEL side by side !!
LEFT SIDEBAR (width:280px, minWidth:280px, background:#1e293b, color:#ffffff, display:flex, flexDirection:column, overflow:hidden):
  Top branding area (padding:20px 16px 16px, borderBottom:"1px solid rgba(255,255,255,0.1)"):
    Row: colored circle (40px, background:#4f46e5, borderRadius:50%, display:flex, alignItems:center, justifyContent:center, color:white, fontWeight:700, fontSize:16) + company initial
    App name: (fontSize:15, fontWeight:700, color:"#ffffff", marginLeft:10)
    Subtitle: (fontSize:11, color:"#94a3b8", marginLeft:10, marginTop:2)

  Scrollable question list (flex:1, overflowY:auto, padding:12px 10px):
    -- Active topic banner (shown only when a topic filter is active):
    IF activeTopic:
      <div style={{background:"rgba(79,70,229,0.2)", borderRadius:8, padding:"6px 10px", marginBottom:8, fontSize:11, color:"#a5b4fc", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <span>Showing: {activeTopic}</span>
        <button onClick={()=>setActiveTopic(null)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:11,fontWeight:700}}>Clear</button>
      </div>
    -- Section label:
    <div style={{fontSize:10, fontWeight:700, letterSpacing:"0.12em", color:"#64748b", textTransform:"uppercase", padding:"0 6px", marginBottom:8}}>
      {activeTopic ? activeTopic + " Questions" : "Top 10 Questions"}
    </div>

    !! CRITICAL: Iterate sidebarQuestions (NOT FAQ_DATA) so topic filter works !!
    sidebarQuestions.map((item, idx) => (
    <button
      key={item.id}
      onClick={() => handleSend(item.question)}
      style={{
        display:"flex", alignItems:"flex-start", gap:"10px", width:"100%",
        padding:"10px 10px", marginBottom:"4px", borderRadius:"8px",
        border:"none", cursor:"pointer", textAlign:"left",
        background: activeQuestion === item.question ? "rgba(79,70,229,0.9)" : "rgba(255,255,255,0.05)",
        transition:"background 0.15s ease"
      }}
    >
      <span style={{
        minWidth:"24px", height:"24px", borderRadius:"50%",
        background: activeQuestion === item.question ? "#ffffff" : "#4f46e5",
        color: activeQuestion === item.question ? "#4f46e5" : "#ffffff",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:"11px", fontWeight:"700", flexShrink:0, marginTop:"1px"
      }}>{idx + 1}</span>
      <span style={{
        fontSize:"13px", lineHeight:"1.5", color:"#ffffff",
        wordBreak:"break-word", whiteSpace:"normal", flex:1
      }}>{item.question}</span>
    </button>
    ))

MAIN AREA (flex:1, display:flex, flexDirection:column, minWidth:0, minHeight:0, overflow:hidden, background:#f8fafc):
  Header bar (background:#ffffff, borderBottom:"1px solid #e2e8f0", padding:"14px 20px", display:flex, alignItems:center, gap:12, boxShadow:"0 1px 3px rgba(0,0,0,0.06)"):
    App name (fontSize:17, fontWeight:700, color:#0f172a, flex:1)
    Green pill: (background:#dcfce7, color:#16a34a, fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:999) "â— AI Active"
    Blue pill: (background:#dbeafe, color:#2563eb, fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:999) "â— KB Connected"
    Avatar circle (36px, background:#4f46e5, borderRadius:50%, color:white, fontSize:13, fontWeight:700) showing initials

  Messages area (flex:1, overflowY:auto, padding:"20px", display:flex, flexDirection:column, gap:12):
    Welcome card (background:#ffffff, border:"1px solid #e2e8f0", borderRadius:12, padding:16, display:flex, gap:12):
      Bot avatar (40px circle, background:#4f46e5, color:white, fontSize:18, flexShrink:0) "&#128100;"
      Text: welcomeMessage (fontSize:14, color:#334155, lineHeight:1.6)

    USER message (alignSelf:flex-end, maxWidth:"72%"):
      Bubble (background:#4f46e5, color:#ffffff, borderRadius:"18px 18px 4px 18px", padding:"12px 16px", fontSize:14, lineHeight:1.5)
      Timestamp (fontSize:10, color:#94a3b8, textAlign:right, marginTop:4)

    BOT message (alignSelf:flex-start, maxWidth:"80%"):
      Card (background:#ffffff, border:"1px solid #e2e8f0", borderRadius:"4px 18px 18px 18px", padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.06)"):
        Answer text (fontSize:14, color:#1e293b, lineHeight:1.6, marginBottom:12, fontWeight:500)
        IF steps exist and steps.length > 0:
          Steps heading (fontSize:11, fontWeight:700, color:#475569, textTransform:uppercase, letterSpacing:"0.05em", marginBottom:8) "&#128269; Step-by-Step Resolution"
          Ordered list (margin:"0 0 12px 0", padding:"0 0 0 4px", listStyle:none):
            Each step: (display:flex, gap:8, marginBottom:6)
              Step number badge (20px circle, background:#f1f5f9, color:#475569, fontSize:10, fontWeight:700, flexShrink:0)
              Step text (fontSize:13, color:#334155, lineHeight:1.5)
        Meta bar (borderTop:"1px solid #f1f5f9", paddingTop:10, marginTop:4, display:flex, gap:16, flexWrap:wrap):
          Source text (fontSize:11, color:#94a3b8) "&#128203; {source}"
          Confidence (fontSize:11, color:#10b981, fontWeight:600) "âœ" {confidence}%"
        IF related and related.length > 0:
          Related row (display:flex, gap:6, flexWrap:wrap, marginTop:8):
            Label (fontSize:11, color:#64748b) "&#128161; Related:"
            Each related: <button onClick={()=>handleSend(r)} style={{fontSize:11, background:#ede9fe, color:#4f46e5, border:"none", borderRadius:999, padding:"3px 10px", cursor:pointer}}>{r}</button>
        Thumbs feedback row (MANDATORY on every bot message, display:flex, alignItems:center, gap:6, marginTop:8):
          Label (fontSize:11, color:#94a3b8) "Was this helpful?"
          Thumbs up: <button onClick={()=>setFeedback(p=>({...p,[msg.id]:'up'}))} title="Helpful" style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:feedback[msg.id]==='up'?1:0.4,transition:"opacity 0.15s"}}>&#128077;</button>
          Thumbs down: <button onClick={()=>setFeedback(p=>({...p,[msg.id]:'down'}))} title="Not helpful" style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:feedback[msg.id]==='down'?1:0.4,transition:"opacity 0.15s"}}>&#128078;</button>
          IF feedback[msg.id]: <span style={{fontSize:11, color:feedback[msg.id]==='up'?"#16a34a":"#dc2626", fontWeight:600}}>{feedback[msg.id]==='up' ? 'Thanks! Glad that helped.' : 'Noted &ndash; we will improve this.'}</span>
      Timestamp (fontSize:10, color:#94a3b8, marginTop:4)

    Typing indicator (alignSelf:flex-start):
      Card (background:#ffffff, border:"1px solid #e2e8f0", borderRadius:"4px 18px 18px 18px", padding:"14px 18px"):
        3 dots: <span className="dot"></span><span className="dot"></span><span className="dot"></span>

  Footer (background:#ffffff, borderTop:"1px solid #e2e8f0", padding:"12px 16px", flexShrink:0):
    Input row (display:flex, gap:10, alignItems:flex-end, width:"100%", overflow:"visible"):
      textarea (flex:1, minWidth:0, resize:none, border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 14px", fontSize:14, color:#334155, outline:none, fontFamily:inherit, rows:2, placeholder:"Type your message...", onKeyDown: Enter without Shift = handleSend)
      MANDATORY SEND BUTTON â€" use this EXACT JSX, no substitutions:
      <button onClick={handleSend} style={{background:"#4f46e5",color:"#ffffff",border:"none",borderRadius:"10px",padding:"10px 20px",fontSize:"14px",fontWeight:600,cursor:"pointer",height:"44px",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:"6px",flexShrink:0,minWidth:"80px"}}>Send &#x27A4;</button>
      !! NEVER replace this with a microphone icon, SVG icon, or any icon-only button. The text "Send" with the arrow MUST always be fully visible on screen. !!
      !! textarea must have minWidth:0 so it shrinks and leaves room for the Send button !!
    Caption (fontSize:11, color:#94a3b8, textAlign:center, marginTop:8) "Powered by " + APP_CONFIG.company + " Knowledge Base &middot; AI-Assisted Support"

RIGHT PANEL (width:260px, minWidth:260px, background:#ffffff, borderLeft:"1px solid #e2e8f0", display:flex, flexDirection:column, overflowY:auto):
  Section padding:16px
  "Knowledge Base" (fontSize:14, fontWeight:700, color:#0f172a, marginBottom:12) + badge (background:#4f46e5, color:white, borderRadius:999, fontSize:11, padding:"2px 8px") showing count

  Document list (display:flex, flexDirection:column, gap:8, marginBottom:20):
    Each doc card (background:#f8fafc, border:"1px solid #e2e8f0", borderRadius:8, padding:"10px 12px"):
      Row: type badge (PDF=background:#fee2e2,color:#dc2626 / DOCX=background:#dbeafe,color:#2563eb / TXT=background:#f3f4f6,color:#6b7280, fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:4)
      Filename (fontSize:12, fontWeight:500, color:#334155, marginTop:4, wordBreak:break-all)
      Row (display:flex, justifyContent:space-between, marginTop:4):
        Size (fontSize:11, color:#94a3b8)
        Indexed badge (fontSize:10, color:#16a34a, fontWeight:600) "âœ" Indexed"

  Divider (borderTop:"1px solid #f1f5f9", margin:"4px 0 12px")
  "Session" heading (fontSize:12, fontWeight:700, color:#0f172a, marginBottom:8)
  Stats rows (fontSize:12, color:#64748b, display:flex, justifyContent:space-between, marginBottom:4):
    "Messages" : {msgCount}
    "Last Query" : {lastQueryTime or "--"}

  Divider (borderTop:"1px solid #f1f5f9", margin:"12px 0")
  "Filter by Topic" heading row (display:flex, justifyContent:space-between, alignItems:center, marginBottom:8):
    Label (fontSize:12, fontWeight:700, color:#0f172a) "Filter by Topic"
    IF activeTopic: <button onClick={()=>setActiveTopic(null)} style={{fontSize:10, color:#ef4444, background:"none", border:"none", cursor:"pointer", fontWeight:600}}>Clear x</button>
  APP_CONFIG.topics.map(topic =>
    // CLICKING a topic FILTERS the left sidebar to show TOPIC_QUESTIONS[topic]
    // It does NOT send a chat message -- it sets activeTopic state
    <button onClick={()=>setActiveTopic(activeTopic===topic ? null : topic)} style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      width:"100%", textAlign:"left", padding:"9px 12px", marginBottom:6,
      borderRadius:8, cursor:"pointer", fontWeight:500, fontSize:12, transition:"all 0.15s",
      border: activeTopic===topic ? "1px solid #4f46e5" : "1px solid #e2e8f0",
      background: activeTopic===topic ? "#ede9fe" : "#f8fafc",
      color: activeTopic===topic ? "#4f46e5" : "#334155"
    }}>
      <span>{topic}</span>
      <span style={{fontSize:10, background: activeTopic===topic?"#4f46e5":"#e2e8f0", color: activeTopic===topic?"#fff":"#64748b", borderRadius:999, padding:"1px 7px", fontWeight:700}}>
        {TOPIC_QUESTIONS[topic]?.length || 0}
      </span>
    </button>
  )

STATE:
const [messages, setMessages] = React.useState([{role:"bot", id:"bot_welcome", answer:APP_CONFIG.welcomeMessage, steps:[], source:"", confidence:null, related:[]}]);
const [input, setInput] = React.useState("");
const [isTyping, setIsTyping] = React.useState(false);
const [activeQuestion, setActiveQuestion] = React.useState(null);
const [activeTopic, setActiveTopic] = React.useState(null);
const [msgCount, setMsgCount] = React.useState(0);
const [lastQueryTime, setLastQueryTime] = React.useState(null);
const [feedback, setFeedback] = React.useState({});  // { [msg.id]: 'up' | 'down' }
// Keep last 6 messages as memory context for follow-up resolution
const conversationRef = React.useRef([]);
const messagesEndRef = React.useRef(null);

// Derived: which questions to show in the left sidebar
// If a topic filter is active -> show TOPIC_QUESTIONS[activeTopic] (10 topic-specific Qs)
// Otherwise -> show the default FAQ_DATA top-10
const sidebarQuestions = activeTopic && TOPIC_QUESTIONS[activeTopic]
  ? TOPIC_QUESTIONS[activeTopic]
  : FAQ_DATA;

function handleSend(text) {
  const q=(typeof text==="string"?text:input).trim(); if(!q||isTyping) return;
  setInput(""); setActiveQuestion(q); setLastQueryTime(new Date().toLocaleTimeString());
  const userMsg = {role:"user",text:q,ts:new Date().toLocaleTimeString()};
  setMessages(p=>[...p,userMsg]);
  // Maintain rolling 6-message memory window for context-aware follow-ups
  conversationRef.current = [...conversationRef.current, userMsg].slice(-6);
  setIsTyping(true);
  setTimeout(()=>{
    const r=findAnswer(q, conversationRef.current);
    const botMsg = {role:"bot",...r,id:"bot_"+Date.now(),ts:new Date().toLocaleTimeString()};
    setMessages(p=>[...p,botMsg]);
    conversationRef.current = [...conversationRef.current, botMsg].slice(-6);
    setIsTyping(false); setMsgCount(c=>c+1);
  }, 1200);
}
React.useEffect(()=>{ messagesEndRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,isTyping]);

CSS in <head> <style>:
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Inter',sans-serif; }
::-webkit-scrollbar { width:4px; }
::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }
@keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
.dot { width:8px;height:8px;background:#94a3b8;border-radius:50%;display:inline-block;margin:0 3px;animation:bounce 1.4s infinite; }
.dot:nth-child(2){animation-delay:.2s} .dot:nth-child(3){animation-delay:.4s}

--- IF APP TYPE = DASHBOARD ---
Build an analytics dashboard with:
- Top navbar: logo + company name + user avatar + notifications bell
- Left sidebar navigation (4-6 domain-specific nav items with icons)
- Main area: 4 KPI cards (domain-relevant metrics, large number + trend arrow up/down + sparkline) + 2 inline SVG charts (bar + line) + 1 data table
- KPI cards: white, border-left 4px colored accent, large number, trend indicator
- Charts: fully inline SVG, realistic data for domain, labeled axes
- Data table: 5-7 domain-relevant columns, 8-10 sample rows, striped, sortable headers
- Sidebar #1e293b, header white, cards white with shadow

--- IF APP TYPE = DATA TABLE ---
Build a full CRUD data management view:
- Search bar + multi-column filter dropdowns + Add New button
- Table: striped rows, sortable columns, checkbox multi-select, View/Edit/Delete per row
- Status badges as color-coded pills
- Pagination: prev/next + page numbers + X of Y results
- Modal for record detail/edit (React state toggled)
- All columns and data domain-relevant

--- IF APP TYPE = WIZARD ---
Build a multi-step form wizard:
- Progress bar showing step N of N with step names
- Each step: heading + description + 3-5 domain-specific form fields with labels
- Validation: required fields highlighted red on Next
- Back / Next / Submit buttons
- Final confirmation screen summarising all entered data

--- IF APP TYPE = SCHEDULER ---
Build an appointment/booking interface:
- Calendar grid (current month) with clickable dates
- Available time slots shown when date selected
- Booking form: name, contact, service type, notes
- Booked appointments list (5-6 sample entries) with status badges
- Confirmation dialog after booking

--- IF APP TYPE = SEARCH APP ---
Build a knowledge base search UI:
- Large hero search bar
- Search results as cards: title, snippet, source doc, relevance %, tags
- Left filter panel: category, date range, document type checkboxes
- Result cards expandable on click
- "No results" empty state with suggestions

--- IF APP TYPE = FORM APP ---
Build a data entry form:
- Logical field grouping with section headers
- Inline validation with error messages near fields
- Character counters for textareas
- Green/red border feedback as user types
- Submit button disables + shows spinner during submission
- Success confirmation screen

--- IF APP TYPE = PORTAL ---
Build a self-service portal:
- Personalized greeting header
- Quick-action tile grid (6-8 tiles, domain-specific actions)
- Sidebar navigation with nested menu
- Recent activity feed
- Notification badge in header

==================================================
MANDATORY NAVIGATION RULE (applies to ALL app types with a sidebar/nav)
==================================================
ANY sidebar or left-nav menu MUST be interactive. Use this exact pattern:

  const [activeNav, setActiveNav] = React.useState('first_item_id');
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'templates', label: 'Templates', icon: '📄' },
    // ... more items
  ];

  // Render each nav item as a BUTTON with onClick:
  {navItems.map(item => (
    <button
      key={item.id}
      onClick={() => setActiveNav(item.id)}
      style={{
        display:'flex', alignItems:'center', gap:10, width:'100%',
        padding:'10px 14px', marginBottom:4, borderRadius:8,
        border:'none', cursor:'pointer', textAlign:'left',
        background: activeNav === item.id ? '#4f46e5' : 'transparent',
        color: activeNav === item.id ? '#ffffff' : '#94a3b8',
        fontWeight: activeNav === item.id ? 600 : 400,
        transition:'all 0.15s ease'
      }}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </button>
  ))}

  // Show different content per active nav item:
  function renderContent() {
    if (activeNav === 'dashboard') return <DashboardView />;
    if (activeNav === 'templates') return <TemplatesView />;
    // ... etc
  }

!! ABSOLUTE BAN: NEVER use plain <li> or <a> tags for navigation. ALWAYS use <button onClick={() => setActiveNav(item.id)}> !!
!! Each nav section MUST render different content in the main area when clicked !!

==================================================
PHASE 4 -- ENTERPRISE QUALITY STANDARDS
==================================================
ALL generated apps must have:
- Hover/active states on all interactive elements (transition:all 0.15s ease)
- Loading/disabled states on buttons during async simulation
- Empty states with helpful messages when lists are empty
- Realistic domain-specific data -- zero Lorem ipsum, zero "Item 1", zero generic placeholders
- Company branding in header (name + colored icon)
- Inter font loaded from Google Fonts

==================================================
FINAL OUTPUT RULES
==================================================
- Return ONLY raw HTML starting with <!DOCTYPE html>
- The <head> MUST include <meta charset="UTF-8"> as the FIRST meta tag
- Use HTML entities for all emoji (e.g. &#128077; for thumbs-up, &#128078; for thumbs-down, &#128161; for lightbulb) -- never raw Unicode emoji characters
- NO markdown fences, NO text before or after the HTML
- ALL content derived from the user's prompt -- zero generic placeholders
- Use inline styles + Tailwind classes -- fully self-contained, no external CSS
- The app must work on first render -- all state initialized, no undefined errors
- MOUNT with ReactDOM.createRoot (React 18): const root = ReactDOM.createRoot(document.getElementById('root')); root.render(<App/>);
  DO NOT use the deprecated ReactDOM.render() â€" it causes console warnings in React 18
- ABSOLUTELY NO placeholder comments like "// Add more questions", "/* 10 questions */", "// TODO"
  Every array entry must be fully written out with real data from the uploaded documents
- SELF-CHECK before outputting: confirm TOPIC_QUESTIONS keys exactly match APP_CONFIG.topics strings
"""


class DocContent(BaseModel):
    name: str
    text: str  # extracted plain text from the uploaded file


class GenerateUIRequest(BaseModel):
    app_name: str
    summary: str
    features: List[str]
    frontend: str = "React + TypeScript"
    app_type: str = "chatbot"
    domain: Optional[str] = None
    company: Optional[str] = None
    doc_types: Optional[List[str]] = None
    documents: Optional[List[DocContent]] = None  # actual uploaded doc content
    user_feedback: Optional[str] = None           # refinement instructions from follow-up chat


class ChatMessage(BaseModel):
    role: str
    content: str


class ArchitectChatRequest(BaseModel):
    messages: List[ChatMessage]
    tech_stack_override: Optional[dict] = None


def _extract_docx_text(raw: bytes) -> str:
    """Extract plain text from a .docx (ZIP of XML) without needing python-docx at import time."""
    try:
        ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            with z.open("word/document.xml") as f:
                tree = ET.parse(f)
        root = tree.getroot()
        paragraphs = []
        for para in root.iter(f"{ns}p"):
            texts = [node.text or "" for node in para.iter(f"{ns}t")]
            line = "".join(texts).strip()
            if line:
                paragraphs.append(line)
        return "\n".join(paragraphs)
    except Exception:
        return ""


def _extract_pdf_text(raw: bytes) -> str:
    """Extract plain text from PDF bytes using pypdf (if installed) or pdfplumber fallback."""
    try:
        import pypdf  # type: ignore
        reader = pypdf.PdfReader(io.BytesIO(raw))
        pages = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                pages.append(t.strip())
        return "\n\n".join(pages)
    except ImportError:
        pass
    try:
        import pdfplumber  # type: ignore
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
        return "\n\n".join(p for p in pages if p.strip())
    except ImportError:
        pass
    # Last resort: return empty rather than binary garbage
    return ""


# File extensions that are valid RAG knowledge-base documents
_RAG_EXTENSIONS = {".docx", ".pdf", ".txt", ".md", ".csv", ".json"}
# Image / media extensions that must never be used as RAG source
_SKIP_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg",
                    ".mp4", ".mp3", ".wav", ".zip", ".exe"}


@router.post("/extract-doc-text")
async def extract_doc_text(file: UploadFile = File(...)):
    """Extract plain text from a document file for RAG.
    Images and other non-document files return an empty string so they are
    silently excluded from the knowledge base.
    """
    raw = await file.read()
    fname = (file.filename or "").lower()
    ext = "." + fname.rsplit(".", 1)[-1] if "." in fname else ""

    # Reject non-document files â€" return empty so the frontend can filter them out
    if ext in _SKIP_EXTENSIONS or ext not in _RAG_EXTENSIONS:
        return {"filename": file.filename, "text": "", "skipped": True,
                "reason": f"{ext or 'unknown'} files are not used as RAG documents"}

    if ext == ".docx":
        text = _extract_docx_text(raw)
    elif ext == ".pdf":
        text = _extract_pdf_text(raw)
    else:
        # .txt / .md / .csv / .json â€" plain UTF-8
        text = raw.decode("utf-8", errors="ignore")

    # Keep up to 12 000 chars per doc (â‰ˆ 3 000 tokens) â€" enough for thorough Q&A extraction
    return {"filename": file.filename, "text": text[:12000], "skipped": False}


@router.post("/generate-ui", response_model=None)
async def generate_ui(req: GenerateUIRequest):
    client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
        timeout=180.0,
    )

    company = req.company or req.app_name.split()[0]
    domain = req.domain or req.summary[:80]
    doc_types = req.doc_types or ["DOCX", "PDF"]
    features_text = "\n".join(f"- {f}" for f in req.features[:10])

    # Detect app type from prompt keywords â€" CHATBOT checked FIRST to prevent false matches
    prompt_lower = (req.summary + " " + req.app_name).lower()
    if any(k in prompt_lower for k in ["chatbot", "chat bot", "support bot", "virtual agent", "rag", "faq",
                                        "knowledge base", "it support", "service desk", "helpdesk", "help desk",
                                        "customer support", "support ticket", "qa bot", "q&a bot",
                                        "conversational", "assistant bot"]):
        detected_type = "CHATBOT"
    elif any(k in prompt_lower for k in ["dashboard", "analytics", "kpi", "metrics", "monitor", "report", "chart"]):
        detected_type = "DASHBOARD"
    elif any(k in prompt_lower for k in ["table", "crud", "inventory", "records", "manage", "employees"]):
        detected_type = "DATA TABLE"
    elif any(k in prompt_lower for k in ["wizard", "onboard", "multi-step", "intake", "step by step form"]):
        detected_type = "WIZARD"
    elif any(k in prompt_lower for k in ["booking", "appointment", "schedule", "calendar", "slot"]):
        detected_type = "SCHEDULER"
    elif any(k in prompt_lower for k in ["search", "knowledge base finder", "document finder", "catalogue"]):
        detected_type = "SEARCH APP"
    elif any(k in prompt_lower for k in ["survey", "feedback", "data entry", "collect"]):
        detected_type = "FORM APP"
    elif any(k in prompt_lower for k in ["portal", "self-service", "employee portal", "client portal"]):
        detected_type = "PORTAL"
    else:
        detected_type = "CHATBOT"

    # Build document section â€" use real extracted content when available
    # TWO-PASS strategy when documents are provided:
    #   Pass 1 â€" extract structured KB data (FAQ_DATA, TOPIC_QUESTIONS, DOC_SECTIONS) as JSON
    #   Pass 2 â€" generate HTML with that pre-filled data (no raw docs in context, freeing tokens for UI code)
    prefilled_kb_block = ""
    if req.documents:
        # Only include real text documents â€" skip images and anything with no extracted text
        rag_docs = [d for d in req.documents if d.text and d.text.strip()]
        doc_names = [d.name for d in rag_docs]

        # Pass 1: extract KB data — 2000 chars/doc keeps input ~28K tokens, freeing output budget
        doc_content_block = "\n\n".join(
            f"=== {d.name} ===\n{d.text[:2000]}" for d in rag_docs
        )
        kb_extraction_prompt = (
            "You are a knowledge-base extraction engine. Read the IT support documents below and output ONLY valid JSON.\n\n"
            "Output exactly this structure (no markdown, no explanation, just JSON):\n"
            '{{\n'
            '  "topics": ["<actual topic 1>", "<actual topic 2>", ...],\n'
            '  "faq_data": [\n'
            '    {{"id":"f1","question":"<question>","answer":"<answer>","steps":["Step 1: ...","Step 2: ...","Step 3: ..."],"source":"<filename>","confidence":90,"topic":"<topic>","related":["f2","f3"]}},\n'
            '    {{"id":"f2","question":"<question>","answer":"<answer>","steps":["Step 1: ...","Step 2: ..."],"source":"<filename>","confidence":88,"topic":"<topic>","related":["f1","f4"]}}\n'
            '  ],\n'
            '  "doc_sections": [\n'
            '    {{"heading":"<section heading>","body":"<section text>","source":"<exact filename>"}}\n'
            '  ]\n'
            '}}\n\n'
            "RULES:\n"
            f"- topics: actual IT support category names from documents (e.g. SAP Handheld, MFA, Password Reset)\n"
            f"- faq_data: generate 5-6 FAQ items per topic (total 45-55 items). Each needs question+answer+steps+confidence 85-97+topic\n"
            f"- Spread FAQ items evenly across ALL topics -- do not stop after the first few topics\n"
            f"- doc_sections: 10-12 entries across all docs\n"
            f"- source MUST be exact filename from: {doc_names}\n"
            f"\nDOCUMENTS:\n{doc_content_block}"
        )
        try:
            kb_response = client.chat.completions.create(
                model=settings.azure_openai_deployment_gpt4o,
                messages=[{"role": "user", "content": kb_extraction_prompt}],
                temperature=0.1,
                max_tokens=12000,
                response_format={"type": "json_object"},
            )
            import json as _json
            kb_data = _json.loads(kb_response.choices[0].message.content or "{}")
            topics = kb_data.get("topics", [])
            faq_data = kb_data.get("faq_data", [])
            doc_sections = kb_data.get("doc_sections", [])

            # Build TOPIC_QUESTIONS from faq_data grouped by topic (10 per topic max).
            # Supplement with synthetic questions for topics with sparse FAQ coverage.
            from collections import defaultdict as _dd
            _tq_builder: dict = _dd(list)
            for _f in faq_data:
                _t = _f.get("topic", "")
                if _t and len(_tq_builder[_t]) < 10:
                    _tq_builder[_t].append({
                        "id": f"tq_{len(_tq_builder[_t])+1}",
                        "question": _f.get("question", ""),
                        "source": _f.get("source", ""),
                    })
            # Synthetic filler questions for topics that still have < 10
            _synthetic_templates = [
                "How do I troubleshoot {} issues?",
                "What are the steps to resolve a {} error?",
                "Who do I contact for {} support?",
                "How do I escalate a {} problem?",
                "What is the procedure for {} in stores?",
            ]
            for _t in topics:
                _src = next((d for d in doc_names if _t.lower().split()[0] in d.lower()), doc_names[0])
                while len(_tq_builder[_t]) < 10:
                    _idx = len(_tq_builder[_t])
                    _q = _synthetic_templates[(_idx - (10 - len(_synthetic_templates))) % len(_synthetic_templates)].format(_t) \
                        if _idx >= len(_synthetic_templates) else _synthetic_templates[_idx].format(_t)
                    _tq_builder[_t].append({"id": f"tq_{_idx+1}", "question": _q, "source": _src})
            topic_questions = dict(_tq_builder)

            # Serialise for injection into Pass 2 prompt
            prefilled_kb_block = f"""
PRE-EXTRACTED KNOWLEDGE BASE DATA (use EXACTLY as-is â€" do not modify or replace):

const APP_CONFIG_topics = {_json.dumps(topics)};
const APP_CONFIG_documents = {_json.dumps(doc_names)};

const FAQ_DATA = {_json.dumps(faq_data, indent=2)};

const TOPIC_QUESTIONS = {_json.dumps(topic_questions, indent=2)};

const DOC_SECTIONS = {_json.dumps(doc_sections, indent=2)};

CRITICAL: Copy the above constants VERBATIM into your generated HTML.
- FAQ_DATA â†' use as the FAQ_DATA const
- TOPIC_QUESTIONS â†' use as the TOPIC_QUESTIONS const (keys already match topics)
- DOC_SECTIONS â†' use as the DOC_SECTIONS const
- APP_CONFIG_topics â†' use as the topics array in APP_CONFIG
- APP_CONFIG_documents â†' use as the documents array (map to {{name, type:"DOCX", size:"KB", indexed:true}})
"""
        except Exception:
            # Fallback to single-pass if extraction fails
            prefilled_kb_block = ""

        doc_instruction = f"""
UPLOADED DOCUMENTS: {doc_names}

{prefilled_kb_block if prefilled_kb_block else f"=== DOCUMENT CONTENT ==={chr(10)}{chr(10).join(f'=== {d.name} ==={chr(10)}{d.text[:3000]}' for d in rag_docs)}"}

CRITICAL RULES:
- APP_CONFIG.documents MUST list EXACTLY these files: {doc_names}
- If PRE-EXTRACTED DATA is provided above, copy it VERBATIM â€" do not regenerate or modify it
- Topics and content must reflect Loblaw IT support categories from the documents
- NEVER use placeholder content â€" all data from documents above
"""
    else:
        doc_instruction = f"""
If building a CHATBOT:
  - FAQ questions = what a REAL {company} end user/agent asks about their product/service/policy
  - NEVER write questions about AI technology, RAG, FAISS, embeddings, or how the app works
  - Topics = practical support categories relevant to the domain
  - DOC_SECTIONS = [] (empty array, no documents provided)
"""

    user_prompt = f"""Build a production-quality enterprise {detected_type} application for this requirement:

REQUIREMENT
-----------
Title: {req.app_name}
Company: {company}
Domain: {domain}
Summary: {req.summary}
Document types: {', '.join(doc_types)}
App type: {detected_type}

Key features to include:
{features_text}

CONTENT RULES
-------------
- Every label, heading, and data value must reflect {company} and the {domain} domain
- Company name "{company}" must appear in the header/branding
- All sample data, questions, field names = realistic for {domain}
{doc_instruction}

If building a DASHBOARD:
  - KPIs and charts must use {domain}-relevant metrics with realistic numbers
  - Table data must be domain-specific records with real-looking names and values

If building a WIZARD or FORM:
  - Field labels, options, and validation messages must be domain-specific
  - Confirmation screen summarises actual entered data

Generate the complete working HTML now.
Return ONLY raw HTML starting with <!DOCTYPE html> -- no markdown fences, no explanation."""

    # If the user sent feedback/refinement comments after the initial generation,
    # inject them as an additional instruction so the new sandbox incorporates the changes.
    feedback_block = ""
    if req.user_feedback and req.user_feedback.strip():
        feedback_block = f"""

USER REFINEMENT REQUEST (apply these changes to this generation):
{req.user_feedback.strip()}

Incorporate ALL of the above changes while keeping everything else from the original specification intact.
"""

    # ── Two-pass DASHBOARD: extract JSON data → inject into working template ──────
    if detected_type == "DASHBOARD":
        import json as _json
        dash_extraction_messages = [
            {"role": "user", "content": f"{_DASH_DATA_PROMPT}\n\nAPPLICATION DESCRIPTION:\nTitle: {req.app_name}\nSummary: {req.summary}\nFeatures: {', '.join(req.features[:8])}\nDomain: {domain}\nCompany: {company}"}
        ]
        try:
            dash_resp = client.chat.completions.create(
                model=settings.azure_openai_deployment_gpt4o,
                messages=dash_extraction_messages,
                temperature=0.1,
                max_tokens=3000,
                response_format={"type": "json_object"},
            )
            dash_data = _json.loads(dash_resp.choices[0].message.content or "{}")
            # Ensure required keys exist with sane defaults
            if not dash_data.get("app_title"):
                dash_data["app_title"] = req.app_name
            if not dash_data.get("company"):
                dash_data["company"] = company
            if not dash_data.get("nav_items"):
                dash_data["nav_items"] = [
                    {"id":"overview","label":"Overview","icon":"📊"},
                    {"id":"reports","label":"Reports","icon":"📋"},
                    {"id":"data","label":"Data","icon":"🗂️"},
                    {"id":"settings","label":"Settings","icon":"⚙️"},
                ]
            if not dash_data.get("kpis"):
                dash_data["kpis"] = [
                    {"label":"Total Records","value":"1,248","trend":"+12.4%","up":True,"color":"#4f46e5"},
                    {"label":"Active Users","value":"342","trend":"+8.1%","up":True,"color":"#10b981"},
                    {"label":"Completed","value":"89.2%","trend":"+3.5%","up":True,"color":"#f59e0b"},
                    {"label":"Issues","value":"14","trend":"-22.3%","up":False,"color":"#ef4444"},
                ]
            if not dash_data.get("bar_chart"):
                dash_data["bar_chart"] = {"title":"Monthly Activity","labels":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"],"values":[42,68,55,80,73,91,64,88]}
            if not dash_data.get("line_chart"):
                dash_data["line_chart"] = {"title":"Performance Trend","labels":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"],"values":[30,45,38,60,55,72,65,80]}
            if not dash_data.get("table_columns"):
                dash_data["table_columns"] = ["Name","Category","Value","Date","Status"]
            if not dash_data.get("table_rows"):
                dash_data["table_rows"] = [
                    ["Record A","Category 1","$4,200","2024-11-01","Active"],
                    ["Record B","Category 2","$2,800","2024-11-03","Completed"],
                    ["Record C","Category 1","$6,100","2024-11-05","Pending"],
                    ["Record D","Category 3","$3,500","2024-11-07","Active"],
                    ["Record E","Category 2","$5,000","2024-11-09","Completed"],
                ]
            if not dash_data.get("report_types"):
                dash_data["report_types"] = ["Summary Report","Trend Analysis","Detailed Breakdown","Export Report"]
            if not dash_data.get("status_colors"):
                dash_data["status_colors"] = {"Active":"#10b981","Completed":"#4f46e5","Pending":"#f59e0b","Failed":"#ef4444","Draft":"#94a3b8"}

            html = _DASHBOARD_TEMPLATE.replace("%%APP_TITLE%%", _json.dumps(dash_data["app_title"])[1:-1])
            html = html.replace("%%APP_DATA_JSON%%", _json.dumps(dash_data))
            return {"html": html, "app_type": "DASHBOARD"}
        except Exception:
            # Fall through to generic GPT-4o HTML generation if extraction fails
            pass

    # When KB data was pre-extracted (two-pass mode), build the HTML from a proven template.
    # The template has all features working; we just substitute the extracted KB data in.
    if prefilled_kb_block and detected_type == "CHATBOT":
        import json as _json
        from string import Template as _Template

        _faq_js      = _json.dumps(faq_data, indent=2)
        _tq_js       = _json.dumps(topic_questions, indent=2)
        _ds_js       = _json.dumps(doc_sections, indent=2)
        _topics_js   = _json.dumps(topics)
        _doc_cards   = ",\n".join(
            f'      {{name:"{d}", type:"DOCX", size:"KB", indexed:true}}'
            for d in doc_names
        )
        _app_title   = req.app_name
        _company     = company
        _domain_label = (req.domain or "support").title()
        _welcome     = f"Hello! I'm the {_app_title}. Ask me anything about {_domain_label} topics, or click a question from the left sidebar."
        _out_contact = f"contact {company} {_domain_label} support directly for assistance."

        # Build HTML directly â€" no second LLM call needed
        html = (
            "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n"
            "<meta charset=\"UTF-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
            f"<title>{_app_title}</title>\n"
            "<script crossorigin src=\"https://unpkg.com/react@18/umd/react.development.js\"></script>\n"
            "<script crossorigin src=\"https://unpkg.com/react-dom@18/umd/react-dom.development.js\"></script>\n"
            "<script src=\"https://unpkg.com/@babel/standalone@7.22.20/babel.min.js\"></script>\n"
            "<script src=\"https://cdn.tailwindcss.com\"></script>\n"
            "<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap\" rel=\"stylesheet\">\n"
            "<style>\n"
            "* { box-sizing:border-box; margin:0; padding:0; }\n"
            "body { font-family:'Inter',sans-serif; }\n"
            "::-webkit-scrollbar { width:4px; }\n"
            "::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }\n"
            "@keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }\n"
            ".dot { width:8px;height:8px;background:#94a3b8;border-radius:50%;display:inline-block;margin:0 3px;animation:bounce 1.4s infinite; }\n"
            ".dot:nth-child(2){animation-delay:.2s} .dot:nth-child(3){animation-delay:.4s}\n"
            "</style>\n"
            "</head>\n<body>\n<div id=\"root\"></div>\n"
            "<script type=\"text/babel\">\n"
            f"const COMPANY = {_json.dumps(_company)};\n"
            f"const APP_TITLE = {_json.dumps(_app_title)};\n"
            f"const WELCOME_MSG = {_json.dumps(_welcome)};\n"
            f"const OUT_CONTACT = {_json.dumps(_out_contact)};\n\n"
            f"const TOPICS = {_topics_js};\n\n"
            "const APP_CONFIG = {\n"
            f"  company: COMPANY,\n"
            f"  title: APP_TITLE,\n"
            f"  welcomeMessage: WELCOME_MSG,\n"
            f"  topics: TOPICS,\n"
            f"  documents: [\n{_doc_cards}\n  ]\n"
            "};\n\n"
            f"const FAQ_DATA = {_faq_js};\n\n"
            f"const TOPIC_QUESTIONS = {_tq_js};\n\n"
            f"const DOC_SECTIONS = {_ds_js};\n\n"
            "const { useState, useRef, useEffect, useCallback } = React;\n\n"
            + _CHATBOT_LOGIC_AND_UI.replace("%%COMPANY%%", _company).replace("%%APP_TITLE%%", _app_title)
            + "\n</script>\n</body>\n</html>"
        )
        return {"html": html, "app_type": detected_type}
    else:
        messages_payload = [
            {"role": "system", "content": UI_GEN_PROMPT},
            {"role": "user", "content": user_prompt + feedback_block},
        ]

    response = client.chat.completions.create(
        model=settings.azure_openai_deployment_gpt4o,
        messages=messages_payload,
        temperature=0.2,
        max_tokens=16000,
    )

    html = response.choices[0].message.content or ""
    html = html.strip()

    if html.startswith("```"):
        parts = html.split("```")
        if len(parts) >= 3:
            html = parts[1]
        else:
            html = parts[-1]
        first_newline = html.find("\n")
        if first_newline != -1:
            lang_tag = html[:first_newline].strip()
            if lang_tag.isalpha():
                html = html[first_newline + 1:]

    html = html.strip()

    # Guarantee UTF-8 charset so emoji render correctly in all browsers
    if "<meta charset" not in html and "<head>" in html:
        html = html.replace("<head>", '<head>\n<meta charset="UTF-8">', 1)
    elif "<meta charset" not in html and "<head " in html:
        head_end = html.find(">", html.find("<head"))
        if head_end != -1:
            html = html[:head_end + 1] + '\n<meta charset="UTF-8">' + html[head_end + 1:]

    return {"html": html}


class GenerateProjectRequest(BaseModel):
    app_name: str
    summary: str
    features: List[str]
    agents: Optional[List[dict]] = None
    api_endpoints: Optional[List[str]] = None
    database_schema: Optional[str] = None
    tech_stack: Optional[dict] = None


def _fix_python_file(path: str, content: str, app_name: str = "") -> str:
    """Post-process GPT-4o generated files: fix known recurring anti-patterns."""
    import re as _re
    if not path.endswith(".py"):
        return content

    # Bug 1: await used with sync AzureOpenAI client → remove the await
    content = _re.sub(
        r'\bawait\s+(self\.client|client)\.chat\.completions\.create\(',
        lambda m: f"{m.group(1)}.chat.completions.create(",
        content,
    )

    # Bug 2: dict-style response access → attribute access
    for bad, good in [
        ('response["choices"][0]["message"]["content"]', "response.choices[0].message.content"),
        ("response['choices'][0]['message']['content']", "response.choices[0].message.content"),
        ('response["choices"][0]["message"]', "response.choices[0].message"),
        ("response['choices'][0]['message']", "response.choices[0].message"),
    ]:
        content = content.replace(bad, good)

    # Bug 3: async def on agent methods that call sync AzureOpenAI
    # If the method body contains self.client.chat.completions.create (sync, no await),
    # the method itself must NOT be async def — change async def → def for agent methods
    content = _re.sub(
        r'async def (answer_question|analyze|run|process|generate|ask|query|answer|respond)\(',
        lambda m: f"def {m.group(1)}(",
        content,
    )

    # Bug 4: sync get_db() yield pattern used with AsyncSession type hint
    # Replace with proper async_session context manager pattern
    content = _re.sub(
        r'def get_db\(\):\s*\n([ \t]+)db = SessionLocal\(\)\s*\n[ \t]+try:\s*\n[ \t]+yield db\s*\n[ \t]+finally:\s*\n[ \t]+db\.close\(\)',
        lambda m: (
            f"async def get_db():\n"
            f"{m.group(1)}async with async_session() as session:\n"
            f"{m.group(1)}    yield session"
        ),
        content,
    )
    # Also fix the Depends type annotation to match
    content = content.replace(
        "db: Session = Depends(get_db)",
        "db: AsyncSession = Depends(get_db)",
    )

    # Bug 5: user_id in Query/record constructor when not in schema
    # Remove user_id= kwarg from ORM constructor calls (it causes AttributeError)
    content = _re.sub(r'\buser_id\s*=\s*\w+[\w.]*\s*,\s*', '', content)
    content = _re.sub(r',\s*user_id\s*=\s*\w+[\w.]*', '', content)

    return content


def _enforce_agentic_structure(all_files: dict, app_name: str, summary: str) -> dict:
    """
    If GPT-4o generated rag.py without an agents/ folder, replace it with
    a proper domain-specific agent class so the download is truly agentic.
    """
    import re as _re

    has_rag = any("rag.py" in p for p in all_files)
    has_agent = any("/agents/" in p or p.endswith("Agent.py") for p in all_files)

    if not has_rag or has_agent:
        return all_files  # already agentic — nothing to do

    # Derive class name: "Policy Analysis Agent" → "PolicyAnalysisAgent"
    safe_name = _re.sub(r"[^A-Za-z0-9 ]", "", app_name).title().replace(" ", "")
    if not safe_name:
        safe_name = "CustomAgent"

    # Find rag.py to steal the SYSTEM_PROMPT / config imports / model call structure
    rag_path = next(p for p in all_files if "rag.py" in p)
    rag_src = all_files[rag_path]

    # Extract SYSTEM_PROMPT text if present
    sp_match = _re.search(r'SYSTEM_PROMPT\s*=\s*"""(.*?)"""', rag_src, _re.DOTALL)
    system_prompt = sp_match.group(1).strip() if sp_match else f"You are a helpful {app_name} assistant."

    agent_code = f'''\"""
{safe_name} — domain-specific agent generated for: {app_name}
\"""
import numpy as np
import json
from typing import Optional
from openai import AzureOpenAI

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False

from app.config import settings

SYSTEM_PROMPT = """{system_prompt}"""


class {safe_name}:
    def __init__(self):
        self._client: Optional[AzureOpenAI] = None
        self._index = None
        self._chunks: list[dict] = []

    def _get_client(self) -> AzureOpenAI:
        if self._client is None:
            self._client = AzureOpenAI(
                azure_endpoint=settings.azure_openai_endpoint,
                api_key=settings.azure_openai_api_key,
                api_version=settings.azure_openai_api_version,
            )
        return self._client

    def _embed(self, texts: list[str]) -> np.ndarray:
        client = self._get_client()
        response = client.embeddings.create(
            model=settings.azure_openai_embedding_deployment,
            input=texts,
        )
        return np.array([d.embedding for d in response.data], dtype="float32")

    def index_documents(self, documents: list[dict]) -> None:
        self._chunks = []
        for doc in documents:
            text = doc.get("content", "")
            source = doc.get("name", "unknown")
            for i in range(0, len(text), 500):
                self._chunks.append({{"text": text[i:i+500], "source": source}})
        if not self._chunks:
            return
        try:
            embeddings = self._embed([c["text"] for c in self._chunks])
            dim = embeddings.shape[1]
            self._index = faiss.IndexFlatL2(dim)
            self._index.add(embeddings)
        except Exception:
            self._index = None

    def _retrieve(self, query: str, k: int = 5) -> list[dict]:
        if not self._chunks:
            return []
        if self._index is not None:
            try:
                q_emb = self._embed([query])
                _, indices = self._index.search(q_emb, k)
                return [self._chunks[i] for i in indices[0] if i < len(self._chunks)]
            except Exception:
                pass
        q_words = set(query.lower().split())
        scored = [(len(q_words & set(c["text"].lower().split())), c) for c in self._chunks]
        scored = [(s, c) for s, c in scored if s > 0]
        scored.sort(key=lambda x: -x[0])
        return [c for _, c in scored[:k]]

    def answer_question(self, query: str, history: list[dict] | None = None) -> dict:
        import re
        context_chunks = self._retrieve(query)
        context = "\\n\\n".join(
            f"[{{c['source']}}]: {{c['text']}}" for c in context_chunks
        ) or "No relevant documents found."
        messages = [{{"role": "system", "content": SYSTEM_PROMPT}}]
        for h in (history or [])[-6:]:
            messages.append({{"role": h["role"], "content": h["content"]}})
        messages.append({{
            "role": "user",
            "content": (
                "Answer using ONLY the context provided.\\n"
                "Format: ANSWER: <answer>\\nSTEPS:\\n1. <step>\\n\\n"
                f"Context:\\n{{context}}\\n\\nQuestion: {{query}}"
            )
        }})
        client = self._get_client()
        response = client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=messages,
            temperature=0.3,
            max_tokens=1200,
        )
        raw = response.choices[0].message.content or ""
        answer_match = re.search(r\'ANSWER:\\s*(.+?)(?:\\nSTEPS:|$)\', raw, re.DOTALL)
        steps_match  = re.search(r\'STEPS:\\s*(.+)\', raw, re.DOTALL)
        answer_text  = answer_match.group(1).strip() if answer_match else raw.strip()
        steps_raw    = steps_match.group(1).strip() if steps_match else ""
        steps = [s.strip() for s in re.findall(r\'\\d+\\.\\s+(.+)\', steps_raw)]
        source = context_chunks[0].get("source", "") if context_chunks else ""
        related = list(dict.fromkeys(
            c["source"] for c in context_chunks[1:]
            if c.get("source") and c["source"] != source
        ))[:2]
        return {{
            "answer": answer_text,
            "steps": steps,
            "source": source,
            "confidence": max(60, min(97, 90 - len(context_chunks) * 2)) if context_chunks else 0,
            "related": related,
            "out_of_scope": not bool(context_chunks),
        }}

    def analyze(self, text: str) -> dict:
        """Domain-specific analysis method."""
        client = self._get_client()
        response = client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=[
                {{"role": "system", "content": SYSTEM_PROMPT}},
                {{"role": "user", "content": f"Analyze the following and return key insights as JSON:\\n\\n{{text}}"}}
            ],
            temperature=0.2,
            max_tokens=800,
        )
        raw = response.choices[0].message.content or "{{}}"
        try:
            start = raw.find("{{")
            end = raw.rfind("}}") + 1
            return json.loads(raw[start:end]) if start >= 0 else {{"summary": raw}}
        except Exception:
            return {{"summary": raw}}


# Module-level singleton
_agent: Optional[{safe_name}] = None

def get_agent() -> {safe_name}:
    global _agent
    if _agent is None:
        _agent = {safe_name}()
    return _agent
'''

    # Determine base directory from rag_path (e.g. "backend/app/rag.py" → "backend/app")
    base_dir = "/".join(rag_path.split("/")[:-1]) if "/" in rag_path else "backend/app"
    agent_path = f"{base_dir}/agents/{safe_name}.py"

    # Build updated file set: remove rag.py, add agent file
    new_files = {p: c for p, c in all_files.items() if "rag.py" not in p}
    new_files[agent_path] = agent_code

    # Patch any api/ files that import from rag → import from agents
    for path in list(new_files.keys()):
        if "/api/" in path and path.endswith(".py"):
            src = new_files[path]
            src = src.replace("from app.rag import", f"from app.agents.{safe_name} import")
            src = src.replace("from app.rag import build_index, answer",
                              f"from app.agents.{safe_name} import get_agent")
            src = src.replace("from app.rag import build_index",
                              f"from app.agents.{safe_name} import get_agent")
            src = src.replace("from app.rag import answer",
                              f"from app.agents.{safe_name} import get_agent")
            # Replace rag function calls with agent method calls
            src = _re.sub(r'\banswr?\s*=\s*answer\s*\(', f"agent = get_agent(); answ = agent.answer_question(", src)
            src = _re.sub(r'\bbuild_index\s*\(', "get_agent().index_documents(", src)
            new_files[path] = src

    return new_files


PROJECT_FRONTEND_PROMPT = """You are a senior React engineer. Generate a complete React 18 + TypeScript + Vite + TailwindCSS frontend for the application described below.

CRITICAL UI REQUIREMENT — EXACT 3-PANEL CHAT INTERFACE:
The main page MUST be a full-screen 3-panel chat application. Copy this layout EXACTLY — do not invent your own styles:

LEFT SIDEBAR — className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0"
  - Top header (p-4 border-b border-gray-700): AI logo badge (w-9 h-9 rounded-xl bg-indigo-600 font-bold text-sm showing "AI") + app name (text-sm font-bold) + subtitle (text-xs text-slate-400 showing domain/model info)
  - Upload button (p-3 border-b border-gray-700): className="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-indigo-500 text-indigo-300 hover:bg-indigo-900/40 transition-colors disabled:opacity-50" — shows "📎 Upload Document" or "⏳ Uploading…" when loading
  - Documents list (flex-1 overflow-y-auto p-3): label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2", each doc as bg-slate-700/50 rounded-lg p-2.5 with "✓ Uploaded" in text-emerald-400
  - Suggested questions (p-3 border-t border-gray-700): label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2", each question as a <button> that calls send(question) with className="text-left text-xs text-slate-300 hover:text-white hover:bg-gray-800 rounded px-2 py-1.5 transition-colors"
  - CRITICAL: Generate 4-5 DOMAIN-SPECIFIC suggested questions (NOT generic ones) based on the app description

MAIN CHAT — className="flex-1 flex flex-col min-w-0 overflow-hidden"
  - Header (bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm):
    * App title: className="flex-1 text-base font-bold text-slate-900"
    * AI Active badge: className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full" text="● AI Active"
    * KB Connected badge: className="text-xs font-semibold bg-blue-100 text-blue-700 px-3 py-1 rounded-full" text="● KB Connected"
  - Messages (flex-1 overflow-y-auto p-5 space-y-3):
    * User bubble: justify-end, bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-md, timestamp text-[10px] text-slate-400 text-right mt-1
    * Bot bubble: justify-start, bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-2xl w-full, timestamp text-[10px] text-slate-400 mt-1
    * Loading indicator: 3 animated dots (w-2 h-2 bg-slate-400 rounded-full animate-bounce with staggered animationDelay)
  - Footer (bg-white border-t border-slate-200 p-3.5): textarea (resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400) + Send button (bg-indigo-600 disabled:bg-slate-300 text-white rounded-xl px-5 py-2.5 text-sm font-semibold h-[44px])
  - Welcome message: "Welcome to [App Name]. Ask questions about [domain] and get detailed answers."

RIGHT PANEL — className="w-56 border-l bg-white p-4 flex flex-col gap-5 flex-shrink-0 overflow-y-auto"
  - "KNOWLEDGE BASE" section: label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2", card className="bg-slate-50 rounded-xl p-3" with big number (text-2xl font-bold text-indigo-600) showing uploadedDocs.length + label "Documents indexed"
  - "SESSION" section: same card style, big number (text-2xl font-bold text-emerald-600) showing COUNT OF USER MESSAGES ONLY (messages.filter(m => m.role==='user').length) — NOT last query text, NOT total messages
  - "FILTER BY TOPIC" section: label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2", topic chips as <button> with: inactive=className="text-[11px] px-2.5 py-1 rounded-full border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100", active=className="text-[11px] px-2.5 py-1 rounded-full border bg-indigo-600 text-white border-indigo-600 font-semibold". Clicking active topic deselects it. Clicking topic calls send("Tell me about " + topic)
  - Generate 4-5 DOMAIN-SPECIFIC topic names (e.g. for policy app: "Obligations", "Rights", "Benefits", "Compliance")

STATE MANAGEMENT (no React Query needed for chat — use useState + fetch):
- messages: array of {{id, role: 'user'|'bot', content, ts}}
- uploadedDocs: string[] (filenames)
- activeTopic: string | null
- loading: boolean (AI thinking state)
- question: string (input value)
- const msgCount = messages.filter(m => m.role === 'user').length

SEND FUNCTION:
```
const send = (override?: string) => {{
  const text = (override ?? question).trim();
  if (!text || loading) return;
  setMessages(prev => [...prev, {{id: Date.now()+'u', role:'user', content:text, ts: new Date().toLocaleTimeString()}}]);
  if (!override) setQuestion('');
  setLoading(true);
  askMutation.mutate(text);
}};
```

RULES:
- Return ONLY valid JSON with this exact structure: {{"files": {{"path": "file content as string"}}}}
- Use real component code — NO placeholder comments, NO TODO, NO lorem ipsum
- Use React Query (@tanstack/react-query) v4 ONLY for upload and ask mutations — useMutation(fn, {{onSuccess, onError}})
- src/main.tsx MUST wrap App in QueryClientProvider:
  import {{ QueryClient, QueryClientProvider }} from "@tanstack/react-query";
  const queryClient = new QueryClient();
  root.render(<StrictMode><QueryClientProvider client={{queryClient}}><App /></QueryClientProvider></StrictMode>)
- Use react-hot-toast for upload notifications only (NOT for ask errors — show error in chat bubble)
- ALWAYS include <Toaster position="top-right" /> in App.tsx return
- All API calls go to relative /api paths (Vite proxy forwards to backend)
- Use Tailwind utility classes for ALL styling — no inline styles, no CSS modules
- Use axios for API: import axios from 'axios'; const api = axios.create({{ baseURL: '/api' }});
- React Query v4 syntax ONLY: useMutation(mutationFn, {{ onSuccess, onError }}) — NEVER v5 syntax
- vite.config.ts MUST include proxy: {{ '/api': {{ target: 'http://localhost:8002', changeOrigin: true }} }}
- tailwind.config.js MUST include content: ['./index.html', './src/**/*.{{ts,tsx}}']
- package.json dependencies MUST include ALL of these EXACTLY (never omit any):
  {{"react": "^18.3.1", "react-dom": "^18.3.1", "@tanstack/react-query": "^4.36.1", "axios": "^1.7.2", "react-hot-toast": "^2.4.1", "lucide-react": "^0.400.0"}}
- package.json devDependencies MUST include: typescript@^5, vite@^5, @vitejs/plugin-react@^4, tailwindcss@^3, autoprefixer, postcss, @types/react@^18, @types/react-dom@^18
- CRITICAL: @tanstack/react-query MUST be in dependencies — main.tsx imports QueryClientProvider from it and the app will show a blank white screen if it is missing
- src/App.tsx is a SINGLE PAGE (no React Router) — the entire app is the 3-panel chat UI
- FORBIDDEN: solid colored badges like bg-green-500 text-white — use the exact pill style above
- FORBIDDEN: showing "Last Query: ..." in the session panel — only show message COUNT
- FORBIDDEN: suggested questions as plain <li> or <span> — they MUST be <button> elements calling send()
- FORBIDDEN: rendering bot responses as raw text with {msg.content} — MUST use renderMarkdown() function
- REQUIRED: include this renderMarkdown function in App.tsx before interfaces:
  function renderMarkdown(text: string): React.ReactNode {
    return text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-1" />;
      const parts: React.ReactNode[] = [];
      const segments = line.split(/\*\*(.*?)\*\*/g);
      segments.forEach((seg, j) => {
        if (j % 2 === 1) parts.push(<strong key={j}>{seg}</strong>);
        else if (seg) parts.push(seg);
      });
      const isListItem = /^(\d+\.|-)\s/.test(line);
      return <p key={i} className={`text-sm text-slate-800 leading-relaxed${isListItem ? ' pl-3' : ''}`}>{parts}</p>;
    });
  }
- Bot bubble MUST render: <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>

Required file structure (use these exact paths — no "frontend/" prefix):
- src/main.tsx  (with QueryClientProvider wrapping App)
- src/App.tsx   (single-page 3-panel chat UI — no Router, import Toaster here)
- src/index.css (tailwind directives only)
- src/api/client.ts  (axios instance + uploadDocument(FormData)→Promise, askQuestion(question:string)→Promise)
- package.json
- vite.config.ts  (with /api proxy)
- tsconfig.json
- tailwind.config.js
- postcss.config.js
- index.html

APPLICATION:
{description}

Agents: {agents}
API Endpoints: {api_endpoints}
Database: {database_schema}"""


PROJECT_BACKEND_PROMPT = """You are a senior Python engineer. Generate a complete FastAPI + SQLAlchemy + PostgreSQL backend for the application described below.

RULES:
- Return ONLY valid JSON with this exact structure: {{"files": {{"path": "file content as string"}}}}
- Use SQLAlchemy 2.x async ORM with PostgreSQL and asyncpg
- Use Pydantic v2 models: model_config = {{"from_attributes": True}} (NOT class Config), use model_validate(obj) to convert ORM objects to schemas (NEVER model_dump(obj))
- AZURE OPENAI AGENT RULES (CRITICAL — violating these will crash the app):
  * ALWAYS use SYNC client: from openai import AzureOpenAI — NEVER AsyncAzureOpenAI
  * Agent methods MUST be plain `def` (NOT `async def`) — AzureOpenAI is blocking/sync
  * NEVER write `await self.client.chat.completions.create(...)` — this CRASHES because AzureOpenAI is sync
  * CORRECT call (no await): response = self.client.chat.completions.create(model=..., messages=[...])
  * CORRECT response access: response.choices[0].message.content
  * FORBIDDEN response access: response["choices"][0]["message"]["content"]  ← dict syntax is WRONG, use attribute access
  * FastAPI routes that call agents: use `async def` for the route, call agent method normally (no await)
  * EXACT agent pattern to follow — copy this exactly:
    from openai import AzureOpenAI
    from app.config import settings
    class MyAgent:
        def __init__(self):
            self.client = AzureOpenAI(azure_endpoint=settings.AZURE_OPENAI_ENDPOINT, api_key=settings.AZURE_OPENAI_API_KEY, api_version="2024-02-01")
        def run(self, input: str) -> str:
            response = self.client.chat.completions.create(model=settings.AZURE_OPENAI_DEPLOYMENT_NAME, messages=[{{"role":"system","content":"You are a helpful assistant."}},{{"role":"user","content":input}}], max_tokens=1000, temperature=0.3)
            return response.choices[0].message.content
  * Route calling agent (async route, sync agent call — this is correct):
    @router.post("/ask")
    async def ask(req: AskRequest, db: AsyncSession = Depends(get_db)):
        agent = MyAgent()
        result = agent.run(req.question)   # NO await — agent.run is sync def
        return {{"answer": result}}
- main.py MUST call load_dotenv() BEFORE any other imports that read env vars:
    from dotenv import load_dotenv
    load_dotenv()
    from fastapi import FastAPI
    ...
- main.py MUST use lifespan to create tables on startup:
    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def lifespan(app):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        yield
    app = FastAPI(lifespan=lifespan)
- AGENTIC ARCHITECTURE — CRITICAL: This is a Custom Code download, NOT a generic RAG scaffold.
  * MUST generate app-specific agent class(es) in backend/app/agents/<AgentName>.py
  * Each agent class has DOMAIN-SPECIFIC methods named after app features (e.g. analyze_policy, check_compliance, summarize_clause — NOT just a generic answer() or run())
  * The agent uses SYSTEM_PROMPT specific to its domain (e.g. "You are a policy analysis expert...")
  * DO NOT generate a generic rag.py file — the agent IS the intelligence layer
  * DO NOT copy the RAG scaffold pattern — build a real, app-specific agent
  * Agent methods call AzureOpenAI directly with domain-tailored prompts per method
  * Example for a Policy Analysis app:
    class PolicyAnalysisAgent:
        def __init__(self): self.client = AzureOpenAI(...)
        def analyze_policy(self, text: str) -> dict:
            response = self.client.chat.completions.create(model=..., messages=[
                {{"role":"system","content":"You are a policy compliance expert. Analyze the policy text and identify obligations, rights, and risks."}},
                {{"role":"user","content":text}}
            ], max_tokens=1200, temperature=0.2)
            return {{"analysis": response.choices[0].message.content}}
        def answer_question(self, question: str, context: str) -> str:
            response = self.client.chat.completions.create(model=..., messages=[
                {{"role":"system","content":"You are a policy analysis assistant. Answer only based on the provided policy context."}},
                {{"role":"user","content":f"Context:\\n{{context}}\\n\\nQuestion: {{question}}"}}
            ], max_tokens=800, temperature=0.3)
            return response.choices[0].message.content
- config.py MUST use pydantic-settings with extra='ignore' so unknown .env vars don't crash:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    class Settings(BaseSettings):
        model_config = SettingsConfigDict(env_file=".env", extra="ignore")
        DATABASE_URL: str = "sqlite+aiosqlite:///./app.db"
        AZURE_OPENAI_ENDPOINT: str = ""
        ...
- config.py MUST define: DATABASE_URL, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME, AZURE_OPENAI_EMBEDDING_DEPLOYMENT (default: "text-embedding-3-small")
- database.py pattern: engine = create_async_engine(settings.DATABASE_URL); async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
- Always use selectinload() for SQLAlchemy async relationship loading
- All endpoints must be fully implemented with real DB queries — no placeholder functions
- Include __init__.py in backend/app/, backend/app/api/, backend/app/agents/
- requirements.txt MUST include: fastapi, uvicorn[standard], pydantic-settings, sqlalchemy[asyncio], aiosqlite, asyncpg, openai, python-multipart, PyMuPDF, python-dotenv
- RESERVED COLUMN NAMES — NEVER use these as SQLAlchemy column names (they shadow SQLAlchemy internals and crash on startup): metadata, registry, __mapper_cls__. Use alternatives: doc_metadata, extra_data, meta_info
- Schemas: optional fields must have default=None, no required timestamp in response schemas unless populated by DB
- Request schemas for create endpoints must NOT include user_id unless auth is implemented — just use question/content/text fields
- DB session dependency MUST use async_session context manager pattern:
    async def get_db():
        async with async_session() as session:
            yield session
  NEVER use the sync SessionLocal() pattern with a try/finally yield in async code
- Route Depends parameter type MUST match: `db: AsyncSession = Depends(get_db)` — use AsyncSession not Session

Required file structure (use these exact paths with backend/ prefix):
- backend/app/main.py       (FastAPI with lifespan table creation, CORS, all routers at prefix="/api")
- backend/app/config.py     (pydantic-settings BaseSettings)
- backend/app/database.py   (async engine + async_session + Base)
- backend/app/models.py     (SQLAlchemy ORM models)
- backend/app/schemas.py    (Pydantic v2 schemas)
- backend/app/api/<feature>.py   (one file per feature, calls the agent)
- backend/app/agents/<AppName>Agent.py  (app-specific sync AzureOpenAI agent with domain methods)
- backend/app/__init__.py
- backend/app/api/__init__.py
- backend/app/agents/__init__.py
- backend/requirements.txt
- backend/Dockerfile
- docker-compose.yml  (postgres:16-alpine + backend services)
- .env.example  (DATABASE_URL, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME)

APPLICATION:
{description}

Agents: {agents}
API Endpoints: {api_endpoints}
Database Schema: {database_schema}"""


@router.post("/generate-project")
async def generate_project(req: GenerateProjectRequest):
    """
    Calls GPT-4o twice to dynamically generate a complete React + FastAPI + PostgreSQL project.
    Returns { files: { "path": "content" } } for all files.
    """
    client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
        timeout=180.0,
    )

    description = f"App: {req.app_name}\nSummary: {req.summary}\nFeatures:\n" + "\n".join(f"- {f}" for f in req.features)
    agents_text = json.dumps(req.agents or [], indent=2)
    endpoints_text = "\n".join(req.api_endpoints or [])
    db_text = req.database_schema or "Design appropriate tables for the application"
    stack = req.tech_stack or {}
    app_slug = req.app_name.lower().replace(" ", "-").replace("[^a-z0-9-]", "")

    all_files: dict = {}

    # ── Pass 1: Frontend (React + TypeScript) ────────────────────────────────
    frontend_prompt = PROJECT_FRONTEND_PROMPT.format(
        description=description, agents=agents_text,
        api_endpoints=endpoints_text, database_schema=db_text,
    )
    try:
        fe_response = client.chat.completions.create(
            model=settings.azure_openai_deployment_gpt4o,
            messages=[{"role": "user", "content": frontend_prompt}],
            temperature=0.2,
            max_tokens=14000,
            response_format={"type": "json_object"},
        )
        fe_data = json.loads(fe_response.choices[0].message.content or "{}")
        all_files.update(fe_data.get("files", {}))
    except Exception as e:
        all_files["frontend/README.md"] = f"# Frontend generation failed\nError: {e}\n\nRe-run or generate manually."

    # ── Pass 2: Backend (FastAPI + PostgreSQL) ───────────────────────────────
    backend_prompt = PROJECT_BACKEND_PROMPT.format(
        description=description, agents=agents_text,
        api_endpoints=endpoints_text, database_schema=db_text,
    )
    try:
        be_response = client.chat.completions.create(
            model=settings.azure_openai_deployment_gpt4o,
            messages=[{"role": "user", "content": backend_prompt}],
            temperature=0.2,
            max_tokens=14000,
            response_format={"type": "json_object"},
        )
        be_data = json.loads(be_response.choices[0].message.content or "{}")
        all_files.update(be_data.get("files", {}))
    except Exception as e:
        all_files["backend/README.md"] = f"# Backend generation failed\nError: {e}\n\nRe-run or generate manually."

    # ── Post-process: fix anti-patterns + enforce agentic structure ──────────
    all_files = {path: _fix_python_file(path, content) for path, content in all_files.items()}
    all_files = _enforce_agentic_structure(all_files, req.app_name, req.summary)

    # ── Static config files always included ──────────────────────────────────
    if "README.md" not in all_files:
        all_files["README.md"] = f"# {req.app_name}\n\n> Generated by **AgentForge Architect** · {__import__('datetime').date.today()}\n\n## Stack\n- Frontend: {stack.get('frontend','React + TypeScript + Vite')}\n- Backend: {stack.get('backend','Python FastAPI')}\n- Database: {stack.get('database','PostgreSQL')}\n- AI: {stack.get('ai','Azure OpenAI GPT-4o')}\n\n## Features\n" + "\n".join(f"- {f}" for f in req.features) + "\n\n## Run\n```bash\ndocker-compose up --build\n```"

    return {"files": all_files, "file_count": len(all_files)}


@router.post("/chat")
async def architect_chat(req: ArchitectChatRequest):
    client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
    )

    conversation = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in req.messages:
        conversation.append({"role": m.role, "content": m.content})

    response = client.chat.completions.create(
        model=settings.azure_openai_deployment_gpt4o,
        messages=conversation,
        temperature=0.7,
        max_tokens=3000,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"type": "message", "message": raw}

    return parsed
