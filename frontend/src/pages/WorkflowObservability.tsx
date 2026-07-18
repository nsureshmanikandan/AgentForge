import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

interface WorkflowRun {
  run_id: string;
  workflow_id: string;
  trigger_input: string;
  final_output: string;
  status: string;
  node_count: number;
  total_duration_ms: number;
  triggered_at: string;
}

interface NodeLog {
  node_id: string;
  node_label: string;
  status: string;
  output: string;
  duration_ms: number;
}

interface RunDetail {
  run_id: string;
  workflow_id: string;
  trigger_input: string;
  final_output: string;
  status: string;
  node_logs: NodeLog[];
  total_duration_ms: number;
  triggered_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  running: "bg-yellow-100 text-yellow-700",
  waiting_approval: "bg-amber-100 text-amber-800",
  rejected: "bg-gray-200 text-gray-700",
};

const NODE_STATUS_COLOR: Record<string, string> = {
  done: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
  running: "bg-yellow-50 border-yellow-200 text-yellow-800",
};

function fmt(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function WorkflowObservability() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    api
      .get("/builder/runs")
      .then((r) => setRuns(r.data))
      .catch(() => setError("Failed to load workflow runs."))
      .finally(() => setLoading(false));
  }, []);

  const loadDetail = async (run: WorkflowRun) => {
    setLoadingDetail(true);
    setSelected(null);
    try {
      const r = await api.get(`/builder/runs/${run.run_id}`);
      setSelected(r.data as RunDetail);
    } catch {
      setSelected(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const filtered = runs.filter((r) => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.trigger_input.toLowerCase().includes(q) ||
      r.final_output.toLowerCase().includes(q) ||
      r.run_id.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const drawerOpen = loadingDetail || selected !== null;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Workflow Observability</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every workflow execution trace stored in PostgreSQL — inputs, outputs, per-node logs, durations.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[
          { label: "Total Runs", value: runs.length },
          { label: "Completed", value: runs.filter((r) => r.status === "completed").length, color: "text-green-600" },
          { label: "Failed", value: runs.filter((r) => r.status === "failed").length, color: "text-red-600" },
          {
            label: "Awaiting Approval",
            value: runs.filter((r) => r.status === "waiting_approval").length,
            color: "text-amber-600",
          },
          {
            label: "Avg Duration",
            value: runs.length
              ? fmt(runs.reduce((s, r) => s + r.total_duration_ms, 0) / runs.length)
              : "—",
          },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color ?? "text-slate-900"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by input, output or run ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="waiting_approval">Awaiting Approval</option>
          <option value="rejected">Rejected</option>
        </select>
        <button
          onClick={() => {
            setLoading(true);
            api.get("/builder/runs").then((r) => setRuns(r.data)).finally(() => setLoading(false));
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Run table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center text-slate-400 py-16">Loading runs…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-16">No runs found.</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Run ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Trigger Input</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Final Output</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Nodes</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Duration</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Triggered</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((run, i) => (
                  <tr
                    key={run.run_id}
                    className={`border-b border-gray-100 hover:bg-purple-50 cursor-pointer transition-colors ${
                      selected?.run_id === run.run_id ? "bg-purple-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                    }`}
                    onClick={() => loadDetail(run)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{run.run_id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={run.trigger_input}>
                      {run.trigger_input}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={run.final_output}>
                      {run.final_output}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-purple-700">{run.node_count}</td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{fmt(run.total_duration_ms)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          STATUS_COLOR[run.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(run.triggered_at)}</td>
                    <td className="px-4 py-3">
                      {run.status === "waiting_approval" ? (
                        <Link
                          to={`/approvals/${run.run_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-amber-700 hover:text-amber-900 text-xs font-semibold"
                        >
                          Review →
                        </Link>
                      ) : (
                        <button
                          className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadDetail(run);
                          }}
                        >
                          Trace →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => { setSelected(null); setLoadingDetail(false); }}
        />
      )}

      {/* Trace drawer — slides in from right */}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-slate-900 text-base">Execution Trace</h2>
          <button
            onClick={() => { setSelected(null); setLoadingDetail(false); }}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loadingDetail ? (
            <div className="text-center text-slate-400 text-sm py-12">Loading trace…</div>
          ) : selected ? (
            <div className="flex flex-col gap-5">
              {/* Meta */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-20 text-xs">Run ID</span>
                  <span className="font-mono text-slate-700 text-xs">{selected.run_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-20 text-xs">Status</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      STATUS_COLOR[selected.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {selected.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-20 text-xs">Duration</span>
                  <span className="font-mono text-slate-700 text-xs">{fmt(selected.total_duration_ms)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-20 text-xs">Nodes</span>
                  <span className="text-purple-700 font-semibold text-xs">{selected.node_logs.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-20 text-xs">Triggered</span>
                  <span className="text-slate-700 text-xs">{fmtDate(selected.triggered_at)}</span>
                </div>
              </div>

              {/* Input */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Trigger Input</p>
                <p className="text-sm text-slate-700 bg-blue-50 border border-blue-100 rounded-xl p-3 leading-relaxed">
                  {selected.trigger_input || "—"}
                </p>
              </div>

              {/* Node trace */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Node Trace</p>
                <div className="flex flex-col gap-3">
                  {selected.node_logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-xl p-3 text-sm ${
                        NODE_STATUS_COLOR[log.status] ?? "bg-gray-50 border-gray-200 text-gray-800"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-white/70 border border-current flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-sm">{log.node_label}</span>
                        </div>
                        <span className="font-mono text-xs opacity-70">{fmt(log.duration_ms)}</span>
                      </div>
                      <p className="text-xs leading-relaxed opacity-90 line-clamp-5">{log.output}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Final output */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Final Output</p>
                <p className="text-sm text-slate-700 bg-green-50 border border-green-100 rounded-xl p-3 leading-relaxed">
                  {selected.final_output || "—"}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
