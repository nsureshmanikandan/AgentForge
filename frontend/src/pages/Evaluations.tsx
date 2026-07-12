import { useEffect, useState } from "react";
import api from "../api/client";

interface EvalRun {
  id: string;
  eval_name: string;
  agent_id: string;
  score: number;
  passed: number;
  total: number;
  status: "completed" | "running" | "failed" | "pending";
  created_at: string;
  results?: Array<{ input: string; expected: string; actual: string; passed: boolean }>;
}

interface Template {
  name: string;
  agent_id: string;
  test_cases: Array<{ input: string; expected: string }>;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function scoreBadge(score: number) {
  if (score >= 80) return "bg-green-100 text-green-700";
  if (score >= 60) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running:   "bg-blue-100 text-blue-700",
  failed:    "bg-red-100 text-red-700",
  pending:   "bg-gray-100 text-gray-600",
};

export default function Evaluations() {
  const [runs, setRuns]         = useState<EvalRun[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailRun, setDetailRun] = useState<EvalRun | null>(null);
  const [toast, setToast]       = useState<string | null>(null);

  const [agentId, setAgentId]         = useState("");
  const [evalName, setEvalName]       = useState("");
  const [testCasesRaw, setTestCasesRaw] = useState(
    '[{"input": "How do I reset my password?", "expected": "Go to the login page and click Forgot Password."}]'
  );
  const [submitting, setSubmitting]   = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/evaluations/runs"),
      api.get("/evaluations/templates"),
    ])
      .then(([runsRes, tmplRes]) => {
        setRuns(runsRes.data);
        setTemplates(tmplRes.data);
      })
      .catch(() => setError("Failed to load evaluations."))
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function applyTemplate(t: Template) {
    setAgentId(t.agent_id);
    setEvalName(t.name);
    setTestCasesRaw(JSON.stringify(t.test_cases, null, 2));
  }

  async function handleRunEval() {
    setFormError(null);
    let testCases: object[];
    try {
      testCases = JSON.parse(testCasesRaw);
      if (!Array.isArray(testCases)) throw new Error();
    } catch {
      setFormError("Test cases must be a valid JSON array.");
      return;
    }
    if (!agentId.trim() || !evalName.trim()) {
      setFormError("Agent ID and Eval Name are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/evaluations/runs", {
        agent_id:   agentId,
        eval_name:  evalName,
        test_cases: testCases,
      });
      const newRun: EvalRun = res.data;
      setRuns((prev) => [newRun, ...prev]);
      setModalOpen(false);
      setAgentId(""); setEvalName("");
      setTestCasesRaw('[{"input": "How do I reset my password?", "expected": "Go to the login page and click Forgot Password."}]');
      showToast(`Evaluation complete: ${newRun.score ?? 0}% score`);
    } catch {
      setFormError("Failed to run evaluation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Evaluations</h1>
          <p className="text-slate-500 mt-1">Run and review automated test suites for your agents</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Evaluation
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Template chips */}
      {templates.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Quick-start templates</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.name}
                onClick={() => { applyTemplate(t); setModalOpen(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 font-medium text-slate-500">Eval Name</th>
              <th className="text-left px-5 py-3 font-medium text-slate-500">Agent ID</th>
              <th className="text-left px-5 py-3 font-medium text-slate-500">Score</th>
              <th className="text-left px-5 py-3 font-medium text-slate-500">Passed</th>
              <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
              <th className="text-left px-5 py-3 font-medium text-slate-500">Created</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-4 bg-gray-100 animate-pulse rounded w-20" />
                    </td>
                  ))}
                </tr>
              ))
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center">
                  <p className="text-slate-400 text-sm">No evaluations yet — run your first test suite</p>
                  <p className="text-slate-300 text-xs mt-1">Use a template above or click "+ New Evaluation"</p>
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900">{run.eval_name}</td>
                  <td className="px-5 py-3 text-slate-500 font-mono text-xs">
                    {run.agent_id.length > 18 ? run.agent_id.slice(0, 18) + "…" : run.agent_id}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${scoreBadge(run.score)}`}>
                      {run.score}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{run.passed}/{run.total}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[run.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{relativeTime(run.created_at)}</td>
                  <td className="px-5 py-3">
                    {run.results && (
                      <button
                        onClick={() => setDetailRun(run)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Details
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New Evaluation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">New Evaluation</h2>
              <button onClick={() => { setModalOpen(false); setFormError(null); }}
                className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Template picker */}
            {templates.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Load a template</label>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => (
                    <button key={t.name} onClick={() => applyTemplate(t)}
                      className="px-2.5 py-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors">
                      {t.name}
                    </button>
                  ))}
                </div>
                <div className="mt-3 border-t border-gray-100" />
              </div>
            )}

            {formError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Agent ID</label>
                <input type="text" value={agentId} onChange={(e) => setAgentId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. loblaw-support-bot" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Eval Name</label>
                <input type="text" value={evalName} onChange={(e) => setEvalName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="My QA Suite" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Test Cases <span className="text-slate-400 font-normal">(JSON array of {"{input, expected}"})</span>
                </label>
                <textarea value={testCasesRaw} onChange={(e) => setTestCasesRaw(e.target.value)}
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setModalOpen(false); setFormError(null); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors border border-gray-200 rounded-lg">
                Cancel
              </button>
              <button onClick={handleRunEval} disabled={submitting}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {submitting ? "Running…" : "Run Evaluation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{detailRun.eval_name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{detailRun.agent_id} · {detailRun.passed}/{detailRun.total} passed · {detailRun.score}%</p>
              </div>
              <button onClick={() => setDetailRun(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {detailRun.results?.map((r, i) => (
                <div key={i} className={`rounded-lg border p-4 ${r.passed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {r.passed ? "PASS" : "FAIL"}
                    </span>
                    <span className="text-xs text-slate-500">Test case {i + 1}</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-1"><span className="font-medium text-slate-700">Input:</span> {r.input}</p>
                  <p className="text-xs text-slate-600 mb-1"><span className="font-medium text-slate-700">Expected:</span> {r.expected}</p>
                  {!r.passed && (
                    <p className="text-xs text-red-600"><span className="font-medium">Actual:</span> {r.actual}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
