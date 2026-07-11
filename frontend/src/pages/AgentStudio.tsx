import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { agentsApi } from "../api/client";

interface Agent {
  id: string;
  name: string;
  model: string;
  description: string;
  current_version: number;
  tools: string[];
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
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    agentsApi.list().then((r) => setAgents(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const runAgent = async (id: string) => {
    const input = runInput[id];
    if (!input) return;
    setRunningId(id);
    try {
      const res = await agentsApi.run(id, input);
      setRunResult((p) => ({ ...p, [id]: res.data.output }));
    } catch {
      setRunResult((p) => ({ ...p, [id]: "Error running agent" }));
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col"
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
                    onClear={() => setRunResult((p) => { const n = {...p}; delete n[agent.id]; return n; })}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
