import { useEffect, useState } from "react";
import api from "../api/client";

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  tools: string[];
}

interface TestCase {
  input: string;
  expected: string;
  category?: string;
}

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
  test_cases: TestCase[];
}

const CATEGORY_COLORS: Record<string, string> = {
  "happy path": "bg-blue-100 text-blue-700",
  "edge case": "bg-amber-100 text-amber-700",
  "out of scope": "bg-red-100 text-red-700",
  clarification: "bg-purple-100 text-purple-700",
  "core flow": "bg-teal-100 text-teal-700",
  "error handling": "bg-orange-100 text-orange-700",
};

function categoryColor(cat?: string): string {
  if (!cat) return "bg-gray-100 text-gray-600";
  const key = cat.toLowerCase();
  for (const [k, v] of Object.entries(CATEGORY_COLORS)) {
    if (key.includes(k)) return v;
  }
  return "bg-gray-100 text-gray-600";
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

const CATEGORIES = ["happy path", "edge case", "out of scope", "clarification", "error handling"];

const MODELS = [
  { value: "local", label: "Local Model" },
  { value: "azure", label: "Azure GPT-5-mini" },
  { value: "gemini", label: "Gemini Flash-Lite" },
];

export default function Evaluations() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailRun, setDetailRun] = useState<EvalRun | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Modal form state
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini");
  const [evalName, setEvalName] = useState("");
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/evaluations/runs"),
      api.get("/evaluations/templates"),
      api.get("/agents/"),
    ])
      .then(([runsRes, tmplRes, agentsRes]) => {
        setRuns(runsRes.data);
        setTemplates(tmplRes.data);
        setAgents(agentsRes.data);
      })
      .catch(() => setError("Failed to load evaluations."))
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }

  function resetModal() {
    setSelectedAgentId("");
    setSelectedModel("gemini");
    setEvalName("");
    setTestCases([]);
    setFormError(null);
    setEditingIdx(null);
    setGenerating(false);
    setSubmitting(false);
  }

  function reRunEval(run: EvalRun) {
    resetModal();
    setSelectedAgentId(run.agent_id);
    setEvalName(run.eval_name);
    setTestCases(
      (run.results || []).map((r) => ({ input: r.input, expected: r.expected }))
    );
    setModalOpen(true);
  }

  function applyTemplate(t: Template) {
    setSelectedAgentId(t.agent_id);
    setEvalName(t.name);
    setTestCases(t.test_cases);
    setModalOpen(true);
  }

  async function handleGenerate() {
    if (!selectedAgentId) {
      setFormError("Select an agent first.");
      return;
    }
    setFormError(null);
    setGenerating(true);
    try {
      const res = await api.post("/evaluations/generate-test-cases", { agent_id: selectedAgentId, model: selectedModel });
      const { agent_name, test_cases } = res.data;
      setTestCases(test_cases);
      if (!evalName) setEvalName(`${agent_name} — AI-Generated Suite`);
    } catch {
      setFormError("Failed to generate test cases. Check that your AI model is reachable and try again.");
    } finally {
      setGenerating(false);
    }
  }

  function updateTestCase(idx: number, field: keyof TestCase, value: string) {
    setTestCases((prev) => prev.map((tc, i) => (i === idx ? { ...tc, [field]: value } : tc)));
  }

  function removeTestCase(idx: number) {
    setTestCases((prev) => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  }

  function addTestCase() {
    const newIdx = testCases.length;
    setTestCases((prev) => [...prev, { input: "", expected: "", category: "happy path" }]);
    setEditingIdx(newIdx);
  }

  async function handleRunEval() {
    setFormError(null);
    if (!selectedAgentId || !evalName.trim()) {
      setFormError("Select an agent and provide an evaluation name.");
      return;
    }
    if (testCases.length === 0) {
      setFormError("Add at least one test case before running.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/evaluations/runs", {
        agent_id: selectedAgentId,
        eval_name: evalName,
        test_cases: testCases,
        model: selectedModel,
      });
      const newRun: EvalRun = res.data;
      setRuns((prev) => [newRun, ...prev]);
      setModalOpen(false);
      resetModal();
      showToast(`Evaluation complete — ${newRun.score ?? 0}% (${newRun.passed}/${newRun.total} passed)`);
    } catch {
      setFormError("Failed to run evaluation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Evaluations</h1>
          <p className="text-slate-500 mt-1">Run and review automated test suites for your agents</p>
        </div>
        <button
          onClick={() => { resetModal(); setModalOpen(true); }}
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
                onClick={() => applyTemplate(t)}
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

      {/* Runs table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 font-medium text-slate-500">Eval Name</th>
              <th className="text-left px-5 py-3 font-medium text-slate-500">Agent</th>
              <th className="text-left px-5 py-3 font-medium text-slate-500">Score</th>
              <th className="text-left px-5 py-3 font-medium text-slate-500">Passed</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-4 bg-gray-100 animate-pulse rounded w-20" />
                    </td>
                  ))}
                </tr>
              ))
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-14 text-center">
                  <p className="text-slate-400 text-sm">No evaluations yet — run your first test suite</p>
                  <p className="text-slate-300 text-xs mt-1">Use a template above or click "+ New Evaluation"</p>
                </td>
              </tr>
            ) : (
              runs.map((run) => {
                const agentName = agents.find((a) => a.id === run.agent_id)?.name;
                return (
                  <tr key={run.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900 text-sm">{run.eval_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{relativeTime(run.created_at)}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {agentName
                        ? <span className="font-medium text-slate-700">{agentName}</span>
                        : <span className="font-mono">{run.agent_id.length > 18 ? run.agent_id.slice(0, 18) + "…" : run.agent_id}</span>
                      }
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${scoreBadge(run.score)}`}>
                        {run.score}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 text-sm">{run.passed}/{run.total}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {run.results && (
                          <button
                            onClick={() => setDetailRun(run)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
                          >
                            Details
                          </button>
                        )}
                        {run.results && run.results.length > 0 && (
                          <button
                            onClick={() => reRunEval(run)}
                            className="text-xs text-slate-500 hover:text-slate-800 font-medium whitespace-nowrap inline-flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Re-run
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── New Evaluation Modal ──────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">New Evaluation</h2>
              <button onClick={() => { setModalOpen(false); resetModal(); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            {/* Agent picker + model + eval name */}
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Agent</label>
                {agents.length > 0 ? (
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">— choose an agent —</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.description ? ` — ${a.description.slice(0, 45)}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-slate-400 italic py-2">
                    No agents found — create one first in the Agent Studio.
                  </p>
                )}
                {selectedAgent && selectedAgent.tools.length > 0 && (
                  <p className="mt-1.5 text-xs text-slate-400">
                    Tools: <span className="font-medium text-slate-600">{selectedAgent.tools.join(", ")}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">AI Model for Evaluation</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">Used for test-case generation and LLM-as-judge scoring</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Evaluation Name</label>
                <input
                  type="text"
                  value={evalName}
                  onChange={(e) => setEvalName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Password Reset — Happy Path Suite"
                />
              </div>
            </div>

            {/* Test cases section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Test Cases
                  {testCases.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {testCases.length} case{testCases.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </span>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !selectedAgentId}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Generate with AI
                    </>
                  )}
                </button>
              </div>

              {/* Empty state */}
              {testCases.length === 0 && !generating && (
                <div className="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center mb-2">
                  <p className="text-sm text-slate-400">No test cases yet</p>
                  <p className="text-xs text-slate-300 mt-1">
                    Click "Generate with AI" to auto-create cases, or add them manually below
                  </p>
                </div>
              )}

              {/* Generating placeholder */}
              {generating && (
                <div className="rounded-lg border border-violet-100 bg-violet-50 py-6 text-center mb-2">
                  <div className="flex items-center justify-center gap-2 text-violet-600 text-sm">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Analysing agent and generating test cases…
                  </div>
                </div>
              )}

              {/* Test case cards */}
              <div className="space-y-2">
                {testCases.map((tc, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(tc.category)}`}>
                          {tc.category || "test case"}
                        </span>
                        <span className="text-xs text-slate-400">#{idx + 1}</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                          className="p-1 text-slate-400 hover:text-indigo-600 transition-colors rounded"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeTestCase(idx)}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded"
                          title="Remove"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {editingIdx === idx ? (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-0.5">Input</label>
                          <textarea
                            value={tc.input}
                            onChange={(e) => updateTestCase(idx, "input", e.target.value)}
                            rows={2}
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-0.5">Expected response</label>
                          <textarea
                            value={tc.expected}
                            onChange={(e) => updateTestCase(idx, "expected", e.target.value)}
                            rows={2}
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white resize-none"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-0.5">Category</label>
                            <select
                              value={tc.category || "happy path"}
                              onChange={(e) => updateTestCase(idx, "category", e.target.value)}
                              className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                            >
                              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                          <button
                            onClick={() => setEditingIdx(null)}
                            className="mt-4 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-700 leading-relaxed">
                          <span className="font-medium text-slate-500">Input: </span>
                          {tc.input || <span className="italic text-slate-300">empty</span>}
                        </p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          <span className="font-medium text-slate-400">Expected: </span>
                          {tc.expected || <span className="italic text-slate-300">empty</span>}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addTestCase}
                className="mt-2 w-full py-2 text-xs text-slate-500 hover:text-slate-700 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-colors"
              >
                + Add test case manually
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs text-slate-400">
                {submitting ? "Running agent & judging responses…" : `${testCases.length} test case${testCases.length !== 1 ? "s" : ""} ready`}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setModalOpen(false); resetModal(); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRunEval}
                  disabled={submitting || testCases.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Running…
                    </>
                  ) : (
                    "Run Evaluation"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────────────────────────── */}
      {detailRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{detailRun.eval_name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {agents.find((a) => a.id === detailRun.agent_id)?.name || detailRun.agent_id}
                  {" · "}
                  {detailRun.passed}/{detailRun.total} passed · {detailRun.score}%
                </p>
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
                  <p className="text-xs text-slate-600 mb-1">
                    <span className="font-medium text-slate-700">Input: </span>{r.input}
                  </p>
                  <p className="text-xs text-slate-600 mb-1">
                    <span className="font-medium text-slate-700">Expected: </span>{r.expected}
                  </p>
                  <p className="text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Actual: </span>
                    <span className={r.passed ? "text-slate-600" : "text-red-700"}>{r.actual}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
