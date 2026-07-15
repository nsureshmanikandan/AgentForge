import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { architectApi } from "../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AQOption {
  id: string;
  text: string;
  options: string[];
}

interface AgentDef {
  name: string;
  role: string;
  tools: string[];
  model: string;
}

interface BuildPhase {
  phase: number;
  name: string;
  tasks: string[];
}

interface Plan {
  summary: string;
  architecture: string;
  tech_stack: { frontend: string; backend: string; database: string; ai: string; other?: string[] };
  agents: AgentDef[];
  features: string[];
  api_endpoints: string[];
  database_schema: string;
  deployment: string;
  phases: BuildPhase[];
}

interface ArchitectResponse {
  type: "questions" | "plan" | "message";
  message: string;
  questions?: AQOption[];
  plan?: Plan;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  response?: ArchitectResponse;
}

type PromptChangeType = "initial" | "suggest" | "feature" | "bugfix" | "enhance" | "refine";

interface PromptVersion {
  version: number;
  ts: number;
  changeType: PromptChangeType;
  userInput: string;           // raw user message that triggered this version
  enhancedPrompt: string;      // LLM-refined summary / plan summary at this point
  addedFeatures?: string[];    // features added in this version
  changeLabel: string;         // human-readable label e.g. "v1 · Initial prompt"
  changeSummary?: string;      // concise LLM-extracted summary of what changed
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  plan?: Plan;
  uiHtml?: string;
  documents?: { name: string; text: string }[];          // RAG knowledge-base sources (docx/pdf/txt)
  visualRefs?: { name: string; asSource: boolean }[];    // Images: default=visual ref, asSource=user promoted to source
  promptHistory?: PromptVersion[];                       // Tracked prompt evolution across all turns
  commits?: { sha: string; message: string; ts: number; planSnapshot: Plan; uiHtmlSnapshot?: string }[];
  ts: number;
}

type Mode = "build" | "suggest" | "features";
type RightTab = "plan" | "agents" | "app" | "database";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STARTERS = [
  "Build a customer support chatbot with RAG over our company knowledge base",
  "Create a multi-agent sales pipeline that qualifies leads and updates our CRM",
  "Build an HR onboarding app with document upload, tasks, and approvals",
  "Design an AI code review agent that integrates with GitHub PRs",
];

const MODE_LABELS: Record<Mode, string> = {
  build: "Build",
  suggest: "Suggest",
  features: "Add Features",
};

// Detects whether the user's message explicitly designates attached images as RAG/source files.
// Images are Visual References by default — only promoted to source when user says so explicitly.
const SOURCE_INTENT_RE = /\b(use (?:this|these|it|them) (?:as|for)|this is (?:the |a |my )?source|treat (?:this|these) as|add (?:this|these) to|source (?:document|file|reference)|rag (?:document|source|file)|knowledge.?base (?:document|source|file)|include (?:this|these) in (?:the )?(?:rag|kb|knowledge|source)|use (?:for|as) (?:rag|kb|knowledge base|source|prompt|idea))\b/i;

// ─── Sub-components ──────────────────────────────────────────────────────────

// ─── Right panel tabs ─────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: RightTab }) {
  const msgs: Record<RightTab, string> = {
    plan: "Your architecture plan will appear here after the Architect generates it.",
    agents: "Agent definitions will be listed here once your plan is ready.",
    app: "Frontend stack, screens, and API endpoints will appear here.",
    database: "Database schema and data model will be shown here.",
  };
  const icons: Record<RightTab, React.ReactNode> = {
    plan: (
      <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
    ),
    agents: (
      <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="8" width="18" height="12" rx="2" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8V4M8 4h8M9 13h.01M15 13h.01M9 17h6" />
      </svg>
    ),
    app: (
      <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 21h8M12 17v4" />
      </svg>
    ),
    database: (
      <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  };
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-10">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">{icons[tab]}</div>
      <p className="text-sm font-semibold text-gray-500 mb-2 capitalize">{tab} not generated yet</p>
      <p className="text-xs text-gray-400 leading-relaxed max-w-xs">{msgs[tab]}</p>
    </div>
  );
}

const CHANGE_TYPE_META: Record<Exclude<PromptChangeType, "initial">, { label: string; pill: string; icon: string }> = {
  feature:  { label: "Feature",  pill: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "✦" },
  bugfix:   { label: "Bug Fix",  pill: "bg-rose-100 text-rose-700 border-rose-200",           icon: "⚒" },
  enhance:  { label: "Enhance",  pill: "bg-violet-100 text-violet-700 border-violet-200",     icon: "↑" },
  refine:   { label: "Refine",   pill: "bg-amber-100 text-amber-700 border-amber-200",        icon: "✎" },
  suggest:  { label: "Suggest",  pill: "bg-sky-100 text-sky-700 border-sky-200",              icon: "💡" },
};

