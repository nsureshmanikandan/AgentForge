import { useState, useRef, useEffect } from "react";
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

interface Session {
  id: string;
  title: string;
  messages: Message[];
  plan?: Plan;
  uiHtml?: string;
  documents?: { name: string; text: string }[];
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

function PlanTab({ plan }: { plan?: Plan }) {
  if (!plan) return <EmptyState tab="plan" />;
  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
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

function AppTab({ plan, uiHtml, onGenerateUI, generatingUI, uiError }: {
  plan?: Plan;
  uiHtml?: string;
  onGenerateUI: () => void;
  generatingUI: boolean;
  uiError?: string;
}) {
  if (!plan) return <EmptyState tab="app" />;

  if (generatingUI) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
          <svg className="w-6 h-6 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-700 mb-1">Building your UI sandbox…</p>
          <p className="text-xs text-gray-400">Generating React components, layouts, and mock data</p>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 mt-2 max-w-sm">
          {["Analyzing features", "Writing components", "Adding mock data", "Finalizing UI"].map((s, i) => (
            <span key={i} className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2.5 py-1 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
              {s}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">This takes ~15–30 seconds…</p>
      </div>
    );
  }

  if (uiHtml) {
    const openInBrowser = () => {
      const blob = new Blob([uiHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
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

export default function Architect() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSid, setActiveSid] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("build");
  const [tab, setTab] = useState<RightTab>("plan");
  const [qAnswers, setQAnswers] = useState<Record<string, string>>({});
  const [qLocked, setQLocked] = useState(false);
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [generatingUI, setGeneratingUI] = useState(false);
  const [uiError, setUiError] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const active = sessions.find((s) => s.id === activeSid);
  const messages = active?.messages ?? [];
  const plan = active?.plan;
  const uiHtml = active?.uiHtml;
  const firstPrompt = messages.find((m) => m.role === "user")?.content ?? "";

  async function handleGenerateUI(currentPlan?: Plan, currentSid?: string, inlineDocs?: { name: string; text: string }[]) {
    const p = currentPlan ?? plan;
    const sid = currentSid ?? activeSid;
    if (!p || !sid) return;
    setGeneratingUI(true);
    setUiError(undefined);
    setTab("app");
    try {
      // Prefer inline docs (passed at call time) then session state
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

  function newSession() {
    const id = crypto.randomUUID();
    setSessions((p) => [{ id, title: "New Session", messages: [], ts: Date.now() }, ...p]);
    setActiveSid(id);
    setQAnswers({});
    setQLocked(false);
    setFiles([]);
    setInput("");
  }

  const PLAN_SUFFIX = "\n\nNow generate the full architecture plan immediately. Do not ask any more questions.";

  async function send(overrideContent?: string) {
    const rawText = overrideContent ?? input.trim();
    if (!rawText && files.length === 0) return;
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

    const userMsg: Message = { role: "user", content: displayText };
    const capturedFiles = files.length > 0 ? [...files] : undefined;
    setSessions((p) =>
      p.map((s) =>
        s.id === sid
          ? {
              ...s,
              title: s.messages.length === 0 ? displayText.slice(0, 50) : s.title,
              messages: [...s.messages, userMsg],
              // Merge new files with any already stored on the session
              documents: capturedFiles
                ? [...(s.documents ?? []), ...capturedFiles.filter(f => !(s.documents ?? []).some(d => d.name === f.name))]
                : s.documents,
            }
          : s
      )
    );
    setInput("");
    setFiles([]);
    setQLocked(true);
    setLoading(true);

    try {
      const session = sessions.find((s) => s.id === sid);
      const history = (session?.messages ?? []).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
      history.push({ role: "user", content: text });

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
        // Auto-generate UI sandbox — pass captured files directly (state cleared by now)
        setTimeout(() => handleGenerateUI(data.plan, sid, capturedFiles), 800);
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
              {loading && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                  <Dots />
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
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {files.map((f) => (
                <span
                  key={f.name}
                  className="flex items-center gap-1 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  📎 {f.name}
                  <button
                    onClick={() => setFiles((p) => p.filter((x) => x.name !== f.name))}
                    className="ml-1 text-gray-500 hover:text-gray-200"
                  >
                    ×
                  </button>
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
              accept=".docx,.txt,.pdf,.md,.json,.csv"
              multiple
              className="hidden"
              onChange={async (e) => {
                const picked = Array.from(e.target.files ?? []);
                e.target.value = "";
                const results = await Promise.all(
                  picked.map(async (f) => {
                    try {
                      const res = await architectApi.extractDocText(f);
                      return { name: f.name, text: res.data.text };
                    } catch {
                      return { name: f.name, text: "" };
                    }
                  })
                );
                setFiles((p) => {
                  const existing = new Set(p.map((x) => x.name));
                  return [...p, ...results.filter((r) => !existing.has(r.name))];
                });
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
              disabled={loading || (!input.trim() && files.length === 0)}
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
          {tab === "plan" && <PlanTab plan={plan} />}
          {tab === "agents" && <AgentsTab plan={plan} />}
          {tab === "app" && <AppTab plan={plan} uiHtml={uiHtml} onGenerateUI={() => handleGenerateUI()} generatingUI={generatingUI} uiError={uiError} />}
          {tab === "database" && <DatabaseTab plan={plan} />}
        </div>
      </div>
    </div>
  );
}
