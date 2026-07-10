import { useEffect, useState } from "react";
import { agentsApi } from "../api/client";

interface Agent {
  id: string;
  name: string;
  model: string;
  description: string;
  current_version: number;
}

export default function MyProjects() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    agentsApi.list().then((r) => setAgents(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Projects</h1>
      <p className="text-gray-500 text-sm mb-6">All your AI agent projects in one place</p>

      {loading ? (
        <div className="text-gray-400 text-center mt-20">Loading...</div>
      ) : agents.length === 0 ? (
        <div className="text-center mt-20">
          <div className="text-5xl mb-4">📁</div>
          <p className="text-gray-500 mb-2">No projects yet</p>
          <p className="text-gray-400 text-sm">Go to Home and describe an agent to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center text-teal-700 font-bold text-lg mb-3">
                {a.name[0]?.toUpperCase()}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{a.name}</h3>
              <p className="text-sm text-gray-500 line-clamp-2 mb-3">{a.description || "No description"}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a.model}</span>
                <span className="text-xs text-gray-400">v{a.current_version}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
