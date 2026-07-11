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
                    {/* Change number badge */}
                    <span className="w-6 h-6 rounded-full bg-gray-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {changeNum}
                    </span>
                    <span className="text-xs font-semibold text-gray-700 flex-1 truncate">Change {changeNum}</span>
                    <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-0.5 flex-shrink-0 ${meta.pill}`}>
                      {meta.icon} {meta.label}
                    </span>
                    {isLatest && (
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                        Latest
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:inline">
                      {new Date(ch.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100 space-y-2">
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

function PlanTab({ plan, promptHistory }: { plan?: Plan; promptHistory?: PromptVersion[] }) {
  if (!plan) return <EmptyState tab="plan" />;
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

// ─── Source ZIP builder ───────────────────────────────────────────────────────

async function buildSourceZip(html: string, plan: Plan): Promise<Blob> {
  const zip = new JSZip();
  const appName = (plan.summary.split(" ").slice(0, 4).join("-") || "agentforge-app").toLowerCase().replace(/[^a-z0-9-]/g, "-");

  // Extract the babel/JSX script block from the sandbox HTML
  const scriptMatch = html.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);
  const rawScript = scriptMatch ? scriptMatch[1].trim() : "// No component found";

  // Attempt to strip the ReactDOM.render / createRoot call at the bottom so we export a clean component
  const componentCode = rawScript
    .replace(/ReactDOM\.createRoot\([^)]*\)\.render\([\s\S]*?\);?\s*$/m, "")
    .replace(/ReactDOM\.render\([\s\S]*?\);?\s*$/m, "")
    .trim();

  // ── src/App.tsx ─────────────────────────────────────────────────────────────
  const appTsx = `import React from "react";

${componentCode}