function PromptEvolutionSection({ history }: { history: PromptVersion[] }) {
  const [enhancedOpen, setEnhancedOpen] = useState(false);
  const [openChange, setOpenChange] = useState<number | null>(null);

  const v1 = history[0];
  const changes = history.slice(1); // v2, v3 ... = Change 1, Change 2 ...
  if (!v1) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Prompt Evolution</h3>
        {changes.length > 0 && (
          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
            {changes.length} change{changes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Block 1: Original User Prompt — always locked ─────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
          <span className="w-5 h-5 rounded-md bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">U</span>
          <span className="text-xs font-semibold text-slate-700">Original User Prompt</span>
          <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 flex items-center gap-1">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
            Locked
          </span>
        </div>
        <p className="px-3 py-3 text-xs text-slate-700 leading-relaxed whitespace-pre-line">{v1.userInput}</p>
        <div className="px-3 pb-2 flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">{new Date(v1.ts).toLocaleString()}</span>
        </div>
      </div>

      {/* ── Block 2: LLM Enhanced Prompt — collapsible, locked ────────────── */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 overflow-hidden">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 border-b border-indigo-100 bg-white/80 hover:bg-white transition-colors text-left"
          onClick={() => setEnhancedOpen((o) => !o)}
        >
          <span className="w-5 h-5 rounded-md bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">AI</span>
          <span className="text-xs font-semibold text-indigo-800">Enhanced Prompt (LLM)</span>
          <span className="ml-auto text-[10px] text-indigo-400 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 flex items-center gap-1 mr-1">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
            Locked
          </span>
          <svg className={`w-3.5 h-3.5 text-indigo-400 flex-shrink-0 transition-transform ${enhancedOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!enhancedOpen && (
          <p className="px-3 py-2.5 text-xs text-indigo-700 leading-relaxed line-clamp-2">{v1.enhancedPrompt}</p>
        )}
        {enhancedOpen && (
          <p className="px-3 py-3 text-xs text-indigo-800 leading-relaxed whitespace-pre-line">{v1.enhancedPrompt}</p>
        )}
      </div>

      {/* ── Block 3: Incremental Changes — Change 1, 2, 3... ─────────────── */}
      {changes.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-semibold text-gray-600">Incremental Changes</span>
            <span className="ml-auto text-[10px] text-gray-400">{changes.length} total</span>
          </div>

          {/* Cumulative context summary strip */}
          <div className="px-3 py-2 bg-amber-50/60 border-b border-amber-100">
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">What evolved so far</p>
            <div className="flex flex-wrap gap-1">
              {changes.map((ch, idx) => {
                const meta = CHANGE_TYPE_META[ch.changeType as Exclude<PromptChangeType, "initial">] ?? CHANGE_TYPE_META.refine;
                return (
                  <span key={ch.version} className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${meta.pill}`} title={ch.changeSummary || ch.userInput}>
                    {meta.icon} C{idx + 1}: {(ch.changeSummary || ch.userInput).slice(0, 35)}{(ch.changeSummary || ch.userInput).length > 35 ? "…" : ""}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {changes.map((ch, idx) => {
              const changeNum = idx + 1;
              const meta = CHANGE_TYPE_META[ch.changeType as Exclude<PromptChangeType, "initial">] ?? CHANGE_TYPE_META.refine;
              const isOpen = openChange === ch.version;
              const isLatest = idx === changes.length - 1;
              return (
                <div key={ch.version}>
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setOpenChange(isOpen ? null : ch.version)}
                  >
                    <span className="w-6 h-6 rounded-full bg-gray-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {changeNum}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-700">Change {changeNum}</span>
                        {isLatest && (
                          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5">Latest</span>
                        )}
                      </div>
                      {ch.changeSummary && (
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">{ch.changeSummary}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-0.5 flex-shrink-0 ${meta.pill}`}>
                      {meta.icon} {meta.label}
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:inline">
                      {new Date(ch.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100 space-y-2">
                      {ch.changeSummary && (
                        <>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">AI Summary</p>
                          <p className="text-xs text-gray-700 leading-relaxed bg-white rounded-lg px-3 py-2 border border-gray-200 italic">
                            {ch.changeSummary}
                          </p>
                        </>
                      )}
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">User Instruction</p>
                      <p className="text-xs text-gray-700 leading-relaxed bg-white rounded-lg px-3 py-2.5 border border-gray-200 whitespace-pre-line">
                        {ch.userInput}
                      </p>
                      <p className="text-[10px] text-gray-400">{new Date(ch.ts).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

interface PlanProgressStateProps {
  messages: Message[];
  loading: boolean;
  qAnswers?: Record<string, string>;
  qLocked?: boolean;
  pickAnswer?: (qId: string, opt: string) => void;
  submitAnswers?: () => void;
  hasAnswers?: boolean;
}

function PlanProgressState({ messages, loading, qAnswers = {}, qLocked = false, pickAnswer, submitAnswers, hasAnswers }: PlanProgressStateProps) {
  const userMsgs   = messages.filter(m => m.role === "user").length;
  const hasQs      = messages.some(m => m.response?.type === "questions");
  const qCount     = messages.filter(m => m.response?.type === "questions").length;

  // Derive current stage: 0=idle, 1=thinking, 2=questions asked, 3=generating plan
  const stage = loading && userMsgs === 0 ? 1
    : hasQs && !loading ? 2
    : loading && userMsgs > 0 ? 3
    : userMsgs > 0 && !hasQs ? 3
    : 0;

  // Extract latest questions from messages
  const lastQMsg = [...messages].reverse().find(m => m.response?.type === "questions");
  const liveQuestions = lastQMsg?.response?.questions ?? [];
  const answeredCount = Object.keys(qAnswers).length;
  const totalCount = liveQuestions.length;

  const steps = [
    { id: 1, label: "Understanding your requirements",    done: userMsgs >= 1 || stage >= 2 },
    { id: 2, label: "Asking clarifying questions",        done: stage >= 2, active: stage === 2 },
    { id: 3, label: "Analysing tech stack & architecture", done: stage === 3, active: stage === 3 },
    { id: 4, label: "Generating full architecture plan",   done: false,       active: stage === 3 },
  ];

  const tips = [
    "GPT-4o analyses your prompt to pick the ideal React + FastAPI + PostgreSQL stack.",
    "FAISS vector store and Azure OpenAI embeddings will be wired automatically.",
    "The plan includes agents, API endpoints, DB schema and a ready-to-deploy sandbox.",
    "Answer all questions above to generate a precise, ready-to-deploy plan.",
  ];
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTipIdx(i => (i + 1) % tips.length), 3500);
    return () => clearInterval(t);
  }, []);

  // ── Stage 2: Clarifying questions — show them as the primary right-panel UI ──
  if (stage === 2 && liveQuestions.length > 0) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow">
            <svg className="w-4.5 h-4.5 text-white w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Clarifying Questions</p>
            <p className="text-xs text-gray-400">Answer to generate a precise architecture plan</p>
          </div>
          {/* Progress pill */}
          <div className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            answeredCount === totalCount
              ? "bg-emerald-100 text-emerald-700"
              : "bg-violet-100 text-violet-700"
          }`}>
            {answeredCount}/{totalCount} answered
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
            style={{ width: totalCount > 0 ? `${(answeredCount / totalCount) * 100}%` : "0%" }}
          />
        </div>

        {/* Questions list */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {liveQuestions.map((q, idx) => {
            const answered = qAnswers[q.id];
            return (
              <div key={q.id} className={`rounded-2xl border transition-all duration-300 ${
                answered
                  ? "border-violet-200 bg-violet-50/60"
                  : "border-gray-200 bg-white"
              }`}>
                {/* Question header */}
                <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                    answered ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-500"
                  }`}>
                    {answered ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : idx + 1}
                  </div>
                  <p className="text-sm font-medium text-gray-800 leading-snug">{q.text}</p>
                </div>

                {/* Options grid */}
                <div className="px-4 pb-4 flex flex-wrap gap-2 pl-13" style={{ paddingLeft: "2.75rem" }}>
                  {q.options.map((opt) => {
                    const selected = qAnswers[q.id] === opt;
                    return (
                      <button
                        key={opt}
                        disabled={qLocked}
                        onClick={() => pickAnswer?.(q.id, opt)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                          selected
                            ? "bg-violet-600 border-violet-600 text-white shadow-sm"
                            : "bg-white border-gray-200 text-gray-600 hover:border-violet-400 hover:text-violet-700 hover:bg-violet-50"
                        } ${qLocked && !selected ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {selected && <span className="mr-1">✓</span>}
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer CTA */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/80">
          {hasAnswers ? (
            <button
              onClick={submitAnswers}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Architecture Plan →
            </button>
          ) : (
            <div className="w-full py-3 bg-gray-200 text-gray-400 text-sm font-medium rounded-xl text-center cursor-not-allowed select-none">
              Answer {totalCount - answeredCount} more question{totalCount - answeredCount !== 1 ? "s" : ""} to continue
            </div>
          )}
          <p className="text-center text-[10px] text-gray-400 mt-2">
            GPT-4o will use your answers to design a precise, ready-to-deploy plan
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-10 py-8 select-none">
      {/* Animated icon */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
          </svg>
        </div>
        {(loading || stage === 2) && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-violet-500" />
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold text-gray-800 mb-1">
        {stage === 0 ? "Ready to architect" : stage === 2 ? "Clarifying your requirements" : stage === 3 ? "Generating your plan…" : "Architect is thinking…"}
      </h3>
      <p className="text-xs text-gray-400 mb-6 text-center max-w-xs leading-relaxed">
        {stage === 0 ? "Describe what you want to build in the chat to get started." : stage === 2 ? "Answer the questions on the left — the more detail you give, the better the plan." : "GPT-4o is designing your full-stack architecture. This takes 10–20 seconds."}
      </p>

      {/* Progress steps */}
      <div className="w-full max-w-sm space-y-2 mb-6">
        {steps.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
              s.done ? "bg-violet-600 text-white" : s.active ? "bg-violet-100 border-2 border-violet-500 text-violet-600" : "bg-gray-100 text-gray-400"
            }`}>
              {s.done ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : s.active ? (
                <span className="animate-pulse">•</span>
              ) : (
                <span>{s.id}</span>
              )}
            </div>
            <span className={`text-xs transition-colors duration-300 ${s.done ? "text-violet-700 font-medium" : s.active ? "text-violet-600 font-semibold" : "text-gray-400"}`}>
              {s.label}
              {s.active && loading && <span className="ml-1 animate-pulse">…</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Rotating tip */}
      <div className="w-full max-w-sm bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
        <p className="text-xs text-indigo-600 leading-relaxed text-center transition-all duration-500">
          💡 {tips[tipIdx]}
        </p>
      </div>

      {/* Q count badge */}
      {qCount > 0 && (
        <p className="mt-4 text-xs text-gray-400">
          {qCount} clarifying question{qCount > 1 ? "s" : ""} answered so far
        </p>
      )}
    </div>
  );
}

function PlanTab({ plan, promptHistory, messages, loading, qAnswers, qLocked, pickAnswer, submitAnswers, hasAnswers }: { plan?: Plan; promptHistory?: PromptVersion[]; messages: Message[]; loading: boolean; qAnswers?: Record<string, string>; qLocked?: boolean; pickAnswer?: (qId: string, opt: string) => void; submitAnswers?: () => void; hasAnswers?: boolean }) {
  if (!plan) return <PlanProgressState messages={messages} loading={loading} qAnswers={qAnswers} qLocked={qLocked} pickAnswer={pickAnswer} submitAnswers={submitAnswers} hasAnswers={hasAnswers} />;
  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Prompt Evolution — shown only when history exists */}
      {promptHistory && promptHistory.length > 0 && (
        <PromptEvolutionSection history={promptHistory} />
      )}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Overview</h3>
        <p className="text-sm text-gray-700 leading-relaxed">{plan.summary}</p>
      </section>
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tech Stack</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Frontend", val: plan.tech_stack.frontend, cls: "bg-blue-50 border-blue-200 text-blue-800" },
            { label: "Backend", val: plan.tech_stack.backend, cls: "bg-violet-50 border-violet-200 text-violet-800" },
            { label: "Database", val: plan.tech_stack.database, cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
            { label: "AI / LLM", val: plan.tech_stack.ai, cls: "bg-amber-50 border-amber-200 text-amber-800" },
          ].map((t) => (
            <div key={t.label} className={`border rounded-xl px-3 py-2.5 ${t.cls}`}>
              <p className="text-xs opacity-60 font-medium mb-0.5">{t.label}</p>
              <p className="text-xs font-semibold">{t.val}</p>
            </div>
          ))}
        </div>
        {(plan.tech_stack.other ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {plan.tech_stack.other!.map((o) => (
              <span key={o} className="text-xs bg-gray-100 text-gray-600 rounded-full border border-gray-200 px-2.5 py-0.5">{o}</span>
            ))}
          </div>
        )}
      </section>
      {plan.features?.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Features</h3>
          <ul className="space-y-1.5">
            {plan.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <svg className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}
      {plan.architecture && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Architecture</h3>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{plan.architecture}</p>
        </section>
      )}
      {plan.phases?.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Build Phases</h3>
          <div className="space-y-3">
            {plan.phases.map((ph) => (
              <div key={ph.phase} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center">{ph.phase}</span>
                  <span className="text-sm font-semibold text-slate-800">{ph.name}</span>
                </div>
                <ul className="space-y-1 pl-1">
                  {ph.tasks.map((t, j) => (
                    <li key={j} className="text-xs text-gray-600 flex gap-1.5"><span className="text-gray-400">·</span>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AgentsTab({ plan }: { plan?: Plan }) {
  if (!plan?.agents?.length) return <EmptyState tab="agents" />;
  const COLORS = ["bg-indigo-500", "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500"];
  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <p className="text-xs text-gray-400">{plan.agents.length} agent{plan.agents.length !== 1 ? "s" : ""} in this architecture</p>
      {plan.agents.map((a, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-3 mb-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${COLORS[i % COLORS.length]}`}>
              {a.name[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">{a.name}</p>
              <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2 py-0.5">{a.model}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">{a.role}</p>
          {a.tools?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {a.tools.map((t) => (
                <span key={t} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2 py-0.5">{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Extract a clean short app name from verbose plan.summary ─────────────────
// e.g. "This system is a policy analysis agent that ingests..." → "Policy Analysis Agent"
function extractAppTitle(summary: string): string {
  const STOPWORDS = new Set(["that","which","for","to","and","with","by","on","in","of","the","a","an","who","where","when","how"]);
  const cleaned = summary
    .replace(/^(this system is an? |build an? |a |an )/i, "")
    .replace(/[,;.!?].*$/, "");
  const words = cleaned.split(/\s+/);
  const kept: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w.toLowerCase())) break;
    kept.push(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    if (kept.length >= 5) break;
  }
  return kept.join(" ") || summary.slice(0, 40);
}

// ─── Detect whether a plan is RAG/document-based ─────────────────────────────

function isRagPlan(plan: Plan): boolean {
  const haystack = [
    plan.summary,
    plan.tech_stack?.ai ?? "",
    plan.tech_stack?.backend ?? "",
    ...(plan.features ?? []),
    ...(plan.agents?.map(a => a.role + " " + a.tools.join(" ")) ?? []),
  ].join(" ").toLowerCase();
  // Only true RAG signals: vector DB, embeddings, semantic search, document ingestion pipeline
  // Deliberately exclude generic "knowledge base" / "kb" — those appear in non-RAG apps too
  return /\b(rag|faiss|embedding|vector store|pgvector|chroma|pinecone|weaviate|semantic search|document ingestion|document upload|vector index)\b/.test(haystack);
}

// ─── RAG Scaffold ZIP — proven RAGChatbot pattern, app name injected ──────────

async function buildRagScaffoldZip(_html: string, plan: Plan): Promise<Blob> {
  const zip = new JSZip();
  const appTitle = extractAppTitle(plan.summary);
  const appName = appTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agentforge-app";

  // ── sandbox.html — 5-page layout matching React App.tsx exactly ─────────────
  zip.file("sandbox.html", `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${appTitle}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  *{box-sizing:border-box}body{margin:0;font-family:'Inter','Segoe UI',sans-serif}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#94a3b8;animation:bounce 1.2s infinite ease-in-out}
  .dot:nth-child(2){animation-delay:.14s}.dot:nth-child(3){animation-delay:.28s}
  @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
  .page{display:none}.page.active{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
  #chat-messages{display:flex;flex-direction:column;gap:12px}
</style>
</head>
<body class="flex h-screen overflow-hidden bg-gray-100">

<!-- LEFT SIDEBAR -->
<aside class="w-64 bg-slate-800 text-white flex flex-col flex-shrink-0">
  <div class="p-4 border-b border-white/10">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-base" id="avatar-letter">${appTitle.charAt(0).toUpperCase()}</div>
      <div class="min-w-0"><p class="text-sm font-bold leading-tight truncate">${appTitle}</p><p class="text-xs text-slate-400 leading-tight">Document-aware support</p></div>
    </div>
  </div>
  <nav class="p-3 border-b border-white/10 space-y-0.5" id="nav-links"></nav>
  <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-0">
    <div id="topic-section">
      <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 px-1 hidden" id="topic-label">Filter by Topic</p>
      <div id="topic-filters"></div>
    </div>
    <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 mt-2 px-1">Top Questions</p>
    <div id="top-questions"></div>
    <p class="text-[11px] text-slate-500 px-1 mt-auto pt-3" id="kb-doc-footer"></p>
  </div>
</aside>

<!-- MAIN CONTENT -->
<div class="flex-1 flex flex-col min-w-0 overflow-hidden">

  <!-- CHAT PAGE -->
  <div class="page active" id="page-chat">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">💬</span><p class="flex-1 text-base font-bold text-slate-900">Support Chat</p>
      <span class="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">● AI Active</span>
      <span class="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">● KB Connected</span>
      <span class="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">FAISS RAG · Azure OpenAI</span>
    </header>
    <div class="flex-1 overflow-y-auto p-5 bg-slate-50" id="chat-scroll">
      <div id="chat-messages">
        <div class="flex justify-start">
          <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-xl">
            <p class="text-sm text-slate-800 leading-relaxed">Hello! I'm your AI assistant for <strong>${appTitle}</strong>. Upload documents and ask me anything.</p>
            <p class="text-[10px] text-slate-400 mt-1">System</p>
          </div>
        </div>
      </div>
    </div>
    <div id="typing-ind" class="hidden px-5 pb-1"><div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 inline-flex gap-1.5 shadow-sm"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div>
    <div class="bg-white border-t border-slate-200 p-3.5 flex-shrink-0">
      <div class="flex gap-2.5 items-end mb-2">
        <textarea id="msg-input" rows="2" placeholder="Ask a question…" class="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"></textarea>
        <button id="send-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-sm font-semibold h-[44px] transition-colors">Send ➤</button>
      </div>
      <div id="quick-suggestions" class="flex flex-wrap gap-1.5 mb-2"></div>
      <p class="text-xs text-slate-400 text-center">Powered by Knowledge Base · FAISS RAG · Azure OpenAI</p>
    </div>
  </div>

  <!-- SUGGESTED QUESTIONS PAGE -->
  <div class="page" id="page-questions">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">💡</span><p class="flex-1 text-base font-bold text-slate-900">Suggested Questions</p>
      <span class="text-xs text-slate-500" id="q-doc-count">0 documents indexed</span>
    </header>
    <div class="flex-1 overflow-y-auto p-5" id="questions-content">
      <div class="text-center py-20 text-slate-400"><p class="text-4xl mb-3">💡</p><p class="font-semibold">No documents uploaded yet</p></div>
    </div>
  </div>

  <!-- ADMIN UPLOADS PAGE -->
  <div class="page" id="page-uploads">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">📁</span><p class="flex-1 text-base font-bold text-slate-900">Admin Uploads</p>
      <button id="upload-btn-header" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg">📎 Upload Documents</button>
      <input id="file-input" type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" class="hidden"/>
    </header>
    <div class="flex-1 overflow-y-auto p-5">
      <div id="drop-zone" class="border-2 border-dashed border-indigo-300 rounded-xl p-10 text-center mb-6 cursor-pointer hover:bg-indigo-50">
        <p class="text-4xl mb-2">📎</p><p class="text-sm font-semibold text-slate-700">Click to upload documents</p>
        <p class="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, MD, CSV — multiple files</p>
      </div>
      <div id="uploads-grid" class="grid grid-cols-2 gap-3"></div>
    </div>
  </div>

  <!-- ANALYTICS PAGE -->
  <div class="page" id="page-analytics">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">📊</span><p class="flex-1 text-base font-bold text-slate-900">Conversation Analytics</p>
    </header>
    <div class="flex-1 overflow-y-auto p-5">
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center"><p class="text-xs text-slate-400 mb-1">Messages</p><p class="text-2xl font-bold text-slate-900" id="stat-msgs">0</p></div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center"><p class="text-xs text-slate-400 mb-1">Documents</p><p class="text-2xl font-bold text-indigo-600" id="stat-docs">0</p></div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center"><p class="text-xs text-slate-400 mb-1">Session</p><p class="text-2xl font-bold text-emerald-600">Live</p></div>
      </div>
      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-4">
        <p class="text-sm font-bold text-slate-700 mb-4">Message Volume</p>
        <div id="msg-bars" class="h-32 flex items-end gap-1"><div class="flex-1 flex items-center justify-center text-slate-400 text-sm h-full">No messages yet</div></div>
      </div>
      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p class="text-sm font-bold text-slate-700 mb-3">Session Log</p>
        <p class="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2" id="session-log">No queries yet in this session.</p>
      </div>
    </div>
  </div>

  <!-- TICKET HANDOFF PAGE -->
  <div class="page" id="page-handoff">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">📞</span><p class="flex-1 text-base font-bold text-slate-900">Ticket Handoff</p>
    </header>
    <div class="flex-1 overflow-y-auto p-5">
      <div class="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-sm" id="ticket-form-wrap">
        <p class="text-sm font-bold text-slate-700 mb-4">Log a Support Ticket</p>
        <div class="space-y-4">
          <div><label class="text-xs font-semibold text-slate-600 block mb-1">Issue Category</label>
            <select id="t-issue" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">Select category…</option><option>General Query</option><option>Technical Issue</option><option>Account Support</option><option>Billing</option><option>Other</option>
            </select></div>
          <div><label class="text-xs font-semibold text-slate-600 block mb-1">Your Name</label>
            <input id="t-name" placeholder="Enter your name" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
          <div><label class="text-xs font-semibold text-slate-600 block mb-1">Priority</label>
            <div class="flex gap-2" id="priority-btns">
              <button onclick="setPriority(this,'Low')" data-p="Low" class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">Low</button>
              <button onclick="setPriority(this,'Medium')" data-p="Medium" class="flex-1 py-1.5 text-xs font-semibold rounded-lg border bg-yellow-400 text-white border-yellow-400">Medium</button>
              <button onclick="setPriority(this,'High')" data-p="High" class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">High</button>
              <button onclick="setPriority(this,'Critical')" data-p="Critical" class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">Critical</button>
            </div></div>
          <div><label class="text-xs font-semibold text-slate-600 block mb-1">Details</label>
            <textarea id="t-details" rows="4" placeholder="Describe the issue…" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"></textarea></div>
          <button onclick="submitTicket()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-lg">Submit Ticket</button>
        </div>
      </div>
      <div class="hidden max-w-md mx-auto text-center py-20" id="ticket-success">
        <p class="text-5xl mb-4">✅</p><p class="text-lg font-bold text-slate-800">Ticket Submitted</p>
        <p class="text-sm text-slate-500 mt-2">Support will follow up shortly.</p>
        <button onclick="resetTicket()" class="mt-6 bg-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg">Submit Another</button>
      </div>
    </div>
  </div>
</div>

<!-- RIGHT PANEL -->
<aside class="w-64 border-l bg-white flex flex-col flex-shrink-0">
  <div class="px-4 py-3 border-b border-slate-200">
    <div class="flex items-center justify-between">
      <p class="text-sm font-bold text-slate-800">Knowledge Base</p>
      <span class="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center" id="kb-badge">0</span>
    </div>
    <p class="text-[11px] text-slate-400 mt-0.5" id="kb-subtitle">No documents yet</p>
  </div>
  <div class="flex-1 overflow-y-auto p-3" id="kb-doc-cards"><p class="text-xs text-slate-400 italic p-2">No documents yet.</p></div>
  <div class="border-t border-slate-200 p-4">
    <p class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Session Stats</p>
    <div class="space-y-2 text-xs text-slate-600">
      <div class="flex justify-between"><span>Messages</span><span class="font-bold text-slate-800" id="sess-msgs">0</span></div>
      <div class="flex justify-between"><span>Avg Accuracy</span><span class="font-bold text-emerald-600" id="sess-accuracy">--</span></div>
    </div>
  </div>
</aside>

<script>
(function(){
  const API = "http://localhost:8000";
  let docs = [], msgCount = 0, currentPage = "chat", selectedTopic = null, accuracySum = 0, accuracyCount = 0;

  function getTopicName(fn){ return (fn||"").replace(/\\.[^.]+$/,"").replace(/[-_]/g," ").replace(/\\b\\w/g,c=>c.toUpperCase()); }
  function docConfidence(fn){ let h=0; for(const c of (fn||"")) h=((h<<5)-h)+c.charCodeAt(0); return 80+Math.abs(h%18); }

  const NAV = [
    {id:"chat",     icon:"💬", label:"Support Chat"},
    {id:"questions",icon:"💡", label:"Suggested Questions"},
    {id:"uploads",  icon:"📁", label:"Admin Uploads"},
    {id:"analytics",icon:"📊", label:"Conversation Analytics"},
    {id:"handoff",  icon:"📞", label:"Ticket Handoff"},
  ];

  function buildNav(){
    document.getElementById("nav-links").innerHTML = NAV.map(n =>
      \`<button onclick="switchPage('\${n.id}')" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left \${n.id===currentPage?"bg-indigo-600 text-white":"text-slate-300 hover:bg-white/10"}">\${n.icon} \${n.label}</button>\`
    ).join("");
  }

  window.switchPage = function(id){
    currentPage = id;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-"+id)?.classList.add("active");
    buildNav();
    if(id==="questions") renderQuestionsPage();
    if(id==="uploads")   renderUploadsGrid();
    if(id==="analytics") renderAnalytics();
  };

  function escHtml(s){ const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }
  function renderMd(s){
    return escHtml(s)
      .replace(/### (.+)/g, '<p class="font-bold text-slate-800 mt-3 mb-1">$1</p>')
      .replace(/## (.+)/g,  '<p class="font-bold text-slate-900 text-base mt-3 mb-1">$1</p>')
      .replace(/# (.+)/g,   '<p class="font-bold text-slate-900 text-lg mt-3 mb-1">$1</p>')
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/^- (.+)/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/\\n/g, '<br/>');
  }
  function getExt(fn){ return (fn.split(".").pop()||"DOC").toUpperCase(); }

  function buildTopicFilters(){
    const lbl = document.getElementById("topic-label");
    const el = document.getElementById("topic-filters");
    if(!docs.length){ lbl.classList.add("hidden"); el.innerHTML=""; return; }
    lbl.classList.remove("hidden");
    el.innerHTML = docs.map(d=>{
      const fn=d.filename||d.name||"Doc";
      const active=selectedTopic===fn;
      return \`<button data-topic="\${escHtml(fn)}" class="w-full flex items-center justify-between text-left text-xs px-2 py-2 rounded-lg transition-colors mb-0.5 \${active?"bg-indigo-600 text-white":"text-slate-300 hover:bg-white/10"}"><span class="truncate">\${escHtml(getTopicName(fn))}</span><span class="ml-2 text-[10px] font-bold bg-white/10 rounded-full px-1.5 py-0.5 flex-shrink-0">10</span></button>\`;
    }).join("");
    document.getElementById("kb-doc-footer").textContent = docs.length+" knowledge base document"+(docs.length!==1?"s":"")+" indexed";
  }

  function buildTopQuestions(){
    const el = document.getElementById("top-questions");
    const filtered = selectedTopic ? docs.filter(d=>(d.filename||d.name)===selectedTopic) : docs;
    const qs = filtered.length === 0
      ? ["What issue is being reported?","How do I troubleshoot this?","Who do I contact for support?","What are the main topics covered?","How can I escalate an issue?"]
      : filtered.flatMap(d=>{ const n=(d.filename||d.name||"Doc").replace(/\\.[^.]+$/,""); return [\`What does \${n} cover?\`,\`How to resolve a \${n} error?\`,\`What are common \${n} issues?\`,\`How to escalate \${n} problems?\`,\`Who to contact for \${n} support?\`]; }).slice(0,10);
    el.innerHTML = qs.map((q,i) =>
      \`<button data-q="\${escHtml(q)}" class="w-full flex items-start gap-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-lg px-2 py-2 transition-colors mb-1"><span class="w-5 h-5 rounded-full bg-indigo-600/60 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">\${i+1}</span><span class="leading-snug">\${escHtml(q)}</span></button>\`
    ).join("");
  }

  function buildQuickSuggestions(){
    const el = document.getElementById("quick-suggestions");
    const qs = docs.length === 0
      ? ["What can you help me with?","Summarise the uploaded documents","What are the key topics?"]
      : docs.flatMap(d=>{ const n=(d.filename||d.name||"Doc").replace(/\\.[^.]+$/,""); return [\`What does \${n} cover?\`,\`Summarise \${n}\`]; }).slice(0,4);
    el.innerHTML = qs.map(q =>
      \`<button data-q="\${escHtml(q)}" class="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2.5 py-0.5 hover:bg-indigo-50 hover:text-indigo-600">\${escHtml(q)}</button>\`
    ).join("");
  }

  function renderKbCards(){
    const el = document.getElementById("kb-doc-cards");
    document.getElementById("kb-badge").textContent = docs.length;
    document.getElementById("stat-docs").textContent = docs.length;
    if(!docs.length){ el.innerHTML='<p class="text-xs text-slate-400 italic p-2">No documents yet.</p>'; document.getElementById("kb-subtitle").textContent="No documents yet"; return; }
    document.getElementById("kb-subtitle").textContent="All documents indexed & ready";
    el.innerHTML = docs.map(d=>{ const fn=d.filename||d.name||"File"; const conf=docConfidence(fn); const topic=getTopicName(fn); return (
      \`<div data-q="Summarise \${escHtml(fn)}" class="border border-slate-200 rounded-xl p-3 mb-2 cursor-pointer hover:border-indigo-300"><div class="flex items-center gap-1.5 mb-1.5"><span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">\${escHtml(getExt(fn))}</span><span class="text-[10px] font-bold text-emerald-600">✓ \${conf}%</span></div><p class="text-sm font-semibold text-slate-800 truncate">\${escHtml(fn)}</p><p class="text-[11px] text-slate-500 mt-0.5 truncate">\${escHtml(topic)}</p></div>\`
    ); }).join("");
    buildTopicFilters();
    buildTopQuestions();
  }

  function renderQuestionsPage(){
    const el = document.getElementById("questions-content");
    document.getElementById("q-doc-count").textContent = docs.length + " document" + (docs.length!==1?"s":"") + " indexed";
    if(!docs.length){ el.innerHTML='<div class="text-center py-20 text-slate-400"><p class="text-4xl mb-3">💡</p><p class="font-semibold">No documents uploaded yet</p></div>'; return; }
    el.innerHTML = docs.map(d=>{
      const fn=(d.filename||d.name||"Document").replace(/\\.[^.]+$/,"");
      const ext=getExt(d.filename||d.name||"DOC");
      const qs=[\`What does \${fn} cover?\`,\`Summarise \${fn}\`,\`Common issues in \${fn}?\`,\`How to resolve a \${fn} error?\`,\`Who to contact for \${fn} support?\`];
      return \`<div class="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden"><div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2"><span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">\${ext}</span><p class="text-sm font-bold text-slate-800 truncate">\${escHtml(d.filename||d.name)}</p><span class="ml-auto text-[11px] text-emerald-600 font-semibold">✓ Indexed</span></div><div class="divide-y divide-slate-100">\${qs.map((q,i)=>\`<button data-q="\${escHtml(q)}" class="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"><span class="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">\${i+1}</span>\${escHtml(q)}<span class="ml-auto text-slate-300 text-xs">→</span></button>\`).join("")}</div></div>\`;
    }).join("");
  }

  function renderUploadsGrid(){
    const el = document.getElementById("uploads-grid");
    if(!docs.length){ el.innerHTML=''; return; }
    el.innerHTML = docs.map(d=>{ const fn=d.filename||d.name||"File"; return (
      \`<div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"><div class="flex items-start gap-3"><div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0"><span class="text-[10px] font-bold text-blue-700">\${escHtml(getExt(fn))}</span></div><div class="min-w-0"><p class="text-sm font-semibold text-slate-800 truncate">\${escHtml(fn)}</p><p class="text-[11px] font-semibold mt-0.5 \${d.indexed?"text-emerald-600":"text-amber-500"}">\${d.indexed?"✓ Indexed":"⏳ Pending"}</p></div></div></div>\`
    ); }).join("");
  }

  function renderAnalytics(){
    document.getElementById("stat-msgs").textContent = msgCount;
    const bars = document.getElementById("msg-bars");
    if(msgCount===0){ bars.innerHTML='<div class="flex-1 flex items-center justify-center text-slate-400 text-sm h-full">No messages yet</div>'; return; }
    bars.innerHTML = Array.from({length:msgCount},(_,i)=>\`<div class="flex-1 bg-indigo-400 rounded-t" style="height:\${Math.min(100,30+i*8)}%"></div>\`).join("");
  }

  function addMsg(role, text, meta){
    const wrap = document.createElement("div");
    wrap.className = "flex " + (role==="user"?"justify-end":"justify-start");
    const t = new Date().toLocaleTimeString();
    if(role==="user"){
      wrap.innerHTML = \`<div><div class="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-md leading-relaxed">\${escHtml(text)}</div><p class="text-[10px] text-slate-400 text-right mt-1">\${t}</p></div>\`;
    } else {
      const conf = meta?.confidence || null;
      const src = meta?.source_doc || null;
      const followups = meta?.suggested_followups || [];
      const confBadge = conf ? \`<span class="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">✓ \${conf}% accuracy</span>\` : "";
      const srcBadge = src ? \`<span class="inline-flex items-center gap-1 text-[11px] text-slate-500"><span>📄</span>\${escHtml(src)}</span>\` : "";
      const badgeRow = (confBadge||srcBadge) ? \`<div class="flex flex-wrap items-center gap-2 mt-2">\${srcBadge}\${confBadge}</div>\` : "";
      const followupHtml = followups.length ? \`<div class="mt-2 pt-2 border-t border-slate-100"><p class="text-[10px] text-slate-400 mb-1.5">Suggested follow-ups</p><div class="flex flex-col gap-1">\${followups.map(q=>\`<button data-q="\${escHtml(q)}" class="text-left text-[12px] bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-3 py-1.5 hover:bg-indigo-100">\${escHtml(q)}</button>\`).join("")}</div></div>\` : "";
      wrap.innerHTML = \`<div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-xl"><div class="text-sm text-slate-800 leading-relaxed">\${renderMd(text)}</div>\${badgeRow}\${followupHtml}<div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100"><span class="text-[10px] text-slate-400">\${t}</span><p class="text-[10px] text-slate-400 ml-1">Helpful?</p><div class="ml-auto flex gap-1.5"><button onclick="this.textContent='👍'" class="text-slate-400 text-sm">👍</button><button onclick="this.textContent='👎'" class="text-slate-400 text-sm">👎</button></div></div></div>\`;
    }
    document.getElementById("chat-messages").appendChild(wrap);
    document.getElementById("chat-scroll").scrollTop = 99999;
  }

  window.sendMsg = async function(text){
    if(!text||!text.trim()) return;
    if(currentPage!=="chat") switchPage("chat");
    addMsg("user", text);
    msgCount++;
    document.getElementById("sess-msgs").textContent = msgCount;
    document.getElementById("stat-msgs").textContent = msgCount;
    const ind = document.getElementById("typing-ind");
    ind.classList.remove("hidden");
    try{
      const r = await fetch(API+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:text,workspace_id:1})});
      ind.classList.add("hidden");
      if(!r.ok) throw new Error("HTTP "+r.status);
      const d = await r.json();
      if(d.confidence){ accuracySum+=d.confidence; accuracyCount++; document.getElementById("sess-accuracy").textContent=Math.round(accuracySum/accuracyCount)+"%"; }
      addMsg("bot", d.answer || JSON.stringify(d), {confidence:d.confidence, source_doc:d.source_doc, suggested_followups:d.suggested_followups||[]});
    }catch(e){
      ind.classList.add("hidden");
      addMsg("bot","⚠️ Backend not reachable. Ensure FastAPI is running on port 8000.");
    }
  };

  async function doUpload(files){
    const btn = document.getElementById("upload-btn-header");
    btn.textContent="⏳ Indexing…"; btn.disabled=true;
    for(const f of Array.from(files)){
      const fd=new FormData(); fd.append("file",f);
      try{ await fetch(API+"/api/documents/upload",{method:"POST",body:fd}); }catch(e){}
    }
    btn.textContent="📎 Upload Documents"; btn.disabled=false;
    await loadDocs();
    if(currentPage==="uploads") renderUploadsGrid();
    if(currentPage==="questions") renderQuestionsPage();
  }

  async function loadDocs(){
    try{
      const r=await fetch(API+"/api/documents");
      if(!r.ok) return;
      docs=await r.json();
    }catch(e){ return; }
    renderKbCards();
    buildTopQuestions();
    buildQuickSuggestions();
  }

  window.setPriority = function(btn, p){
    document.querySelectorAll("#priority-btns button").forEach(b=>{
      const bp=b.dataset.p;
      if(bp===p){
        const cls=p==="Critical"?"bg-red-600 text-white border-red-600":p==="High"?"bg-amber-500 text-white border-amber-500":p==="Medium"?"bg-yellow-400 text-white border-yellow-400":"bg-green-500 text-white border-green-500";
        b.className=\`flex-1 py-1.5 text-xs font-semibold rounded-lg border \${cls}\`;
      } else {
        b.className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50";
      }
    });
  };
  window.submitTicket = function(){
    if(!document.getElementById("t-issue").value||!document.getElementById("t-name").value){ alert("Please fill in Issue Category and Name."); return; }
    document.getElementById("ticket-form-wrap").classList.add("hidden");
    document.getElementById("ticket-success").classList.remove("hidden");
  };
  window.resetTicket = function(){
    document.getElementById("t-issue").value="";
    document.getElementById("t-name").value="";
    document.getElementById("t-details").value="";
    document.getElementById("ticket-form-wrap").classList.remove("hidden");
    document.getElementById("ticket-success").classList.add("hidden");
  };

  document.getElementById("send-btn").addEventListener("click",()=>{ const t=document.getElementById("msg-input").value.trim(); if(t){ document.getElementById("msg-input").value=""; sendMsg(t); } });
  document.getElementById("msg-input").addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); document.getElementById("send-btn").click(); } });
  document.getElementById("upload-btn-header").addEventListener("click",()=>document.getElementById("file-input").click());
  document.getElementById("drop-zone").addEventListener("click",()=>document.getElementById("file-input").click());
  document.getElementById("file-input").addEventListener("change",e=>{ if(e.target.files?.length) doUpload(e.target.files); e.target.value=""; });
  document.body.addEventListener("click",e=>{
    const tBtn=e.target.closest("[data-topic]");
    if(tBtn){ const t=tBtn.getAttribute("data-topic"); selectedTopic=(selectedTopic===t?null:t); buildTopicFilters(); buildTopQuestions(); return; }
    const qBtn=e.target.closest("[data-q]"); if(qBtn){ const q=qBtn.getAttribute("data-q"); if(q) sendMsg(q); }
  });

  buildNav();
  buildTopQuestions();
  buildQuickSuggestions();
  loadDocs();
  setInterval(loadDocs, 15000);
})();
</script>
</body>
</html>`);

  // ── frontend/src/App.tsx — multi-page UI matching sandbox ───────────────────
  const ragAppTsx = `import React, { useState, useRef, useEffect } from "react";

interface ApiDoc { id: string; name?: string; filename?: string; indexed: boolean; confidence?: number; }
interface BotMsg { id: string; role: "bot"; answer: string; steps?: string[]; source?: string; confidence?: number; out_of_scope?: boolean; related?: string[]; ts: string; }
interface UserMsg { id: string; role: "user"; text: string; ts: string; }
type Msg = UserMsg | BotMsg;

function ConfBadge({ value }: { value?: number }) {
  if (!value) return null;
  const pct = Math.round(value > 1 ? value : value * 100);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1"/><path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {pct}% confidence
    </span>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  return text.split("\\n").map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-1" />;
    const parts: React.ReactNode[] = [];
    const segs = line.split(/\\*\\*(.*?)\\*\\*/g);
    segs.forEach((s, j) => { if (j % 2 === 1) parts.push(<strong key={j}>{s}</strong>); else if (s) parts.push(s); });
    const isList = /^(\\d+\\.|-) /.test(line);
    return <p key={i} className={\`text-sm text-slate-800 leading-relaxed\${isList ? " pl-3" : ""}\`}>{parts}</p>;
  });
}

async function apiHealth(): Promise<string> {
  const r = await fetch("/api/health");
  if (!r.ok) return "AI Assistant";
  const d = await r.json();
  return d.app || "AI Assistant";
}
async function apiDocs(): Promise<ApiDoc[]> {
  const r = await fetch("/api/documents");
  return r.ok ? r.json() : [];
}
async function apiChat(question: string): Promise<Omit<BotMsg, "id" | "role" | "ts">> {
  const r = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, workspace_id: 1 }),
  });
  if (!r.ok) throw new Error("Chat API " + r.status);
  return r.json();
}
async function apiUpload(file: File): Promise<any> {
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch("/api/documents/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error("Upload " + r.status);
  return r.json().catch(() => ({}));
}
function buildTopics(docs: ApiDoc[]): { topic: string; count: number }[] {
  const map: Record<string, number> = {};
  docs.forEach(d => {
    const t = (d.filename ?? d.name ?? "Document").replace(/\\.[^.]+$/, "");
    map[t] = (map[t] ?? 0) + 1;
  });
  return Object.entries(map).map(([topic, count]) => ({ topic, count }));
}
function buildSuggestions(docs: ApiDoc[]): string[] {
  if (!docs.length) return ["What can you help me with?", "Summarise the uploaded documents", "What are the key topics covered?"];
  return docs.flatMap(d => {
    const n = (d.filename ?? d.name ?? "Doc").replace(/\\.[^.]+$/, "");
    return [\`What does \${n} cover?\`, \`Summarise \${n}\`, \`What are common issues in \${n}?\`];
  }).slice(0, 9);
}

// RAG Scaffold — backend on port 8003 — routes: /api/chat, /api/documents/upload, /api/documents
type Page = "chat" | "questions" | "uploads" | "analytics" | "handoff";

function getExt(filename: string): string {
  return (filename.split(".").pop() ?? "DOC").toUpperCase();
}
function buildTopQuestions(docs: ApiDoc[]): string[] {
  if (!docs.length) return ["What issue is being reported?", "How do I troubleshoot this problem?", "Who do I contact for support?"];
  return docs.flatMap(d => {
    const n = (d.filename ?? d.name ?? "Doc").replace(/\\.[^.]+$/, "");
    return [\`What issue is being reported with \${n}?\`, \`How do I resolve a \${n} error?\`, \`Who do I contact for \${n} support?\`];
  }).slice(0, 10);
}

export default function App() {
  const [page, setPage] = useState<Page>("chat");
  const [appTitle, setAppTitle] = useState("AI Assistant");
  const [messages, setMessages] = useState<Msg[]>([{
    id: "welcome", role: "bot",
    answer: "Hello! I'm your AI assistant. Upload knowledge base documents and ask me anything.",
    ts: new Date().toLocaleTimeString(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<ApiDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ticketForm, setTicketForm] = useState({ issue: "", name: "", priority: "Medium", details: "" });
  const [ticketSent, setTicketSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const suggestions = buildSuggestions(docs);
  const topQuestions = buildTopQuestions(docs);
  const msgCount = messages.filter(m => m.role === "user").length;
  const botMsgs = messages.filter((m): m is BotMsg => m.role === "bot" && m.id !== "welcome");
  const lowConfCount = botMsgs.filter(m => m.confidence !== undefined && (m.confidence > 1 ? m.confidence : m.confidence * 100) < 75).length;
  const lastQuery = (messages.filter(m => m.role === "user").slice(-1)[0] as UserMsg | undefined)?.text ?? null;
  const unanswered = botMsgs.filter(m => m.out_of_scope || (m.confidence !== undefined && (m.confidence > 1 ? m.confidence : m.confidence * 100) < 50));

  useEffect(() => {
    apiHealth().then(t => { setAppTitle(t); setMessages([{ id: "welcome", role: "bot", answer: \`Hello! I'm your AI assistant for \${t}. Upload documents and ask me anything.\`, ts: new Date().toLocaleTimeString() }]); });
    apiDocs().then(setDocs);
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setInput("");
    if (page !== "chat") setPage("chat");
    setMessages(p => [...p, { id: Date.now() + "u", role: "user", text, ts: new Date().toLocaleTimeString() }]);
    setLoading(true);
    try {
      const resp = await apiChat(text);
      setMessages(p => [...p, { id: Date.now() + "b", role: "bot", ...resp, ts: new Date().toLocaleTimeString() }]);
    } catch {
      setMessages(p => [...p, { id: Date.now() + "e", role: "bot", answer: "⚠️ Backend not reachable. Ensure FastAPI is running on port 8003.", ts: new Date().toLocaleTimeString() }]);
    } finally { setLoading(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const results = await Promise.all(Array.from(files).map(f => apiUpload(f)));
      const fresh = await apiDocs();
      if (fresh.length > 0) setDocs(fresh);
      else setDocs(p => [...p, ...results.map((r: any, i: number) => ({ id: String(Date.now() + i), name: r.title || r.filename || files[i]?.name || "Document", indexed: true }))]);
    } catch (err) {
      alert("Upload failed: " + (err instanceof Error ? err.message : String(err)));
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const navItems: { id: Page; icon: string; label: string }[] = [
    { id: "chat", icon: "💬", label: "Support Chat" },
    { id: "questions", icon: "💡", label: "Suggested Questions" },
    { id: "uploads", icon: "📁", label: "Admin Uploads" },
    { id: "analytics", icon: "📊", label: "Conversation Analytics" },
    { id: "handoff", icon: "📞", label: "Ticket Handoff" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100" style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <aside className="w-64 bg-slate-800 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-base">{appTitle.charAt(0).toUpperCase()}</div>
            <div className="min-w-0"><p className="text-sm font-bold leading-tight truncate">{appTitle}</p><p className="text-xs text-slate-400 leading-tight">Document-aware support</p></div>
          </div>
        </div>
        <nav className="p-3 border-b border-white/10 space-y-0.5">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)}
              className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left \${page === item.id ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-white/10"}\`}>
              <span className="text-base">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 px-1">Top 10 Questions</p>
          {topQuestions.map((q, i) => (
            <button key={i} onClick={() => send(q)}
              className="w-full flex items-start gap-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-lg px-2 py-2 transition-colors mb-1">
              <span className="w-5 h-5 rounded-full bg-indigo-600/60 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <span className="leading-snug">{q}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {page === "chat" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">💬</span><p className="flex-1 text-base font-bold text-slate-900">Support Chat</p>
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">● AI Active</span>
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">● KB Connected</span>
            <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">FAISS RAG · Azure OpenAI</span>
          </header>
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50">
            {messages.map(msg => (
              <div key={msg.id} className={\`flex \${msg.role === "user" ? "justify-end" : "justify-start"}\`}>
                {msg.role === "user"
                  ? <div><div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-md">{(msg as UserMsg).text}</div><p className="text-[10px] text-slate-400 text-right mt-1">{msg.ts}</p></div>
                  : (() => { const bm = msg as BotMsg; return (
                    <div className={\`bg-white border \${bm.out_of_scope ? "border-amber-200" : "border-slate-200"} rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-xl\`}>
                      {bm.out_of_scope && <div className="mb-3 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs font-medium">⚠ Outside knowledge base scope</div>}
                      <div className="space-y-0.5">{renderMarkdown(bm.answer)}</div>
                      {bm.steps && bm.steps.length > 0 && <div className="mt-3 pt-3 border-t border-slate-100"><p className="text-xs font-semibold text-slate-500 mb-2">Step-by-Step Resolution</p><ol className="space-y-1.5">{bm.steps.map((s, i) => <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700"><span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>{s}</li>)}</ol></div>}
                      {bm.source && bm.source !== "N/A" && <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap"><span className="text-xs text-slate-500">📄 {bm.source}</span><ConfBadge value={bm.confidence} /></div>}
                      {bm.related && bm.related.length > 0 && <div className="mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] font-semibold text-slate-400 mb-1.5">Follow-ups:</p><div className="flex flex-wrap gap-1.5">{bm.related.map((r, i) => <button key={i} onClick={() => send(r)} className="text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2.5 py-0.5 hover:bg-indigo-100">{r}</button>)}</div></div>}
                      {msg.id !== "welcome" && <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2"><span className="text-[10px] text-slate-400">Helpful?</span><button className="text-base">👍</button><button className="text-base">👎</button></div>}
                      <p className="text-[10px] text-slate-400 mt-1">{msg.ts}</p>
                    </div>); })()}
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 inline-flex gap-1.5 shadow-sm">{[0,1,2].map(i => <span key={i} className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: \`\${i * 0.14}s\` }} />)}</div></div>}
            <div ref={bottomRef} />
          </div>
          <div className="bg-white border-t border-slate-200 p-3.5 flex-shrink-0">
            <div className="flex gap-2.5 items-end mb-2">
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask a question…" rows={2} className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={() => send()} disabled={!input.trim() || loading} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl px-5 py-2.5 text-sm font-semibold h-[44px] transition-colors">Send ➤</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">{suggestions.slice(0, 3).map(s => <button key={s} onClick={() => send(s)} className="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2.5 py-0.5 hover:bg-indigo-50 hover:text-indigo-600">{s}</button>)}</div>
            <p className="text-xs text-slate-400 text-center">Powered by Knowledge Base · FAISS RAG · Azure OpenAI</p>
          </div>
        </>)}

        {page === "questions" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">💡</span><p className="flex-1 text-base font-bold text-slate-900">Suggested Questions</p>
            <span className="text-xs text-slate-500">{docs.length} document{docs.length !== 1 ? "s" : ""} indexed</span>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            {docs.length === 0
              ? <div className="text-center py-20 text-slate-400"><p className="text-4xl mb-3">💡</p><p className="font-semibold">No documents uploaded yet</p></div>
              : docs.map(d => {
                  const fn = (d.filename ?? d.name ?? "Document").replace(/\\.[^.]+$/, "");
                  const qs = [\`What does \${fn} cover?\`, \`Summarise \${fn}\`, \`What are common issues in \${fn}?\`, \`How do I resolve a \${fn} error?\`, \`Who do I contact for \${fn} support?\`];
                  return (
                    <div key={d.id} className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{getExt(d.filename ?? d.name ?? "DOC")}</span>
                        <p className="text-sm font-bold text-slate-800 truncate">{d.filename ?? d.name}</p>
                        <span className="ml-auto text-[11px] text-emerald-600 font-semibold">✓ Indexed</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {qs.map((q, i) => (
                          <button key={i} onClick={() => send(q)} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>{q}<span className="ml-auto text-slate-300 text-xs">→</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
          </div>
        </>)}

        {page === "uploads" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">📁</span><p className="flex-1 text-base font-bold text-slate-900">Admin Uploads</p>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg">{uploading ? "⏳ Indexing…" : "📎 Upload Documents"}</button>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={handleUpload} />
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-indigo-300 rounded-xl p-10 text-center mb-6 cursor-pointer hover:bg-indigo-50">
              <p className="text-4xl mb-2">📎</p><p className="text-sm font-semibold text-slate-700">Click to upload documents</p>
              <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, MD, CSV — multiple files</p>
            </div>
            {docs.length === 0 ? <p className="text-center text-slate-400 text-sm italic">No documents uploaded yet.</p>
              : <div className="grid grid-cols-2 gap-3">{docs.map(d => { const fn = d.filename ?? d.name ?? "File"; return (
                  <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0"><span className="text-[10px] font-bold text-blue-700">{getExt(fn)}</span></div>
                      <div className="min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{fn}</p><p className={\`text-[11px] font-semibold mt-0.5 \${d.indexed ? "text-emerald-600" : "text-amber-500"}\`}>{d.indexed ? "✓ Indexed" : "⏳ Pending"}</p></div>
                    </div>
                  </div>); })}</div>}
          </div>
        </>)}

        {page === "analytics" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">📊</span><p className="flex-1 text-base font-bold text-slate-900">Conversation Analytics</p>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[{ label: "Messages", value: msgCount, color: "text-slate-900" }, { label: "Low Confidence", value: lowConfCount, color: "text-amber-500" }, { label: "Last Query", value: lastQuery ? lastQuery.slice(0, 20) + (lastQuery.length > 20 ? "…" : "") : "--", color: "text-slate-600" }].map(({ label, value, color }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                  <p className="text-xs text-slate-400 mb-1">{label}</p><p className={\`text-2xl font-bold \${color}\`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-4">
              <p className="text-sm font-bold text-slate-700 mb-4">Message Volume</p>
              {msgCount === 0 ? <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No messages yet</div>
                : <div className="h-32 flex items-end gap-1">{messages.filter(m => m.role === "user").map((m, i) => <div key={i} className="flex-1 bg-indigo-400 rounded-t" style={{ height: \`\${Math.min(100, 30 + i * 8)}%\` }} />)}</div>}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-700 mb-3">Unanswered / Escalated</p>
              {unanswered.length === 0 ? <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">No unresolved queries in this session.</p>
                : unanswered.map((m, i) => <div key={i} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0"><span className="text-amber-500">⚠</span><p className="text-sm text-slate-600">{m.answer.slice(0, 80)}…</p></div>)}
            </div>
          </div>
        </>)}

        {page === "handoff" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">📞</span><p className="flex-1 text-base font-bold text-slate-900">Ticket Handoff</p>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            {ticketSent
              ? <div className="max-w-md mx-auto text-center py-20"><p className="text-5xl mb-4">✅</p><p className="text-lg font-bold text-slate-800">Ticket Submitted</p><p className="text-sm text-slate-500 mt-2">Support will follow up shortly.</p><button onClick={() => { setTicketSent(false); setTicketForm({ issue: "", name: "", priority: "Medium", details: "" }); }} className="mt-6 bg-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg">Submit Another</button></div>
              : <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <p className="text-sm font-bold text-slate-700 mb-4">Log a Support Ticket</p>
                  <div className="space-y-4">
                    <div><label className="text-xs font-semibold text-slate-600 block mb-1">Issue Category</label>
                      <select value={ticketForm.issue} onChange={e => setTicketForm(p => ({ ...p, issue: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        <option value="">Select category…</option><option>SAP Handheld</option><option>ID Disabled</option><option>Lane Issues</option><option>MFA</option><option>NCR Printer</option><option>Network</option><option>Pinpad</option><option>Password Reset</option><option>Other</option>
                      </select></div>
                    <div><label className="text-xs font-semibold text-slate-600 block mb-1">Your Name</label>
                      <input value={ticketForm.name} onChange={e => setTicketForm(p => ({ ...p, name: e.target.value }))} placeholder="Enter your name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" /></div>
                    <div><label className="text-xs font-semibold text-slate-600 block mb-1">Priority</label>
                      <div className="flex gap-2">{["Low", "Medium", "High", "Critical"].map(p => <button key={p} onClick={() => setTicketForm(prev => ({ ...prev, priority: p }))} className={\`flex-1 py-1.5 text-xs font-semibold rounded-lg border \${ticketForm.priority === p ? p === "Critical" ? "bg-red-600 text-white border-red-600" : p === "High" ? "bg-amber-500 text-white border-amber-500" : p === "Medium" ? "bg-yellow-400 text-white border-yellow-400" : "bg-green-500 text-white border-green-500" : "border-slate-200 text-slate-500 hover:bg-slate-50"}\`}>{p}</button>)}</div></div>
                    <div><label className="text-xs font-semibold text-slate-600 block mb-1">Details</label>
                      <textarea value={ticketForm.details} onChange={e => setTicketForm(p => ({ ...p, details: e.target.value }))} placeholder="Describe the issue…" rows={4} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" /></div>
                    <button onClick={() => { if (ticketForm.issue && ticketForm.name) setTicketSent(true); else alert("Please fill in Issue Category and Name."); }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-lg">Submit Ticket</button>
                  </div>
                </div>}
          </div>
        </>)}
      </div>

      <aside className="w-64 border-l bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Knowledge Base</p>
          <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center">{docs.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {docs.length === 0 ? <p className="text-xs text-slate-400 italic p-2">No documents yet.</p>
            : docs.map(d => { const fn = d.filename ?? d.name ?? "File"; return (
              <div key={d.id} className="border border-slate-200 rounded-xl p-3 mb-2 cursor-pointer hover:border-indigo-300" onClick={() => send(\`Summarise \${fn}\`)}>
                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{getExt(fn)}</span>
                <p className="text-sm font-semibold text-slate-800 mt-1.5 truncate">{fn}</p>
                <div className="flex items-center justify-between mt-1.5"><span className="text-[11px] text-slate-400">—</span><span className={\`text-[11px] font-semibold \${d.indexed ? "text-emerald-600" : "text-amber-500"}\`}>{d.indexed ? "✓ Indexed" : "⏳ Pending"}</span></div>
              </div>); })}
        </div>
        <div className="border-t border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Session</p>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex justify-between"><span>Messages</span><span className="font-bold text-slate-800">{msgCount}</span></div>
            <div className="flex justify-between"><span>Low Confidence</span><span className={\`font-bold \${lowConfCount > 0 ? "text-amber-500" : "text-slate-800"}\`}>{lowConfCount}</span></div>
            <div className="flex justify-between"><span>Last Query</span><span className="font-bold text-slate-800 truncate ml-2 max-w-[100px]">{lastQuery ? lastQuery.slice(0, 15) + (lastQuery.length > 15 ? "…" : "") : "--"}</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
`;
  zip.file("frontend/src/App.tsx", ragAppTsx);

  // ── frontend/src/main.tsx ─────────────────────────────────────────────────
  zip.file("frontend/src/main.tsx", `import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
`);

  // ── frontend/src/index.css ────────────────────────────────────────────────
  zip.file("frontend/src/index.css", `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n* { box-sizing: border-box; }\nbody { margin: 0; }\n`);

  // ── frontend/index.html ───────────────────────────────────────────────────
  zip.file("frontend/index.html", `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${appTitle}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);

  // ── frontend/package.json ─────────────────────────────────────────────────
  zip.file("frontend/package.json", JSON.stringify({
    name: appName + "-frontend", version: "0.1.0", private: true,
    scripts: { dev: "vite", build: "tsc && vite build", preview: "vite preview" },
    dependencies: { react: "^18.3.1", "react-dom": "^18.3.1", "axios": "^1.7.2" },
    devDependencies: { "@types/react": "^18.3.3", "@types/react-dom": "^18.3.0", "@vitejs/plugin-react": "^4.3.1",
    autoprefixer: "^10.4.19", postcss: "^8.4.38", tailwindcss: "^3.4.4", typescript: "^5.2.2", vite: "^5.4.0" },
  }, null, 2));

  // ── frontend/vite.config.ts ───────────────────────────────────────────────
  zip.file("frontend/vite.config.ts", `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()], server: { proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } } } });\n`);

  // ── frontend/tsconfig.json ────────────────────────────────────────────────
  zip.file("frontend/tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2020", useDefineForClassFields: true, lib: ["ES2020","DOM","DOM.Iterable"], module: "ESNext", skipLibCheck: true, moduleResolution: "bundler", allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx", strict: true, noUnusedLocals: true, noUnusedParameters: true, noFallthroughCasesInSwitch: true }, include: ["src"], references: [{ path: "./tsconfig.node.json" }] }, null, 2));
  zip.file("frontend/tsconfig.node.json", JSON.stringify({ compilerOptions: { composite: true, skipLibCheck: true, module: "ESNext", moduleResolution: "bundler", allowSyntheticDefaultImports: true }, include: ["vite.config.ts"] }, null, 2));
  zip.file("frontend/tailwind.config.js", `/** @type {import('tailwindcss').Config} */\nexport default { content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] };\n`);
  zip.file("frontend/postcss.config.js", `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`);

  // ── backend/app/rag.py — proven RAGChatbot pattern ────────────────────────
  zip.file("backend/app/rag.py", `import os, faiss, pickle, json, re, numpy as np
from pathlib import Path
from openai import AzureOpenAI

AZURE_ENDPOINT   = os.environ.get("AZURE_OPENAI_ENDPOINT", "https://your-resource.openai.azure.com/")
AZURE_API_KEY    = os.environ.get("AZURE_OPENAI_API_KEY", "")
EMBED_DEPLOYMENT = os.environ.get("AZURE_EMBED_DEPLOYMENT", "text-embedding-3-small")
CHAT_DEPLOYMENT  = os.environ.get("AZURE_CHAT_DEPLOYMENT", "gpt-4o")

SYSTEM_PROMPT = """You are a helpful ${appTitle} assistant. \\
Answer questions based on the provided context. \\
If you cannot find the answer in the context, say so clearly.
At the end of your answer, on a new line, output exactly:
FOLLOWUPS: ["<follow-up question 1>", "<follow-up question 2>"]
These should be 2 natural follow-up questions related to the answer."""

INDEX_PATH   = Path("faiss_index.pkl")
client       = AzureOpenAI(azure_endpoint=AZURE_ENDPOINT, api_key=AZURE_API_KEY, api_version="2024-02-01")
_index: faiss.IndexFlatL2 | None = None
_chunks: list[str] = []
_chunk_sources: list[str] = []

def _chunk_text(text: str, max_words: int = 150) -> list[str]:
    words = text.split()
    chunks, current = [], []
    for word in words:
        current.append(word)
        if len(current) >= max_words:
            chunks.append(" ".join(current))
            current = []
    if current:
        chunks.append(" ".join(current))
    return [c for c in chunks if c.strip()]

def _embed_batched(texts: list[str], batch_size: int = 16) -> np.ndarray:
    all_vecs = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        resp = client.embeddings.create(input=batch, model=EMBED_DEPLOYMENT)
        all_vecs.extend([e.embedding for e in resp.data])
    return np.array(all_vecs, dtype="float32")

def add_document(text: str, source_name: str = "") -> None:
    global _index, _chunks, _chunk_sources
    sentences = _chunk_text(text, max_words=150)
    if not sentences:
        return
    vecs = _embed_batched(sentences)
    if _index is None:
        _index = faiss.IndexFlatL2(vecs.shape[1])
    _index.add(vecs)
    _chunks.extend(sentences)
    _chunk_sources.extend([source_name] * len(sentences))
    with open(INDEX_PATH, "wb") as f:
        pickle.dump({"index": faiss.serialize_index(_index), "chunks": _chunks, "sources": _chunk_sources}, f)

def _load_index() -> None:
    global _index, _chunks, _chunk_sources
    if INDEX_PATH.exists() and _index is None:
        with open(INDEX_PATH, "rb") as f:
            data = pickle.load(f)
        _index = faiss.deserialize_index(data["index"])
        _chunks = data["chunks"]
        _chunk_sources = data.get("sources", [""] * len(_chunks))

def answer(question: str, top_k: int = 5) -> dict:
    _load_index()
    context, source_doc = "", ""
    if _index is not None and _chunks:
        q_vec = _embed_batched([question])
        _, idxs = _index.search(q_vec, min(top_k, len(_chunks)))
        valid = [i for i in idxs[0] if i < len(_chunks)]
        context = "\\n".join(_chunks[i] for i in valid)
        if valid and _chunk_sources:
            source_doc = _chunk_sources[valid[0]]
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Context:\\n{context}\\n\\nQuestion: {question}"},
    ]
    response = client.chat.completions.create(model=CHAT_DEPLOYMENT, messages=messages, temperature=0.3, max_completion_tokens=900)
    raw = response.choices[0].message.content or ""
    followups = []
    answer_text = raw
    m = re.search(r"FOLLOWUPS:\\s*(\\[.*?\\])", raw, re.DOTALL)
    if m:
        answer_text = raw[:m.start()].strip()
        try: followups = json.loads(m.group(1))
        except: pass
    return {"answer": answer_text, "source": "FAISS RAG", "source_doc": source_doc, "confidence": 85, "suggested_followups": followups}
`);

  // ── backend/app/api/chat.py ───────────────────────────────────────────────
  zip.file("backend/app/api/chat.py", `from fastapi import APIRouter
from pydantic import BaseModel
from app import rag

router = APIRouter()

class ChatRequest(BaseModel):
    question: str = ""
    message: str = ""   # legacy alias
    workspace_id: int = 1
    session_id: str = ""

@router.post("/chat")
async def chat(req: ChatRequest):
    text = req.question or req.message
    if not text:
        return {"answer": "Please provide a question.", "source": "N/A", "confidence": 0}
    result = rag.answer(text)
    return result
`);

  // ── backend/app/api/documents.py ─────────────────────────────────────────
  zip.file("backend/app/api/documents.py", `import io
from fastapi import APIRouter, UploadFile
from app import rag

router = APIRouter()
_docs: list[dict] = []

def extract_text(filename: str, data: bytes) -> str:
    ext = (filename or "").lower().rsplit(".", 1)[-1]
    if ext == "docx":
        try:
            from docx import Document
            doc = Document(io.BytesIO(data))
            return "\\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            return f"[docx parse error: {e}]"
    elif ext == "pdf":
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                return "\\n".join(page.extract_text() or "" for page in pdf.pages)
        except Exception as e:
            return f"[pdf parse error: {e}]"
    else:
        return data.decode("utf-8", errors="replace")

@router.post("/documents/upload")
async def upload(file: UploadFile):
    data = await file.read()
    content = extract_text(file.filename or "", data)
    rag.add_document(content, source_name=file.filename or "")
    doc = {"id": str(len(_docs) + 1), "filename": file.filename or "Untitled", "name": file.filename or "Untitled", "indexed": True}
    _docs.append(doc)
    return doc

@router.get("/documents")
async def list_docs():
    return _docs
`);

  // ── backend/main.py ───────────────────────────────────────────────────────
  zip.file("backend/main.py", `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router
from app.api.documents import router as docs_router

app = FastAPI(title="${appTitle}")

@app.middleware("http")
async def cors_middleware(request, call_next):
    if request.method == "OPTIONS":
        from fastapi.responses import Response
        return Response(status_code=200, headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"*","Access-Control-Allow-Headers":"*"})
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

app.include_router(chat_router, prefix="/api")
app.include_router(docs_router, prefix="/api")

@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "${appTitle}"}
`);

  // ── backend/requirements.txt ──────────────────────────────────────────────
  zip.file("backend/requirements.txt", `fastapi>=0.111.0
uvicorn[standard]>=0.29.0
openai>=1.30.0
faiss-cpu>=1.8.0
numpy>=1.26.0
python-multipart>=0.0.9
python-docx>=1.1.0
`);

  // ── backend/.env.example ─────────────────────────────────────────────────
  zip.file("backend/.env.example", `AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-key-here
AZURE_CHAT_DEPLOYMENT=gpt-4o
AZURE_EMBED_DEPLOYMENT=text-embedding-ada-002
`);

  // ── README.md ─────────────────────────────────────────────────────────────
  zip.file("README.md", `# ${appTitle}

> RAG Scaffold generated by AgentForge · ${new Date().toLocaleDateString()}

## Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Backend**: FastAPI + FAISS + Azure OpenAI GPT-4o (sync client)
- **RAG**: FAISS vector store, text-embedding-ada-002, document ingestion

## Quick Start

### Backend
\`\`\`bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in your Azure keys
uvicorn main:app --reload --port 8000
\`\`\`

### Frontend
\`\`\`bash
cd frontend
npm install
npm run dev            # opens http://localhost:5173
\`\`\`

## Features
- Upload documents (PDF/DOCX/TXT) → indexed into FAISS
- Ask questions → RAG retrieval + GPT-4o answer
- Open \`sandbox.html\` in browser for a self-contained preview
`);

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

// ─── Dynamic App.tsx builder — plan-specific UI for non-RAG Custom Code plans ─

function buildDynamicAppTsx(plan: Plan, appTitle: string, port: number): string {
  const badge = plan.tech_stack?.ai ?? plan.tech_stack?.backend ?? "Azure OpenAI";
  const featureList = (plan.features ?? []).slice(0, 8);
  const apiList = (plan.api_endpoints ?? []).slice(0, 6);

  // Build nav pages from features (max 5 total including Chat + Analytics)
  const featurePages = featureList.slice(0, 3).map((f, i) => ({
    id: `feature${i}`,
    icon: ["⚙️", "🔧", "📋"][i] ?? "📌",
    label: f.length > 20 ? f.slice(0, 20) + "…" : f,
  }));

  const allPages = [
    { id: "chat", icon: "💬", label: "AI Chat" },
    ...featurePages,
    { id: "analytics", icon: "📊", label: "Analytics" },
  ];

  const navItems = allPages
    .map(
      (p) =>
        `    { id: "${p.id}", icon: "${p.icon}", label: ${JSON.stringify(p.label)} },`
    )
    .join("\n");

  const suggestedQs = featureList
    .slice(0, 5)
    .map((f) => `How does the ${f} feature work?`);
  if (!suggestedQs.length) suggestedQs.push("What can you help me with?", "How do I get started?");

  const suggestionsCode = suggestedQs
    .map((q) => `    "${q}",`)
    .join("\n");

  const featurePageComponents = featurePages
    .map((p, i) => {
      const feat = (featureList[i] ?? p.label).toLowerCase();
      const api = apiList[i] ?? "";
      const apiMethod = api.startsWith("POST") ? "POST" : api.startsWith("PUT") ? "PUT" : "GET";
      const apiPath = api.replace(/^(GET|POST|PUT|DELETE)\s+/, "").split(" ")[0] ?? "/api/data";

      // Detect feature type by keywords
      const isForm = /form|intake|creat|submit|input|add|new|register/i.test(feat);
      const isUpload = /upload|file|attach|import|document|csv|xlsx|pdf/i.test(feat);
      const isList = /history|list|search|filter|browse|all |decisions|records/i.test(feat);
      const isView = /view|verdict|result|output|detail|report|show|display/i.test(feat);

      if (isUpload) return `
      {currentPage === "${p.id}" && (
        <UploadPage icon="${p.icon}" label="${p.label}" apiBase={API_BASE} />
      )}`;
      const isDecisionIntake = /decision.*intake|intake.*decision/i.test(feat);
      if (isDecisionIntake) return `
      {currentPage === "${p.id}" && (
        <DecisionIntakePage apiBase={API_BASE} />
      )}`;
      if (isForm) return `
      {currentPage === "${p.id}" && (
        <FormPage icon="${p.icon}" label="${p.label}" apiBase={API_BASE} apiPath="${apiPath}" method="${apiMethod}" />
      )}`;
      if (isList) return `
      {currentPage === "${p.id}" && (
        <ListPage icon="${p.icon}" label="${p.label}" apiBase={API_BASE} apiPath="${apiPath}" />
      )}`;
      const isVerdictView = /verdict/i.test(feat);
      if (isView) return `
      {currentPage === "${p.id}" && (
        ${isVerdictView
          ? `<VerdictPage apiBase={API_BASE} />`
          : `<ViewPage icon="${p.icon}" label="${p.label}" apiBase={API_BASE} apiPath="${apiPath}" />`}
      )}`;
      // default: simple card with API call
      return `
      {currentPage === "${p.id}" && (
        <ListPage icon="${p.icon}" label="${p.label}" apiBase={API_BASE} apiPath="${apiPath}" />
      )}`;
    })
    .join("\n");

  return `import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const API_BASE = "http://localhost:${port}";
const SESSION_ID = Math.random().toString(36).slice(2);

interface Message { role: "user" | "bot"; text: string; time: string; data?: any; }

// ── Decision Intake Page — manual form + bulk Excel upload ───────────────────

function DecisionIntakePage({ apiBase }: { apiBase: string }) {
  const [tab, setTab] = React.useState<"manual"|"bulk">("manual");
  const [fields, setFields] = React.useState({ title:"", question:"", context:"", constraints:"", stakes:"" });
  const [manualStatus, setManualStatus] = React.useState<"idle"|"loading"|"ok"|"err">("idle");
  const [manualMsg, setManualMsg] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [rows, setRows] = React.useState<Record<string,string>[]>([]);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = React.useState<"idle"|"running"|"done">("idle");
  const [bulkResults, setBulkResults] = React.useState<{idx:number;title:string;status:"ok"|"err";msg:string}[]>([]);
  const [fileName, setFileName] = React.useState("");

  async function parseExcel(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data: Record<string,string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    setRows(data);
    setSelected(new Set(data.map((_:any, i:number) => i)));
    setFileName(file.name);
    setBulkResults([]);
    setBulkStatus("idle");
  }

  async function parseCSV(file: File) {
    const text = await file.text();
    const lines = text.split("\\n").filter(l => l.trim());
    if (lines.length < 2) return;
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g,""));
    const data: Record<string,string>[] = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g,""));
      const row: Record<string,string> = {};
      headers.forEach((h,i) => { row[h] = vals[i] ?? ""; });
      return row;
    });
    setRows(data);
    setSelected(new Set(data.map((_:any, i:number) => i)));
    setFileName(file.name);
    setBulkResults([]);
    setBulkStatus("idle");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) await parseCSV(file);
    else await parseExcel(file);
  }

  function toggleRow(i: number) {
    setSelected(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });
  }
  function toggleAll() {
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map((_,i) => i)));
  }

  async function runBulk() {
    if (selected.size === 0) return;
    setBulkStatus("running");
    setBulkResults([]);
    const toRun = [...selected].sort((a,b) => a-b);
    for (const idx of toRun) {
      const row = rows[idx];
      const payload = {
        title: row.title || row.Title || \`Decision \${idx+1}\`,
        question: row.question || row.Question || "",
        context: row.context || row.Context || "",
        constraints: row.constraints || row.Constraints || "",
        stakes: row.stakes || row.Stakes || "",
      };
      try {
        const r = await fetch(apiBase + "/api/decisions", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
        const d = await r.json();
        setBulkResults(prev => [...prev, { idx, title: payload.title, status: r.ok ? "ok" : "err", msg: r.ok ? \`#\${d.id ?? "?"} — pipeline started\` : d.detail ?? "Error" }]);
      } catch(e: any) {
        setBulkResults(prev => [...prev, { idx, title: payload.title, status: "err", msg: String(e) }]);
      }
    }
    setBulkStatus("done");
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    setManualStatus("loading"); setManualMsg("");
    try {
      const r = await fetch(apiBase + "/api/decisions", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(fields) });
      const d = await r.json();
      if (r.ok) {
        setManualMsg(\`Decision #\${d.id} created — AI advisors are processing it now. Check Verdict View in ~30s.\`);
        setManualStatus("ok");
        setFields({ title:"", question:"", context:"", constraints:"", stakes:"" });
      } else {
        setManualMsg(d.detail ?? "Submission failed.");
        setManualStatus("err");
      }
    } catch { setManualStatus("err"); setManualMsg("Error — check backend is running."); }
  }

  const COLS = ["title","question","context","constraints","stakes"];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
        <span className="text-lg">⚙️</span>
        <p className="flex-1 text-base font-bold text-slate-900">Decision Intake</p>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
          <button onClick={() => setTab("manual")}
            className={\`px-4 py-1.5 transition-colors \${tab==="manual" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}\`}>
            Manual
          </button>
          <button onClick={() => setTab("bulk")}
            className={\`px-4 py-1.5 transition-colors \${tab==="bulk" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}\`}>
            Bulk Upload
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        {tab === "manual" && (
          <form onSubmit={submitManual} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4 max-w-2xl">
            {(["title","question","context","constraints","stakes"] as const).map(f => (
              <div key={f}>
                <label className="block text-xs font-semibold text-slate-600 mb-1 capitalize">{f}</label>
                <textarea rows={f==="title"||f==="stakes" ? 1 : 3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  value={(fields as any)[f]} onChange={e => setFields(prev => ({...prev,[f]:e.target.value}))} />
              </div>
            ))}
            <button type="submit" disabled={manualStatus==="loading" || !fields.question.trim()}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {manualStatus==="loading" ? "Submitting…" : "Submit to AI Council ➤"}
            </button>
            {manualMsg && (
              <p className={\`text-sm rounded-lg px-3 py-2 \${manualStatus==="ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}\`}>
                {manualMsg}
              </p>
            )}
          </form>
        )}
        {tab === "bulk" && (
          <div className="space-y-4">
            <label className="block bg-white rounded-xl border-2 border-dashed border-slate-300 p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors max-w-2xl">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-sm font-semibold text-slate-700">{fileName || "Click to upload Excel or CSV"}</p>
              <p className="text-xs text-slate-400 mt-1">Columns: title · question · context · constraints · stakes</p>
              <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.csv" onChange={handleFileChange} />
            </label>
            {rows.length > 0 && (
              <>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-full">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selected.size===rows.length} onChange={toggleAll}
                        className="w-4 h-4 accent-indigo-600" />
                      <span className="text-xs font-semibold text-slate-600">{selected.size} of {rows.length} selected</span>
                    </div>
                    <button onClick={runBulk} disabled={selected.size===0 || bulkStatus==="running"}
                      className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-2">
                      {bulkStatus==="running" ? "⏳ Processing…" : \`▶ Run \${selected.size} decision\${selected.size!==1?"s":""} through AI Council\`}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="w-8 px-3 py-2"></th>
                          <th className="w-6 px-2 py-2 text-slate-400 font-semibold text-left">#</th>
                          {COLS.map(c => (
                            <th key={c} className="px-3 py-2 text-left text-slate-500 font-semibold capitalize">{c}</th>
                          ))}
                          <th className="px-3 py-2 text-left text-slate-500 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => {
                          const res = bulkResults.find(r => r.idx === i);
                          return (
                            <tr key={i} className={\`border-b border-slate-50 transition-colors \${selected.has(i) ? "bg-indigo-50/40" : "bg-white"}\`}>
                              <td className="px-3 py-2 text-center">
                                <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)}
                                  className="w-4 h-4 accent-indigo-600" />
                              </td>
                              <td className="px-2 py-2 text-slate-400">{i+1}</td>
                              {COLS.map(c => (
                                <td key={c} className="px-3 py-2 text-slate-700 max-w-[180px]">
                                  <p className="truncate">{(row as any)[c] || (row as any)[c.charAt(0).toUpperCase()+c.slice(1)] || ""}</p>
                                </td>
                              ))}
                              <td className="px-3 py-2">
                                {res ? (
                                  <span className={\`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold \${res.status==="ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}\`}>
                                    {res.status==="ok" ? "✓" : "✗"} {res.msg}
                                  </span>
                                ) : bulkStatus==="running" && selected.has(i) ? (
                                  <span className="text-slate-400 animate-pulse">queued…</span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                {bulkStatus==="done" && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium max-w-2xl">
                    {bulkResults.filter(r=>r.status==="ok").length} of {selected.size} decisions submitted — AI advisors are processing. Check Verdict View in ~30s.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable functional page components ──────────────────────────────────────

function FormPage({ icon, label, apiBase, apiPath, method }: { icon: string; label: string; apiBase: string; apiPath: string; method: string }) {
  const [fields, setFields] = React.useState<Record<string,string>>({});
  const [status, setStatus] = React.useState<"idle"|"loading"|"ok"|"err">("idle");
  const [result, setResult] = React.useState<string>("");
  const fieldNames = ["title","question","context","constraints","stakes","name","description","input","value"];
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const r = await fetch(apiBase + apiPath, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(fields) });
      const data = await r.json();
      setResult(JSON.stringify(data, null, 2));
      setStatus("ok");
    } catch { setStatus("err"); setResult("Error — check backend is running."); }
  }
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
        <span className="text-lg">{icon}</span>
        <p className="flex-1 text-base font-bold text-slate-900">{label}</p>
      </header>
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4 max-w-2xl">
          {fieldNames.map(f => (
            <div key={f}>
              <label className="block text-xs font-semibold text-slate-600 mb-1 capitalize">{f}</label>
              <textarea rows={f === "question" || f === "context" || f === "constraints" ? 3 : 1}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                value={fields[f] ?? ""} onChange={e => setFields(prev => ({...prev,[f]:e.target.value}))} />
            </div>
          ))}
          <button type="submit" disabled={status==="loading"}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {status==="loading" ? "Submitting…" : "Submit"}
          </button>
          {result && <pre className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">{result}</pre>}
        </form>
      </div>
    </div>
  );
}

function UploadPage({ icon, label, apiBase }: { icon: string; label: string; apiBase: string }) {
  const [file, setFile] = React.useState<File|null>(null);
  const [status, setStatus] = React.useState<"idle"|"loading"|"ok"|"err">("idle");
  const [result, setResult] = React.useState<string>("");
  async function handleUpload() {
    if (!file) return;
    setStatus("loading");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch(apiBase + "/api/documents/upload", { method:"POST", body: fd });
      const data = await r.json();
      setResult(JSON.stringify(data, null, 2));
      setStatus("ok");
    } catch { setStatus("err"); setResult("Upload failed — check backend is running."); }
  }
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
        <span className="text-lg">{icon}</span>
        <p className="flex-1 text-base font-bold text-slate-900">{label}</p>
      </header>
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-xl space-y-4">
          <label className="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors">
            <p className="text-2xl mb-2">📎</p>
            <p className="text-sm font-semibold text-slate-700">{file ? file.name : "Click to select file"}</p>
            <p className="text-xs text-slate-400 mt-1">Supports .xlsx, .csv, .pdf, .docx, .txt</p>
            <input type="file" className="hidden" accept=".xlsx,.csv,.pdf,.docx,.txt"
              onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} />
          </label>
          {file && (
            <button onClick={handleUpload} disabled={status==="loading"}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {status==="loading" ? "Uploading…" : "Upload File"}
            </button>
          )}
          {result && <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">{result}</pre>}
        </div>
      </div>
    </div>
  );
}

function ListPage({ icon, label, apiBase, apiPath }: { icon: string; label: string; apiBase: string; apiPath: string }) {
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<any>(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    setLoading(true);
    fetch(apiBase + apiPath).then(r=>r.json()).then(d => {
      setItems(Array.isArray(d) ? d : d.items ?? d.data ?? d.decisions ?? d.results ?? []);
    }).catch(() => setError("Could not load data — check backend is running.")).finally(()=>setLoading(false));
  }, []);
  const filtered = items.filter(it => JSON.stringify(it).toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
        <span className="text-lg">{icon}</span>
        <p className="flex-1 text-base font-bold text-slate-900">{label}</p>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-48" />
      </header>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-1/3 border-r border-slate-200 overflow-y-auto bg-white">
          {loading && <p className="p-4 text-sm text-slate-400">Loading…</p>}
          {error && <p className="p-4 text-sm text-red-500">{error}</p>}
          {!loading && !error && filtered.length === 0 && <p className="p-4 text-sm text-slate-400">No records found.</p>}
          {filtered.map((it, i) => (
            <button key={i} onClick={()=>setSelected(it)}
              className={\`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors \${selected===it?"bg-indigo-50":""}\`}>
              <p className="text-sm font-semibold text-slate-800 truncate">{it.title ?? it.name ?? it.question ?? it.id ?? \`Item \${i+1}\`}</p>
              <p className="text-xs text-slate-400 mt-0.5">{it.status ?? it.created_at ?? ""}</p>
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          {selected ? (
            <pre className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-700 whitespace-pre-wrap overflow-x-auto shadow-sm">{JSON.stringify(selected, null, 2)}</pre>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select a record to view details</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ViewPage({ icon, label, apiBase, apiPath }: { icon: string; label: string; apiBase: string; apiPath: string }) {
  const [id, setId] = React.useState("");
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  async function fetchData() {
    if (!id.trim()) return;
    setLoading(true); setError(""); setData(null);
    try {
      const path = apiPath.replace(/\{[^}]+\}/, id.trim());
      const r = await fetch(apiBase + path);
      setData(await r.json());
    } catch { setError("Could not load — check backend is running."); }
    finally { setLoading(false); }
  }
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
        <span className="text-lg">{icon}</span>
        <p className="flex-1 text-base font-bold text-slate-900">{label}</p>
      </header>
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm max-w-2xl space-y-4">
          <div className="flex gap-2">
            <input value={id} onChange={e=>setId(e.target.value)} placeholder="Enter ID…"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <button onClick={fetchData} disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {data && (
            <div className="space-y-3">
              {Object.entries(data).map(([k,v]) => (
                <div key={k} className="border border-slate-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{k}</p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const NAV = [
${navItems}
];

const SUGGESTIONS = [
${suggestionsCode}
];

function parseMsg(m: Message) {
  if (m.data) return m.data;
  try { const p = JSON.parse(m.text); if (p && typeof p === "object" && p.answer) return p; } catch {}
  return null;
}

const PERSONA_COLORS: Record<string, string> = {
  Contrarian: "bg-red-50 border-red-200 text-red-700",
  "First Principles": "bg-blue-50 border-blue-200 text-blue-700",
  Expansionist: "bg-green-50 border-green-200 text-green-700",
  Outsider: "bg-orange-50 border-orange-200 text-orange-700",
  Executor: "bg-purple-50 border-purple-200 text-purple-700",
};
function personaColor(name: string) {
  for (const k of Object.keys(PERSONA_COLORS)) if (name.includes(k)) return PERSONA_COLORS[k];
  return "bg-slate-50 border-slate-200 text-slate-700";
}

function VerdictPage({ apiBase }: { apiBase: string }) {
  const [decisions, setDecisions] = React.useState<any[]>([]);
  const [listLoading, setListLoading] = React.useState(true);
  const [listError, setListError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [selected, setSelected] = React.useState<any>(null);
  const [detail, setDetail] = React.useState<any>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [expandedAdvisors, setExpandedAdvisors] = React.useState<Set<number>>(new Set());

  React.useEffect(() => {
    fetch(apiBase + "/api/decisions")
      .then(r => r.json()).then(d => setDecisions(Array.isArray(d) ? d : d.decisions ?? d.data ?? []))
      .catch(() => setListError("Could not load decisions.")).finally(() => setListLoading(false));
  }, []);

  async function loadDetail(dec: any) {
    setSelected(dec); setDetail(null); setExpandedAdvisors(new Set()); setDetailLoading(true);
    try { const r = await fetch(apiBase + "/api/decisions/" + dec.id); setDetail(await r.json()); }
    catch { setDetail({ error: "Could not load." }); } finally { setDetailLoading(false); }
  }

  function toggleAdvisor(i: number) { setExpandedAdvisors(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; }); }

  const filtered = decisions.filter(d => {
    const ms = !search || JSON.stringify(d).toLowerCase().includes(search.toLowerCase());
    const mf = statusFilter === "all" || d.status === statusFilter;
    return ms && mf;
  });

  const statusBadge = (s: string) => ({ completed: "bg-emerald-100 text-emerald-700", running: "bg-yellow-100 text-yellow-700", failed: "bg-red-100 text-red-700" }[s] ?? "bg-slate-100 text-slate-600");
  const verdict = detail?.chairman_verdict;
  const advisors: any[] = detail?.advisor_outputs ?? [];
  const reviews: any[] = detail?.peer_reviews ?? [];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0 flex-wrap gap-y-2">
        <span className="text-lg">📋</span>
        <p className="flex-1 text-base font-bold text-slate-900">Verdict View</p>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search decisions…"
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-44" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
        </select>
        <span className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </header>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-72 flex-shrink-0 border-r border-slate-200 overflow-y-auto bg-white">
          {listLoading && <p className="p-4 text-sm text-slate-400">Loading…</p>}
          {listError && <p className="p-4 text-sm text-red-500">{listError}</p>}
          {!listLoading && !listError && filtered.length === 0 && <p className="p-4 text-sm text-slate-400">No decisions found. Submit one via Decision Intake form.</p>}
          {filtered.map((dec) => (
            <button key={dec.id} onClick={() => loadDetail(dec)}
              className={\`w-full text-left px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition-colors \${selected?.id === dec.id ? "bg-indigo-50 border-l-2 border-l-indigo-500" : ""}\`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{dec.title ?? "Untitled"}</p>
                <span className="text-[10px] font-bold text-slate-400 flex-shrink-0">#{dec.id}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={\`text-[10px] font-bold px-1.5 py-0.5 rounded-full capitalize \${statusBadge(dec.status)}\`}>{dec.status}</span>
                {dec.confidence_score != null && (
                  <span className={\`text-[10px] font-bold px-1.5 py-0.5 rounded-full \${dec.confidence_score >= 80 ? "bg-emerald-100 text-emerald-700" : dec.confidence_score >= 60 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}\`}>{dec.confidence_score}% conf</span>
                )}
              </div>
              {dec.created_at && <p className="text-[10px] text-slate-400 mt-1">{new Date(dec.created_at).toLocaleString()}</p>}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          {!selected && <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3"><span className="text-5xl">📋</span><p className="text-sm">Select a decision to view the full verdict</p></div>}
          {detailLoading && <div className="flex items-center justify-center h-full"><div className="flex gap-1.5">{[0,1,2].map(d => <span key={d} className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay: d*0.14+"s"}}/>)}</div></div>}
          {detail && !detailLoading && (
            <div className="space-y-4 max-w-3xl">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div><h2 className="text-lg font-bold text-slate-900">{detail.title}</h2><p className="text-xs text-slate-400 mt-0.5">Decision #{detail.id}</p></div>
                  <span className={\`text-xs font-bold px-2.5 py-1 rounded-full capitalize flex-shrink-0 \${statusBadge(detail.status)}\`}>{detail.status}</span>
                </div>
                <p className="text-sm text-slate-700 mb-3">{detail.question}</p>
                {detail.confidence_score != null && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">Overall Confidence</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={\`h-full rounded-full \${detail.confidence_score >= 80 ? "bg-emerald-500" : detail.confidence_score >= 60 ? "bg-yellow-400" : "bg-red-400"}\`} style={{width: detail.confidence_score+"%"}}/>
                      </div>
                      <span className="text-xs font-bold text-slate-600">{detail.confidence_score}%</span>
                    </div>
                  </div>
                )}
              </div>
              {verdict && (
                <div className="bg-white rounded-xl border border-indigo-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">👑</span>
                    <p className="font-bold text-slate-900 text-sm">Chairman Verdict</p>
                    <span className={\`ml-auto text-xs font-bold px-2 py-0.5 rounded-full \${verdict.confidence_score >= 80 ? "bg-emerald-100 text-emerald-700" : verdict.confidence_score >= 60 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}\`}>{verdict.confidence_score}% confidence</span>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-3"><p className="text-sm font-semibold text-indigo-900">{verdict.recommendation}</p></div>
                  {verdict.rationale && <div className="mb-3"><p className="text-xs font-semibold text-slate-500 mb-1">Rationale</p><p className="text-sm text-slate-700">{verdict.rationale}</p></div>}
                  {verdict.key_tensions && <div className="mb-3"><p className="text-xs font-semibold text-slate-500 mb-1">Key Tensions</p><p className="text-sm text-slate-700">{verdict.key_tensions}</p></div>}
                  {Array.isArray(verdict.next_steps_json) && verdict.next_steps_json.length > 0 && (
                    <div><p className="text-xs font-semibold text-slate-500 mb-2">Next Steps</p>
                      <ol className="space-y-1.5">{verdict.next_steps_json.map((step: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>{step}
                        </li>
                      ))}</ol>
                    </div>
                  )}
                  {verdict.alignment_matrix_json && Object.keys(verdict.alignment_matrix_json).length > 0 && (
                    <div className="mt-3"><p className="text-xs font-semibold text-slate-500 mb-2">Alignment Matrix</p>
                      <div className="grid grid-cols-2 gap-2">{Object.entries(verdict.alignment_matrix_json).map(([adv, score]: [string, any]) => (
                        <div key={adv} className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 w-24 truncate">{adv}</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full" style={{width: Number(score)+"%"}}/></div>
                          <span className="text-[10px] text-slate-500">{score}%</span>
                        </div>
                      ))}</div>
                    </div>
                  )}
                </div>
              )}
              {advisors.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2"><span>🧠</span><p className="font-bold text-slate-900 text-sm">Advisor Analysis ({advisors.length})</p></div>
                  <div className="divide-y divide-slate-100">{advisors.map((adv: any, i: number) => (
                    <div key={i} className="p-4">
                      <button onClick={() => toggleAdvisor(i)} className="w-full flex items-center gap-3 text-left">
                        <span className={\`text-xs font-bold px-2 py-0.5 rounded-full border \${personaColor(adv.advisor_name ?? adv.persona ?? "")}\`}>{adv.advisor_name ?? adv.persona}</span>
                        <span className="flex-1 text-xs text-slate-500 truncate">{adv.recommendation ?? ""}</span>
                        <span className="text-slate-400 text-xs">{expandedAdvisors.has(i) ? "▲" : "▼"}</span>
                      </button>
                      {expandedAdvisors.has(i) && (
                        <div className="mt-3 space-y-2 pl-1">
                          {adv.reasoning && <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Reasoning</p><p className="text-sm text-slate-700">{adv.reasoning}</p></div>}
                          {adv.key_insights && <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Key Insights</p><p className="text-sm text-slate-700">{adv.key_insights}</p></div>}
                          {adv.risks && <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Risks</p><p className="text-sm text-slate-700">{adv.risks}</p></div>}
                        </div>
                      )}
                    </div>
                  ))}</div>
                </div>
              )}
              {reviews.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2"><span>🔍</span><p className="font-bold text-slate-900 text-sm">Blind Peer Reviews ({reviews.length})</p></div>
                  <div className="divide-y divide-slate-100">{reviews.map((rev: any, i: number) => (
                    <div key={i} className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-slate-600 font-semibold">{rev.reviewer_name}</span>
                        <span className="text-xs text-slate-400">→</span>
                        <span className="text-xs text-slate-600">{rev.target_advisor_name}</span>
                        <span className={\`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full \${rev.agreement_level >= 70 ? "bg-emerald-100 text-emerald-700" : rev.agreement_level >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}\`}>{rev.agreement_level}% agree</span>
                      </div>
                      <p className="text-sm text-slate-700">{rev.critique}</p>
                    </div>
                  ))}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalyticsPage({ apiBase, messages, msgCount }: { apiBase: string; messages: Message[]; msgCount: number }) {
  const [decisions, setDecisions] = React.useState<any[]>([]);
  React.useEffect(() => {
    fetch(apiBase + "/api/decisions").then(r => r.json()).then(d => setDecisions(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  const botMsgs = messages.filter(m => m.role === "bot" && m.data);
  const avgConf = botMsgs.length ? Math.round(botMsgs.reduce((s, m) => s + (m.data?.confidence ?? 0), 0) / botMsgs.length) : 0;
  const completed = decisions.filter(d => d.status === "completed");
  const avgDecConf = completed.length ? Math.round(completed.reduce((s, d) => s + (d.confidence_score ?? 0), 0) / completed.length) : 0;
  const bk = [
    completed.filter(d => (d.confidence_score ?? 0) >= 90).length,
    completed.filter(d => (d.confidence_score ?? 0) >= 70 && (d.confidence_score ?? 0) < 90).length,
    completed.filter(d => (d.confidence_score ?? 0) >= 50 && (d.confidence_score ?? 0) < 70).length,
    completed.filter(d => (d.confidence_score ?? 0) < 50).length,
  ];
  const maxBk = Math.max(...bk, 1);
  const days: string[] = []; const dayCounts: number[] = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toLocaleDateString("en", { weekday: "short" })); dayCounts.push(decisions.filter(dec => dec.created_at && new Date(dec.created_at).toDateString() === d.toDateString()).length); }
  const maxDay = Math.max(...dayCounts, 1);
  const buckets = [{label:"90–100%",color:"bg-emerald-500"},{label:"70–89%",color:"bg-blue-500"},{label:"50–69%",color:"bg-yellow-400"},{label:"< 50%",color:"bg-red-400"}];
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
        <span className="text-lg">📊</span><p className="flex-1 text-base font-bold text-slate-900">Analytics</p>
        <button onClick={() => fetch(apiBase+"/api/decisions").then(r=>r.json()).then(d=>setDecisions(Array.isArray(d)?d:[])).catch(()=>{})} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold px-3 py-1 bg-indigo-50 rounded-lg">↻ Refresh</button>
      </header>
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-5">
        <div className="grid grid-cols-4 gap-4">
          {[{label:"Total Decisions",value:decisions.length,color:"text-slate-900",icon:"📋"},{label:"Completed",value:completed.length,color:"text-emerald-600",icon:"✅"},{label:"Avg Confidence",value:avgDecConf?avgDecConf+"%":"—",color:"text-indigo-600",icon:"🎯"},{label:"Chat Messages",value:msgCount,color:"text-purple-600",icon:"💬"}].map(k => (
            <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2"><span>{k.icon}</span><p className="text-xs text-slate-400">{k.label}</p></div>
              <p className={\`text-2xl font-bold \${k.color}\`}>{String(k.value)}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-700 mb-4">Decisions Last 7 Days</p>
            {decisions.length === 0 ? <p className="text-xs text-slate-400 text-center py-6">Submit a decision via Decision Intake form</p> : (
              <div className="flex items-end gap-1.5 h-28">
                {days.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-slate-500">{dayCounts[i] || ""}</span>
                    <div className="w-full rounded-t bg-indigo-500" style={{height:(dayCounts[i]/maxDay*88)+"px",minHeight:dayCounts[i]>0?"4px":"0"}}/>
                    <span className="text-[9px] text-slate-400">{day}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-700 mb-4">Confidence Distribution</p>
            {completed.length === 0 ? <p className="text-xs text-slate-400 text-center py-6">No completed decisions yet</p> : (
              <div className="space-y-3">{buckets.map((b, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-0.5"><span>{b.label}</span><span>{bk[i]}</span></div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className={\`h-full rounded-full \${b.color}\`} style={{width:(bk[i]/maxBk*100)+"%"}}/></div>
                </div>
              ))}</div>
            )}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-700 mb-4">AI Chat — Confidence per Response {avgConf ? <span className="text-xs font-normal text-slate-400 ml-2">avg {avgConf}%</span> : null}</p>
          {botMsgs.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">Send a message in AI Chat to see confidence trend</p> : (
            <div className="flex items-end gap-2 h-24">{botMsgs.map((m, i) => { const conf = m.data?.confidence ?? 0; const col = conf >= 80 ? "bg-emerald-500" : conf >= 60 ? "bg-yellow-400" : "bg-red-400"; return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-slate-500">{conf}%</span>
                <div className={\`w-full rounded-t \${col}\`} style={{height:(conf/100*72)+"px",minHeight:"4px"}}/>
                <span className="text-[9px] text-slate-400">#{i+1}</span>
              </div>
            ); })}</div>
          )}
        </div>
        {decisions.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-700 mb-3">Decision Status Breakdown</p>
            <div className="flex gap-4">
              {[{label:"Completed",count:completed.length,color:"bg-emerald-100 text-emerald-700"},{label:"Running",count:decisions.filter(d=>d.status==="running").length,color:"bg-yellow-100 text-yellow-700"},{label:"Failed",count:decisions.filter(d=>d.status==="failed").length,color:"bg-red-100 text-red-700"}].map(s => (
                <div key={s.label} className={\`flex-1 rounded-xl p-3 \${s.color} text-center\`}><p className="text-xl font-bold">{s.count}</p><p className="text-xs font-semibold mt-0.5">{s.label}</p></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState("chat");
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", text: "Hello! I'm your AI assistant for ${appTitle}. How can I help you?", time: new Date().toLocaleTimeString() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    const t = new Date().toLocaleTimeString();
    setMessages(m => [...m, { role: "user", text, time: t }]);
    setMsgCount(c => c + 1);
    setInput("");
    setLoading(true);
    if (currentPage !== "chat") setCurrentPage("chat");
    try {
      const r = await fetch(API_BASE + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, session_id: SESSION_ID }),
      });
      const raw = await r.json();
      const data = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return { answer: raw }; } })() : raw;
      const answerText = data.answer ?? data.detail ?? JSON.stringify(data);
      setMessages(m => [...m, { role: "bot", text: answerText, data, time: new Date().toLocaleTimeString() }]);
    } catch {
      setMessages(m => [...m, { role: "bot", text: "⚠️ Backend not reachable. Ensure the server is running on port ${port}.", time: new Date().toLocaleTimeString() }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-base">
              {${JSON.stringify(appTitle.charAt(0).toUpperCase())}}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate">${appTitle}</p>
              <p className="text-xs text-slate-400 leading-tight">${badge}</p>
            </div>
          </div>
        </div>
        <nav className="p-3 border-b border-white/10 space-y-0.5">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setCurrentPage(n.id)}
              className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left \${currentPage === n.id ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-white/10"}\`}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 px-1">Quick Start</p>
          {SUGGESTIONS.map((q, i) => (
            <button key={i} onClick={() => sendMessage(q)}
              className="w-full flex items-start gap-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-lg px-2 py-2 transition-colors mb-1">
              <span className="w-5 h-5 rounded-full bg-indigo-600/60 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
              <span className="leading-snug">{q}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Chat page */}
        {currentPage === "chat" && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
              <span className="text-lg">💬</span>
              <p className="flex-1 text-base font-bold text-slate-900">AI Chat</p>
              <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">● AI Active</span>
              <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">Custom Code · ${badge}</span>
            </header>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 bg-slate-50">
              <div className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <div key={i} className={\`flex \${m.role === "user" ? "justify-end" : "justify-start"}\`}>
                    {m.role === "user" ? (
                      <div>
                        <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-md leading-relaxed">{m.text}</div>
                        <p className="text-[10px] text-slate-400 text-right mt-1">{m.time}</p>
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-xl">
                        {(() => { const d = parseMsg(m); return (d && d.answer) ? (
                          <div className="space-y-3">
                            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{String(d.answer).replace(/\\\\n/g, "\\n")}</p>
                            {d.steps?.length > 0 && (
                              <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Steps</p>
                                {d.steps.map((s: string, si: number) => (
                                  <div key={si} className="flex items-start gap-2 text-xs text-slate-700">
                                    <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 font-bold flex items-center justify-center flex-shrink-0 text-[9px] mt-0.5">{si+1}</span>
                                    <span>{s}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {d.confidence > 0 && (
                              <div>
                                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                  <span>Confidence</span><span className="font-bold text-indigo-600">{d.confidence}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{width: d.confidence+"%"}}/>
                                </div>
                              </div>
                            )}
                            {d.related?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {d.related.map((r: string, ri: number) => (
                                  <button key={ri} onClick={() => sendMessage(r)}
                                    className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full transition-colors">
                                    {r}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{String(m.text).replace(/\\\\n/g, "\\n")}</p>; })()}
                        <p className="text-[10px] text-slate-400 mt-2">{m.time}</p>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 inline-flex gap-1.5 shadow-sm">
                      {[0,1,2].map(d => <span key={d} className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{animationDelay: d*0.14+"s"}}/>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white border-t border-slate-200 p-3.5 flex-shrink-0">
              <div className="flex gap-2.5 items-end mb-2">
                <textarea rows={2} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder="Ask a question…"
                  className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"/>
                <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl px-5 py-2.5 text-sm font-semibold h-[44px] transition-colors">
                  Send ➤
                </button>
              </div>
              <p className="text-xs text-slate-400 text-center">Powered by ${badge} · Custom Code Scaffold</p>
            </div>
          </div>
        )}
${featurePageComponents}
        {currentPage === "analytics" && <AnalyticsPage apiBase={API_BASE} messages={messages} msgCount={msgCount} />}
      </div>

      {/* Right panel */}
      <aside className="w-64 border-l bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-3.5 border-b border-slate-200">
          <p className="text-sm font-bold text-slate-800">App Info</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Tech Stack</p>
              <p className="text-xs text-slate-700">${badge}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">API Endpoints</p>
              ${
                apiList.length
                  ? `{${JSON.stringify(apiList)}.map((ep: string, i: number) => <p key={i} className="text-xs font-mono text-indigo-700 truncate">{ep}</p>)}`
                  : `<p className="text-xs text-slate-400 italic">None specified</p>`
              }
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Session</p>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex justify-between"><span>Messages</span><span className="font-bold text-slate-800">{msgCount}</span></div>
            <div className="flex justify-between"><span>Status</span><span className="font-bold text-emerald-600">Active</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
`;
}

// ─── Source ZIP builder — calls GPT-4o via /api/architect/generate-project ───

async function buildSourceZip(html: string, plan: Plan): Promise<Blob> {
  const zip = new JSZip();
  const appTitle = extractAppTitle(plan.summary);
  const appName = (plan.summary.split(" ").slice(0, 4).join("-") || "agentforge-app").toLowerCase().replace(/[^a-z0-9-]/g, "-");

  // ── Step 1: Call GPT-4o to dynamically generate the full project ─────────
  let aiFiles: Record<string, string> = {};
  try {
    const res = await architectApi.generateProject({
      app_name: extractAppTitle(plan.summary),
      summary: plan.summary,
      features: plan.features ?? [],
      agents: plan.agents ?? [],
      api_endpoints: plan.api_endpoints ?? [],
      database_schema: plan.database_schema ?? "",
      tech_stack: plan.tech_stack ?? {},
    });
    aiFiles = res.data.files ?? {};
  } catch (err) {
    console.error("[buildSourceZip] generate-project failed:", err);
    // Fall through to static scaffold below
  }

  // ── Step 2: Post-process + add GPT-4o generated files to ZIP ────────────────
  // The AI reliably produces two classes of Python bugs that break startup:
  //   (a) sync `def fn():` that contains `await` → must be `async def fn():`
  //   (b) `import io` placed after the function that calls `io.BytesIO` → hoist it
  // We also normalise the `frontend/` path prefix.
  function fixPythonFile(src: string): string {
    // Fix (a): any def whose body contains await must be async
    let out = src.replace(/^(\s*)(def\s+\w+\s*\([^)]*\)\s*:)([\s\S]*?)(?=\n\s*(?:def |async def |class |@|\Z))/gm,
      (match, indent, sig, body) => {
        if (body.includes("await ") && !sig.startsWith("async ")) {
          return `${indent}async ${sig}${body}`;
        }
        return match;
      }
    );
    // Fix (b): hoist `import io` to top if it appears after a `def` that uses `io.`
    if (out.includes("io.BytesIO") || out.includes("io.StringIO")) {
      out = out.replace(/\nimport io\n/g, "\n");
      if (!out.startsWith("import io")) {
        out = "import io\n" + out;
      }
    }
    // Fix (c): agent files that use json.loads/json.dumps must import json
    if ((out.includes("json.loads") || out.includes("json.dumps") || out.includes("json.loads")) && !/^import json/m.test(out)) {
      out = "import json\n" + out;
    }
    // Fix (d): decisions.py — ensure tags= never receives a list directly; convert to comma-joined string
    if (out.includes("tags=payload.tags")) {
      out = out.replace(
        /tags\s*=\s*payload\.tags/g,
        'tags=", ".join(payload.tags) if payload.tags else ""'
      );
    }
    // Fix (e): replace fitz/PyMuPDF with PyPDF2 for PDF extraction
    if (out.includes("import fitz") || out.includes("fitz.open")) {
      out = out.replace(/import fitz\n/g, "");
      out = out.replace(
        /fitz\.open\s*\([^)]*\)[^;]*?(?=\n)/g,
        ""
      );
      // Replace fitz-based PDF extraction block with PyPDF2 equivalent
      out = out.replace(
        /doc\s*=\s*fitz\.open\s*\([\s\S]*?text\s*=\s*.*?\.get_text\(\)[\s\S]*?(?=\n\s*(?:elif|else|return|#|\w))/g,
        `import PyPDF2\n    reader = PyPDF2.PdfReader(io.BytesIO(content))\n    text = "\\n".join(page.extract_text() or "" for page in reader.pages)\n`
      );
    }
    return out;
  }

  for (const [filePath, content] of Object.entries(aiFiles)) {
    const normalizedPath = filePath.startsWith("frontend/") ? filePath.slice("frontend/".length) : filePath;
    const fixed = normalizedPath.endsWith(".py") ? fixPythonFile(content as string) : content as string;
    zip.file(normalizedPath, fixed);
  }

  // ── Step 3: Always include sandbox.html (the working iframe preview) ──────
  // Post-process: fix garbled APP_TITLE / WELCOME_MSG that the AI emits when it
  // copies the raw plan.summary into those constants.
  function fixSandboxHtml(src: string): string {
    const clean = appTitle;
    // Replace garbled APP_TITLE string constant (anything after the = up to ;)
    let out = src.replace(/(const APP_TITLE\s*=\s*")[^"]{40,}(")/g, `$1${clean}$2`);
    // Replace garbled WELCOME_MSG
    out = out.replace(/(const WELCOME_MSG\s*=\s*")[^"]{120,}(")/g,
      `$1Hello! I'm ${clean}, your AI-powered assistant. Ask me anything or click a question from the sidebar.$2`);
    // Replace garbled OUT_CONTACT
    out = out.replace(/(const OUT_CONTACT\s*=\s*")[^"]{80,}(")/g,
      `$1contact ${clean} support directly for assistance.$2`);
    // Fix page <title> if it contains raw plan summary
    out = out.replace(/(<title>)[^<]{60,}(<\/title>)/, `$1${clean}$2`);
    // Inject renderMarkdown helper before React destructure if missing
    if (!out.includes("renderMarkdown") && !out.includes("renderMd")) {
      const marker = "const { useState";
      const inject = `function renderMarkdown(text) {
  if (!text) return null;
  return text.split('\\n').map((line, i) => {
    if (!line.trim()) return React.createElement('div', {key:i, className:'h-1'});
    const segs = line.split(/\\*\\*(.*?)\\*\\*/g);
    const parts = segs.map((s, j) => j%2===1 ? React.createElement('strong',{key:j},s) : s).filter(Boolean);
    return React.createElement('p', {key:i, className:'text-sm text-gray-800 leading-relaxed'+((/^(\\d+\\.|-) /.test(line))?' pl-3':'')}, ...parts);
  });
}
${marker}`;
      out = out.replace(marker, inject);
      // Also replace plain text bot answer rendering with renderMarkdown
      out = out.replace(/<p className="text-sm text-gray-800 leading-relaxed">\{msg\.answer\}<\/p>/g,
        '<div className="text-sm text-gray-800 leading-relaxed">{renderMarkdown(msg.answer)}</div>');
    }
    return out;
  }
  const sandboxHtml = `<!--
  AgentForge Architect sandbox preview — open directly in a browser (no build needed)
  Generated: ${new Date().toISOString()}
-->\n${fixSandboxHtml(html)}`;
  zip.file("sandbox.html", sandboxHtml);

  // ── Step 4: Inject App.tsx — RAG plan uses ragAppTsx template; non-RAG uses plan-specific dynamic UI ────
  // GPT-4o generates backend files well but produces inconsistent React UIs.

  // ── src/App.tsx — matches CC sandbox HTML layout exactly ─────────────────────
  const appTsx = `import React, { useState, useRef, useEffect } from "react";

type Page = "chat" | "questions" | "uploads" | "analytics" | "handoff";

interface ApiDoc { id: string; name?: string; filename?: string; indexed: boolean; confidence?: number; }
interface BotMsg { id: string; role: "bot"; answer: string; steps?: string[]; source?: string; confidence?: number; out_of_scope?: boolean; related?: string[]; ts: string; }
interface UserMsg { id: string; role: "user"; text: string; ts: string; }
type Msg = UserMsg | BotMsg;

function ConfBadge({ value }: { value?: number }) {
  if (!value) return null;
  const pct = Math.round(value > 1 ? value : value * 100);
  const color = pct >= 90 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : pct >= 75 ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={\`inline-flex items-center gap-1 text-[11px] font-bold border rounded-full px-2 py-0.5 \${color}\`}>
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
      {pct}% accuracy
    </span>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  return text.split("\\n").map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-1" />;
    const parts: React.ReactNode[] = [];
    const segs = line.split(/\\*\\*(.*?)\\*\\*/g);
    segs.forEach((s, j) => { if (j % 2 === 1) parts.push(<strong key={j}>{s}</strong>); else if (s) parts.push(s); });
    const isList = /^(\\d+\\.|-) /.test(line);
    return <p key={i} className={\`text-sm text-slate-800 leading-relaxed\${isList ? " pl-3" : ""}\`}>{parts}</p>;
  });
}

async function apiHealth(): Promise<string> {
  const r = await fetch("/api/health").catch(() => null);
  if (!r || !r.ok) return "AI Assistant";
  const d = await r.json();
  return d.app || "AI Assistant";
}
async function apiDocs(): Promise<ApiDoc[]> {
  const r = await fetch("/api/documents").catch(() => null);
  return r && r.ok ? r.json() : [];
}
async function apiChat(question: string): Promise<Omit<BotMsg, "id" | "role" | "ts">> {
  const r = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, workspace_id: 1 }),
  });
  if (!r.ok) throw new Error("Chat API " + r.status);
  const d = await r.json();
  return { answer: d.answer || d.response || "No response received.", steps: d.steps, source: d.source, confidence: d.confidence, out_of_scope: d.out_of_scope, related: d.related };
}
async function apiUpload(file: File): Promise<any> {
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch("/api/documents/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error("Upload " + r.status);
  return r.json().catch(() => ({}));
}
function buildTopQuestions(docs: ApiDoc[]): string[] {
  if (!docs.length) return ["What issue is being reported?", "How do I troubleshoot this problem?", "Who do I contact for support?"];
  return docs.flatMap(d => {
    const n = (d.filename ?? d.name ?? "Doc").replace(/\\.[^.]+$/, "");
    return [\`What issue is being reported with \${n}?\`, \`How do I resolve a \${n} error?\`, \`Who do I contact for \${n} support?\`];
  }).slice(0, 10);
}
function buildSuggestions(docs: ApiDoc[]): string[] {
  if (!docs.length) return ["What can you help me with?", "Summarise the uploaded documents", "What are the key topics covered?"];
  return docs.flatMap(d => {
    const n = (d.filename ?? d.name ?? "Doc").replace(/\\.[^.]+$/, "");
    return [\`What does \${n} cover?\`, \`Summarise \${n}\`, \`What are common issues in \${n}?\`];
  }).slice(0, 9);
}
function getExt(filename: string): string {
  return (filename.split(".").pop() ?? "DOC").toUpperCase();
}

// Custom Code — backend on port 8002 — routes: /api/chat, /api/documents/upload, /api/documents
export default function App() {
  const [page, setPage] = useState<Page>("chat");
  const [appTitle, setAppTitle] = useState("AI Assistant");
  const [messages, setMessages] = useState<Msg[]>([{ id: "welcome", role: "bot", answer: "Hello! I'm your AI assistant. Upload knowledge base documents and ask me anything.", ts: new Date().toLocaleTimeString() }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<ApiDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ticketForm, setTicketForm] = useState({ issue: "", name: "", priority: "Medium", details: "" });
  const [ticketSent, setTicketSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const suggestions = buildSuggestions(docs);
  const topQuestions = buildTopQuestions(docs);
  const msgCount = messages.filter(m => m.role === "user").length;
  const botMsgs = messages.filter((m): m is BotMsg => m.role === "bot" && m.id !== "welcome");
  const lowConfCount = botMsgs.filter(m => m.confidence !== undefined && (m.confidence > 1 ? m.confidence : m.confidence * 100) < 75).length;
  const lastQuery = (messages.filter(m => m.role === "user").slice(-1)[0] as UserMsg | undefined)?.text ?? null;
  const unanswered = botMsgs.filter(m => m.out_of_scope || (m.confidence !== undefined && (m.confidence > 1 ? m.confidence : m.confidence * 100) < 50));

  useEffect(() => {
    apiHealth().then(t => { setAppTitle(t); setMessages([{ id: "welcome", role: "bot", answer: \`Hello! I'm your AI assistant for \${t}. Upload documents and ask me anything.\`, ts: new Date().toLocaleTimeString() }]); });
    apiDocs().then(setDocs);
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setInput("");
    if (page !== "chat") setPage("chat");
    setMessages(p => [...p, { id: Date.now() + "u", role: "user", text, ts: new Date().toLocaleTimeString() }]);
    setLoading(true);
    try {
      const resp = await apiChat(text);
      setMessages(p => [...p, { id: Date.now() + "b", role: "bot", ...resp, ts: new Date().toLocaleTimeString() }]);
    } catch {
      setMessages(p => [...p, { id: Date.now() + "e", role: "bot", answer: "⚠️ Backend not reachable. Ensure FastAPI is running on port 8002.", ts: new Date().toLocaleTimeString() }]);
    } finally { setLoading(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const results = await Promise.all(Array.from(files).map(f => apiUpload(f)));
      const fresh = await apiDocs();
      if (fresh.length > 0) setDocs(fresh);
      else setDocs(p => [...p, ...results.map((r: any, i: number) => ({ id: String(Date.now() + i), name: r.title || r.filename || files[i]?.name || "Document", indexed: true }))]);
    } catch (err) {
      alert("Upload failed: " + (err instanceof Error ? err.message : String(err)));
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const navItems: { id: Page; icon: string; label: string }[] = [
    { id: "chat", icon: "💬", label: "Support Chat" },
    { id: "questions", icon: "💡", label: "Suggested Questions" },
    { id: "uploads", icon: "📁", label: "Admin Uploads" },
    { id: "analytics", icon: "📊", label: "Conversation Analytics" },
    { id: "handoff", icon: "📞", label: "Ticket Handoff" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100" style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <aside className="w-64 bg-slate-800 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-base">{appTitle.charAt(0).toUpperCase()}</div>
            <div className="min-w-0"><p className="text-sm font-bold leading-tight truncate">{appTitle}</p><p className="text-xs text-slate-400 leading-tight">Document-aware support</p></div>
          </div>
        </div>
        <nav className="p-3 border-b border-white/10 space-y-0.5">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)}
              className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left \${page === item.id ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-white/10"}\`}>
              <span className="text-base">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 px-1">Top 10 Questions</p>
          {topQuestions.map((q, i) => (
            <button key={i} onClick={() => send(q)}
              className="w-full flex items-start gap-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-lg px-2 py-2 transition-colors mb-1">
              <span className="w-5 h-5 rounded-full bg-indigo-600/60 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <span className="leading-snug">{q}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {page === "chat" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">💬</span><p className="flex-1 text-base font-bold text-slate-900">Support Chat</p>
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">● AI Active</span>
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">● KB Connected</span>
            <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">Custom Code · Azure OpenAI</span>
          </header>
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50">
            {messages.map(msg => (
              <div key={msg.id} className={\`flex \${msg.role === "user" ? "justify-end" : "justify-start"}\`}>
                {msg.role === "user"
                  ? <div><div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-md">{(msg as UserMsg).text}</div><p className="text-[10px] text-slate-400 text-right mt-1">{msg.ts}</p></div>
                  : (() => { const bm = msg as BotMsg; return (
                    <div className={\`bg-white border \${bm.out_of_scope ? "border-amber-200" : "border-slate-200"} rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-xl\`}>
                      {bm.out_of_scope && <div className="mb-3 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs font-medium">⚠ Outside knowledge base scope</div>}
                      <div className="space-y-0.5">{renderMarkdown(bm.answer)}</div>
                      {bm.steps && bm.steps.length > 0 && <div className="mt-3 pt-3 border-t border-slate-100"><p className="text-xs font-semibold text-slate-500 mb-2">Step-by-Step Resolution</p><ol className="space-y-1.5">{bm.steps.map((s, i) => <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700"><span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>{s}</li>)}</ol></div>}
                      {bm.source && bm.source !== "N/A" && <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap"><span className="text-xs text-slate-500 font-medium">📄 {bm.source}</span><ConfBadge value={bm.confidence} /></div>}
                      {bm.related && bm.related.length > 0 && <div className="mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] font-semibold text-slate-400 mb-1.5">Follow-ups:</p><div className="flex flex-wrap gap-1.5">{bm.related.map((r, i) => <button key={i} onClick={() => send(r)} className="text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2.5 py-0.5 hover:bg-indigo-100">{r}</button>)}</div></div>}
                      {msg.id !== "welcome" && <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2"><span className="text-[10px] text-slate-400">Helpful?</span><button className="text-base">👍</button><button className="text-base">👎</button></div>}
                      <p className="text-[10px] text-slate-400 mt-1">{msg.ts}</p>
                    </div>); })()}
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 inline-flex gap-1.5 shadow-sm">{[0,1,2].map(i => <span key={i} className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: \`\${i * 0.14}s\` }} />)}</div></div>}
            <div ref={bottomRef} />
          </div>
          <div className="bg-white border-t border-slate-200 p-3.5 flex-shrink-0">
            <div className="flex gap-2.5 items-end mb-2">
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask a question…" rows={2} className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={() => send()} disabled={!input.trim() || loading} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl px-5 py-2.5 text-sm font-semibold h-[44px] transition-colors">Send ➤</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">{suggestions.slice(0, 3).map(s => <button key={s} onClick={() => send(s)} className="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2.5 py-0.5 hover:bg-indigo-50 hover:text-indigo-600">{s}</button>)}</div>
            <p className="text-xs text-slate-400 text-center">Powered by Knowledge Base · Custom Code · Azure OpenAI</p>
          </div>
        </>)}

        {page === "questions" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">💡</span><p className="flex-1 text-base font-bold text-slate-900">Suggested Questions</p>
            <span className="text-xs text-slate-500">{docs.length} document{docs.length !== 1 ? "s" : ""} indexed</span>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            {docs.length === 0
              ? <div className="text-center py-20 text-slate-400"><p className="text-4xl mb-3">💡</p><p className="font-semibold">No documents uploaded yet</p><p className="text-sm mt-1">Upload documents to see suggested questions</p></div>
              : docs.map(d => {
                  const fn = (d.filename ?? d.name ?? "Document").replace(/\\.[^.]+$/, "");
                  const qs = [\`What does \${fn} cover?\`, \`Summarise \${fn}\`, \`What are common issues in \${fn}?\`, \`How do I resolve a \${fn} error?\`, \`Who do I contact for \${fn} support?\`];
                  return (
                    <div key={d.id} className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{getExt(d.filename ?? d.name ?? "DOC")}</span>
                        <p className="text-sm font-bold text-slate-800 truncate">{d.filename ?? d.name}</p>
                        <span className="ml-auto text-[11px] text-emerald-600 font-semibold">✓ Indexed</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {qs.map((q, i) => (
                          <button key={i} onClick={() => send(q)} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>{q}
                            <span className="ml-auto text-slate-300 text-xs">→</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
          </div>
        </>)}

        {page === "uploads" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">📁</span><p className="flex-1 text-base font-bold text-slate-900">Admin Uploads</p>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg">{uploading ? "⏳ Indexing…" : "📎 Upload Documents"}</button>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={handleUpload} />
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-indigo-300 rounded-xl p-10 text-center mb-6 cursor-pointer hover:bg-indigo-50">
              <p className="text-4xl mb-2">📎</p><p className="text-sm font-semibold text-slate-700">Click to upload documents</p>
              <p className="text-xs text-slate-400 mt-1">Supports PDF, DOCX, TXT, MD, CSV — multiple files</p>
            </div>
            {docs.length === 0 ? <p className="text-center text-slate-400 text-sm italic">No documents uploaded yet.</p>
              : <div className="grid grid-cols-2 gap-3">{docs.map(d => { const fn = d.filename ?? d.name ?? "File"; return (
                  <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0"><span className="text-[10px] font-bold text-blue-700">{getExt(fn)}</span></div>
                      <div className="min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{fn}</p><p className={\`text-[11px] font-semibold mt-0.5 \${d.indexed ? "text-emerald-600" : "text-amber-500"}\`}>{d.indexed ? "✓ Indexed" : "⏳ Pending"}</p></div>
                    </div>
                  </div>); })}</div>}
          </div>
        </>)}

        {page === "analytics" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">📊</span><p className="flex-1 text-base font-bold text-slate-900">Conversation Analytics</p>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[{ label: "Messages", value: msgCount, color: "text-slate-900" }, { label: "Low Confidence", value: lowConfCount, color: "text-amber-500" }, { label: "Last Query", value: lastQuery ? lastQuery.slice(0, 20) + (lastQuery.length > 20 ? "…" : "") : "--", color: "text-slate-600" }].map(({ label, value, color }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                  <p className="text-xs text-slate-400 mb-1">{label}</p><p className={\`text-2xl font-bold \${color}\`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-4">
              <p className="text-sm font-bold text-slate-700 mb-4">Message Volume</p>
              {msgCount === 0 ? <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No messages yet</div>
                : <div className="h-32 flex items-end gap-1">{messages.filter(m => m.role === "user").map((m, i) => <div key={i} className="flex-1 bg-indigo-400 rounded-t" style={{ height: \`\${Math.min(100, 30 + i * 8)}%\` }} />)}</div>}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-700 mb-3">Unanswered / Escalated</p>
              {unanswered.length === 0 ? <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">No unresolved queries in this session.</p>
                : unanswered.map((m, i) => <div key={i} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0"><span className="text-amber-500">⚠</span><p className="text-sm text-slate-600">{m.answer.slice(0, 80)}…</p></div>)}
            </div>
          </div>
        </>)}

        {page === "handoff" && (<>
          <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
            <span className="text-lg">📞</span><p className="flex-1 text-base font-bold text-slate-900">Ticket Handoff</p>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            {ticketSent
              ? <div className="max-w-md mx-auto text-center py-20"><p className="text-5xl mb-4">✅</p><p className="text-lg font-bold text-slate-800">Ticket Submitted</p><p className="text-sm text-slate-500 mt-2">Your ticket has been logged. Support will follow up shortly.</p><button onClick={() => { setTicketSent(false); setTicketForm({ issue: "", name: "", priority: "Medium", details: "" }); }} className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg">Submit Another</button></div>
              : <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <p className="text-sm font-bold text-slate-700 mb-4">Log a Support Ticket</p>
                  <div className="space-y-4">
                    <div><label className="text-xs font-semibold text-slate-600 block mb-1">Issue Category</label>
                      <select value={ticketForm.issue} onChange={e => setTicketForm(p => ({ ...p, issue: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        <option value="">Select category…</option><option>SAP Handheld</option><option>ID Disabled</option><option>Lane Issues</option><option>MFA</option><option>NCR Printer</option><option>Network</option><option>Pinpad</option><option>Password Reset</option><option>Other</option>
                      </select></div>
                    <div><label className="text-xs font-semibold text-slate-600 block mb-1">Your Name</label>
                      <input value={ticketForm.name} onChange={e => setTicketForm(p => ({ ...p, name: e.target.value }))} placeholder="Enter your name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" /></div>
                    <div><label className="text-xs font-semibold text-slate-600 block mb-1">Priority</label>
                      <div className="flex gap-2">{["Low", "Medium", "High", "Critical"].map(p => <button key={p} onClick={() => setTicketForm(prev => ({ ...prev, priority: p }))} className={\`flex-1 py-1.5 text-xs font-semibold rounded-lg border \${ticketForm.priority === p ? p === "Critical" ? "bg-red-600 text-white border-red-600" : p === "High" ? "bg-amber-500 text-white border-amber-500" : p === "Medium" ? "bg-yellow-400 text-white border-yellow-400" : "bg-green-500 text-white border-green-500" : "border-slate-200 text-slate-500 hover:bg-slate-50"}\`}>{p}</button>)}</div></div>
                    <div><label className="text-xs font-semibold text-slate-600 block mb-1">Details</label>
                      <textarea value={ticketForm.details} onChange={e => setTicketForm(p => ({ ...p, details: e.target.value }))} placeholder="Describe the issue…" rows={4} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" /></div>
                    <button onClick={() => { if (ticketForm.issue && ticketForm.name) setTicketSent(true); else alert("Please fill in Issue Category and Name."); }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-lg">Submit Ticket</button>
                  </div>
                </div>}
          </div>
        </>)}
      </div>

      <aside className="w-64 border-l bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Knowledge Base</p>
          <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center">{docs.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {docs.length === 0 ? <p className="text-xs text-slate-400 italic p-2">No documents yet.</p>
            : docs.map(d => { const fn = d.filename ?? d.name ?? "File"; return (
              <div key={d.id} className="border border-slate-200 rounded-xl p-3 mb-2 cursor-pointer hover:border-indigo-300" onClick={() => send(\`Summarise \${fn}\`)}>
                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{getExt(fn)}</span>
                <p className="text-sm font-semibold text-slate-800 mt-1.5 truncate">{fn}</p>
                <div className="flex items-center justify-between mt-1.5"><span className="text-[11px] text-slate-400">—</span><span className={\`text-[11px] font-semibold \${d.indexed ? "text-emerald-600" : "text-amber-500"}\`}>{d.indexed ? "✓ Indexed" : "⏳ Pending"}</span></div>
              </div>); })}
        </div>
        <div className="border-t border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Session</p>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex justify-between"><span>Messages</span><span className="font-bold text-slate-800">{msgCount}</span></div>
            <div className="flex justify-between"><span>Low Confidence</span><span className={\`font-bold \${lowConfCount > 0 ? "text-amber-500" : "text-slate-800"}\`}>{lowConfCount}</span></div>
            <div className="flex justify-between"><span>Last Query</span><span className="font-bold text-slate-800 truncate ml-2 max-w-[100px]">{lastQuery ? lastQuery.slice(0, 15) + (lastQuery.length > 15 ? "…" : "") : "--"}</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
`;

  // ── src/main.tsx ────────────────────────────────────────────────────────────
  const mainTsx = `import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
`;

  // ── src/index.css ───────────────────────────────────────────────────────────
  const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
`;

  // ── index.html ──────────────────────────────────────────────────────────────
  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${plan.summary.slice(0, 60)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

  // ── package.json ─────────────────────────────────────────────────────────────
  const packageJson = JSON.stringify({
    name: appName,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
      preview: "vite preview",
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
      "@tanstack/react-query": "^4.36.1",
      "react-hot-toast": "^2.4.1",
      "axios": "^1.7.2",
    },
    devDependencies: {
      "@types/react": "^18.3.3",
      "@types/react-dom": "^18.3.0",
      "@vitejs/plugin-react": "^4.3.1",
      autoprefixer: "^10.4.19",
      postcss: "^8.4.38",
      tailwindcss: "^3.4.4",
      typescript: "^5.2.2",
      vite: "^5.4.0",
    },
  }, null, 2);

  // ── vite.config.ts ───────────────────────────────────────────────────────────
  const viteConfig = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
`;

  // ── tsconfig.json ────────────────────────────────────────────────────────────
  const tsconfig = JSON.stringify({
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ["src"],
    references: [{ path: "./tsconfig.node.json" }],
  }, null, 2);

  // ── tsconfig.node.json ───────────────────────────────────────────────────────
  const tsconfigNode = JSON.stringify({
    compilerOptions: {
      composite: true,
      skipLibCheck: true,
      module: "ESNext",
      moduleResolution: "bundler",
      allowSyntheticDefaultImports: true,
    },
    include: ["vite.config.ts"],
  }, null, 2);

  // ── tailwind.config.js ───────────────────────────────────────────────────────
  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;

  // ── postcss.config.js ────────────────────────────────────────────────────────
  const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

  // ── .gitignore ───────────────────────────────────────────────────────────────
  const gitignore = `# Logs
logs
*.log
npm-debug.log*

# Runtime data
node_modules
dist
dist-ssr
*.local

# Editor
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Env
.env
.env.local
.env.*.local
`;

  // ── README.md ────────────────────────────────────────────────────────────────
  // sandbox.html was already added above (Step 3)

  // ── backend/.env.example ─────────────────────────────────────────────────────
  const envExample = `# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://YOUR_RESOURCE.openai.azure.com/
AZURE_OPENAI_API_KEY=your-azure-openai-api-key-here
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-ada-002

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:password@localhost:5432/${appName.replace(/-/g, "_")}

# App
APP_SECRET_KEY=change-me-to-a-random-secret
CORS_ORIGINS=http://localhost:5173
`;

  // ── backend/requirements.txt ──────────────────────────────────────────────────
  const requirementsTxt = `fastapi==0.115.8
uvicorn[standard]==0.34.0
sqlalchemy==2.0.36
alembic==1.14.1
asyncpg==0.30.0
psycopg2-binary==2.9.10
openai==1.86.0
greenlet>=3.0.0
faiss-cpu==1.10.0
numpy==2.1.3
python-dotenv==1.0.1
python-multipart==0.0.20
pydantic==2.10.6
pydantic-settings==2.7.1
tiktoken==0.9.0
pypdf2==3.0.1
sentence-transformers==3.0.1
pandas==2.2.3
`;

  // ── backend/main.py ───────────────────────────────────────────────────────────
  const backendMain = `"""
${plan.summary.slice(0, 80)}
Generated by AgentForge Planning Architect
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.database import engine, Base
from app.api import chat, documents, health
from app.api.decisions import router as decisions_router
from app.api.tags import router as tags_router

app = FastAPI(title="${plan.summary.slice(0, 60)}", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(chat.router, prefix="/api/chat")
app.include_router(documents.router, prefix="/api/documents")
app.include_router(decisions_router, prefix="/api")
app.include_router(tags_router, prefix="/api")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
`;

  // ── backend/app/__init__.py ───────────────────────────────────────────────────
  const initPy = ``;

  // ── backend/app/config.py ─────────────────────────────────────────────────────
  const configPy = `from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="allow")

    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_API_VERSION: str = "2024-12-01-preview"
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-5.4-mini"
    AZURE_OPENAI_DEPLOYMENT_NAME: str = "gpt-5.4-mini"
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: str = "text-embedding-3-small"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/${appName.replace(/-/g, "_")}"
    APP_SECRET_KEY: str = "change-me"
    CORS_ORIGINS: str = "http://localhost:5173"

settings = Settings()
`;

  // ── backend/app/database.py ───────────────────────────────────────────────────
  const databasePy = `from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
`;

  // ── backend/app/models.py ─────────────────────────────────────────────────────
  const modelsPy = `import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String, index=True)
    role: Mapped[str] = mapped_column(String)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    embedding_indexed: Mapped[bool] = mapped_column(default=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
`;

  // ── backend/app/rag.py ────────────────────────────────────────────────────────
  const ragPy = `"""
RAG Engine — FAISS vector store + Azure OpenAI embeddings + GPT-4o generation
"""
import os
import json
import numpy as np
from typing import Optional
from openai import AzureOpenAI
from app.config import settings

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False

_client: Optional[AzureOpenAI] = None
_index: Optional[object] = None
_chunks: list[dict] = []   # [{text, source, topic}]

SYSTEM_PROMPT = """You are a helpful support assistant for ${extractAppTitle(plan.summary)}.
Answer questions using ONLY the provided context. Be concise and give step-by-step resolutions where possible.
If the answer is not in the context, say: "I don't have information on that. Please contact support directly."
"""

def _get_client() -> AzureOpenAI:
    global _client
    if _client is None:
        _client = AzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )
    return _client


def _embed(texts: list[str]) -> np.ndarray:
    client = _get_client()
    response = client.embeddings.create(
        model=settings.azure_openai_embedding_deployment,
        input=texts,
    )
    return np.array([d.embedding for d in response.data], dtype="float32")


def build_index(documents: list[dict]) -> None:
    """Index documents into FAISS. Call after uploading new documents."""
    global _index, _chunks
    if not FAISS_AVAILABLE:
        return
    _chunks = []
    for doc in documents:
        # Split into ~500-char chunks
        text = doc.get("content", "")
        source = doc.get("name", "unknown")
        for i in range(0, len(text), 500):
            _chunks.append({"text": text[i:i+500], "source": source})
    if not _chunks:
        return
    embeddings = _embed([c["text"] for c in _chunks])
    dim = embeddings.shape[1]
    _index = faiss.IndexFlatL2(dim)
    _index.add(embeddings)


def _retrieve(query: str, k: int = 5) -> list[dict]:
    if _index is None or not _chunks:
        return []
    q_emb = _embed([query])
    _, indices = _index.search(q_emb, k)
    return [_chunks[i] for i in indices[0] if i < len(_chunks)]


def answer(query: str, history: list[dict] | None = None) -> dict:
    """Generate a RAG-grounded answer. Returns structured dict for the API."""
    import re
    context_chunks = _retrieve(query)
    out_of_scope = not bool(context_chunks)
    context = "\\n\\n".join(
        f"[{c['source']}]: {c['text']}" for c in context_chunks
    ) or "No relevant documents found."

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in (history or [])[-6:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({
        "role": "user",
        "content": (
            "Answer the question below using ONLY the context provided. "
            "Format your response as:\\n"
            "ANSWER: <one-sentence direct answer>\\n"
            "STEPS:\\n1. <step>\\n2. <step>\\n3. <step>\\n"
            "(include 3-6 numbered steps whenever the question involves a process or resolution)\\n\\n"
            f"Context:\\n{context}\\n\\nQuestion: {query}"
        )
    })

    client = _get_client()
    response = client.chat.completions.create(
        model=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
        messages=messages,
        temperature=0.3,
        max_completion_tokens=1200,
    )
    raw = response.choices[0].message.content or ""

    # Parse ANSWER: and STEPS: sections from the response
    answer_match = re.search(r'ANSWER:\\s*(.+?)(?:\\nSTEPS:|$)', raw, re.DOTALL)
    steps_match  = re.search(r'STEPS:\\s*(.+)', raw, re.DOTALL)
    answer_text  = answer_match.group(1).strip() if answer_match else raw.strip()
    steps_raw    = steps_match.group(1).strip() if steps_match else ""
    steps        = [s.strip() for s in re.findall(r'\\d+\\.\\s+(.+)', steps_raw)] if steps_raw else []

    source = context_chunks[0].get("source", "") if context_chunks else ""
    # Related: other unique sources retrieved
    related_sources = list(dict.fromkeys(
        c["source"] for c in context_chunks[1:] if c.get("source") and c["source"] != source
    ))[:2]

    confidence = max(60, min(97, 90 - len(context_chunks) * 2)) if context_chunks else 0

    return {
        "answer": answer_text,
        "steps": steps,
        "source": source,
        "confidence": confidence,
        "related": related_sources,
        "out_of_scope": out_of_scope,
    }
`;

  // ── backend/app/api/__init__.py ───────────────────────────────────────────────
  const apiInitPy = ``;

  // ── backend/app/api/health.py ─────────────────────────────────────────────────
  const healthPy = `from fastapi import APIRouter
router = APIRouter()

@router.get("/health")
async def health():
    return {"status": "ok"}
`;

  // ── backend/app/api/chat.py ───────────────────────────────────────────────────
  const chatApiPy = `from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import ChatMessage
from app import rag
import uuid

router = APIRouter()

class ChatRequest(BaseModel):
    session_id: str = ""
    question: str
    history: list[dict] = []

class ChatResponse(BaseModel):
    session_id: str
    answer: str
    steps: list[str] = []
    source: str = ""
    confidence: int = 0
    related: list[str] = []
    out_of_scope: bool = False

@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    session_id = req.session_id or str(uuid.uuid4())
    try:
        result = rag.answer(req.question, req.history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    db.add(ChatMessage(session_id=session_id, role="user", content=req.question))
    db.add(ChatMessage(session_id=session_id, role="assistant", content=result["answer"]))
    await db.commit()
    return ChatResponse(session_id=session_id, **result)

@router.get("/history/{session_id}")
async def get_history(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    msgs = result.scalars().all()
    return [{"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in msgs]
`;

  // ── backend/app/api/documents.py ──────────────────────────────────────────────
  const documentsApiPy = `from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Document
from app import rag
import io

router = APIRouter()

def _extract_text(filename: str, raw: bytes) -> str:
    name = (filename or "").lower()
    try:
        if name.endswith(".pdf"):
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(raw))
            return "\\n".join(p.extract_text() or "" for p in reader.pages)
        if name.endswith(".docx"):
            import docx
            doc = docx.Document(io.BytesIO(raw))
            return "\\n".join(p.text for p in doc.paragraphs if p.text.strip())
        if name.endswith(".xlsx"):
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
            rows = []
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    rows.append("\\t".join(str(c) if c is not None else "" for c in row))
            return "\\n".join(rows)
        if name.endswith(".csv"):
            import csv
            text = raw.decode("utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            return "\\n".join(str(row) for row in reader)
        # .txt and everything else
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("latin-1", errors="replace")
    except Exception as e:
        return f"[Parse error: {e}]\\n" + raw.decode("utf-8", errors="replace")

@router.post("/upload")
async def upload_document(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    raw = await file.read()
    content = _extract_text(file.filename or "", raw)
    doc = Document(name=file.filename or "unknown", content=content)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Re-build FAISS index with all docs
    result = await db.execute(select(Document))
    all_docs = result.scalars().all()
    rag.build_index([{"name": d.name, "content": d.content} for d in all_docs])

    doc.embedding_indexed = True
    await db.commit()
    await db.refresh(doc)
    return {"id": doc.id, "name": doc.name, "indexed": doc.embedding_indexed}

@router.get("")
async def list_documents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).order_by(Document.uploaded_at.desc()))
    docs = result.scalars().all()
    return [{"id": d.id, "name": d.name, "indexed": d.embedding_indexed} for d in docs]
`;

  // ── docker-compose.yml ─────────────────────────────────────────────────────────
  const dockerCompose = `version: "3.9"
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${appName.replace(/-/g, "_")}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    env_file: ./backend/.env
    ports:
      - "8000:8000"
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:password@db:5432/${appName.replace(/-/g, "_")}

  frontend:
    build: .
    ports:
      - "5173:80"
    depends_on:
      - backend

volumes:
  pgdata:
`;

  // ── backend/Dockerfile ────────────────────────────────────────────────────────
  const backendDockerfile = `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;

  // ── Dockerfile (frontend) ──────────────────────────────────────────────────────
  const frontendDockerfile = `FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
`;

  // Updated README with full-stack instructions
  const fullReadme = `# ${plan.summary.slice(0, 80)}

> Generated by **AgentForge Planning Architect** · ${new Date().toLocaleDateString()}

## Tech Stack
- **Frontend**: ${plan.tech_stack.frontend} (React + TypeScript + Vite)
- **Backend**: ${plan.tech_stack.backend} (Python FastAPI)
- **Database**: ${plan.tech_stack.database} (PostgreSQL 16)
- **AI / LLM**: ${plan.tech_stack.ai} (Azure OpenAI GPT-4o)
- **Vector Store**: FAISS (CPU) + text-embedding-ada-002
${(plan.tech_stack.other ?? []).length > 0 ? `- **Other**: ${plan.tech_stack.other!.join(", ")}` : ""}

## Features
${plan.features.map((f) => `- ${f}`).join("\n")}

---

## Quick Start

### Option 1: Docker Compose (Recommended — runs everything)

\`\`\`bash
# 1. Fill in your Azure OpenAI credentials
cp backend/.env.example backend/.env
# Edit backend/.env with your real values

# 2. Start all services (PostgreSQL + backend + frontend)
docker-compose up --build
\`\`\`

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

### Option 2: Run Locally (without Docker)

#### Backend
\`\`\`bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Azure OpenAI credentials and DB URL
uvicorn main:app --reload
\`\`\`

#### Database (PostgreSQL)
\`\`\`bash
# Start PostgreSQL and create the database
psql -U postgres -c "CREATE DATABASE ${appName.replace(/-/g, "_")};"
# Tables are auto-created on first backend startup
\`\`\`

#### Frontend
\`\`\`bash
# In the project root
npm install
npm run dev
\`\`\`

---

## Configuration (backend/.env)

| Variable | Description |
|----------|-------------|
| \`AZURE_OPENAI_ENDPOINT\` | Your Azure OpenAI resource URL |
| \`AZURE_OPENAI_API_KEY\` | Your Azure OpenAI API key |
| \`AZURE_OPENAI_DEPLOYMENT\` | GPT-4o deployment name |
| \`AZURE_OPENAI_EMBEDDING_DEPLOYMENT\` | text-embedding-ada-002 deployment name |
| \`DATABASE_URL\` | PostgreSQL connection string |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | \`/api/chat\` | Send a message, get RAG-grounded reply |
| GET | \`/api/chat/history/{session_id}\` | Fetch chat history |
| POST | \`/api/documents/upload\` | Upload a document (re-indexes FAISS) |
| GET | \`/api/documents\` | List all indexed documents |
| GET | \`/api/health\` | Health check |

---

## Architecture

${plan.architecture}

## Build Phases
${plan.phases.map((ph) => `\n### Phase ${ph.phase}: ${ph.name}\n${ph.tasks.map((t) => `- ${t}`).join("\n")}`).join("")}

---

## Instant Demo (no install)

Open \`sandbox.html\` directly in any browser for a fully working UI demo — no backend or npm required.

---

*Scaffolded by [AgentForge](https://github.com/agentforge) · Powered by Azure OpenAI GPT-4o*
`;

  // Assemble ZIP — frontend + backend + infra
  zip.file("package.json", packageJson);
  zip.file("index.html", indexHtml);
  zip.file("vite.config.ts", viteConfig);
  zip.file("tsconfig.json", tsconfig);
  zip.file("tsconfig.node.json", tsconfigNode);
  zip.file("tailwind.config.js", tailwindConfig);
  zip.file("postcss.config.js", postcssConfig);
  zip.file(".gitignore", gitignore);
  zip.file("README.md", fullReadme);
  zip.file("Dockerfile", frontendDockerfile);
  zip.file("docker-compose.yml", dockerCompose);
  zip.file("src/main.tsx", mainTsx);
  zip.file("src/App.tsx", isRagPlan(plan) ? appTsx : buildDynamicAppTsx(plan, appTitle, 8000));
  zip.file("src/index.css", indexCss);

  // ── Option B: build chat.py that wires to the AI's primary answer agent ────────
  // Scan aiFiles for an agent with `answer_question`. If found, import + call it.
  // If agent exists but no answer_question, generate a stub that delegates to it.
  // Only fall back to FAISS template if no agent files at all.
  function buildAgentChatPy(): string {
    const allAgentEntries = Object.entries(aiFiles).filter(([path]) =>
      /backend\/app\/agents\/(?!__init__)/.test(path)
    );

    if (allAgentEntries.length === 0) return chatApiPy; // no agents at all → FAISS

    // Prefer agent with answer_question, otherwise use the first agent found
    const agentEntry =
      allAgentEntries.find(([, src]) => /def answer_question\s*\(/.test(src as string)) ??
      allAgentEntries[0];

    const [agentPath, agentSrc] = agentEntry;
    // Extract class name: first `class XxxAgent` in the file
    const classMatch = (agentSrc as string).match(/^class\s+(\w+)/m);
    if (!classMatch) return chatApiPy;

    const className = classMatch[1];
    // Derive module name from file path: backend/app/agents/support_agent.py → support_agent
    const moduleName = agentPath.replace(/^.*\/agents\//, "").replace(/\.py$/, "");
    const hasAnswerQuestion = /def answer_question\s*\(/.test(agentSrc as string);
    // Find the agent's main public method name (not __init__, not _private, not answer_question itself)
    const mainMethodMatch = (agentSrc as string).match(/def\s+([a-z][a-z_0-9]+)\s*\(self/g);
    const mainMethod = mainMethodMatch
      ?.map(m => m.replace(/def\s+/, "").replace(/\s*\(self.*/, ""))
      .find(m => !m.startsWith("_") && m !== "answer_question") ?? "run";
    const agentCall = hasAnswerQuestion
      ? `agent.answer_question(req.question, req.history)`
      : `agent.answer_question(req.question, req.history)`;

    const fallbackCall = hasAnswerQuestion
      ? ""
      : `
def _agent_answer(agent, question: str, history: list) -> dict:
    """General-purpose chat wrapper for any agent class."""
    import json
    from app.config import settings
    # 1. Prefer explicit answer_question method
    if hasattr(agent, "answer_question"):
        return agent.answer_question(question, history)
    # 2. Use agent._call helper if available (takes system_prompt, user_prompt)
    if hasattr(agent, "_call"):
        try:
            return agent._call(
                "You are an AI assistant. Answer the user question helpfully and concisely. Respond in JSON with keys: answer (string), steps (list), source (string), confidence (int 0-100), related (list), out_of_scope (bool).",
                question
            )
        except Exception:
            pass
    # 3. Fall back to agent.client directly
    if hasattr(agent, "client"):
        messages = [{"role": "system", "content": "You are an AI assistant. Answer helpfully. Respond in JSON: {answer, steps, source, confidence, related, out_of_scope}."}]
        for h in (history or []):
            if h.get("role") and h.get("content"):
                messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": question})
        resp = agent.client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
            messages=messages,
            max_completion_tokens=800,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content or '{"answer":"No response"}')
    return {"answer": "Agent not configured correctly.", "confidence": 0}
`;

    return `from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import ChatMessage
from app.agents.${moduleName} import ${className}
import uuid
${fallbackCall}
router = APIRouter()

class ChatRequest(BaseModel):
    session_id: str = ""
    question: str
    history: list[dict] = []

class ChatResponse(BaseModel):
    session_id: str
    answer: str
    steps: list[str] = []
    source: str = ""
    confidence: int = 0
    related: list[str] = []
    out_of_scope: bool = False

@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    session_id = req.session_id or str(uuid.uuid4())
    try:
        agent = ${className}()
        result = ${hasAnswerQuestion ? `agent.answer_question(req.question, req.history)` : `_agent_answer(agent, req.question, req.history)`}
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}\\n{traceback.format_exc()}")
    if not isinstance(result, dict):
        result = {"answer": str(result)}
    db.add(ChatMessage(session_id=session_id, role="user", content=req.question))
    db.add(ChatMessage(session_id=session_id, role="assistant", content=result.get("answer", "")))
    await db.commit()
    return ChatResponse(session_id=session_id, **{
        "answer": result.get("answer", ""),
        "steps": result.get("steps", []),
        "source": str(result.get("source", "")),
        "confidence": int(result.get("confidence", 0)),
        "related": result.get("related", []),
        "out_of_scope": bool(result.get("out_of_scope", False)),
    })

@router.get("/history/{session_id}")
async def get_history(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    msgs = result.scalars().all()
    return [{"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in msgs]
`;
  }

  // Infrastructure files: always use reliable templates (AI gets these wrong every time).
  // Business-logic files (agents/, domain models): keep whatever AI generated.
  zip.file("backend/main.py", backendMain);
  zip.file("backend/requirements.txt", requirementsTxt);
  zip.file("backend/.env.example", envExample);
  zip.file("backend/Dockerfile", backendDockerfile);
  zip.file("backend/app/__init__.py", initPy);
  zip.file("backend/app/config.py", configPy);
  zip.file("backend/app/database.py", databasePy);
  zip.file("backend/app/api/__init__.py", apiInitPy);
  zip.file("backend/app/api/health.py", healthPy);
  zip.file("backend/app/api/chat.py", buildAgentChatPy());
  zip.file("backend/app/api/documents.py", documentsApiPy);

  // Always ensure ChatMessage + Document are in models.py
  const hasBackendFiles = Object.keys(aiFiles).some(p => p.startsWith("backend/"));
  if (!hasBackendFiles) {
    zip.file("backend/app/models.py", modelsPy);
    zip.file("backend/app/rag.py", ragPy);
  } else {
    // AI produced backend files — patch models.py to add missing required models
    const aiModelsSrc = (aiFiles["backend/app/models.py"] as string) || modelsPy;
    const extraModels = `

class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    embedding_indexed: Mapped[bool] = mapped_column(Integer, nullable=False, default=False)
    uploaded_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
`;
    const patchedModels = aiModelsSrc.includes("class ChatMessage")
      ? aiModelsSrc
      : aiModelsSrc + extraModels;
    zip.file("backend/app/models.py", patchedModels);
    if (!aiFiles["backend/app/rag.py"]) {
      zip.file("backend/app/rag.py", ragPy);
    }
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function AppTab({ plan, uiHtml, onGenerateUI, generatingUI, uiError, progressStep }: {
  plan?: Plan;
  uiHtml?: string;
  onGenerateUI: () => void;
  generatingUI: boolean;
  progressStep?: number;
  uiError?: string;
}) {
  const [downloadingRag, setDownloadingRag] = useState(false);
  const [downloadingCustom, setDownloadingCustom] = useState(false);

  const downloadZip = async () => {
    if (downloadingCustom || !plan) return;
    setDownloadingCustom(true);
    try {
      const blob = await buildSourceZip(uiHtml, plan);
      const url = URL.createObjectURL(blob);
      const appSlug = (plan.summary.split(" ").slice(0, 4).join("-") || "agentforge-app")
        .toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${appSlug}-custom-code.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      setDownloadingCustom(false);
    }
  };

  if (!plan) return <EmptyState tab="app" />;

  if (generatingUI && !uiHtml) {
    const step = progressStep ?? 0;
    const UI_STEPS = [
      { label: "Reading attached documents",        icon: "📄" },
      { label: "Extracting knowledge base content", icon: "🔍" },
      { label: "Generating chatbot UI",             icon: "🎨" },
      { label: "Wiring RAG & topic filters",        icon: "🔗" },
      { label: "Sandbox ready",                     icon: "🚀" },
    ];
    return (
      <div className="flex flex-col items-center justify-center h-full px-8">
        <div className="w-full max-w-sm">
          {/* Animated icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center relative">
              <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </span>
            </div>
          </div>
          <p className="text-center text-sm font-semibold text-slate-700 mb-1">Building your AI Sandbox</p>
          <p className="text-center text-xs text-gray-400 mb-5">Powered by Azure OpenAI · GPT-4o</p>
          {/* Step list */}
          <div className="space-y-2 mb-5">
            {UI_STEPS.map((s, idx) => {
              const done   = idx < step;
              const active = idx === step;
              return (
                <div key={idx} className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-500 ${
                  active ? "bg-indigo-50 border border-indigo-200" : done ? "bg-emerald-50/50" : "bg-gray-50"
                }`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                    done ? "bg-emerald-100 text-emerald-600" : active ? "bg-indigo-100 text-indigo-600 animate-pulse" : "bg-gray-100 text-gray-400"
                  }`}>
                    {done ? "✓" : s.icon}
                  </div>
                  <span className={`text-xs font-medium ${
                    done ? "text-emerald-600 line-through decoration-emerald-300" : active ? "text-indigo-700" : "text-gray-400"
                  }`}>{s.label}</span>
                  {active && <span className="ml-auto text-indigo-400 text-xs animate-pulse">…</span>}
                </div>
              );
            })}
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-2">{Math.round((step / 4) * 100)}% complete</p>
        </div>
        <p className="text-xs text-gray-400 mt-1">This takes ~15–30 seconds…</p>
      </div>
    );
  }

  if (uiHtml) {
    const openInBrowser = () => {
      const blob = new Blob([uiHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      // Use anchor click instead of window.open() — bypasses popup blockers
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    const appSlug = (plan.summary.split(" ").slice(0, 4).join("-") || "agentforge-app")
      .toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const downloadRagScaffold = async () => {
      if (downloadingRag) return;
      setDownloadingRag(true);
      try {
        const blob = await buildRagScaffoldZip(uiHtml, plan);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${appSlug}-rag-scaffold.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } finally {
        setDownloadingRag(false);
      }
    };

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Sandbox toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1 text-xs text-gray-500 font-mono truncate">
            sandbox://preview/{plan.tech_stack.frontend.toLowerCase().replace(/\s+/g, "-")}
          </div>
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
          {/* RAG Scaffold download — only shown for RAG/doc-based plans */}
          {isRagPlan(plan) && (
          <button
            onClick={downloadRagScaffold}
            disabled={downloadingRag || downloadingCustom}
            title="Instant download — proven RAGChatbot scaffold with app name injected"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {downloadingRag ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            {downloadingRag ? "Packaging…" : "⬇ RAG Scaffold"}
          </button>
          )}
          {/* Custom Code download — GPT-4o generated, ~40s */}
          <button
            onClick={downloadZip}
            disabled={downloadingCustom || downloadingRag}
            title="GPT-4o generates app-specific agents and React pages (~40s)"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs text-indigo-700 font-medium transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {downloadingCustom ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <span className="text-sm">🤖</span>
            )}
            {downloadingCustom ? "Generating… (~40s)" : "Custom Code"}
          </button>
          <button
            onClick={openInBrowser}
            title="Open in browser"
            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs text-indigo-600 font-medium transition-colors flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open
          </button>
          <button
            onClick={onGenerateUI}
            title="Regenerate UI"
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        {/* Sandboxed iframe — fills remaining height via flex-1 (parent chain: flex flex-col) */}
        <iframe
          className="flex-1 w-full border-0 bg-white block min-h-0"
          srcDoc={uiHtml?.replace(/<\/head>/, '<style>html,body{overflow-y:auto!important;height:auto!important;}</style></head>') ?? uiHtml}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          title="App Preview"
        />
      </div>
    );
  }

  // Error state
  if (uiError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-10">
        <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">UI generation failed</p>
        <p className="text-xs text-red-500 mb-4 max-w-xs leading-relaxed">{uiError}</p>
        <button
          onClick={onGenerateUI}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Try Again
        </button>
      </div>
    );
  }

  // Plan ready but no UI yet
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-10">
      <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth={1.5}/>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 21h8M12 17v4"/>
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-700 mb-2">Ready to build your UI sandbox</p>
      <p className="text-xs text-gray-400 leading-relaxed max-w-xs mb-5">
        Click below to generate a live React UI preview of your app
      </p>
      <button
        onClick={onGenerateUI}
        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/>
        </svg>
        Launch UI Sandbox
      </button>
      <p className="text-xs text-gray-400 mt-3">{plan.tech_stack.frontend} · Interactive mock preview · ~15–30s</p>
    </div>
  );
}

function DatabaseTab({ plan }: { plan?: Plan }) {
  if (!plan) return <EmptyState tab="database" />;
  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Database</span>
        <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">{plan.tech_stack.database}</span>
      </div>
      <div className="bg-gray-900 rounded-xl p-5 text-xs font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">
        {plan.database_schema || "Schema details not specified."}
      </div>
      {plan.agents?.some((a) => a.tools?.some((t) => /db|sql|query|database/i.test(t))) && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Agents with Data Access</h3>
          {plan.agents
            .filter((a) => a.tools?.some((t) => /db|sql|query|database/i.test(t)))
            .map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
                <p className="text-xs font-medium text-emerald-800">{a.name}</p>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY    = "agentforge_architect_sessions";
const ACTIVE_KEY     = "agentforge_architect_active";
const SESSION_CTR_KEY = "agentforge_architect_session_ctr";

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch { return []; }
}

function saveSessions(sessions: Session[]) {
  try {
    // Documents can be large — store only the last 5 sessions to stay under 5 MB
    const trimmed = sessions.slice(0, 5);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* storage full — silent */ }
}

// Keywords that signal the user wants to refine/update the chatbot sandbox
const REFINE_TRIGGERS = /\b(add|change|update|fix|improve|make|show|display|include|remove|replace|adjust|increase|decrease|more|less|better|different|regenerate|redo|rebuild|refresh|enhance)\b/i;

export default function Architect() {
  const location = useLocation();
  const navigate = useNavigate();
  const processedLocationKey = useRef<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeSid, setActiveSid] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_KEY)
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("build");
  const [tab, setTab] = useState<RightTab>("plan");
  const [qAnswers, setQAnswers] = useState<Record<string, string>>({});
  const [qLocked, setQLocked] = useState(false);
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [pendingFileNames, setPendingFileNames] = useState<string[]>([]); // files staged but still extracting
  const [visualFiles, setVisualFiles] = useState<{ name: string; asSource: boolean }[]>([]); // image refs
  const [generatingUI, setGeneratingUI] = useState(false);
  const [uiError, setUiError] = useState<string | undefined>();
  const [sessionCtr, setSessionCtr] = useState<number>(
    () => parseInt(localStorage.getItem(SESSION_CTR_KEY) ?? "0", 10)
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);
  const [sessionsHeight, setSessionsHeight] = useState(112);
  const isResizingRows = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  const active = sessions.find((s) => s.id === activeSid);
  const messages = active?.messages ?? [];
  const plan = active?.plan;
  const uiHtml = active?.uiHtml;

  const [downloadingCustom, setDownloadingCustom] = useState(false);
  const downloadZip = async () => {
    if (downloadingCustom || !plan) return;
    setDownloadingCustom(true);
    try {
      const blob = await buildSourceZip(uiHtml, plan);
      const url = URL.createObjectURL(blob);
      const appSlug = (plan.summary.split(" ").slice(0, 4).join("-") || "agentforge-app")
        .toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${appSlug}-custom-code.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      setDownloadingCustom(false);
    }
  };

  function detectChangeType(text: string): PromptChangeType {
    const t = text.toLowerCase();
    if (/\b(bug|fix|broken|error|not working|crash|issue|problem|wrong|incorrect|missing)\b/.test(t)) return "bugfix";
    if (/\b(add|include|new feature|support|enable|allow|integrate|connect)\b/.test(t)) return "feature";
    if (/\b(improve|better|enhance|upgrade|optimize|polish|refine|clean)\b/.test(t)) return "enhance";
    if (/\b(change|update|modify|adjust|tweak|different|instead|replace|switch)\b/.test(t)) return "refine";
    if (/\b(suggest|recommend|idea|what if|consider|maybe|how about)\b/.test(t)) return "suggest";
    return "refine";
  }

  async function handleGenerateUI(
    currentPlan?: Plan,
    currentSid?: string,
    inlineDocs?: { name: string; text: string }[],
    feedbackHint?: string,
  ) {
    const p = currentPlan ?? plan;
    const sid = currentSid ?? activeSid;
    if (!p || !sid) return;
    setGeneratingUI(true);
    setProgressStep(1);
    setUiError(undefined);
    setTab("app");
    const step2Timer = setTimeout(() => setProgressStep(2), 1500);
    try {
      // Always use session documents — they persist across all chat turns
      const sessionDocs = inlineDocs ?? sessions.find((s) => s.id === sid)?.documents;

      const summaryLow = p.summary.toLowerCase();
      const appType = summaryLow.includes("chatbot") || summaryLow.includes("support") || summaryLow.includes("rag")
        ? "chatbot"
        : summaryLow.includes("dashboard") || summaryLow.includes("analytics")
        ? "dashboard"
        : "web app";

      // Extract company name from first user message or plan summary
      const userPrompt = messages.find((m) => m.role === "user")?.content ?? "";
      const companyMatch = userPrompt.match(/\b(for|at|from)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\b/);
      const company = companyMatch?.[2] ?? p.summary.split(" ").slice(0, 2).join(" ");

      // Detect document types — prefer actual uploaded file extensions
      const docTypes: string[] = [];
      if (sessionDocs?.length) {
        sessionDocs.forEach(d => {
          const ext = d.name.split(".").pop()?.toUpperCase() ?? "";
          if (ext && !docTypes.includes(ext)) docTypes.push(ext);
        });
      }
      if (docTypes.length === 0) {
        if (/docx|word/i.test(userPrompt + p.summary)) docTypes.push("DOCX");
        if (/pdf/i.test(userPrompt + p.summary)) docTypes.push("PDF");
        if (/csv|excel/i.test(userPrompt + p.summary)) docTypes.push("CSV");
        if (docTypes.length === 0) docTypes.push("DOCX", "PDF");
      }

      const appName = extractAppTitle(userPrompt.length > 10 ? userPrompt : p.summary);

      const res = await architectApi.generateUI({
        app_name: appName,
        summary: p.summary,
        features: p.features ?? [],
        frontend: p.tech_stack.frontend,
        app_type: appType,
        company,
        domain: p.summary,
        doc_types: docTypes,
        documents: sessionDocs?.length ? sessionDocs : undefined,
        user_feedback: feedbackHint ?? undefined,
      });
      const html = res.data.html;
      setProgressStep(3);
      if (!html || html.trim().length < 50) {
        setUiError("The sandbox returned empty content. Please try again.");
        return;
      }
      setSessions((prev) =>
        prev.map((s) => s.id === sid ? { ...s, uiHtml: html } : s)
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate UI sandbox.";
      setUiError(`${msg} — Check that the backend is running and your Azure OpenAI key is valid.`);
    } finally {
      clearTimeout(step2Timer);
      setProgressStep(0);
      setGeneratingUI(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-fill prompt coming from Prompt Library / Blueprints / What Should I Build via router state
  useEffect(() => {
    if (processedLocationKey.current === location.key) return;
    processedLocationKey.current = location.key;
    const queued = (location.state as any)?.prompt as string | undefined;
    const sampleFile = (location.state as any)?.sampleFile as { name: string; url: string } | undefined;

    if (queued) {
      // Clear history state without re-rendering (navigate() would abort the in-flight request)
      window.history.replaceState({}, '', location.pathname);

      setInput(queued);
      if (sampleFile) {
        const csvUrl = sampleFile.url.replace(/\.xlsx$/, ".csv");
        const csvName = sampleFile.name.replace(/\.xlsx$/, ".csv");
        fetch(csvUrl)
          .then((r) => r.text())
          .then((text) => {
            if (text.trim()) {
              const preloaded = [{ name: csvName, text }];
              setFiles(preloaded);
              setTimeout(() => send(queued + QUESTIONS_SUFFIX, preloaded), 80);
            } else {
              setTimeout(() => send(queued + QUESTIONS_SUFFIX), 80);
            }
          })
          .catch(() => setTimeout(() => send(queued + QUESTIONS_SUFFIX), 80));
      } else {
        setTimeout(() => send(queued + QUESTIONS_SUFFIX), 80);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Resizable sidebar mouse handlers
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isResizing.current) return;
      const delta = e.clientX - resizeStartX.current;
      const next = Math.min(700, Math.max(280, resizeStartW.current + delta));
      setSidebarWidth(next);
    }
    function onMouseUp() {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Vertical resize for sessions panel
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isResizingRows.current) return;
      const delta = e.clientY - resizeStartY.current;
      const next = Math.min(400, Math.max(72, resizeStartH.current + delta));
      setSessionsHeight(next);
    }
    function onMouseUp() {
      if (!isResizingRows.current) return;
      isResizingRows.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Persist sessions and active session to localStorage whenever they change
  useEffect(() => { saveSessions(sessions); }, [sessions]);
  useEffect(() => {
    if (activeSid) localStorage.setItem(ACTIVE_KEY, activeSid);
    else localStorage.removeItem(ACTIVE_KEY);
  }, [activeSid]);

  function nextCtr() {
    const n = sessionCtr + 1;
    setSessionCtr(n);
    localStorage.setItem(SESSION_CTR_KEY, String(n));
    return n;
  }

  function newSession() {
    const id = crypto.randomUUID();
    const n = nextCtr();
    const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    setSessions((p) => [{ id, title: `#${n} · New Session · ${ts}`, messages: [], ts: Date.now() }, ...p]);
    setActiveSid(id);
    setQAnswers({});
    setQLocked(false);
    setFiles([]);
    setPendingFileNames([]);
    setVisualFiles([]);
    setInput("");
  }

  function deleteSession(sid: string) {
    setSessions((p) => p.filter((s) => s.id !== sid));
    if (activeSid === sid) {
      const remaining = sessions.filter((s) => s.id !== sid);
      setActiveSid(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  const PLAN_SUFFIX = "\n\nNow generate the full architecture plan immediately. Do not ask any more questions.";
  const QUESTIONS_SUFFIX = "\n\n[SYSTEM: You MUST respond with {\"type\":\"questions\",...} asking exactly 2 clarifying questions. Do NOT generate a plan on this message. This is your only valid response format right now.]";

  async function send(overrideContent?: string, overrideFiles?: { name: string; text: string }[]) {
    const rawText = overrideContent ?? input.trim();
    const activeFiles = overrideFiles ?? files;
    if (!rawText && activeFiles.length === 0 && visualFiles.length === 0) return;
    // Strip hidden suffixes for display only — preserve them for API content
    const hasQSuffix = rawText.includes(QUESTIONS_SUFFIX);
    const displayText = rawText.replace(PLAN_SUFFIX, "").replace(QUESTIONS_SUFFIX, "").trim();
    let sid = activeSid;
    if (!sid) {
      const id = crypto.randomUUID();
      const n = nextCtr();
      const short = displayText.replace(/\s+/g, " ").slice(0, 38) || "Session";
      setSessions((p) => [{ id, title: `#${n} · ${short}`, messages: [], ts: Date.now() }, ...p]);
      setActiveSid(id);
      sid = id;
    }

    const capturedFiles = activeFiles.length > 0 ? [...activeFiles] : undefined;

    // Auto-promote images to source if message explicitly requests it; otherwise keep as visual ref
    const userWantsSource = SOURCE_INTENT_RE.test(displayText);
    const capturedVisuals = visualFiles.length > 0
      ? visualFiles.map((v) => ({ ...v, asSource: v.asSource || userWantsSource }))
      : undefined;

    // Build annotated message content for the AI
    let msgContent = displayText;
    if (capturedVisuals?.length) {
      const sourceOnes = capturedVisuals.filter((v) => v.asSource).map((v) => v.name);
      const refOnes    = capturedVisuals.filter((v) => !v.asSource).map((v) => v.name);
      if (sourceOnes.length)
        msgContent += `\n\n[SOURCE DOCUMENT] The user has explicitly designated the following image(s) as source/RAG documents for the knowledge base: ${sourceOnes.join(", ")}.`;
      if (refOnes.length)
        msgContent += `\n\n[VISUAL REFERENCE] The following screenshot(s) are UI reference images for fixes/enhancements only — NOT knowledge-base documents: ${refOnes.join(", ")}. Use them to understand what the output currently looks like.`;
    }

    const userMsg: Message = { role: "user", content: displayText }; // display without annotation
    setSessions((p) =>
      p.map((s) =>
        s.id === sid
          ? {
              ...s,
              title: s.messages.length === 0
                ? (s.title.startsWith("#") ? s.title.replace(/· New Session.*$/, `· ${displayText.replace(/\s+/g," ").slice(0,38)}`) : `${displayText.replace(/\s+/g," ").slice(0,38)}`)
                : s.title,
              messages: [...s.messages, userMsg],
              // Merge RAG docs — images never go here unless user has no doc files
              documents: capturedFiles
                ? [...(s.documents ?? []), ...capturedFiles.filter(f => !(s.documents ?? []).some(d => d.name === f.name))]
                : s.documents,
              // Merge image refs — preserve existing asSource promotions, apply new ones
              visualRefs: capturedVisuals
                ? [
                    ...(s.visualRefs ?? []).map((r) => {
                      const updated = capturedVisuals.find((v) => v.name === r.name);
                      return updated ? { ...r, asSource: r.asSource || updated.asSource } : r;
                    }),
                    ...capturedVisuals.filter((v) => !(s.visualRefs ?? []).some((r) => r.name === v.name)),
                  ]
                : s.visualRefs,
            }
          : s
      )
    );
    setInput("");
    setFiles([]);
    setPendingFileNames([]);
    setVisualFiles([]);
    setQLocked(true);
    setLoading(true);

    try {
      const session = sessions.find((s) => s.id === sid);
      const history = (session?.messages ?? []).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
      // Use annotated content for the AI; re-append QUESTIONS_SUFFIX if this was a forced-questions send
      const apiContent = hasQSuffix ? msgContent + QUESTIONS_SUFFIX : msgContent;
      history.push({ role: "user", content: apiContent });

      const res = await architectApi.chat(history);
      const data: ArchitectResponse = res.data;
      // Merge messages, plan AND promptHistory in one atomic setSessions call
      // to avoid stale-state bugs from separate batched calls
      const planSummary   = data.plan?.summary ?? "";
      const planArch      = data.plan?.architecture ?? "";
      const planFeatures  = data.plan?.features ?? [];
      const capturedDisplayText = displayText;
      const capturedSid   = sid;

      // Capture the expected promptHistory length BEFORE the update, so the
      // self-correction verifier can detect if the write was silently dropped.
      const sessionBeforeUpdate = sessions.find((s) => s.id === capturedSid);
      const historyLenBefore = sessionBeforeUpdate?.promptHistory?.length ?? 0;
      const expectedLenAfter = data.plan
        ? (historyLenBefore === 0 ? 1 : historyLenBefore + 1)
        : historyLenBefore;

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== capturedSid) return s;

          // ── messages + plan update (always) ──────────────────────────
          const nextMessages = [...s.messages, { role: "assistant" as const, content: data.message, response: data }];
          const nextPlan     = data.plan ?? s.plan;

          // ── promptHistory update (only when plan returned) ────────────
          let nextPromptHistory = s.promptHistory ?? [];
          if (data.plan) {
            const existing = nextPromptHistory;
            if (existing.length === 0) {
              // v1: lock original user prompt + full LLM output forever
              const firstUserMsg = s.messages.find((m) => m.role === "user")?.content ?? capturedDisplayText;
              const enhancedFull = [
                planSummary,
                planArch ? `\nArchitecture:\n${planArch}` : "",
              ].filter(Boolean).join("\n\n");
              nextPromptHistory = [{
                version: 1,
                ts: Date.now(),
                changeType: "initial",
                userInput: firstUserMsg,
                enhancedPrompt: enhancedFull,
                addedFeatures: planFeatures.slice(0, 6),
                changeLabel: "v1 · Initial prompt",
                // Concise summary extracted from assistant reply
                changeSummary: data.message?.split(".")[0]?.slice(0, 120) ?? "",
              }];
            } else {
              // Dedup guard: skip if this exact user instruction is already the last entry
              const lastEntry = existing[existing.length - 1];
              if (lastEntry?.userInput?.trim() === capturedDisplayText.trim()) {
                // Already recorded — no-op (idempotent self-correction)
                nextPromptHistory = existing;
              } else {
                const nextVersion = (lastEntry?.version ?? 0) + 1;
                const changeType  = detectChangeType(capturedDisplayText);
                // Extract concise summary from assistant reply (first sentence, max 120 chars)
                const changeSummary = data.message?.split(/[.\n]/)[0]?.trim().slice(0, 120) ?? capturedDisplayText.slice(0, 80);
                nextPromptHistory = [...existing, {
                  version: nextVersion,
                  ts: Date.now(),
                  changeType,
                  userInput: capturedDisplayText,
                  enhancedPrompt: "",
                  changeSummary,
                  changeLabel: `Change ${nextVersion - 1} · ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}`,
                }];
              }
            }
          }

          return { ...s, messages: nextMessages, plan: nextPlan, promptHistory: nextPromptHistory };
        })
      );

      // ── Self-correction verifier (reinforcement) ──────────────────────────
      // Runs 50ms after the atomic setSessions to confirm the write landed.
      // If promptHistory is shorter than expected (edge case / race), it inserts
      // the missing Change entry so it is never silently dropped.
      if (data.plan && expectedLenAfter > 1) {
        const verifySid = capturedSid;
        const verifyText = capturedDisplayText;
        const verifyMsg  = data.message ?? "";
        setTimeout(() => {
          setSessions((latest) =>
            latest.map((s) => {
              if (s.id !== verifySid) return s;
              const ph = s.promptHistory ?? [];
              if (ph.length >= expectedLenAfter) return s; // already correct
              // Self-heal: append the missing Change entry
              const lastVer = ph[ph.length - 1]?.version ?? 0;
              const changeType = detectChangeType(verifyText);
              const changeSummary = verifyMsg.split(/[.\n]/)[0]?.trim().slice(0, 120) ?? verifyText.slice(0, 80);
              const repaired: PromptVersion = {
                version: lastVer + 1,
                ts: Date.now(),
                changeType,
                userInput: verifyText,
                enhancedPrompt: "",
                changeSummary,
                changeLabel: `Change ${lastVer} · ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}`,
              };
              return { ...s, promptHistory: [...ph, repaired] };
            })
          );
        }, 50);
      }

      if (data.plan) {
        setTab("plan");
        // First-time generation — pass captured files directly (state cleared by now)
        setTimeout(() => handleGenerateUI(data.plan, sid, capturedFiles), 800);
      } else {
        // No new plan — check if this is a refinement request for the existing sandbox
        const currentSession = sessions.find((s) => s.id === sid);
        const hasExistingSandbox = !!currentSession?.uiHtml;
        const isRefinement = REFINE_TRIGGERS.test(displayText);
        if (hasExistingSandbox && isRefinement && currentSession?.plan) {
          // Append Change entry for UI-only refinements (no plan returned)
          const changeType = detectChangeType(displayText);
          const capturedMsg = displayText;
          const capturedSid2 = sid;
          const capturedReply = data.message ?? "";
          setSessions((latestSessions) => {
            const sess = latestSessions.find((s) => s.id === capturedSid2);
            const prevHistory = sess?.promptHistory ?? [];
            // Dedup guard
            if (prevHistory[prevHistory.length - 1]?.userInput?.trim() === capturedMsg.trim()) {
              return latestSessions;
            }
            const nextVersion = (prevHistory[prevHistory.length - 1]?.version ?? 0) + 1;
            const changeSummary = capturedReply.split(/[.\n]/)[0]?.trim().slice(0, 120) ?? capturedMsg.slice(0, 80);
            const newEntry: PromptVersion = {
              version: nextVersion,
              ts: Date.now(),
              changeType,
              userInput: capturedMsg,
              enhancedPrompt: "",
              changeSummary,
              changeLabel: `Change ${nextVersion - 1} · ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}`,
            };
            return latestSessions.map((s) =>
              s.id === capturedSid2
                ? { ...s, promptHistory: [...prevHistory, newEntry] }
                : s
            );
          });
          const feedbackMessages = (currentSession.messages ?? [])
            .filter((m) => m.role === "user")
            .slice(-5)
            .map((m) => m.content)
            .join("\n");
          const sourceRefs = (currentSession.visualRefs ?? []).filter((v) => v.asSource);
          const visualOnlyRefs = (currentSession.visualRefs ?? []).filter((v) => !v.asSource);
          const visualNote = [
            sourceRefs.length
              ? `User explicitly designated these images as source/RAG documents: ${sourceRefs.map((v) => v.name).join(", ")}.`
              : "",
            visualOnlyRefs.length
              ? `Screenshot visual references (UI fix guides only, not RAG sources): ${visualOnlyRefs.map((v) => v.name).join(", ")}.`
              : "",
          ].filter(Boolean).join("\n");
          const feedbackHint = feedbackMessages + "\n" + displayText + visualNote;
          setTimeout(() => handleGenerateUI(currentSession.plan, sid, undefined, feedbackHint), 400);
        }
      }
      if (data.type === "questions") {
        setQLocked(false);
        setQAnswers({});
      }
    } catch {
      setSessions((p) =>
        p.map((s) =>
          s.id === sid
            ? {
                ...s,
                messages: [
                  ...s.messages,
                  {
                    role: "assistant",
                    content: "Could not reach the backend. Make sure the server is running on port 8000.",
                    response: { type: "message", message: "" },
                  },
                ],
              }
            : s
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function pickAnswer(qId: string, opt: string) {
    if (qLocked) return;
    setQAnswers((p) => ({ ...p, [qId]: opt }));
  }

  function submitAnswers() {
    const values = Object.values(qAnswers);
    const formatted = values.join(" - ");
    // The PLAN_SUFFIX is stripped from display in send(), only sent to the API
    send(formatted + PLAN_SUFFIX);
  }

  const lastMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const hasAnswers =
    lastMsg?.response?.type === "questions" && !qLocked && Object.keys(qAnswers).length > 0;

  // Progress steps shown while the plan / UI is being generated
  const PLAN_STEPS = [
    { label: "Understanding your requirements", icon: "🧠" },
    { label: "Designing architecture & agents",  icon: "🏗️" },
    { label: "Building API & database schema",   icon: "🗄️" },
    { label: "Generating tech stack plan",        icon: "⚙️" },
    { label: "Finalising plan",                   icon: "✅" },
  ];
  const UI_STEPS = [
    { label: "Reading attached documents",        icon: "📄" },
    { label: "Extracting knowledge base content", icon: "🔍" },
    { label: "Generating chatbot UI",             icon: "🎨" },
    { label: "Wiring RAG & topic filters",        icon: "🔗" },
    { label: "Sandbox ready",                     icon: "🚀" },
  ];
  // Drive step index from elapsed time so it animates without real backend events
  const [listening, setListening] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading || generatingUI) {
      setProgressStep(0);
      progressTimerRef.current = setInterval(() => {
        setProgressStep((s) => Math.min(s + 1, 4));
      }, 1800);
    } else {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setProgressStep(0);
    }
    return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current); };
  }, [loading, generatingUI]);

  function startVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };
    recognition.start();
  }

  const TABS: { id: RightTab; label: string }[] = [
    { id: "plan", label: "Plan" },
    { id: "agents", label: `Agents${plan?.agents?.length ? ` (${plan.agents.length})` : ""}` },
    { id: "app", label: generatingUI ? "App ⟳" : uiHtml ? "App ✓" : "App" },
    { id: "database", label: "Database" },
  ];

  return (
    <div className="flex h-screen bg-[#0f1117] overflow-hidden">
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col border-r-2 border-white/20 relative overflow-hidden transition-[width] duration-200" style={{ width: chatCollapsed ? 0 : sidebarWidth }}>

        {/* Header + mode buttons in one row */}
        <div className="flex items-center gap-1.5 px-3 py-3 border-b-2 border-white/20" style={{ background: "rgba(99,102,241,0.08)" }}>
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <div className="w-px h-4 bg-white/15 flex-shrink-0" />
          <button
            onClick={newSession}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/20 transition-all duration-150 flex-shrink-0"
            style={{ background: "rgba(99,102,241,0.10)" }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
          </button>
          {(["build", "suggest", "features"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex-shrink-0 ${
                mode === m
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
              style={mode !== m ? { background: "rgba(255,255,255,0.06)" } : undefined}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* ── Persistent attached-files bar ── shown whenever the active session has docs/refs */}
        {((active?.documents?.length ?? 0) > 0 || (active?.visualRefs?.length ?? 0) > 0) && (
          <div className="border-b border-white/10 px-4 py-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Attached to this session</p>
            <div className="flex flex-wrap gap-1.5">
              {(active?.documents ?? []).map((d) => (
                <span
                  key={d.name}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-emerald-300 border border-emerald-500/25"
                  style={{ background: "rgba(16,185,129,0.08)" }}
                  title="RAG Knowledge Base Document"
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="truncate max-w-[110px]">{d.name}</span>
                  <span className="text-[9px] text-emerald-600 font-bold ml-0.5">KB</span>
                </span>
              ))}
              {(active?.visualRefs ?? []).map((v) => (
                <span
                  key={v.name}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs border ${
                    v.asSource
                      ? "text-amber-300 border-amber-500/25"
                      : "text-sky-300 border-sky-500/25"
                  }`}
                  style={{ background: v.asSource ? "rgba(245,158,11,0.07)" : "rgba(14,165,233,0.07)" }}
                  title={v.asSource ? "Explicitly designated as source document" : "Screenshot visual reference"}
                >
                  {v.asSource ? (
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                  )}
                  <span className="truncate max-w-[110px]">{v.name}</span>
                  <span className={`text-[9px] font-bold ml-0.5 ${v.asSource ? "text-amber-600" : "text-sky-600"}`}>
                    {v.asSource ? "SRC" : "REF"}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Sessions history */}
        {sessions.length > 0 && (
          <div className="flex flex-col min-h-0 flex-shrink-0 border-t-2 border-b border-white/20" style={{ height: sessionsHeight, background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-white/15">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Sessions ({sessions.length})</span>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center gap-1 border-b border-white/5 last:border-0 transition-colors ${
                    s.id === activeSid ? "bg-indigo-600/20" : "hover:bg-white/5"
                  }`}
                >
                  <button
                    onClick={() => { setActiveSid(s.id); setQAnswers({}); setQLocked(false); }}
                    className="flex-1 text-left px-4 py-2 min-w-0"
                  >
                    <p className={`text-xs font-medium truncate ${s.id === activeSid ? "text-indigo-300" : "text-gray-300"}`}>
                      {s.title}
                    </p>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 mr-2 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete session"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vertical resize handle — drag to grow/shrink chat area */}
        {sessions.length > 0 && (
          <div
            className="h-3 flex-shrink-0 cursor-row-resize group flex items-center justify-center relative z-10 transition-colors border-b-2 border-white/20"
            style={{ background: "rgba(99,102,241,0.06)" }}
            onMouseDown={(e) => {
              e.preventDefault();
              isResizingRows.current = true;
              resizeStartY.current = e.clientY;
              resizeStartH.current = sessionsHeight;
              document.body.style.cursor = "row-resize";
              document.body.style.userSelect = "none";
            }}
          >
            <div className="w-10 h-1 rounded-full bg-white/30 group-hover:bg-indigo-400 transition-colors" />
          </div>
        )}

        {/* Message thread */}
        <div className="flex-1 overflow-y-auto py-3 min-h-0 border-t border-white/10">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <div className="w-14 h-14 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">What do you want to build?</h3>
              <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                Describe your idea. I'll ask a few clarifying questions, then generate a complete architecture plan with agents, API, database and UI.
              </p>
              <div className="space-y-2 w-full">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="w-full text-left px-4 py-3 border border-white/10 rounded-xl text-xs text-gray-300 leading-relaxed transition-colors hover:bg-white/10"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1 px-0 py-1">
              {messages.map((msg, i) => {
                if (msg.role === "user") {
                  return (
                    <div key={i} className="flex justify-end px-4 py-1.5">
                      <div
                        className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white leading-relaxed"
                        style={{ background: "rgba(99,102,241,0.85)" }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                }
                const r = msg.response;
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-indigo-400 mb-1.5">Architect</p>
                      <p className="text-sm text-gray-200 leading-relaxed mb-3">{r?.message || msg.content}</p>

                      {/* Clarifying questions — answered in right panel */}
                      {r?.type === "questions" && (
                        <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-lg border border-indigo-500/25" style={{ background: "rgba(99,102,241,0.08)" }}>
                          <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs text-indigo-300">Answer the questions in the <span className="font-semibold text-indigo-200">Plan panel →</span></p>
                        </div>
                      )}

                      {/* Plan ready badge */}
                      {r?.type === "plan" && (
                        <div
                          className="flex items-center gap-2 rounded-xl px-3 py-2 mt-1 border border-emerald-700/40"
                          style={{ background: "rgba(16,185,129,0.12)" }}
                        >
                          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs font-medium text-emerald-300">Plan generated — see the right panel →</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {(loading || generatingUI) && (
                <div className="px-4 py-3">
                  <div className="rounded-2xl border border-indigo-500/20 overflow-hidden" style={{ background: "rgba(99,102,241,0.07)" }}>
                    {/* Header row */}
                    <div className="flex items-center gap-2.5 px-4 pt-3 pb-2 border-b border-white/5">
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 animate-pulse">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-indigo-300">
                          {generatingUI ? "Building your sandbox…" : "Generating architecture plan…"}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {generatingUI ? "Reading documents · Extracting Q&A · Rendering UI" : "Analysing requirements · Designing agents · Structuring API"}
                        </p>
                      </div>
                    </div>
                    {/* Step list */}
                    <div className="px-4 py-3 space-y-2">
                      {(generatingUI ? UI_STEPS : PLAN_STEPS).map((step, idx) => {
                        const done    = idx < progressStep;
                        const active  = idx === progressStep;
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            {/* Step indicator */}
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] transition-all duration-500 ${
                              done    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : active  ? "bg-indigo-500/30 text-indigo-300 border border-indigo-500/50 animate-pulse"
                              : "bg-white/5 text-gray-600 border border-white/8"
                            }`}>
                              {done ? "✓" : active ? step.icon : "○"}
                            </div>
                            <span className={`text-xs transition-all duration-300 ${
                              done    ? "text-emerald-400 line-through decoration-emerald-700"
                              : active  ? "text-white font-medium"
                              : "text-gray-600"
                            }`}>
                              {step.label}
                            </span>
                            {active && (
                              <span className="ml-auto flex gap-0.5">
                                {[0,1,2].map((d) => (
                                  <span
                                    key={d}
                                    className="w-1 h-1 rounded-full bg-indigo-400"
                                    style={{ animation: `bounce 1.2s ${d * 0.2}s infinite` }}
                                  />
                                ))}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Progress bar */}
                    <div className="mx-4 mb-3 h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700"
                        style={{ width: `${(progressStep / 4) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Submit answers CTA */}
        {hasAnswers && (
          <div className="px-4 pb-2">
            <button
              onClick={submitAnswers}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Submit answers &amp; generate plan →
            </button>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t-2 border-white/20" style={{ background: "rgba(255,255,255,0.02)" }}>
          {(files.length > 0 || pendingFileNames.length > 0 || visualFiles.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {pendingFileNames.filter((n) => !files.some((f) => f.name === n)).map((name) => (
                <span
                  key={name}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 border border-slate-500/30 animate-pulse"
                  style={{ background: "rgba(100,116,139,0.10)" }}
                  title="Extracting document…"
                >
                  ⏳ {name}
                  <span className="text-[10px] text-slate-500 font-medium ml-1">Indexing…</span>
                </span>
              ))}
              {files.map((f) => (
                <span
                  key={f.name}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-emerald-300 border border-emerald-500/30"
                  style={{ background: "rgba(16,185,129,0.08)" }}
                  title="RAG Knowledge Base Document"
                >
                  📄 {f.name}
                  <span className="text-[10px] text-emerald-500 font-medium ml-1">KB</span>
                  <button
                    onClick={() => setFiles((p) => p.filter((x) => x.name !== f.name))}
                    className="ml-1 text-emerald-700 hover:text-emerald-200"
                  >×</button>
                </span>
              ))}
              {visualFiles.map((v) => (
                <span
                  key={v.name}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs border ${
                    v.asSource
                      ? "text-amber-300 border-amber-500/30"
                      : "text-sky-300 border-sky-500/30"
                  }`}
                  style={{ background: v.asSource ? "rgba(245,158,11,0.08)" : "rgba(14,165,233,0.08)" }}
                  title={
                    v.asSource
                      ? "Explicitly designated as source/RAG document by user — click label to revert to visual ref"
                      : "Screenshot visual reference (UI fix guide) — click label to designate as source document"
                  }
                >
                  {v.asSource ? "📄" : "🖼️"} {v.name}
                  {/* Toggle button: lets user manually flip between Ref ↔ Source */}
                  <button
                    onClick={() =>
                      setVisualFiles((p) =>
                        p.map((x) => x.name === v.name ? { ...x, asSource: !x.asSource } : x)
                      )
                    }
                    className={`ml-1 text-[10px] font-semibold px-1 rounded transition-colors ${
                      v.asSource
                        ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/40"
                        : "bg-sky-500/20 text-sky-400 hover:bg-sky-500/40"
                    }`}
                  >
                    {v.asSource ? "Source ✓" : "Ref →"}
                  </button>
                  <button
                    onClick={() => setVisualFiles((p) => p.filter((x) => x.name !== v.name))}
                    className="ml-1 text-gray-600 hover:text-gray-200"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <div
            className="flex items-end gap-2 rounded-2xl px-4 py-3 border border-white/15 focus-within:border-indigo-500/60 transition-colors cursor-text"
            style={{ background: "rgba(255,255,255,0.06)" }}
            onClick={() => chatInputRef.current?.focus()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.txt,.pdf,.md,.json,.csv,.png,.jpg,.jpeg,.gif,.webp,.bmp"
              multiple
              className="hidden"
              onChange={async (e) => {
                const picked = Array.from(e.target.files ?? []);
                e.target.value = "";
                const RAG_EXTS   = new Set([".docx", ".pdf", ".txt", ".md", ".csv", ".json"]);
                const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

                const getExt = (name: string) =>
                  name.includes(".") ? "." + name.split(".").pop()!.toLowerCase() : "";

                // Route images to visualFiles — they are screenshot references, NOT RAG docs
                const imageFiles = picked.filter((f) => IMAGE_EXTS.has(getExt(f.name)));
                if (imageFiles.length > 0) {
                  setVisualFiles((p) => {
                    const existing = new Set(p.map((x) => x.name));
                    return [...p, ...imageFiles
                      .filter((f) => !existing.has(f.name))
                      .map((f) => ({ name: f.name, asSource: false }))]; // default = visual ref
                  });
                }

                // Route document files to RAG pipeline — stage immediately for instant chip display
                const docFiles = picked.filter((f) => RAG_EXTS.has(getExt(f.name)));
                if (docFiles.length > 0) {
                  const newNames = docFiles.map((f) => f.name);
                  setPendingFileNames((p) => [...p, ...newNames.filter((n) => !p.includes(n))]);
                  const results = await Promise.all(
                    docFiles.map(async (f) => {
                      try {
                        const res = await architectApi.extractDocText(f);
                        if (!res.data.text || (res.data as any).skipped) return null;
                        return { name: f.name, text: res.data.text as string };
                      } catch { return null; }
                    })
                  );
                  const valid = results.filter(
                    (r): r is { name: string; text: string } => r !== null && r.text.trim().length > 0
                  );
                  setPendingFileNames((p) => p.filter((n) => !newNames.includes(n)));
                  setFiles((prev) => {
                    const existing = new Set(prev.map((x) => x.name));
                    return [...prev, ...valid.filter((r) => !existing.has(r.name))];
                  });
                }
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach files"
              className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
            </button>
            <button
              onClick={startVoice}
              disabled={listening}
              title={listening ? "Listening…" : "Voice input"}
              className={`flex-shrink-0 transition-colors ${listening ? "text-red-400 animate-pulse" : "text-gray-500 hover:text-gray-300"}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </button>
            <textarea
              ref={chatInputRef}
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 outline-none resize-none max-h-16 leading-relaxed"
              placeholder={
                mode === "build"
                  ? "Describe what you want to build…"
                  : mode === "suggest"
                  ? "Describe your current setup for suggestions…"
                  : "Describe your existing app and what to add…"
              }
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 64) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text/plain");
                if (text) {
                  e.preventDefault();
                  const ta = e.currentTarget;
                  const start = ta.selectionStart ?? 0;
                  const end = ta.selectionEnd ?? 0;
                  const next = input.slice(0, start) + text + input.slice(end);
                  setInput(next);
                  requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = start + text.length;
                    ta.style.height = "auto";
                    ta.style.height = Math.min(ta.scrollHeight, 64) + "px";
                  });
                }
              }}
            />
            <button
              disabled={loading || (!input.trim() && files.length === 0 && visualFiles.length === 0)}
              onClick={() => send()}
              className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center justify-center flex-shrink-0 transition-colors"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
          <p className="text-[11px] text-gray-700 text-center mt-1.5">Shift+Enter for new line · defaults to React + Python FastAPI</p>
        </div>
      </div>

      {/* ── Resize handle + collapse toggle ───────────────────────────────── */}
      <div
        className="flex-shrink-0 relative z-10 flex items-center justify-center cursor-col-resize hover:bg-indigo-500/20 transition-colors"
        style={{ width: 16, background: "rgba(255,255,255,0.04)" }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          if (chatCollapsed) return;
          e.preventDefault();
          isResizing.current = true;
          resizeStartX.current = e.clientX;
          resizeStartW.current = sidebarWidth;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      >
        {/* collapse / expand button centred on the handle */}
        <button
          onClick={() => setChatCollapsed((c) => !c)}
          title={chatCollapsed ? "Expand chat panel" : "Collapse chat panel"}
          className="relative z-20 flex items-center justify-center w-5 h-8 rounded bg-white/10 hover:bg-indigo-500/60 text-white/50 hover:text-white transition-all"
          style={{ fontSize: 10 }}
        >
          {chatCollapsed ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white min-w-0 min-h-0">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-6 py-3.5 border-b border-gray-200 flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            {plan ? (
              <>
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Plan ready
                </span>
                <button onClick={downloadZip} disabled={downloadingCustom} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium transition-colors">
                  {downloadingCustom ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                  )}
                  {downloadingCustom ? "Generating…" : "Deploy Plan"}
                </button>
                {plan && (
                  <button
                    onClick={() => {
                      if (!activeSid || !plan) return;
                      const sha = Math.random().toString(36).slice(2, 9);
                      const message = `v${(active?.commits?.length ?? 0) + 1} · ${plan.summary.slice(0, 50)}`;
                      setSessions((prev) => prev.map((s) =>
                        s.id === activeSid
                          ? { ...s, commits: [...(s.commits ?? []), { sha, message, ts: Date.now(), planSnapshot: plan, uiHtmlSnapshot: uiHtml }] }
                          : s
                      ));
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Commit
                  </button>
                )}
                {(active?.commits?.length ?? 0) > 0 && (
                  <button
                    onClick={() => setShowVersionHistory((v) => !v)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      showVersionHistory ? "bg-gray-100 border-gray-300 text-gray-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    History ({active?.commits?.length ?? 0})
                  </button>
                )}
              </>
            ) : (
              <span className="text-xs text-gray-400">Answer the questions to generate your plan</span>
            )}
          </div>
        </div>

        {/* Content — overflow-hidden on non-app tabs; app tab needs full height */}
        <div className={`flex-1 min-h-0 relative ${tab === "app" ? "flex flex-col overflow-hidden" : "overflow-hidden"}`}>
          {showVersionHistory && (
            <div className="absolute inset-0 z-10 bg-white overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Version History</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{active?.commits?.length ?? 0} commits</p>
                </div>
                <button onClick={() => setShowVersionHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="divide-y divide-gray-100">
                {[...(active?.commits ?? [])].reverse().map((c, i) => (
                  <div key={c.sha} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50">
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className="w-3 h-3 rounded-full bg-indigo-500 border-2 border-indigo-200" />
                      {i < (active?.commits?.length ?? 0) - 1 && <div className="w-0.5 h-8 bg-gray-200" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{c.sha} · {new Date(c.ts).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (!activeSid) return;
                        setSessions((prev) => prev.map((s) =>
                          s.id === activeSid
                            ? { ...s, plan: c.planSnapshot, uiHtml: c.uiHtmlSnapshot }
                            : s
                        ));
                        setShowVersionHistory(false);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-100 flex-shrink-0"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Revert
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "plan" && <PlanTab plan={plan} promptHistory={active?.promptHistory} messages={active?.messages ?? []} loading={loading} qAnswers={qAnswers} qLocked={qLocked} pickAnswer={pickAnswer} submitAnswers={submitAnswers} hasAnswers={hasAnswers} />}
          {tab === "agents" && <AgentsTab plan={plan} />}
          {tab === "app" && <AppTab plan={plan} uiHtml={uiHtml} onGenerateUI={() => handleGenerateUI()} generatingUI={generatingUI} uiError={uiError} progressStep={progressStep} />}
          {tab === "database" && <DatabaseTab plan={plan} />}
        </div>
      </div>
    </div>
  );
}
