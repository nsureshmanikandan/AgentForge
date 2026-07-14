import { useState, useRef, useEffect } from "react";
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

function Dots() {
  return (
    <span className="flex items-center gap-1 h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
          style={{ animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </span>
  );
}

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
        {steps.map((s, i) => (
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

// ─── RAG Scaffold ZIP — proven RAGChatbot pattern, app name injected ──────────

async function buildRagScaffoldZip(html: string, plan: Plan): Promise<Blob> {
  const zip = new JSZip();
  const appTitle = extractAppTitle(plan.summary);
  const appName = appTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agentforge-app";

  // ── sandbox.html — rich 3-panel chat UI, calls http://localhost:8000 ────────
  zip.file("sandbox.html", `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${appTitle}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter','Segoe UI',sans-serif; }
  .dot-bounce { display:inline-block; width:8px; height:8px; border-radius:50%; background:#94a3b8; animation: bounce 1.2s infinite ease-in-out; }
  .dot-bounce:nth-child(2) { animation-delay:.14s; }
  .dot-bounce:nth-child(3) { animation-delay:.28s; }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
  .chip { cursor:pointer; background:#eff6ff; color:#4f46e5; border:1px solid #c7d2fe; border-radius:9999px; padding:2px 10px; font-size:11px; white-space:nowrap; }
  .chip:hover { background:#e0e7ff; }
  #chat-messages { display:flex; flex-direction:column; gap:12px; }
</style>
</head>
<body class="flex h-screen overflow-hidden bg-slate-50">

<!-- LEFT SIDEBAR -->
<aside id="sidebar" class="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
  <div class="p-4 border-b border-gray-700">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-sm">AI</div>
      <div>
        <p class="text-sm font-bold leading-tight truncate max-w-[160px]">${appTitle}</p>
        <p class="text-xs text-slate-400">FAISS RAG · Azure OpenAI</p>
      </div>
    </div>
  </div>
  <div class="p-3 border-b border-gray-700">
    <button id="upload-btn" class="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-indigo-500 text-indigo-300 hover:bg-indigo-900/40 transition-colors">
      📎 Upload Documents
    </button>
    <input id="file-input" type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" class="hidden"/>
  </div>
  <div class="flex-1 overflow-y-auto p-3">
    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Documents</p>
    <div id="doc-list"><p class="text-xs text-slate-500 italic">No documents yet.</p></div>
  </div>
  <div class="p-3 border-t border-gray-700">
    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Suggested</p>
    <div id="suggestions" class="flex flex-col gap-1.5">
      <button class="suggestion-btn text-left text-xs text-slate-300 hover:text-white hover:bg-gray-800 rounded px-2 py-1.5 transition-colors">What can you help me with?</button>
      <button class="suggestion-btn text-left text-xs text-slate-300 hover:text-white hover:bg-gray-800 rounded px-2 py-1.5 transition-colors">Summarise the uploaded documents</button>
      <button class="suggestion-btn text-left text-xs text-slate-300 hover:text-white hover:bg-gray-800 rounded px-2 py-1.5 transition-colors">What are the key topics covered?</button>
    </div>
  </div>
</aside>

<!-- MAIN CHAT -->
<div class="flex-1 flex flex-col min-w-0 overflow-hidden">
  <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
    <p class="flex-1 text-base font-bold text-slate-900">${appTitle}</p>
    <span class="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0">● AI Active</span>
    <span class="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0">● KB Connected</span>
    <span class="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0">85–97% Accuracy</span>
  </header>
  <div id="chat-scroll" class="flex-1 overflow-y-auto p-5">
    <div id="chat-messages">
      <div class="flex justify-start">
        <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-xl">
          <p class="text-sm text-slate-800 leading-relaxed">Hello! I am your AI assistant for <strong>${appTitle}</strong>. Upload documents and ask me anything.</p>
          <p class="text-[10px] text-slate-400 mt-1">System</p>
        </div>
      </div>
    </div>
  </div>
  <div id="typing-indicator" class="hidden px-5 pb-2">
    <div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 inline-flex gap-1.5 shadow-sm">
      <span class="dot-bounce"></span><span class="dot-bounce"></span><span class="dot-bounce"></span>
    </div>
  </div>
  <footer class="bg-white border-t border-slate-200 p-3.5 flex-shrink-0">
    <div class="flex gap-2.5 items-end">
      <textarea id="msg-input" rows="2" placeholder="Ask a question…"
        class="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"></textarea>
      <button id="send-btn" class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl px-5 py-2.5 text-sm font-semibold h-[44px] whitespace-nowrap transition-colors">Send ➤</button>
    </div>
    <p class="text-xs text-slate-400 text-center mt-2">Powered by Knowledge Base · FAISS RAG · Azure OpenAI</p>
  </footer>
</div>

<!-- RIGHT PANEL -->
<aside class="w-64 border-l bg-white p-4 flex flex-col gap-5 flex-shrink-0 overflow-y-auto">
  <div>
    <p class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Knowledge Base</p>
    <div class="bg-slate-50 rounded-xl p-3">
      <p class="text-2xl font-bold text-indigo-600" id="kb-doc-count">0</p>
      <p class="text-xs text-slate-500 mt-0.5">Documents indexed</p>
    </div>
  </div>
  <div>
    <p class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Session</p>
    <div class="bg-slate-50 rounded-xl p-3">
      <p class="text-2xl font-bold text-emerald-600" id="msg-count">0</p>
      <p class="text-xs text-slate-500 mt-0.5">Messages sent</p>
    </div>
  </div>
  <div>
    <p class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Filter by Topic</p>
    <div class="flex flex-wrap gap-1.5" id="topic-chips">
      <p class="text-xs text-slate-400 italic">Upload docs to see topics</p>
    </div>
  </div>
</aside>

<script>
(function(){
  const API = "http://localhost:8000";
  const SESSION_ID = Math.random().toString(36).slice(2);
  let msgCount = 0;
  let activeTopic = null;

  const chatMessages = document.getElementById("chat-messages");
  const chatScroll   = document.getElementById("chat-scroll");
  const msgInput     = document.getElementById("msg-input");
  const sendBtn      = document.getElementById("send-btn");
  const typingInd    = document.getElementById("typing-indicator");
  const docList      = document.getElementById("doc-list");
  const kbCount      = document.getElementById("kb-doc-count");
  const msgCountEl   = document.getElementById("msg-count");

  function scrollBottom(){ chatScroll.scrollTop = chatScroll.scrollHeight; }

  function addMessage(role, text, ts){
    const wrap = document.createElement("div");
    wrap.className = "flex " + (role==="user" ? "justify-end" : "justify-start");
    const time = ts || new Date().toLocaleTimeString();
    if(role==="user"){
      wrap.innerHTML = \`<div><div class="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-md leading-relaxed">\${escHtml(text)}</div><p class="text-[10px] text-slate-400 text-right mt-1">\${time}</p></div>\`;
    } else {
      wrap.innerHTML = \`<div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-xl"><p class="text-sm text-slate-800 leading-relaxed">\${escHtml(text)}</p><div class="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100"><p class="text-[10px] text-slate-400">\${time}</p><div class="ml-auto flex items-center gap-1.5"><p class="text-[10px] text-slate-400">Helpful?</p><button onclick="this.style.color='#16a34a'" class="text-slate-400 hover:text-green-600 text-sm transition-colors" title="Helpful">👍</button><button onclick="this.style.color='#dc2626'" class="text-slate-400 hover:text-red-500 text-sm transition-colors" title="Not helpful">👎</button></div></div></div>\`;
    }
    chatMessages.appendChild(wrap);
    scrollBottom();
  }

  function escHtml(s){ const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }

  function buildTopicChips(docs){
    const container = document.getElementById("topic-chips");
    if(!docs.length){ container.innerHTML='<p class="text-xs text-slate-400 italic">Upload docs to see topics</p>'; return; }
    container.innerHTML = docs.map(d=>{ const name=(d.filename||d.name||"File").replace(/\.[^.]+$/,""); return \`<span class="chip" data-topic="\${escHtml(name)}">\${escHtml(name)}</span>\`; }).join("");
    container.querySelectorAll(".chip").forEach(chip=>{
      chip.addEventListener("click",()=>{
        const topic=chip.dataset.topic;
        if(activeTopic===topic){ activeTopic=null; chip.style.background=""; chip.style.fontWeight=""; }
        else { activeTopic=topic; container.querySelectorAll(".chip").forEach(c=>{ c.style.background=""; c.style.fontWeight=""; }); chip.style.background="#c7d2fe"; chip.style.fontWeight="700"; sendMessage("Tell me about "+topic); }
      });
    });
  }

  function buildSuggestionsList(docs){
    const container = document.getElementById("suggestions");
    let qs;
    if(!docs.length){ qs=["What can you help me with?","Summarise the uploaded documents","What are the key topics covered?"]; }
    else { qs=[]; docs.forEach(d=>{ const n=(d.filename||d.name||"File").replace(/\.[^.]+$/,""); qs.push(\`What does \${n} cover?\`); qs.push(\`Summarise \${n}\`); qs.push(\`Common issues in \${n}?\`); }); qs=qs.slice(0,6); }
    container.innerHTML = qs.map(q=>\`<button class="suggestion-btn text-left text-xs text-slate-300 hover:text-white hover:bg-gray-800 rounded px-2 py-1.5 transition-colors">\${escHtml(q)}</button>\`).join("");
    container.querySelectorAll(".suggestion-btn").forEach(btn=>{ btn.addEventListener("click",()=>{ sendMessage(btn.textContent.trim()); }); });
  }

  async function loadDocs(){
    try {
      const r = await fetch(API+"/api/documents");
      if(!r.ok) return;
      const docs = await r.json();
      kbCount.textContent = docs.length;
      if(docs.length===0){ docList.innerHTML='<p class="text-xs text-slate-500 italic">No documents yet.</p>'; buildTopicChips([]); buildSuggestionsList([]); return; }
      docList.innerHTML = docs.map(d=>{ const fn=d.filename||d.name||"File"; return \`<div class="bg-slate-700/50 rounded-lg p-2.5 mb-2 cursor-pointer hover:bg-slate-600/50 transition-colors" onclick="sendMessage('Summarise '+\${JSON.stringify(fn)})"><p class="text-xs font-medium text-slate-200 truncate">\${escHtml(fn)}</p><span class="text-[10px] font-semibold mt-1 inline-block \${d.indexed?"text-emerald-400":"text-amber-400"}">\${d.indexed?"✓ Indexed — click to explore":"⏳ Pending"}</span></div>\`; }).join("");
      buildTopicChips(docs);
      buildSuggestionsList(docs);
    } catch(e){ /* backend not running yet */ }
  }

  async function sendMessage(text){
    if(!text.trim()) return;
    addMessage("user", text);
    msgCount++; msgCountEl.textContent = msgCount;
    typingInd.classList.remove("hidden");
    scrollBottom();
    try {
      const r = await fetch(API+"/api/chat", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({message:text, session_id:SESSION_ID}) });
      typingInd.classList.add("hidden");
      if(!r.ok) throw new Error("HTTP "+r.status);
      const data = await r.json();
      addMessage("bot", data.answer || JSON.stringify(data));
    } catch(e){
      typingInd.classList.add("hidden");
      addMessage("bot", "⚠️ Backend not reachable. Start FastAPI on port 8000 to get real answers.");
    }
  }

  sendBtn.addEventListener("click", ()=>{ const t=msgInput.value.trim(); if(t){ msgInput.value=""; sendMessage(t); } });
  msgInput.addEventListener("keydown", e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendBtn.click(); } });

  // suggestions + chips are wired dynamically in buildSuggestionsList / buildTopicChips

  // Upload
  const uploadBtn = document.getElementById("upload-btn");
  const fileInput = document.getElementById("file-input");
  uploadBtn.addEventListener("click", ()=> fileInput.click());
  fileInput.addEventListener("change", async ()=>{
    const files = fileInput.files;
    if(!files||!files.length) return;
    uploadBtn.textContent = "⏳ Indexing…";
    uploadBtn.disabled = true;
    for(const f of Array.from(files)){
      const fd = new FormData(); fd.append("file", f);
      try { await fetch(API+"/api/documents/upload", {method:"POST",body:fd}); } catch(e){}
    }
    fileInput.value="";
    uploadBtn.textContent = "📎 Upload Documents";
    uploadBtn.disabled = false;
    loadDocs();
  });

  buildSuggestionsList([]);
  buildTopicChips([]);
  loadDocs();
  setInterval(loadDocs, 15000);
})();
</script>
</body>
</html>`);

  // ── frontend/src/App.tsx — 3-panel chat UI (matches sandbox.html) ─────────
  zip.file("frontend/src/App.tsx", `import React, { useState, useRef, useEffect } from "react";

function renderMarkdown(text: string): React.ReactNode {
  return text.split("\\n").map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-1" />;
    const parts: React.ReactNode[] = [];
    const segments = line.split(/\\*\\*(.*?)\\*\\*/g);
    segments.forEach((seg, j) => {
      if (j % 2 === 1) parts.push(<strong key={j}>{seg}</strong>);
      else if (seg) parts.push(seg);
    });
    const isListItem = /^(\\d+\\.|-)\\ /.test(line);
    return <p key={i} className={\`text-sm text-slate-800 leading-relaxed\${isListItem ? " pl-3" : ""}\`}>{parts}</p>;
  });
}

interface ApiDoc { id: string; name?: string; filename?: string; indexed: boolean; }
interface BotMsg { id: string; role: "bot"; answer: string; related?: string[]; ts: string; }
interface UserMsg { id: string; role: "user"; text: string; ts: string; }
type Msg = UserMsg | BotMsg;

const SESSION_ID: string =
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

async function apiHealth(): Promise<string> {
  const r = await fetch("/api/health");
  if (!r.ok) return "AI Assistant";
  const d = await r.json();
  return d.app || "AI Assistant";
}
function buildSuggestions(docs: ApiDoc[]): string[] {
  if (docs.length === 0) return ["What can you help me with?", "Summarise the uploaded documents", "What are the key topics covered?"];
  const qs: string[] = [];
  docs.forEach(d => {
    const name = (d.filename ?? d.name ?? "Document").replace(/\.[^.]+$/, "");
    qs.push(\`What does \${name} cover?\`);
    qs.push(\`Summarise the key points in \${name}\`);
    qs.push(\`What are the common issues mentioned in \${name}?\`);
  });
  return qs.slice(0, 10);
}
async function apiChat(message: string): Promise<Omit<BotMsg, "id" | "role" | "ts">> {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: message, workspace_id: 1 }),
  });
  if (!r.ok) throw new Error(\`Chat API \${r.status}\`);
  return r.json();
}
async function apiUpload(file: File): Promise<any> {
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch("/api/documents/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error(\`Upload \${r.status}\`);
  return r.json().catch(() => ({}));
}
async function apiDocs(): Promise<ApiDoc[]> {
  const r = await fetch("/api/documents");
  return r.ok ? r.json() : [];
}
// RAG Scaffold — backend on port 8001 — routes: /api/chat, /api/documents/upload, /api/documents

export default function App() {
  const [appTitle, setAppTitle] = useState("AI Assistant");
  const [messages, setMessages] = useState<Msg[]>([{
    id: "welcome", role: "bot",
    answer: "Hello! I am your AI assistant. Upload documents and ask me anything.",
    ts: new Date().toLocaleTimeString(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<ApiDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const msgCount = messages.filter(m => m.role === "user").length;
  const suggestions = buildSuggestions(docs);

  useEffect(() => {
    apiHealth().then(title => {
      setAppTitle(title);
      setMessages([{ id: "welcome", role: "bot", answer: \`Hello! I am your AI assistant for \${title}. Upload documents and ask me anything.\`, ts: new Date().toLocaleTimeString() }]);
    });
    apiDocs().then(setDocs);
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setMessages(p => [...p, { id: Date.now() + "u", role: "user", text, ts: new Date().toLocaleTimeString() }]);
    setLoading(true);
    try {
      const resp = await apiChat(text);
      setMessages(p => [...p, { id: Date.now() + "b", role: "bot", ...resp, ts: new Date().toLocaleTimeString() }]);
    } catch {
      setMessages(p => [...p, { id: Date.now() + "e", role: "bot", answer: "⚠️ Backend not reachable. Ensure FastAPI is running.", ts: new Date().toLocaleTimeString() }]);
    } finally { setLoading(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const results = await Promise.all(Array.from(files).map(f => apiUpload(f)));
      const fresh = await apiDocs();
      if (fresh.length > 0) {
        setDocs(fresh);
      } else {
        setDocs(p => [...p, ...results.map((r: any, i: number) => ({ id: String(Date.now()+i), name: r.title || r.filename || files[i]?.name || "Document", indexed: true }))]);
      }
    } catch (err) {
      alert("Upload failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleTopic(topic: string) {
    if (activeTopic === topic) { setActiveTopic(null); }
    else { setActiveTopic(topic); send(\`What are the key topics covered in \${topic}?\`); }
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden" style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-sm">AI</div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate">{appTitle}</p>
              <p className="text-xs text-slate-400">FAISS RAG · Azure OpenAI</p>
            </div>
          </div>
        </div>
        <div className="p-3 border-b border-gray-700">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-indigo-500 text-indigo-300 hover:bg-indigo-900/40 transition-colors disabled:opacity-50"
          >
            {uploading ? "⏳ Indexing…" : "📎 Upload Documents"}
          </button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={handleUpload} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Documents</p>
          {docs.length === 0
            ? <p className="text-xs text-slate-500 italic">No documents yet.</p>
            : docs.map(d => (
              <button key={d.id} onClick={() => send(\`Summarise \${d.filename ?? d.name}\`)}
                className="w-full text-left bg-slate-700/50 hover:bg-slate-600/60 rounded-lg p-2.5 mb-2 transition-colors">
                <p className="text-xs font-medium text-slate-200 truncate">{d.filename ?? d.name}</p>
                <span className={\`text-[10px] font-semibold mt-1 inline-block \${d.indexed ? "text-emerald-400" : "text-amber-400"}\`}>
                  {d.indexed ? "✓ Indexed — click to explore" : "⏳ Pending"}
                </span>
              </button>
            ))}
        </div>
        <div className="p-3 border-t border-gray-700 max-h-56 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Suggested</p>
          <div className="flex flex-col gap-1.5">
            {suggestions.map(s => (
              <button key={s} onClick={() => send(s)}
                className="text-left text-xs text-slate-300 hover:text-white hover:bg-gray-800 rounded px-2 py-1.5 transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── MAIN CHAT ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-2 shadow-sm flex-shrink-0 min-w-0">
          <p className="flex-1 min-w-0 text-sm font-bold text-slate-900 truncate">{appTitle}</p>
          <span className="flex-shrink-0 text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full whitespace-nowrap">● AI Active</span>
          <span className="flex-shrink-0 text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full whitespace-nowrap">● KB Connected</span>
          <span className="flex-shrink-0 text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full whitespace-nowrap">85–97% Accuracy</span>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={\`flex \${msg.role === "user" ? "justify-end" : "justify-start"}\`}>
              {msg.role === "user"
                ? <div><div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-md leading-relaxed">{msg.text}</div><p className="text-[10px] text-slate-400 text-right mt-1">{msg.ts}</p></div>
                : <div className={\`bg-white border \${msg.out_of_scope ? "border-amber-200" : "border-slate-200"} rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-2xl w-full\`}>
                    {msg.out_of_scope && <div className="flex items-center gap-2 mb-3 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs font-medium">⚠ Out of scope</div>}
                    <div className="space-y-0.5">{renderMarkdown(msg.answer)}</div>
                    {msg.steps && msg.steps.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 mb-2">Step-by-Step Resolution</p>
                        <ol className="space-y-1.5">
                          {msg.steps.map((s, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                              {s}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {msg.source && msg.source !== "N/A" && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-500 font-medium">📄 {msg.source}</span>
                        <ConfBadge value={msg.confidence} />
                      </div>
                    )}
                    {msg.related && msg.related.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 mb-1.5">💡 Related:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.related.map((r, i) => (
                            <button key={i} onClick={() => send(r)}
                              className="text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2.5 py-0.5 hover:bg-indigo-100">{r}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.id !== "welcome" && (
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">Was this helpful?</span>
                        <button className="text-base hover:scale-110 transition-transform" title="Helpful">👍</button>
                        <button className="text-base hover:scale-110 transition-transform" title="Not helpful">👎</button>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">{msg.ts}</p>
                  </div>}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-sm">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => <span key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: \`\${i * 0.14}s\` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <footer className="bg-white border-t border-slate-200 p-3.5 flex-shrink-0">
          <div className="flex gap-2.5 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask a question…"
              rows={2}
              className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl px-5 py-2.5 text-sm font-semibold h-[44px] whitespace-nowrap transition-colors"
            >Send ➤</button>
          </div>
          <p className="text-xs text-slate-400 text-center mt-2">Powered by Knowledge Base · FAISS RAG · Azure OpenAI</p>
        </footer>
      </div>

      {/* ── RIGHT PANEL ── */}
      <aside className="w-64 border-l bg-white p-4 flex flex-col gap-5 flex-shrink-0 overflow-y-auto">
        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Knowledge Base</p>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-indigo-600">{docs.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Documents indexed</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Session</p>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-emerald-600">{msgCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Messages sent</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Filter by Topic</p>
          <div className="flex flex-wrap gap-1.5">
            {docs.length === 0
              ? <p className="text-xs text-slate-400 italic">Upload documents to filter by topic</p>
              : docs.map(d => (d.filename ?? d.name ?? "Document").replace(/\\.[^.]+$/, "")).map((topic: string) => (
                <button key={topic} onClick={() => toggleTopic(topic)}
                  className={\`text-[11px] px-2.5 py-1 rounded-full border transition-colors truncate max-w-full \${
                    activeTopic === topic
                      ? "bg-indigo-600 text-white border-indigo-600 font-semibold"
                      : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                  }\`}>
                  {topic}
                </button>
              ))
            }
          </div>
        </div>
      </aside>

    </div>
  );
}
`);

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
    dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
    devDependencies: { "@types/react": "^18.3.3", "@types/react-dom": "^18.3.0", "@vitejs/plugin-react": "^4.3.1",
    "axios": "^1.7.2", autoprefixer: "^10.4.19", postcss: "^8.4.38", tailwindcss: "^3.4.4", typescript: "^5.2.2", vite: "^5.4.0" },
  }, null, 2));

  // ── frontend/vite.config.ts ───────────────────────────────────────────────
  zip.file("frontend/vite.config.ts", `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()], server: { proxy: { "/api": { target: "http://localhost:8001", changeOrigin: true } } } });\n`);

  // ── frontend/tsconfig.json ────────────────────────────────────────────────
  zip.file("frontend/tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2020", useDefineForClassFields: true, lib: ["ES2020","DOM","DOM.Iterable"], module: "ESNext", skipLibCheck: true, moduleResolution: "bundler", allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx", strict: true, noUnusedLocals: true, noUnusedParameters: true, noFallthroughCasesInSwitch: true }, include: ["src"], references: [{ path: "./tsconfig.node.json" }] }, null, 2));
  zip.file("frontend/tsconfig.node.json", JSON.stringify({ compilerOptions: { composite: true, skipLibCheck: true, module: "ESNext", moduleResolution: "bundler", allowSyntheticDefaultImports: true }, include: ["vite.config.ts"] }, null, 2));
  zip.file("frontend/tailwind.config.js", `/** @type {import('tailwindcss').Config} */\nexport default { content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] };\n`);
  zip.file("frontend/postcss.config.js", `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`);

  // ── backend/app/rag.py — proven RAGChatbot pattern ────────────────────────
  zip.file("backend/app/rag.py", `import os, faiss, pickle, numpy as np
from pathlib import Path
from openai import AzureOpenAI

AZURE_ENDPOINT   = os.environ.get("AZURE_OPENAI_ENDPOINT", "https://your-resource.openai.azure.com/")
AZURE_API_KEY    = os.environ.get("AZURE_OPENAI_API_KEY", "")
EMBED_DEPLOYMENT = os.environ.get("AZURE_EMBED_DEPLOYMENT", "text-embedding-3-small")
CHAT_DEPLOYMENT  = os.environ.get("AZURE_CHAT_DEPLOYMENT", "gpt-4o")

SYSTEM_PROMPT = """You are a helpful ${appTitle} assistant. \\
Answer questions based on the provided context. \\
If you cannot find the answer in the context, say so clearly."""

INDEX_PATH   = Path("faiss_index.pkl")
client       = AzureOpenAI(azure_endpoint=AZURE_ENDPOINT, api_key=AZURE_API_KEY, api_version="2024-02-01")
_index: faiss.IndexFlatL2 | None = None
_chunks: list[str] = []

def _embed(texts: list[str]) -> np.ndarray:
    resp = client.embeddings.create(input=texts, model=EMBED_DEPLOYMENT)
    return np.array([e.embedding for e in resp.data], dtype="float32")

def add_document(text: str) -> None:
    global _index, _chunks
    sentences = [s.strip() for s in text.replace("\\n", " ").split(". ") if s.strip()]
    if not sentences:
        return
    vecs = _embed(sentences)
    if _index is None:
        _index = faiss.IndexFlatL2(vecs.shape[1])
    _index.add(vecs)
    _chunks.extend(sentences)
    with open(INDEX_PATH, "wb") as f:
        pickle.dump({"index": faiss.serialize_index(_index), "chunks": _chunks}, f)

def _load_index() -> None:
    global _index, _chunks
    if INDEX_PATH.exists() and _index is None:
        with open(INDEX_PATH, "rb") as f:
            data = pickle.load(f)
        _index = faiss.deserialize_index(data["index"])
        _chunks = data["chunks"]

def answer(question: str, top_k: int = 5) -> dict:
    _load_index()
    context = ""
    if _index is not None and _chunks:
        q_vec = _embed([question])
        _, idxs = _index.search(q_vec, min(top_k, len(_chunks)))
        context = "\\n".join(_chunks[i] for i in idxs[0] if i < len(_chunks))
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Context:\\n{context}\\n\\nQuestion: {question}"},
    ]
    response = client.chat.completions.create(model=CHAT_DEPLOYMENT, messages=messages, temperature=0.3, max_tokens=800)
    return {"answer": response.choices[0].message.content, "source": "FAISS RAG", "confidence": 85}
`);

  // ── backend/app/api/chat.py ───────────────────────────────────────────────
  zip.file("backend/app/api/chat.py", `from fastapi import APIRouter
from pydantic import BaseModel
from app import rag

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    session_id: str = ""

@router.post("/chat")
async def chat(req: ChatRequest):
    result = rag.answer(req.message)
    return result
`);

  // ── backend/app/api/documents.py ─────────────────────────────────────────
  zip.file("backend/app/api/documents.py", `from fastapi import APIRouter, UploadFile
from app import rag

router = APIRouter()
_docs: list[dict] = []

@router.post("/documents/upload")
async def upload(file: UploadFile):
    content = (await file.read()).decode("utf-8", errors="replace")
    rag.add_document(content)
    doc = {"id": str(len(_docs) + 1), "name": file.filename or "Untitled", "indexed": True}
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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
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

  // ── Step 2: Add GPT-4o generated files to ZIP ─────────────────────────────
  // Strip leading "frontend/" prefix so paths match the project root layout
  for (const [filePath, content] of Object.entries(aiFiles)) {
    const normalizedPath = filePath.startsWith("frontend/") ? filePath.slice("frontend/".length) : filePath;
    zip.file(normalizedPath, content as string);
  }

  // ── Step 3: Always include sandbox.html (the working iframe preview) ──────
  const sandboxHtml = `<!--
  AgentForge Architect sandbox preview — open directly in a browser (no build needed)
  Generated: ${new Date().toISOString()}
-->\n${html}`;
  zip.file("sandbox.html", sandboxHtml);

  // ── Step 4: If GPT-4o returned no frontend files, inject the static 3-panel template ──
  // The frontend pass can silently return {} (e.g. GPT-4o response too large / missing "files" key)
  // while the backend pass succeeds. Detect by checking for any src/ or index.html files.
  const hasFrontendFiles = Object.keys(aiFiles).some(
    p => p.startsWith("src/") || p === "index.html" || p.endsWith("/App.tsx") || p.endsWith("/main.tsx")
  );
  if (!hasFrontendFiles) {

  // ── src/App.tsx — Real React frontend that calls the FastAPI backend ─────────
  // NOTE: This calls POST /api/chat and POST /api/documents/upload.
  //       Do NOT use the sandbox HTML here — sandbox uses local FAQ; this uses RAG.
  // ── src/App.tsx — 3-panel chat UI matching sandbox layout ────────────────────
  const appTsx = `import React, { useState, useRef, useEffect } from "react";

function renderMarkdown(text: string): React.ReactNode {
  return text.split("\\n").map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-1" />;
    const parts: React.ReactNode[] = [];
    const segments = line.split(/\\*\\*(.*?)\\*\\*/g);
    segments.forEach((seg, j) => {
      if (j % 2 === 1) parts.push(<strong key={j}>{seg}</strong>);
      else if (seg) parts.push(seg);
    });
    const isListItem = /^(\\d+\\.|-)\\ /.test(line);
    return <p key={i} className={\`text-sm text-slate-800 leading-relaxed\${isListItem ? " pl-3" : ""}\`}>{parts}</p>;
  });
}

interface ApiDoc { id: string; name?: string; filename?: string; indexed: boolean; }
interface BotMsg { id: string; role: "bot"; answer: string; related?: string[]; ts: string; }
interface UserMsg { id: string; role: "user"; text: string; ts: string; }
type Msg = UserMsg | BotMsg;

const SESSION_ID: string =
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

async function apiHealth(): Promise<string> {
  const r = await fetch("/api/health");
  if (!r.ok) return "AI Assistant";
  const d = await r.json();
  return d.app || "AI Assistant";
}
function buildSuggestions(docs: ApiDoc[]): string[] {
  if (docs.length === 0) return ["What can you help me with?", "Summarise the uploaded documents", "What are the key topics covered?"];
  const qs: string[] = [];
  docs.forEach(d => {
    const name = (d.filename ?? d.name ?? "Document").replace(/\.[^.]+$/, "");
    qs.push(\`What does \${name} cover?\`);
    qs.push(\`Summarise the key points in \${name}\`);
    qs.push(\`What are the common issues mentioned in \${name}?\`);
  });
  return qs.slice(0, 10);
}

async function apiChat(question: string): Promise<Omit<BotMsg, "id" | "role" | "ts">> {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, workspace_id: 1 }),
  });
  if (!r.ok) throw new Error(\`Chat API \${r.status}\`);
  const data = await r.json();
  return { answer: data.answer || data.response || "No response received." };
}

async function apiUpload(file: File): Promise<{ title?: string; filename?: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload-document", { method: "POST", body: fd });
  if (!r.ok) throw new Error(\`Upload \${r.status}\`);
  return r.json();
}

async function apiDocs(): Promise<ApiDoc[]> {
  const r = await fetch("/api/documents").catch(() => null);
  return r && r.ok ? r.json() : [];
}
// Custom Code — backend on port 8002 — routes: /api/ask-question, /api/upload-document
// handleUpload tracks docs locally since /api/documents may not exist

export default function App() {
  const [appTitle, setAppTitle] = useState("AI Assistant");
  const [messages, setMessages] = useState<Msg[]>([{
    id: "welcome", role: "bot",
    answer: "Hello! I am your AI assistant. Upload documents and ask me anything.",
    ts: new Date().toLocaleTimeString(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<ApiDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgCount = messages.filter(m => m.role === "user").length;
  const suggestions = buildSuggestions(docs);

  useEffect(() => {
    apiHealth().then(title => {
      setAppTitle(title);
      setMessages([{ id: "welcome", role: "bot", answer: \`Hello! I am your AI assistant for \${title}. Upload documents and ask me anything.\`, ts: new Date().toLocaleTimeString() }]);
    });
    apiDocs().then(setDocs);
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setMessages(p => [...p, { id: Date.now() + "u", role: "user", text, ts: new Date().toLocaleTimeString() }]);
    setLoading(true);
    try {
      const resp = await apiChat(text);
      setMessages(p => [...p, { id: Date.now() + "b", role: "bot", ...resp, ts: new Date().toLocaleTimeString() }]);
    } catch {
      setMessages(p => [...p, { id: Date.now() + "e", role: "bot", answer: "⚠️ Backend not reachable. Ensure FastAPI is running.", ts: new Date().toLocaleTimeString() }]);
    } finally { setLoading(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const results = await Promise.all(Array.from(files).map(f => apiUpload(f)));
      const fresh = await apiDocs();
      if (fresh.length > 0) {
        setDocs(fresh);
      } else {
        setDocs(p => [...p, ...results.map((r: any, i: number) => ({ id: String(Date.now()+i), name: r.title || r.filename || files[i]?.name || "Document", indexed: true }))]);
      }
    } catch (err) {
      alert("Upload failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleTopic(topic: string) {
    if (activeTopic === topic) { setActiveTopic(null); }
    else { setActiveTopic(topic); send(\`What are the key topics covered in \${topic}?\`); }
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden" style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-sm">AI</div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate">{appTitle}</p>
              <p className="text-xs text-slate-400">FAISS RAG · Azure OpenAI</p>
            </div>
          </div>
        </div>
        <div className="p-3 border-b border-gray-700">
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-indigo-500 text-indigo-300 hover:bg-indigo-900/40 transition-colors disabled:opacity-50">
            {uploading ? "⏳ Indexing…" : "📎 Upload Documents"}
          </button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={handleUpload} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Documents</p>
          {docs.length === 0
            ? <p className="text-xs text-slate-500 italic">No documents yet.</p>
            : docs.map(d => (
              <button key={d.id} onClick={() => send(\`Summarise \${d.filename ?? d.name}\`)}
                className="w-full text-left bg-slate-700/50 hover:bg-slate-600/60 rounded-lg p-2.5 mb-2 transition-colors">
                <p className="text-xs font-medium text-slate-200 truncate">{d.filename ?? d.name}</p>
                <span className={\`text-[10px] font-semibold mt-1 inline-block \${d.indexed ? "text-emerald-400" : "text-amber-400"}\`}>
                  {d.indexed ? "✓ Indexed — click to explore" : "⏳ Pending"}
                </span>
              </button>
            ))}
        </div>
        <div className="p-3 border-t border-gray-700 max-h-56 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Suggested</p>
          <div className="flex flex-col gap-1.5">
            {suggestions.map(s => (
              <button key={s} onClick={() => send(s)}
                className="text-left text-xs text-slate-300 hover:text-white hover:bg-gray-800 rounded px-2 py-1.5 transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── MAIN CHAT ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-2 shadow-sm flex-shrink-0 min-w-0">
          <p className="flex-1 min-w-0 text-sm font-bold text-slate-900 truncate">{appTitle}</p>
          <span className="flex-shrink-0 text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full whitespace-nowrap">● AI Active</span>
          <span className="flex-shrink-0 text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full whitespace-nowrap">● KB Connected</span>
          <span className="flex-shrink-0 text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full whitespace-nowrap">85–97% Accuracy</span>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={\`flex \${msg.role === "user" ? "justify-end" : "justify-start"}\`}>
              {msg.role === "user"
                ? <div><div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-md leading-relaxed">{msg.text}</div><p className="text-[10px] text-slate-400 text-right mt-1">{msg.ts}</p></div>
                : <div className={\`bg-white border \${msg.out_of_scope ? "border-amber-200" : "border-slate-200"} rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-2xl w-full\`}>
                    {msg.out_of_scope && <div className="flex items-center gap-2 mb-3 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs font-medium">⚠ Out of scope</div>}
                    <div className="space-y-0.5">{renderMarkdown(msg.answer)}</div>
                    {msg.steps && msg.steps.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 mb-2">Step-by-Step Resolution</p>
                        <ol className="space-y-1.5">
                          {msg.steps.map((s, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                              {s}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {msg.source && msg.source !== "N/A" && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-500 font-medium">📄 {msg.source}</span>
                        <ConfBadge value={msg.confidence} />
                      </div>
                    )}
                    {msg.related && msg.related.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 mb-1.5">💡 Related:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.related.map((r, i) => (
                            <button key={i} onClick={() => send(r)}
                              className="text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2.5 py-0.5 hover:bg-indigo-100">{r}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.id !== "welcome" && (
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">Was this helpful?</span>
                        <button className="text-base hover:scale-110 transition-transform" title="Helpful">👍</button>
                        <button className="text-base hover:scale-110 transition-transform" title="Not helpful">👎</button>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">{msg.ts}</p>
                  </div>}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-sm">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => <span key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: \`\${i * 0.14}s\` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <footer className="bg-white border-t border-slate-200 p-3.5 flex-shrink-0">
          <div className="flex gap-2.5 items-end">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask a question…" rows={2}
              className="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl px-5 py-2.5 text-sm font-semibold h-[44px] whitespace-nowrap transition-colors">
              Send ➤
            </button>
          </div>
          <p className="text-xs text-slate-400 text-center mt-2">Powered by Knowledge Base · FAISS RAG · Azure OpenAI</p>
        </footer>
      </div>

      {/* ── RIGHT PANEL ── */}
      <aside className="w-64 border-l bg-white p-4 flex flex-col gap-5 flex-shrink-0 overflow-y-auto">
        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Knowledge Base</p>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-indigo-600">{docs.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Documents indexed</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Session</p>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-emerald-600">{msgCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Messages sent</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Filter by Topic</p>
          <div className="flex flex-wrap gap-1.5">
            {docs.length === 0
              ? <p className="text-xs text-slate-400 italic">Upload documents to filter by topic</p>
              : docs.map(d => (d.filename ?? d.name ?? "Document").replace(/\\.[^.]+$/, "")).map((topic: string) => (
                <button key={topic} onClick={() => toggleTopic(topic)}
                  className={\`text-[11px] px-2.5 py-1 rounded-full border transition-colors truncate max-w-full \${
                    activeTopic === topic
                      ? "bg-indigo-600 text-white border-indigo-600 font-semibold"
                      : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                  }\`}>
                  {topic}
                </button>
              ))
            }
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
        target: "http://localhost:8002",
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
  const readme = `# ${plan.summary.slice(0, 80)}

> Generated by **AgentForge Planning Architect** · ${new Date().toLocaleDateString()}

## Tech Stack
- **Frontend**: ${plan.tech_stack.frontend}
- **Backend**: ${plan.tech_stack.backend}
- **Database**: ${plan.tech_stack.database}
- **AI / LLM**: ${plan.tech_stack.ai}
${(plan.tech_stack.other ?? []).length > 0 ? `- **Other**: ${plan.tech_stack.other!.join(", ")}` : ""}

## Features
${plan.features.map((f) => `- ${f}`).join("\n")}

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Run Locally

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

\`\`\`bash
npm run build
npm run preview
\`\`\`

## Architecture

${plan.architecture}

## Build Phases
${plan.phases.map((ph) => `\n### Phase ${ph.phase}: ${ph.name}\n${ph.tasks.map((t) => `- ${t}`).join("\n")}`).join("")}

---

*Scaffolded by [AgentForge](https://github.com/agentforge) · Powered by Azure OpenAI GPT-4o*
`;

  // ── sandbox.html — the original self-contained working preview ───────────────
  const sandboxHtml = `<!--
  Original AgentForge sandbox preview
  Run this file directly in a browser for an instant demo (no build step needed)
-->
${html}`;

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
  const requirementsTxt = `fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy==2.0.30
alembic==1.13.1
asyncpg==0.29.0
psycopg2-binary==2.9.9
openai==1.30.1
faiss-cpu==1.8.0
numpy==1.26.4
python-dotenv==1.0.1
python-multipart==0.0.9
pydantic==2.7.1
pydantic-settings==2.2.1
tiktoken==0.7.0
pypdf2==3.0.1
sentence-transformers==2.7.0
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

app = FastAPI(title="${plan.summary.slice(0, 60)}", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(chat.router, prefix="/api/chat")
app.include_router(documents.router, prefix="/api/documents")

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
  const configPy = `from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_api_version: str = "2024-02-15-preview"
    azure_openai_deployment: str = "gpt-4o"
    azure_openai_embedding_deployment: str = "text-embedding-ada-002"
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/${appName.replace(/-/g, "_")}"
    app_secret_key: str = "change-me"
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"

settings = Settings()
`;

  // ── backend/app/database.py ───────────────────────────────────────────────────
  const databasePy = `from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
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
        model=settings.azure_openai_deployment,
        messages=messages,
        temperature=0.3,
        max_tokens=1200,
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
    message: str
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
        result = rag.answer(req.message, req.history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    db.add(ChatMessage(session_id=session_id, role="user", content=req.message))
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
  const documentsApiPy = `from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import Document
from app import rag

router = APIRouter()

@router.post("/upload")
async def upload_document(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    raw = await file.read()
    # Try UTF-8; fall back gracefully for binary formats
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        content = raw.decode("latin-1", errors="replace")
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
  zip.file("src/App.tsx", appTsx);
  zip.file("src/index.css", indexCss);

  // Only add static backend when GPT-4o produced NO files at all (complete failure)
  // If aiFiles has backend files, don't overwrite them with the FAISS scaffold
  const hasBackendFiles = Object.keys(aiFiles).some(p => p.startsWith("backend/"));
  if (!hasBackendFiles) {
    zip.file("backend/main.py", backendMain);
    zip.file("backend/requirements.txt", requirementsTxt);
    zip.file("backend/.env.example", envExample);
    zip.file("backend/Dockerfile", backendDockerfile);
    zip.file("backend/app/__init__.py", initPy);
    zip.file("backend/app/config.py", configPy);
    zip.file("backend/app/database.py", databasePy);
    zip.file("backend/app/models.py", modelsPy);
    zip.file("backend/app/rag.py", ragPy);
    zip.file("backend/app/api/__init__.py", apiInitPy);
    zip.file("backend/app/api/health.py", healthPy);
    zip.file("backend/app/api/chat.py", chatApiPy);
    zip.file("backend/app/api/documents.py", documentsApiPy);
  }

  } // end frontend fallback (!hasFrontendFiles)

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

    const downloadZip = async () => {
      if (downloadingCustom) return;
      setDownloadingCustom(true);
      try {
        const blob = await buildSourceZip(uiHtml, plan);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${appSlug}-custom-code.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } finally {
        setDownloadingCustom(false);
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
          {/* RAG Scaffold download — instant, proven pattern */}
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
  const [visualFiles, setVisualFiles] = useState<{ name: string; asSource: boolean }[]>([]); // image refs
  const [generatingUI, setGeneratingUI] = useState(false);
  const [uiError, setUiError] = useState<string | undefined>();
  const [sessionCtr, setSessionCtr] = useState<number>(
    () => parseInt(localStorage.getItem(SESSION_CTR_KEY) ?? "0", 10)
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(460);
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
  const firstPrompt = messages.find((m) => m.role === "user")?.content ?? "";

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

  // Auto-submit prompt coming from Prompt Library / Blueprints / What Should I Build
  useEffect(() => {
    const queued = sessionStorage.getItem("architectPrompt");
    if (queued) {
      sessionStorage.removeItem("architectPrompt");
      setInput(queued);
      // Defer so state is flushed and the send() call sees the new session
      setTimeout(() => send(queued), 80);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function send(overrideContent?: string) {
    const rawText = overrideContent ?? input.trim();
    if (!rawText && files.length === 0 && visualFiles.length === 0) return;
    // Strip the hidden suffix for display
    const displayText = rawText.replace(PLAN_SUFFIX, "").trim();
    const text = rawText;

    let sid = activeSid;
    if (!sid) {
      const id = crypto.randomUUID();
      const n = nextCtr();
      const short = displayText.replace(/\s+/g, " ").slice(0, 38) || "Session";
      setSessions((p) => [{ id, title: `#${n} · ${short}`, messages: [], ts: Date.now() }, ...p]);
      setActiveSid(id);
      sid = id;
    }

    const capturedFiles = files.length > 0 ? [...files] : undefined;

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
    setVisualFiles([]);
    setQLocked(true);
    setLoading(true);

    try {
      const session = sessions.find((s) => s.id === sid);
      const history = (session?.messages ?? []).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
      // Use annotated content (includes visual-ref note) for the AI, not display text
      history.push({ role: "user", content: msgContent });

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
      <div className="flex-shrink-0 flex flex-col border-r-2 border-white/20 relative" style={{ width: sidebarWidth }}>

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
                        const pending = idx > progressStep;
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
          {(files.length > 0 || visualFiles.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
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
            className="flex items-end gap-2 rounded-2xl px-4 py-3 border border-white/15 focus-within:border-indigo-500/60 transition-colors"
            style={{ background: "rgba(255,255,255,0.06)" }}
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

                // Route document files to RAG pipeline
                const docFiles = picked.filter((f) => RAG_EXTS.has(getExt(f.name)));
                if (docFiles.length > 0) {
                  const results = await Promise.all(
                    docFiles.map(async (f) => {
                      try {
                        const res = await architectApi.extractDocText(f);
                        if (!res.data.text || res.data.skipped) return null;
                        return { name: f.name, text: res.data.text as string };
                      } catch { return null; }
                    })
                  );
                  const valid = results.filter(
                    (r): r is { name: string; text: string } => r !== null && r.text.trim().length > 0
                  );
                  setFiles((p) => {
                    const existing = new Set(p.map((x) => x.name));
                    return [...p, ...valid.filter((r) => !existing.has(r.name))];
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

      {/* ── Resize handle ──────────────────────────────────────────────────── */}
      <div
        className="w-1.5 flex-shrink-0 cursor-col-resize group relative z-10 hover:bg-indigo-500/30 transition-colors"
        style={{ background: "rgba(255,255,255,0.06)" }}
        onMouseDown={(e) => {
          e.preventDefault();
          isResizing.current = true;
          resizeStartX.current = e.clientX;
          resizeStartW.current = sidebarWidth;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 group-hover:bg-indigo-400 transition-colors rounded-full" />
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
                <button className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  Deploy Plan
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
