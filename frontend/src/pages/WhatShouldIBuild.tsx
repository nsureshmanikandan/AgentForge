import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = "http://localhost:8000/api";

interface Suggestion {
  title: string;
  type: string;
  description: string;
  prompt: string;
  tools: string[];
  complexity: "Starter" | "Intermediate" | "Advanced";
  why: string;
}

const COMPLEXITY_COLOR: Record<string, string> = {
  Starter: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Intermediate: "bg-amber-50 text-amber-700 border-amber-200",
  Advanced: "bg-rose-50 text-rose-700 border-rose-200",
};

const TYPE_ICON: Record<string, string> = {
  "Customer Support": "💬",
  Research: "🔬",
  Automation: "⚙️",
  "Data Analysis": "📊",
  Content: "✍️",
  HR: "👥",
  Finance: "💰",
  Engineering: "🛠️",
  Sales: "📈",
  Operations: "🔄",
};

const EXAMPLES = [
  "I need to answer customer questions about our product 24/7",
  "Automate weekly sales reports from our CRM data",
  "Help new employees complete onboarding in their first week",
  "Summarize long research papers and extract key findings",
  "Review code PRs and enforce our coding standards",
  "Qualify inbound leads and book demos automatically",
];

function SuggestionCard({
  s,
  idx,
  onUse,
}: {
  s: Suggestion;
  idx: number;
  onUse: (prompt: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col">
      <div className="p-5 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl flex-shrink-0">
              {TYPE_ICON[s.type] ?? "🤖"}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-900 text-sm leading-tight">{s.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${COMPLEXITY_COLOR[s.complexity]}`}>
                  {s.complexity}
                </span>
              </div>
              <span className="text-xs text-indigo-600 font-medium">{s.type}</span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {idx + 1}
          </div>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-3">{s.description}</p>

        {/* Why this fits */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs text-indigo-700">
            <span className="font-semibold">Why this fits: </span>{s.why}
          </p>
        </div>

        {/* Prompt preview toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1 mb-2 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? "Hide" : "Show"} prompt template
        </button>

        {expanded && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
            <p className="text-xs text-slate-700 leading-relaxed font-mono">{s.prompt}</p>
          </div>
        )}

        {/* Tool tags */}
        <div className="flex flex-wrap gap-1.5">
          {s.tools.map((t) => (
            <span key={t} className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        <button
          onClick={() => onUse(s.prompt)}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Build this agent
        </button>
      </div>
    </div>
  );
}

export default function WhatShouldIBuild() {
  const [problem, setProblem] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit() {
    const q = problem.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setSuggestions([]);
    setHasSearched(true);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("agentforge_token");
      const res = await axios.post(
        `${API_BASE}/agents/suggest`,
        { problem: q },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuggestions(res.data.suggestions || []);
    } catch {
      setError("Failed to get suggestions. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function usePrompt(prompt: string) {
    sessionStorage.setItem("architectPrompt", prompt);
    navigate("/architect");
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">What Should I Build?</h1>
            <p className="text-gray-500 text-sm">Describe your problem — AI suggests the right agents for you</p>
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-8">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          What problem are you trying to solve?
        </label>
        <textarea
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          rows={3}
          placeholder="e.g. I need to automatically answer customer questions about our products, escalate complex issues to human agents, and track response quality over time..."
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-400">Ctrl+Enter to submit</p>
          <button
            onClick={handleSubmit}
            disabled={!problem.trim() || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Thinking...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Suggest Agents
              </>
            )}
          </button>
        </div>

        {/* Example pills */}
        {!hasSearched && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">Try an example:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setProblem(ex)}
                  className="text-xs bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 px-3 py-1.5 rounded-full transition-colors border border-transparent hover:border-indigo-200"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gray-200" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-5/6" />
                <div className="h-3 bg-gray-100 rounded w-4/6" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {!loading && suggestions.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <h2 className="text-base font-semibold text-slate-900">
              {suggestions.length} agent idea{suggestions.length !== 1 ? "s" : ""} for your problem
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {suggestions.map((s, idx) => (
              <SuggestionCard key={idx} s={s} idx={idx} onUse={usePrompt} />
            ))}
          </div>
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500 mb-3">Not what you're looking for?</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleSubmit}
                className="text-sm text-indigo-600 hover:text-indigo-800 underline transition-colors"
              >
                Generate different suggestions
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => navigate("/prompts")}
                className="text-sm text-indigo-600 hover:text-indigo-800 underline transition-colors"
              >
                Browse Prompt Library
              </button>
            </div>
          </div>
        </>
      )}

      {/* Empty state after search */}
      {!loading && hasSearched && suggestions.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">No suggestions generated. Try rephrasing your problem.</p>
        </div>
      )}
    </div>
  );
}
