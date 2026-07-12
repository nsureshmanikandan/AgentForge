import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { agentsApi, controlPlaneApi } from "../api/client";

interface Agent {
  id: string;
  name: string;
  model: string;
  description: string;
  current_version: number;
  tools: string[];
  system_prompt?: string;
  temperature?: number;
}

interface AgentVersion {
  id?: string;
  version_number?: number;
  version?: number;
  model?: string;
  system_prompt?: string;
  temperature?: number;
  tools?: string[];
  created_at?: string;
  timestamp?: string;
  [key: string]: unknown;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Unknown date";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getVersionNumber(v: AgentVersion, idx: number): number {
  return v.version_number ?? v.version ?? idx + 1;
}

function getTimestamp(v: AgentVersion): string | undefined {
  return v.created_at ?? v.timestamp;
}

export default function AgentVersions() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [restoringIdx, setRestoringIdx] = useState<number | null>(null);
  const [restoredIdx, setRestoredIdx] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) { setNotFound(true); setLoading(false); return; }

    Promise.all([
      agentsApi.get(agentId),
      controlPlaneApi.versions(agentId),
    ])
      .then(([agentRes, versionsRes]) => {
        setAgent(agentRes.data);
        setVersions(Array.isArray(versionsRes.data) ? versionsRes.data : []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [agentId]);

  const restoreVersion = async (v: AgentVersion, idx: number) => {
    if (!agentId) return;
    setRestoringIdx(idx);
    setRestoreError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (v.system_prompt != null) payload.system_prompt = v.system_prompt;
      if (v.model != null) payload.model = v.model;
      if (v.temperature != null) payload.temperature = v.temperature;
      if (v.tools != null) payload.tools = v.tools;
      await agentsApi.update(agentId, payload);
      setRestoredIdx(idx);
      setTimeout(() => setRestoredIdx(null), 3000);
    } catch {
      setRestoreError("Failed to restore version. Please try again.");
    } finally {
      setRestoringIdx(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading version history...
        </div>
      </div>
    );
  }

  if (notFound || !agent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-slate-900 mb-1">Agent not found</h2>
        <p className="text-sm text-gray-500 mb-6">Could not load the agent or its version history.</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          ← Go back
        </button>
      </div>
    );
  }

  // Latest version is identified by the highest version number
  const sortedVersions = [...versions].sort((a, b) => {
    const va = a.version_number ?? a.version ?? 0;
    const vb = b.version_number ?? b.version ?? 0;
    return vb - va;
  });

  const latestVersionNumber = sortedVersions.length > 0
    ? getVersionNumber(sortedVersions[0], 0)
    : agent.current_version;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-xs mb-4 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{agent.name}</h1>
            <p className="text-gray-500 text-sm mt-0.5">Version History</p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {restoreError && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {restoreError}
          <button onClick={() => setRestoreError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Restore success banner */}
      {restoredIdx !== null && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Version restored successfully.
        </div>
      )}

      {/* Timeline */}
      {sortedVersions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="px-6 py-16 text-center">
            <div className="w-12 h-12 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">No version history available yet</p>
            <p className="text-xs text-gray-400">Versions are saved automatically when you update your agent.</p>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-indigo-100" />

          <div className="space-y-4">
            {sortedVersions.map((v, idx) => {
              const vNum = getVersionNumber(v, sortedVersions.length - 1 - idx);
              const isLatest = vNum === latestVersionNumber;
              const isCurrent = isLatest;
              const ts = getTimestamp(v);
              const promptPreview = v.system_prompt
                ? v.system_prompt.slice(0, 100) + (v.system_prompt.length > 100 ? "…" : "")
                : null;

              return (
                <div key={v.id ?? idx} className="relative pl-14">
                  {/* Timeline dot */}
                  <div className={`absolute left-3 top-5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    isLatest
                      ? "bg-indigo-600 border-indigo-600"
                      : "bg-white border-indigo-300"
                  }`}>
                    {isLatest && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>

                  {/* Version card */}
                  <div className={`bg-white border rounded-xl shadow-sm p-5 transition-shadow hover:shadow-md ${
                    isLatest ? "border-indigo-200 ring-1 ring-indigo-100" : "border-gray-200"
                  }`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Version badge */}
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          isLatest
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}>
                          v{vNum}
                        </span>

                        {/* Current badge */}
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Current
                          </span>
                        )}

                        {/* Timestamp */}
                        {ts && (
                          <span className="text-xs text-gray-400">{formatDate(ts)}</span>
                        )}
                      </div>

                      {/* Restore button */}
                      <button
                        onClick={() => restoreVersion(v, idx)}
                        disabled={isCurrent || restoringIdx === idx}
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isCurrent
                            ? "bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed"
                            : restoredIdx === idx
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                            : "border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                        }`}
                      >
                        {restoringIdx === idx ? (
                          <>
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Restoring…
                          </>
                        ) : restoredIdx === idx ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Restored
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                            Restore
                          </>
                        )}
                      </button>
                    </div>

                    {/* Details row */}
                    <div className="mt-3 flex flex-wrap gap-3">
                      {v.model && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {v.model}
                        </span>
                      )}
                      {v.tools && v.tools.length > 0 && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {v.tools.length} tool{v.tools.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {v.temperature != null && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          temp {v.temperature}
                        </span>
                      )}
                    </div>

                    {/* System prompt preview */}
                    {promptPreview && (
                      <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <p className="text-xs text-gray-400 font-medium mb-1">System Prompt</p>
                        <p className="text-xs text-gray-600 font-mono leading-relaxed">{promptPreview}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
