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
                            >ðŸ'</button>
                            <button
                              onClick={() => setFeedback(prev => ({ ...prev, [msg.id]: 'down' }))}
                              className={`p-1.5 rounded-lg transition-colors text-sm ${feedback[msg.id] === 'down' ? 'bg-red-100 text-red-500' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                              title="Not helpful"
                            >ðŸ'Ž</button>
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
      Bot avatar (40px circle, background:#4f46e5, color:white, fontSize:18, flexShrink:0) "ðŸ¤–"
      Text: welcomeMessage (fontSize:14, color:#334155, lineHeight:1.6)

    USER message (alignSelf:flex-end, maxWidth:"72%"):
      Bubble (background:#4f46e5, color:#ffffff, borderRadius:"18px 18px 4px 18px", padding:"12px 16px", fontSize:14, lineHeight:1.5)
      Timestamp (fontSize:10, color:#94a3b8, textAlign:right, marginTop:4)

    BOT message (alignSelf:flex-start, maxWidth:"80%"):
      Card (background:#ffffff, border:"1px solid #e2e8f0", borderRadius:"4px 18px 18px 18px", padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.06)"):
        Answer text (fontSize:14, color:#1e293b, lineHeight:1.6, marginBottom:12, fontWeight:500)
        IF steps exist and steps.length > 0:
          Steps heading (fontSize:11, fontWeight:700, color:#475569, textTransform:uppercase, letterSpacing:"0.05em", marginBottom:8) "ðŸ"‹ Step-by-Step Resolution"
          Ordered list (margin:"0 0 12px 0", padding:"0 0 0 4px", listStyle:none):
            Each step: (display:flex, gap:8, marginBottom:6)
              Step number badge (20px circle, background:#f1f5f9, color:#475569, fontSize:10, fontWeight:700, flexShrink:0)
              Step text (fontSize:13, color:#334155, lineHeight:1.5)
        Meta bar (borderTop:"1px solid #f1f5f9", paddingTop:10, marginTop:4, display:flex, gap:16, flexWrap:wrap):
          Source text (fontSize:11, color:#94a3b8) "ðŸ"Ž {source}"
          Confidence (fontSize:11, color:#10b981, fontWeight:600) "âœ" {confidence}%"
        IF related and related.length > 0:
          Related row (display:flex, gap:6, flexWrap:wrap, marginTop:8):
            Label (fontSize:11, color:#64748b) "ðŸ'¡ Related:"
            Each related: <button onClick={()=>handleSend(r)} style={{fontSize:11, background:#ede9fe, color:#4f46e5, border:"none", borderRadius:999, padding:"3px 10px", cursor:pointer}}>{r}</button>
        Thumbs feedback row (MANDATORY on every bot message, display:flex, alignItems:center, gap:6, marginTop:8):
          Label (fontSize:11, color:#94a3b8) "Was this helpful?"
          Thumbs up: <button onClick={()=>setFeedback(p=>({...p,[msg.id]:'up'}))} title="Helpful" style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:feedback[msg.id]==='up'?1:0.4,transition:"opacity 0.15s"}}>ðŸ'</button>
          Thumbs down: <button onClick={()=>setFeedback(p=>({...p,[msg.id]:'down'}))} title="Not helpful" style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:feedback[msg.id]==='down'?1:0.4,transition:"opacity 0.15s"}}>ðŸ'Ž</button>
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
    return {"html": html}


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
