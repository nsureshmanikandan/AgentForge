import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { controlPlaneApi, agentsApi } from "../api/client";

interface Stats {
  total_agents: number;
  total_runs: number;
  guardrail_triggers: number;
  avg_latency_ms: number;
}

interface Agent {
  id: string;
  name: string;
  model: string;
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
];

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
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

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
      Idle
    </span>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    controlPlaneApi.stats().then((r) => setStats(r.data)).catch(() => {});
    agentsApi.list().then((r) => setAgents(r.data)).catch(() => {});
  }, []);

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Control Plane</h1>
        <p className="text-gray-500 text-sm mt-1">Monitor your AI agents and platform health in real time</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard
          label="Total Agents"
          value={stats?.total_agents ?? "—"}
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
          value={stats?.total_runs ?? "—"}
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
          value={stats?.guardrail_triggers ?? "—"}
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
          value={stats ? `${stats.avg_latency_ms}ms` : "—"}
          borderColor="border-l-emerald-500"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Deployed Agents Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Deployed Agents</h2>
            <p className="text-xs text-gray-400 mt-0.5">{agents.length} agent{agents.length !== 1 ? "s" : ""} registered</p>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400 text-sm">No agents deployed yet. Go to Agent Studio to create one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Model</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Version</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tools</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a, idx) => (
                  <tr key={a.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${idx === agents.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 ${getAvatarColor(a.name)}`}>
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{a.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{a.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {a.model}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">v{a.current_version}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {a.tools?.length ?? 0} tools
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge active={true} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate("/studio")}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                        >
                          View
                        </button>
                        <span className="text-gray-200">|</span>
                        <button
                          onClick={() => navigate(`/studio/create?id=${a.id}`)}
                          className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
                        >
                          Configure
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