export default App;
`;

  // ── src/main.tsx ────────────────────────────────────────────────────────────
  const mainTsx = `import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
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
      lint: "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
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

  // Assemble ZIP
  zip.file("package.json", packageJson);
  zip.file("index.html", indexHtml);
  zip.file("vite.config.ts", viteConfig);
  zip.file("tsconfig.json", tsconfig);
  zip.file("tsconfig.node.json", tsconfigNode);
  zip.file("tailwind.config.js", tailwindConfig);
  zip.file("postcss.config.js", postcssConfig);
  zip.file(".gitignore", gitignore);
  zip.file("README.md", readme);
  zip.file("src/main.tsx", mainTsx);
  zip.file("src/App.tsx", appTsx);
  zip.file("src/index.css", indexCss);
  zip.file("sandbox.html", sandboxHtml);

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
  if (!plan) return <EmptyState tab="app" />;

  if (generatingUI) {
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
    const [downloading, setDownloading] = useState(false);

    const openInBrowser = () => {
      const blob = new Blob([uiHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    const downloadZip = async () => {
      if (downloading) return;
      setDownloading(true);
      try {
        const blob = await buildSourceZip(uiHtml, plan);
        const appSlug = (plan.summary.split(" ").slice(0, 4).join("-") || "agentforge-app")
          .toLowerCase().replace(/[^a-z0-9-]/g, "-");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${appSlug}-source.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } finally {
        setDownloading(false);
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
          {/* Download source ZIP */}
          <button
            onClick={downloadZip}
            disabled={downloading}
            title="Download source code as ZIP"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            {downloading ? "Packaging…" : "Download"}
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
          className="flex-1 w-full border-0 bg-white block"
          srcDoc={uiHtml}
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

const STORAGE_KEY = "agentforge_architect_sessions";
const ACTIVE_KEY  = "agentforge_architect_active";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    setUiError(undefined);
    setTab("app");
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

      const appName = userPrompt.length > 10
        ? userPrompt.split(" ").slice(0, 8).join(" ")
        : p.summary.split(" ").slice(0, 6).join(" ");

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
      setGeneratingUI(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Persist sessions and active session to localStorage whenever they change
  useEffect(() => { saveSessions(sessions); }, [sessions]);
  useEffect(() => {
    if (activeSid) localStorage.setItem(ACTIVE_KEY, activeSid);
    else localStorage.removeItem(ACTIVE_KEY);
  }, [activeSid]);

  function newSession() {
    const id = crypto.randomUUID();
    setSessions((p) => [{ id, title: "New Session", messages: [], ts: Date.now() }, ...p]);
    setActiveSid(id);
    setQAnswers({});
    setQLocked(false);
    setFiles([]);
    setVisualFiles([]);
    setInput("");
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
      setSessions((p) => [{ id, title: displayText.slice(0, 50) || "Session", messages: [], ts: Date.now() }, ...p]);
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
              title: s.messages.length === 0 ? displayText.slice(0, 50) : s.title,
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

      setSessions((p) =>
        p.map((s) =>
          s.id === sid
            ? {
                ...s,
                messages: [...s.messages, { role: "assistant", content: data.message, response: data }],
                plan: data.plan ?? s.plan,
              }
            : s
        )
      );

      if (data.plan) {
        setTab("plan");
        // Capture v1 prompt history for the initial plan
        // enhancedPrompt = full LLM output (summary + architecture), locked forever
        const enhancedFull = [
          data.plan.summary,
          data.plan.architecture ? `\nArchitecture:\n${data.plan.architecture}` : "",
        ].filter(Boolean).join("\n\n");
        const v1: PromptVersion = {
          version: 1,
          ts: Date.now(),
          changeType: "initial",
          userInput: displayText,
          enhancedPrompt: enhancedFull,
          addedFeatures: data.plan.features?.slice(0, 6),
          changeLabel: "v1 · Initial prompt",
        };
        setSessions((p) =>
          p.map((s) =>
            s.id === sid
              ? { ...s, promptHistory: [v1] }
              : s
          )
        );
        // First-time generation — pass captured files directly (state cleared by now)
        setTimeout(() => handleGenerateUI(data.plan, sid, capturedFiles), 800);
      } else {
        // No new plan — check if this is a refinement request for the existing sandbox
        const currentSession = sessions.find((s) => s.id === sid);
        const hasExistingSandbox = !!currentSession?.uiHtml;
        const isRefinement = REFINE_TRIGGERS.test(displayText);
        if (hasExistingSandbox && isRefinement && currentSession?.plan) {
          // Append a new prompt history version
          const prevHistory = currentSession.promptHistory ?? [];
          const nextVersion = (prevHistory[prevHistory.length - 1]?.version ?? 0) + 1;
          const changeType = detectChangeType(displayText);
          const newVersion: PromptVersion = {
            version: nextVersion,
            ts: Date.now(),
            changeType,
            userInput: displayText,   // only the user's raw instruction; enhanced prompt is v1 only
            enhancedPrompt: "",       // not used for change entries
            changeLabel: `Change ${nextVersion - 1} · ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}`,
          };
          setSessions((p) =>
            p.map((s) =>
              s.id === sid
                ? { ...s, promptHistory: [...(s.promptHistory ?? []), newVersion] }
                : s
            )
          );
          const feedbackMessages = (currentSession.messages ?? [])
            .filter((m) => m.role === "user")
            .slice(-5)
            .map((m) => m.content)
            .join("\n");
          // Separate session visual refs by their designation
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

  const TABS: { id: RightTab; label: string }[] = [
    { id: "plan", label: "Plan" },
    { id: "agents", label: `Agents${plan?.agents?.length ? ` (${plan.agents.length})` : ""}` },
    { id: "app", label: generatingUI ? "App ⟳" : uiHtml ? "App ✓" : "App" },
    { id: "database", label: "Database" },
  ];

  return (
    <div className="flex h-screen bg-[#0f1117] overflow-hidden">
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div className="w-[460px] flex-shrink-0 flex flex-col border-r border-white/10">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Planning Architect</span>
          </div>
          <button
            onClick={newSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-300 border border-white/10 transition-colors hover:bg-white/10"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
          </button>
        </div>

        {/* Mode selector: Build | Suggest | Add Features */}
        <div className="flex items-center gap-1.5 px-5 py-3 border-b border-white/10">
          {(["build", "suggest", "features"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                mode === m
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
              style={mode !== m ? { background: "rgba(255,255,255,0.06)" } : undefined}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
          <p className="ml-auto text-xs text-gray-600">
            {mode === "build" && "Full stack"}
            {mode === "suggest" && "Recommendations"}
            {mode === "features" && "Extend app"}
          </p>
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

        {/* Past sessions */}
        {sessions.filter((s) => s.id !== activeSid).length > 0 && (
          <div className="border-b border-white/10 max-h-32 overflow-y-auto">
            {sessions
              .filter((s) => s.id !== activeSid)
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveSid(s.id);
                    setQAnswers({});
                    setQLocked(false);
                  }}
                  className="w-full text-left px-5 py-2.5 border-b border-white/5 last:border-0 transition-colors hover:bg-white/5"
                >
                  <p className="text-xs font-medium text-gray-300 truncate">{s.title}</p>
                </button>
              ))}
          </div>
        )}

        {/* Message thread */}
        <div className="flex-1 overflow-y-auto py-3 min-h-0">
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

                      {/* Clarifying question option chips */}
                      {r?.type === "questions" &&
                        r.questions?.map((q) => (
                          <div key={q.id} className="mb-4">
                            <p className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                              <span
                                className="w-4 h-4 rounded-full text-indigo-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                                style={{ background: "rgba(99,102,241,0.3)" }}
                              >
                                ?
                              </span>
                              {q.text}
                            </p>
                            <div className="flex flex-wrap gap-2 pl-6">
                              {q.options.map((opt) => (
                                <button
                                  key={opt}
                                  disabled={qLocked}
                                  onClick={() => pickAnswer(q.id, opt)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                                    qAnswers[q.id] === opt
                                      ? "bg-indigo-600 border-indigo-500 text-white"
                                      : "border-white/20 text-gray-300 hover:border-indigo-500 hover:text-indigo-300"
                                  } ${qLocked && qAnswers[q.id] !== opt ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                                  style={
                                    qAnswers[q.id] !== opt
                                      ? { background: "rgba(255,255,255,0.06)" }
                                      : undefined
                                  }
                                >
                                  {qAnswers[q.id] === opt && "✓ "}
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}

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
        <div className="px-4 pb-4 pt-2 border-t border-white/10">
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
            <textarea
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 outline-none resize-none max-h-32 leading-relaxed"
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
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
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
              </>
            ) : (
              <span className="text-xs text-gray-400">Answer the questions to generate your plan</span>
            )}
          </div>
        </div>

        {/* Content — overflow-hidden on non-app tabs; app tab needs full height */}
        <div className={`flex-1 ${tab === "app" ? "flex flex-col overflow-hidden" : "overflow-hidden"}`}>
          {tab === "plan" && <PlanTab plan={plan} promptHistory={active?.promptHistory} />}
          {tab === "agents" && <AgentsTab plan={plan} />}
          {tab === "app" && <AppTab plan={plan} uiHtml={uiHtml} onGenerateUI={() => handleGenerateUI()} generatingUI={generatingUI} uiError={uiError} progressStep={progressStep} />}
          {tab === "database" && <DatabaseTab plan={plan} />}
        </div>
      </div>
    </div>
  );
}
