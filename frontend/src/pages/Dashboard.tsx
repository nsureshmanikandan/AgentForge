import { useEffect, useState } from "react";
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

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    controlPlaneApi.stats().then((r) => setStats(r.data)).catch(() => {});
    agentsApi.list().then((r) => setAgents(r.data)).catch(() => {});
  }, []);

  return (
    <div className="p-8 bg-gray-950 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-2">Control Plane</h1>
      <p className="text-gray-400 text-sm mb-6">Monitor your AI agents in real time</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Agents"
          value={stats?.total_agents ?? "—"}
          color="text-violet-400"
        />
        <StatCard
          label="Total Runs"
          value={stats?.total_runs ?? "—"}
          color="text-blue-400"
        />
        <StatCard
          label="Guardrail Triggers"
          value={stats?.guardrail_triggers ?? "—"}
          color="text-orange-400"
        />
        <StatCard
          label="Avg Latency"
          value={stats ? `${stats.avg_latency_ms}ms` : "—"}
          color="text-green-400"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="font-semibold mb-4 text-white">Deployed Agents</h2>
        {agents.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No agents yet. Go to Builder to create one.
          </p>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3"
              >
                <div>
                  <p className="font-medium text-white">{a.name}</p>
                  <p className="text-gray-400 text-sm">
                    {a.model} · v{a.current_version}
                  </p>
                </div>
                <span className="text-xs bg-violet-900 text-violet-300 px-2 py-1 rounded">
                  {a.tools?.length ?? 0} tools
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
