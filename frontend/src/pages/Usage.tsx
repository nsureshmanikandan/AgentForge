import { useEffect, useState } from "react";
import { controlPlaneApi } from "../api/client";

interface Stats {
  total_agents: number;
  total_runs: number;
  guardrail_triggers: number;
  avg_latency_ms: number;
}

interface AuditLog {
  id: string;
  agent_id: string;
  action: string;
  created_at: string;
  latency_ms: number;
  guardrail_triggered: boolean;
  input_snapshot: Record<string, unknown>;
  output_snapshot: Record<string, unknown>;
}

interface StatCardProps {
  label: string;
  value: string | number;
  borderColor: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, borderColor, icon }: StatCardProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex items-center justify-between border-l-4 ${borderColor}`}>
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
        <p className="text-3xl font-semibold text-slate-900">{value}</p>
      </div>
      <div className="text-gray-300">{icon}</div>
    </div>
  );
}

function TraceDetailPanel({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const inputText = log.input_snapshot?.input as string ?? JSON.stringify(log.input_snapshot, null, 2);
  const outputText = log.output_snapshot?.output as string ?? JSON.stringify(log.output_snapshot, null, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-slate-900 text-base">Detailed Logs</h2>
            <p className="text-xs text-gray-400 mt-0.5">Execution trace for this agent run</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Meta strip */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-6 text-xs text-gray-500">
          <span><span className="font-medium text-slate-700">Action</span> · {log.action}</span>
          <span><span className="font-medium text-slate-700">Agent ID</span> · <span className="font-mono">{log.agent_id?.slice(0, 12)}...</span></span>
          <span><span className="font-medium text-slate-700">Duration</span> · {log.latency_ms}ms</span>
          <span><span className="font-medium text-slate-700">Time</span> · {new Date(log.created_at).toLocaleString()}</span>
          <span>
            {log.guardrail_triggered ? (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Guardrail Triggered</span>
            ) : (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Clear</span>
            )}
          </span>
        </div>

        {/* Input / Output columns */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-5">
          {/* INPUT */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Input</span>
              <span className="text-xs text-gray-400">User Query</span>
            </div>
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-64">
              {inputText || <span className="text-gray-400 italic">No input recorded</span>}
            </div>
          </div>

          {/* OUTPUT */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Output</span>
              <span className="text-xs text-gray-400">Agent Response</span>
            </div>
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-64">
              {outputText || <span className="text-gray-400 italic">No output recorded</span>}
            </div>
          </div>
        </div>

        {/* Trace timeline stub */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5M3.75 6.75h16.5M3.75 17.25h16.5" />
            </svg>
            <span className="text-xs font-semibold text-slate-700">Trace Timeline</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-indigo-400" />
              <span>Agent Run</span>
              <span className="font-mono text-gray-400">{log.latency_ms}ms</span>
            </div>
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full" style={{ width: "100%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

export default function Usage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [filterText, setFilterText] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    controlPlaneApi.stats().then((r) => setStats(r.data)).catch(() => {});
    controlPlaneApi.auditLogs().then((r) => setLogs(r.data)).catch(() => {});
  }, []);

  const filteredLogs = filterText.trim()
    ? logs.filter((log) => {
        const q = filterText.toLowerCase();
        return (
          log.action?.toLowerCase().includes(q) ||
          log.agent_id?.toLowerCase().includes(q)
        );
      })
    : logs;

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const pagedLogs = filteredLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
    setPage(0);
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {selectedLog && <TraceDetailPanel log={selectedLog} onClose={() => setSelectedLog(null)} />}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Usage &amp; Traceability</h1>
        <p className="text-gray-500 text-sm mt-1">Monitor agent activity, runs, and platform performance</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard
          label="Total Agents"
          value={stats?.total_agents ?? 0}
          borderColor="border-l-indigo-500"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="8" width="18" height="12" rx="2" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8V4M8 4h8M9 13h.01M15 13h.01M9 17h6" />
            </svg>
          }
        />
        <StatCard
          label="Total Runs"
          value={stats?.total_runs ?? 0}
          borderColor="border-l-blue-500"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          }
        />
        <StatCard
          label="Guardrail Triggers"
          value={stats?.guardrail_triggers ?? 0}
          borderColor="border-l-amber-500"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          }
        />
        <StatCard
          label="Avg Latency"
          value={`${stats?.avg_latency_ms ?? 0}ms`}
          borderColor="border-l-emerald-500"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Audit Logs</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {logs.length === 0 ? "No activity recorded yet" : `${filteredLogs.length} of ${logs.length} event${logs.length !== 1 ? "s" : ""} — click any row to view trace details`}
            </p>
          </div>
          <input
            type="text"
            value={filterText}
            onChange={handleFilterChange}
            placeholder="Filter by action or agent ID..."
            className="ml-auto text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-700 placeholder-gray-400"
          />
        </div>

        {logs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm font-medium">No activity yet</p>
            <p className="text-gray-400 text-xs mt-1">Run an agent to see audit logs here.</p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent ID</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Input Preview</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Output Preview</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Latency</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Guardrail</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Logs</th>
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map((log, idx) => {
                  const inputPreview = (log.input_snapshot?.input as string) || Object.values(log.input_snapshot)[0] as string || "";
                  const outputPreview = (log.output_snapshot?.output as string) || Object.values(log.output_snapshot)[0] as string || "";
                  return (
                    <tr
                      key={log.id}
                      className={`border-b border-gray-100 hover:bg-indigo-50/40 transition-colors cursor-pointer ${idx === pagedLogs.length - 1 ? "border-b-0" : ""}`}
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="px-6 py-4 font-medium text-slate-800">{log.action}</td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-2 py-0.5">
                          {log.agent_id?.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-[160px]">
                        <p className="text-xs text-gray-500 truncate">
                          {inputPreview ? inputPreview.slice(0, 60) + (inputPreview.length > 60 ? "…" : "") : <span className="text-gray-300 italic">—</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4 max-w-[160px]">
                        <p className="text-xs text-gray-500 truncate">
                          {outputPreview ? outputPreview.slice(0, 60) + (outputPreview.length > 60 ? "…" : "") : <span className="text-gray-300 italic">—</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{log.latency_ms}ms</td>
                      <td className="px-6 py-4">
                        {log.guardrail_triggered ? (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Triggered
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Clear
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-slate-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-slate-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
