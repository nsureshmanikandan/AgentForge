import { useState } from "react";
import { useNavigate } from "react-router-dom";

const PROMPTS = [
  { category: "Customer Success", title: "Customer Support Agent", description: "Handle FAQs, escalations, and ticket routing with RAG over your knowledge base", prompt: "Build a customer support agent that answers FAQs from a knowledge base and escalates complex queries to humans" },
  { category: "Sales", title: "Lead Qualification Agent", description: "Score and qualify inbound leads using CRM data and custom criteria", prompt: "Create a lead qualification agent that scores prospects based on ICP criteria and updates the CRM automatically" },
  { category: "Engineering", title: "Code Review Agent", description: "Review PRs, suggest improvements and enforce coding standards via GitHub", prompt: "Build a code review agent connected to GitHub that reviews pull requests and suggests improvements" },
  { category: "HR", title: "Onboarding Assistant", description: "Guide new hires through paperwork, policies and first-week tasks", prompt: "Create an HR onboarding agent that guides new employees through company policies and first-week tasks" },
  { category: "Finance", title: "Expense Analyzer", description: "Analyze expense reports, detect anomalies and enforce policy compliance", prompt: "Build an expense analysis agent that reviews submissions for policy violations and flags anomalies" },
  { category: "Marketing", title: "Content Writer Agent", description: "Generate blog posts, social copy and email campaigns from briefs", prompt: "Create a content writing agent that generates SEO-optimized blog posts and social media content from a brief" },
  { category: "Research", title: "Knowledge Base Agent", description: "Search and synthesize information from uploaded documents using RAG", prompt: "Build a research agent with RAG that answers questions from uploaded PDFs and documents" },
  { category: "Operations", title: "Meeting Summarizer", description: "Transcribe, summarize and extract action items from meeting recordings", prompt: "Create a meeting assistant agent that summarizes transcripts and extracts action items with owners and deadlines" },
];

const CATEGORIES = ["All", ...Array.from(new Set(PROMPTS.map((p) => p.category)))];

export default function PromptLibrary() {
  const [selected, setSelected] = useState("All");
  const navigate = useNavigate();

  const filtered = selected === "All" ? PROMPTS : PROMPTS.filter((p) => p.category === selected);

  const usePrompt = (prompt: string) => {
    sessionStorage.setItem("homePrompt", prompt);
    navigate("/");
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Prompt Library</h1>
      <p className="text-gray-500 text-sm mb-6">Ready-made agent blueprints — click to use</p>

      {/* Category Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setSelected(c)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
              selected === c
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Prompt Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <div key={p.title} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-100 mb-3 inline-block">
              {p.category}
            </span>
            <h3 className="font-semibold text-gray-900 mb-1">{p.title}</h3>
            <p className="text-sm text-gray-500 mb-4">{p.description}</p>
            <button
              onClick={() => usePrompt(p.prompt)}
              className="w-full py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
            >
              Use this prompt →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
