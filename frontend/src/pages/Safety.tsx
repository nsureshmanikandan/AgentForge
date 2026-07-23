import { useEffect, useState } from "react";
import api from "../api/client";

interface SafetyStats {
  total_requests: number;
  blocked_requests: number;
  pii_redactions: number;
  hallucination_flags: number;
}

interface SafetyRule {
  id: string;
  name: string;
  description: string;
  category: "pii" | "hallucination" | "toxicity" | "content";
  severity: "critical" | "high" | "medium" | "low";
  enabled: boolean;
}

const categoryColors: Record<string, string> = {
  pii: "bg-purple-100 text-purple-700",
  hallucination: "bg-orange-100 text-orange-700",
  toxicity: "bg-red-100 text-red-700",
  content: "bg-blue-100 text-blue-700",
};

const severityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

export default function Safety() {
  const [stats, setStats] = useState<SafetyStats>({
    total_requests: 0,
    blocked_requests: 0,
    pii_redactions: 0,
    hallucination_flags: 0,
  });
  const [rules, setRules] = useState<SafetyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/safety/stats"),
      api.get("/safety/rules"),
    ])
      .then(([statsRes, rulesRes]) => {
        setStats(statsRes.data);
        setRules(rulesRes.data);
      })
      .catch(() => setError("Failed to load safety data. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  async function toggleRule(id: string, enabled: boolean) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled } : r))
    );
    try {
      await api.patch(`/safety/rules/${id}`, { enabled });
    } catch {
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r))
      );
    }
  }

  const statCards = [
    { label: "Total Requests", value: stats.total_requests, color: "border-indigo-400" },
    { label: "Blocked Requests", value: stats.blocked_requests, color: "border-red-400" },
    { label: "PII Redactions", value: stats.pii_redactions, color: "border-purple-400" },
    { label: "Hallucination Flags", value: stats.hallucination_flags, color: "border-orange-400" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Safety & Guardrails</h1>
        <p className="text-slate-500 mt-1">Configure protection rules for your agents</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`bg-white border border-gray-200 rounded-xl shadow-sm p-4 border-l-4 ${card.color}`}
          >
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
              {card.label}
            </p>
            {loading ? (
              <div className="mt-2 h-7 w-16 bg-gray-200 animate-pulse rounded" />
            ) : (
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {card.value.toLocaleString()}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Not-yet-enforced notice */}
      <div className="flex gap-3 bg-amber-50 border border-amber-100 rounded-xl px-5 py-4 mb-6">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-800">Not yet enforced</p>
          <p className="text-xs text-amber-700 mt-0.5">
            These toggles are saved but not yet consulted by live agent runs — per-agent guardrails (configured in Agent Studio) are what's actually enforced today.
          </p>
        </div>
      </div>

      {/* Rules List */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-slate-900">Safety Rules</h2>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-4">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-gray-200 animate-pulse rounded" />
                  <div className="h-3 w-64 bg-gray-100 animate-pulse rounded" />
                  <div className="flex gap-2">
                    <div className="h-5 w-16 bg-gray-100 animate-pulse rounded-full" />
                    <div className="h-5 w-12 bg-gray-100 animate-pulse rounded-full" />
                  </div>
                </div>
                <div className="h-6 w-11 bg-gray-200 animate-pulse rounded-full ml-4" />
              </div>
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400">No safety rules configured.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex-1 min-w-0 mr-4">
                  <p className="font-medium text-slate-900">{rule.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{rule.description}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[rule.category] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {rule.category.toUpperCase()}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${severityColors[rule.severity] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {rule.severity.charAt(0).toUpperCase() + rule.severity.slice(1)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleRule(rule.id, !rule.enabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${rule.enabled ? "bg-indigo-600" : "bg-gray-200"}`}
                  aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.enabled ? "translate-x-6" : "translate-x-1"}`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
