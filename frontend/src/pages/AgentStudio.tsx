import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { agentsApi } from "../api/client";
import type { PromptVersion } from "../components/PromptEvolution";
import { detectChangeType, PromptEvolutionSection, buildRepairEntry } from "../components/PromptEvolution";

const STUDIO_HISTORY_KEY = "agentforge_studio_run_history";

interface Agent {
  id: string;
  name: string;
  model: string;
  description: string;
  current_version: number;
  tools: string[];
  agent_type?: string;
}

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
];

function getAvatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

const API_BASE = "http://localhost:8000";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function DeployModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [tab, setTab] = useState<"api" | "json" | "howto">("api");

  const curlCmd = `curl -X POST ${API_BASE}/api/agents/${agent.id}/run \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": "Hello, what can you help me with?",
    "chat_history": []
  }'`;

  const pythonSnippet = `import requests

response = requests.post(
    "${API_BASE}/api/agents/${agent.id}/run",
    headers={
        "Authorization": "Bearer YOUR_JWT_TOKEN",
        "Content-Type": "application/json",
    },
    json={
        "input": "Hello, what can you help me with?",
        "chat_history": []
    }
)
data = response.json()
print(data["output"])
# data["guardrail_triggered"] → True/False
# data["pii_triggered"]       → True/False
# data["latency_ms"]          → response time`;

  const agentJson = JSON.stringify({
    id: agent.id,
    name: agent.name,
    model: agent.model,
    description: agent.description,
    version: `v${agent.current_version}`,
    tools: agent.tools,
    endpoint: `${API_BASE}/api/agents/${agent.id}/run`,
    method: "POST",
    auth: "Bearer <JWT Token>",
    request_body: { input: "string", chat_history: "array (optional)" },
    response_fields: {
      output: "string — agent reply (PII redacted if triggered)",
      guardrail_triggered: "bool",
      pii_triggered: "bool",
      input_pii_triggered: "bool",
      output_pii_triggered: "bool",
      hallucination_triggered: "bool",
      latency_ms: "number",
    },
  }, null, 2);

  const steps = [
    { num: "01", icon: ">_", title: "Get a JWT token", desc: 'POST /api/auth/login with your email + password to receive a Bearer token.' },
    { num: "02", icon: "{ }", title: "Call the agent", desc: `POST /api/agents/${agent.id}/run with JSON body: { "input": "your message" }` },
    { num: "03", icon: "✓", title: "Read the response", desc: 'Use the "output" field. Check "guardrail_triggered" to know if PII was detected.' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">Deploy — {agent.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Your agent is live behind an API endpoint. Integrate it into any app.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg">✕</button>
        </div>

        {/* Status + 3 steps */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-emerald-700">Agent live</span>
            <span className="ml-auto text-xs text-emerald-600 font-mono">v{agent.current_version}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {steps.map((s) => (
              <div key={s.num} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-indigo-500 text-sm">{s.icon}</span>
                  <span className="text-xs text-gray-300 font-mono">{s.num}</span>
                </div>
                <p className="text-xs font-semibold text-gray-800 mb-1">{s.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 flex-shrink-0">
          <div className="flex border-b border-gray-200 gap-1">
            {(["api", "json", "howto"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                  tab === t ? "bg-white border border-b-white border-gray-200 text-indigo-600 -mb-px" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "api" ? "Agent API" : t === "json" ? "Agent JSON" : "How to Use"}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {tab === "api" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">The primary way to call your agent. Paste into your terminal or app.</p>
                  <CopyButton text={curlCmd} />
                </div>
                <pre className="bg-gray-950 text-green-400 rounded-xl p-4 text-xs overflow-x-auto whitespace-pre font-mono leading-relaxed">{curlCmd}</pre>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600">Python SDK</p>
                  <CopyButton text={pythonSnippet} />
                </div>
                <pre className="bg-gray-950 text-blue-300 rounded-xl p-4 text-xs overflow-x-auto whitespace-pre font-mono leading-relaxed">{pythonSnippet}</pre>
              </div>
            </div>
          )}

          {tab === "json" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">Full agent specification — use this to recreate or document the agent.</p>
                <CopyButton text={agentJson} />
              </div>
              <pre className="bg-gray-950 text-yellow-300 rounded-xl p-4 text-xs overflow-x-auto whitespace-pre font-mono leading-relaxed">{agentJson}</pre>
            </div>
          )}

          {tab === "howto" && (
            <div className="space-y-4 text-sm text-gray-700">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <p className="font-semibold text-indigo-800 mb-1">Step 1 — Authenticate</p>
                <pre className="text-xs text-indigo-700 font-mono whitespace-pre-wrap">{`POST ${API_BASE}/api/auth/login
Content-Type: application/x-www-form-urlencoded

username=your@email.com&password=yourpassword

→ returns: { "access_token": "eyJ..." }`}</pre>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <p className="font-semibold text-indigo-800 mb-1">Step 2 — Run your agent</p>
                <pre className="text-xs text-indigo-700 font-mono whitespace-pre-wrap">{`POST ${API_BASE}/api/agents/${agent.id}/run
Authorization: Bearer <access_token>
Content-Type: application/json

{ "input": "Your message here", "chat_history": [] }`}</pre>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="font-semibold text-emerald-800 mb-1">Step 3 — Parse the response</p>
                <pre className="text-xs text-emerald-700 font-mono whitespace-pre-wrap">{`{
  "output":                "Agent reply text",
  "guardrail_triggered":   false,
  "pii_triggered":         false,
  "input_pii_triggered":   false,
  "output_pii_triggered":  false,
  "hallucination_triggered": false,
  "latency_ms":            1240
}`}</pre>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="font-semibold text-amber-800 mb-2">Guardrails</p>
                <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                  <li><strong>pii_triggered</strong> — PII was detected and redacted (email, phone, SSN, credit card)</li>
                  <li><strong>input_pii_triggered</strong> — PII was in the user's message (redacted before LLM)</li>
                  <li><strong>output_pii_triggered</strong> — PII was in the LLM's response (redacted before returning)</li>
                  <li><strong>hallucination_triggered</strong> — LLM expressed uncertainty (flagged, not blocked)</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">{API_BASE}/api/agents/{agent.id}/run</span>
          </div>
          <CopyButton text={`${API_BASE}/api/agents/${agent.id}/run`} />
        </div>
      </div>
    </div>
  );
}

function ModelBadge({ model }: { model: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
      {model}
    </span>
  );
}

function AgentResponse({ text, onClear }: { text: string; onClear: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 border border-indigo-100 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 border-b border-indigo-100">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-indigo-700">Agent response</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copy}
            title="Copy response"
            className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors"
          >
            {copied ? (
              <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg> Copied</>
            ) : (
              <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg> Copy</>
            )}
          </button>
          <button
            onClick={onClear}
            title="Clear"
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="px-4 py-3 max-h-64 overflow-y-auto">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({ agentName, onConfirm, onCancel, loading }: {
  agentName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-900 text-center mb-1">Delete Agent</h3>
        <p className="text-sm text-gray-500 text-center mb-5">
          Are you sure you want to delete <span className="font-medium text-slate-800">"{agentName}"</span>? This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgentStudio() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [runInput, setRunInput] = useState<{ [id: string]: string }>({});
  const [runResult, setRunResult] = useState<{ [id: string]: string }>({});
  const [runSteps, setRunSteps] = useState<{ [id: string]: { agent: string; result: { output: string } }[] }>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deployAgent, setDeployAgent] = useState<Agent | null>(null);
  const [publishAgent, setPublishAgent] = useState<Agent | null>(null);
  const [publishCategory, setPublishCategory] = useState("Productivity");
  const [publishDescription, setPublishDescription] = useState("");
  const [publishTags, setPublishTags] = useState("");
  const [publishPricing, setPublishPricing] = useState<"free" | "paid">("free");
  const [publishedIds, setPublishedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("af_published_ids") ?? "[]"); }
    catch { return []; }
  });
  const [typeFilter, setTypeFilter] = useState<"all" | "agent" | "managerial" | "superflow">("all");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("id");
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Per-agent run history with self-healing prompt evolution
  const [runHistory, setRunHistory] = useState<{ [agentId: string]: PromptVersion[] }>(() => {
    try { return JSON.parse(localStorage.getItem(STUDIO_HISTORY_KEY) ?? "{}"); } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(STUDIO_HISTORY_KEY, JSON.stringify(runHistory)); } catch { /* full */ }
  }, [runHistory]);

  const recordRun = (agentId: string, userInput: string, responseText: string) => {
    const changeSummary = responseText.split(/[.\n]/)[0]?.trim().slice(0, 120) ?? userInput.slice(0, 80);
    const changeType = detectChangeType(userInput);

    setRunHistory((prev) => {
      const existing = prev[agentId] ?? [];
      // Dedup guard
      if (existing[existing.length - 1]?.userInput?.trim() === userInput.trim()) return prev;

      let next: PromptVersion[];
      if (existing.length === 0) {
        next = [{
          version: 1, ts: Date.now(), changeType: "initial",
          userInput, enhancedPrompt: responseText.slice(0, 300),
          changeLabel: "v1 · First test run", changeSummary,
        }];
      } else {
        const lastVer = existing[existing.length - 1].version;
        next = [...existing, {
          version: lastVer + 1, ts: Date.now(), changeType,
          userInput, enhancedPrompt: "",
          changeSummary,
          changeLabel: `Run ${lastVer} · ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}`,
        }];
      }
      return { ...prev, [agentId]: next };
    });

    // Self-correction verifier (50ms) — repairs any silently dropped run entry
    const capturedId = agentId;
    const capturedInput = userInput;
    const capturedSummary = changeSummary;
    const capturedType = changeType;
    setTimeout(() => {
      setRunHistory((latest) => {
        const hist = latest[capturedId] ?? [];
        if (hist[hist.length - 1]?.userInput?.trim() === capturedInput.trim()) return latest;
        if (hist.some((v) => v.userInput?.trim() === capturedInput.trim())) return latest;
        const repaired = buildRepairEntry(hist, capturedInput, capturedSummary, capturedType);
        return { ...latest, [capturedId]: [...hist, repaired] };
      });
    }, 50);
  };

  const load = () => {
    agentsApi.list().then((r) => setAgents(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!loading && highlightId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [loading, highlightId]);

  const runAgent = async (id: string) => {
    const input = runInput[id];
    if (!input) return;
    setRunningId(id);
    try {
      const res = await agentsApi.run(id, input);
      const output = res.data.output;
      setRunResult((p) => ({ ...p, [id]: output }));
      setRunSteps((p) => ({ ...p, [id]: res.data.steps ?? [] }));
      // Record run in evolution history with self-healing
      recordRun(id, input, output);
    } catch {
      setRunResult((p) => ({ ...p, [id]: "Error running agent" }));
      setRunSteps((p) => ({ ...p, [id]: [] }));
    } finally {
      setRunningId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await agentsApi.delete(deleteTarget.id);
      setAgents((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // keep dialog open so user knows it failed
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {deleteTarget && (
        <DeleteConfirmDialog
          agentName={deleteTarget.name}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {/* Page Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Agent Studio</h1>
          <p className="text-gray-500 text-sm mt-1">Create, configure, and run your AI agents</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/builder")}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
            Visual Builder
          </button>
          <button
            onClick={() => navigate("/studio/create")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Agent
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center mt-32">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading agents...
          </div>
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-24 text-center">
          <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="8" width="18" height="12" rx="2" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8V4M8 4h8M9 13h.01M15 13h.01M9 17h6" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-2">No agents yet</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-xs">
            Create your first AI agent or use the Home prompt to generate one automatically.
          </p>
          <button
            onClick={() => navigate("/studio/create")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Agent
          </button>
        </div>
      ) : (
        <>
        {/* Type filter tabs */}
        <div className="mb-5 flex items-center gap-2">
          {(["all", "agent", "managerial", "superflow"] as const).map((t) => {
            const count = t === "all" ? agents.length : agents.filter(a => (a.agent_type ?? "agent") === t).length;
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
                  typeFilter === t
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                <span className={`ml-1.5 text-xs ${typeFilter === t ? "text-indigo-200" : "text-gray-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {(typeFilter === "all" ? agents : agents.filter(a => (a.agent_type ?? "agent") === typeFilter)).map((agent) => (
            <div
              key={agent.id}
              ref={agent.id === highlightId ? highlightRef : null}
              className={`bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col ${agent.id === highlightId ? "border-indigo-400 ring-2 ring-indigo-200" : "border-gray-200"}`}
            >
              <div className="p-5 flex-1">
                {/* Card Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ${getAvatarColor(agent.name)}`}>
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm leading-tight">{agent.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">v{agent.current_version}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {agent.tools?.length ?? 0} tools
                    </span>
                    <button
                      onClick={() => setDeleteTarget(agent)}
                      title="Delete agent"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <ModelBadge model={agent.model} />
                </div>

                {agent.description && (
                  <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">{agent.description}</p>
                )}
              </div>

              {/* Run Input */}
              <div className="px-5 pb-5">
                {/* Navigation action row */}
                <div className="flex gap-1.5 mb-2">
                  <button
                    onClick={() => navigate(`/studio/create?id=${agent.id}`)}
                    title="Edit agent"
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => navigate(`/playground/${agent.id}`)}
                    title="Test in playground"
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-50 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    Test
                  </button>
                  <button
                    onClick={() => navigate(`/versions/${agent.id}`)}
                    title="Version history"
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    History
                  </button>
                </div>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setDeployAgent(agent)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Deploy
                  </button>
                  <button
                    onClick={() => {
                      setPublishAgent(agent);
                      setPublishDescription(agent.description ?? "");
                      setPublishTags("");
                      setPublishCategory("Productivity");
                      setPublishPricing("free");
                    }}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      publishedIds.includes(agent.id)
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {publishedIds.includes(agent.id) ? "✓ Published" : "🌐 Publish"}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
                    placeholder="Ask something..."
                    value={runInput[agent.id] ?? ""}
                    onChange={(e) => setRunInput((p) => ({ ...p, [agent.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && runAgent(agent.id)}
                  />
                  <button
                    onClick={() => runAgent(agent.id)}
                    disabled={runningId === agent.id || !runInput[agent.id]?.trim()}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    {runningId === agent.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                      </svg>
                    )}
                    Run
                  </button>
                </div>

                {runResult[agent.id] && (
                  <AgentResponse
                    text={runResult[agent.id]}
                    onClear={() => {
                      setRunResult((p) => { const n = {...p}; delete n[agent.id]; return n; });
                      setRunSteps((p) => { const n = {...p}; delete n[agent.id]; return n; });
                    }}
                  />
                )}

                {(agent.agent_type ?? "agent") === "managerial" && (runSteps[agent.id]?.length ?? 0) > 0 && (
                  <details className="mt-2 text-xs text-gray-500">
                    <summary className="cursor-pointer hover:text-gray-700">
                      {runSteps[agent.id].length} worker{runSteps[agent.id].length === 1 ? "" : "s"} invoked
                    </summary>
                    <ul className="mt-1.5 space-y-1 pl-3 border-l border-gray-200">
                      {runSteps[agent.id].map((s, i) => (
                        <li key={i}>
                          <span className="font-medium text-gray-700">{s.agent}</span>: {s.result.output}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* Run Evolution — shows after first successful run */}
                {(runHistory[agent.id]?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <PromptEvolutionSection
                      history={runHistory[agent.id]}
                      sectionTitle="Run Evolution"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {/* Publish Modal */}
      {publishAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Publish to Marketplace</h2>
                <p className="text-xs text-gray-400 mt-0.5">{publishAgent.name}</p>
              </div>
              <button onClick={() => setPublishAgent(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
                <select
                  value={publishCategory}
                  onChange={(e) => setPublishCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-teal-500"
                >
                  {["Productivity", "Communication", "Engineering", "Sales", "Analytics", "Support", "Finance", "HR"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={publishDescription}
                  onChange={(e) => setPublishDescription(e.target.value)}
                  placeholder="Describe what this agent does..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Tags (comma-separated)</label>
                <input
                  value={publishTags}
                  onChange={(e) => setPublishTags(e.target.value)}
                  placeholder="e.g. support, faq, rag"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Pricing</label>
                <div className="flex gap-2">
                  {(["free", "paid"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPublishPricing(p)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors capitalize ${
                        publishPricing === p
                          ? "bg-teal-50 border-teal-400 text-teal-700"
                          : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {p === "free" ? "🆓 Free" : "💰 Paid"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setPublishAgent(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={() => {
                  const newIds = [...publishedIds, publishAgent.id];
                  setPublishedIds(newIds);
                  localStorage.setItem("af_published_ids", JSON.stringify(newIds));
                  const existing = JSON.parse(localStorage.getItem("af_marketplace_agents") ?? "[]");
                  existing.push({
                    id: publishAgent.id,
                    name: publishAgent.name,
                    model: publishAgent.model,
                    description: publishDescription || publishAgent.description,
                    category: publishCategory,
                    tags: publishTags.split(",").map((t: string) => t.trim()).filter(Boolean),
                    pricing: publishPricing,
                    publishedAt: Date.now(),
                  });
                  localStorage.setItem("af_marketplace_agents", JSON.stringify(existing));
                  setPublishAgent(null);
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                🌐 Publish Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy Modal */}
      {deployAgent && (
        <DeployModal agent={deployAgent} onClose={() => setDeployAgent(null)} />
      )}
    </div>
  );
}
