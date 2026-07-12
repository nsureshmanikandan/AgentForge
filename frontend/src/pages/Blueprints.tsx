import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Blueprint {
  category: string;
  complexity: "Starter" | "Intermediate" | "Advanced";
  title: string;
  description: string;
  agents: string[];
  steps: string[];
  tools: string[];
  prompt: string;
}

const BLUEPRINTS: Blueprint[] = [
  {
    title: "STORM-Style Research Engine",
    category: "Research",
    complexity: "Advanced",
    description: "Multi-perspective research that explores any topic through 5 AI analyst lenses, synthesizes findings, and produces a comprehensive cited report.",
    agents: ["Research Coordinator", "Web Search Agent", "Synthesis Agent", "Citation Validator", "Report Writer"],
    steps: ["Define research scope", "Parallel web searches across 5 perspectives", "Synthesize findings", "Validate citations", "Generate final report"],
    tools: ["Web Search", "RAG", "PDF Parser"],
    prompt: "Build a multi-agent research engine that explores any topic from 5 AI analyst perspectives in parallel, synthesizes the findings, validates citations, and produces a comprehensive research report.",
  },
  {
    title: "AI Blog Writing Pipeline",
    category: "Content",
    complexity: "Intermediate",
    description: "Research-backed blog pipeline: keyword research, outline generation, first draft, SEO optimization, and publish-ready final post.",
    agents: ["Keyword Researcher", "Outline Planner", "Content Writer", "SEO Optimizer"],
    steps: ["Keyword and topic research", "Generate structured outline", "Write full draft", "SEO optimize title and meta", "Final review and formatting"],
    tools: ["Web Search", "Webhook"],
    prompt: "Build a multi-agent blog writing pipeline that does keyword research, generates a structured outline, writes a full draft, optimizes for SEO, and produces a publish-ready blog post.",
  },
  {
    title: "Content Strategy & Editorial",
    category: "Content",
    complexity: "Advanced",
    description: "End-to-end content engine: strategy planning, content calendar generation, multi-format content creation, and performance tracking.",
    agents: ["Strategy Planner", "Calendar Builder", "Content Writer", "Social Adapter", "Analytics Tracker"],
    steps: ["Audit existing content", "Define content pillars", "Generate 30-day calendar", "Create multi-format content", "Track and report performance"],
    tools: ["Web Search", "Email", "Webhook"],
    prompt: "Build a content strategy multi-agent system that audits existing content, defines content pillars, generates a 30-day editorial calendar, creates multi-format content, and tracks performance.",
  },
  {
    title: "Autonomous Sales Outreach",
    category: "Sales",
    complexity: "Advanced",
    description: "Find leads, enrich profiles, personalize outreach emails, send sequences, and log all activity back to your CRM automatically.",
    agents: ["Lead Finder", "Data Enricher", "Email Personalizer", "Sequence Manager", "CRM Logger"],
    steps: ["Identify target accounts", "Enrich contact data", "Personalize email copy", "Send timed sequence", "Log responses to CRM"],
    tools: ["Web Search", "Email", "CRM", "Webhook"],
    prompt: "Build an autonomous sales outreach pipeline that finds leads, enriches their profiles, writes personalized emails, manages a send sequence, and logs all activity to the CRM.",
  },
  {
    title: "Employee Onboarding Pipeline",
    category: "HR",
    complexity: "Intermediate",
    description: "Automated onboarding: send welcome emails, provision accounts, schedule introductory meetings, deliver policy docs, and track completion.",
    agents: ["Onboarding Coordinator", "Account Provisioner", "Meeting Scheduler", "Document Sender"],
    steps: ["Trigger on new hire record", "Send welcome package", "Provision system access", "Schedule intro meetings", "Deliver and track policy acknowledgment"],
    tools: ["Email", "Calendar", "Knowledge Base", "Slack"],
    prompt: "Build an automated employee onboarding pipeline that sends welcome emails, provisions system access, schedules introductory meetings, delivers policy documents, and tracks completion.",
  },
  {
    title: "Customer Support Triage Pipeline",
    category: "Support",
    complexity: "Intermediate",
    description: "Classify incoming support tickets by urgency and type, auto-resolve common issues with RAG, escalate complex cases, and measure resolution quality.",
    agents: ["Ticket Classifier", "RAG Resolver", "Escalation Router", "Quality Evaluator"],
    steps: ["Receive and classify ticket", "Attempt RAG auto-resolution", "Route unresolved to human", "Send acknowledgment", "Evaluate and log resolution quality"],
    tools: ["RAG", "Knowledge Base", "Email", "Slack"],
    prompt: "Build a customer support triage pipeline that classifies tickets by urgency, auto-resolves common issues using a knowledge base, routes complex cases to the right human team, and evaluates resolution quality.",
  },
  {
    title: "Weekly Finance Report Generator",
    category: "Finance",
    complexity: "Intermediate",
    description: "Pull financial data, calculate KPIs, generate executive narrative, flag anomalies, and email the formatted report to stakeholders every Monday.",
    agents: ["Data Collector", "KPI Calculator", "Anomaly Detector", "Report Narrator", "Email Distributor"],
    steps: ["Pull data from sources", "Calculate weekly KPIs", "Detect anomalies", "Generate executive narrative", "Email formatted report"],
    tools: ["Webhook", "Email", "Slack"],
    prompt: "Build a weekly finance reporting pipeline that pulls financial data, calculates KPIs, detects anomalies, generates an executive narrative summary, and emails the formatted report to stakeholders every Monday.",
  },
  {
    title: "Code Review & PR Pipeline",
    category: "Engineering",
    complexity: "Advanced",
    description: "Review PRs for security vulnerabilities, style guide violations, and performance issues; post inline comments; and block merges on critical findings.",
    agents: ["Security Scanner", "Style Checker", "Performance Analyzer", "Comment Writer", "Merge Gatekeeper"],
    steps: ["Trigger on PR open", "Scan for security issues", "Check style guide", "Analyze performance", "Post inline review comments", "Set merge status"],
    tools: ["GitHub", "Slack", "Webhook"],
    prompt: "Build a multi-agent code review pipeline that scans PRs for security vulnerabilities, style guide violations, and performance issues, posts inline review comments, and sets merge status based on findings.",
  },
  {
    title: "Market Intelligence Monitor",
    category: "Research",
    complexity: "Advanced",
    description: "Monitor competitor news, pricing changes, job postings, and product updates daily, then deliver a curated intelligence briefing to your team.",
    agents: ["Web Monitor", "News Aggregator", "Change Detector", "Briefing Writer", "Distributor"],
    steps: ["Monitor competitor sources", "Aggregate news and signals", "Detect meaningful changes", "Write intelligence briefing", "Distribute to team"],
    tools: ["Web Search", "Email", "Slack"],
    prompt: "Build a market intelligence pipeline that monitors competitor websites, news, pricing, and job postings daily, detects meaningful changes, and delivers a curated intelligence briefing to your team.",
  },
  {
    title: "Invoice Processing Workflow",
    category: "Finance",
    complexity: "Intermediate",
    description: "Extract invoice data from PDFs, validate against PO records, route for approval, post to accounting system, and notify vendors on payment.",
    agents: ["Invoice Extractor", "PO Validator", "Approval Router", "Accounting Poster", "Vendor Notifier"],
    steps: ["Extract data from invoice PDF", "Match against purchase orders", "Route for manager approval", "Post to accounting system", "Notify vendor of payment status"],
    tools: ["PDF Parser", "Email", "Webhook"],
    prompt: "Build an invoice processing pipeline that extracts data from PDF invoices, validates against purchase orders, routes for approval, posts to the accounting system, and notifies vendors of payment status.",
  },
  {
    title: "Recruitment Pipeline",
    category: "HR",
    complexity: "Advanced",
    description: "Screen resumes, score candidates against job criteria, schedule interviews, collect feedback, and generate a hiring recommendation report.",
    agents: ["Resume Screener", "Candidate Scorer", "Interview Scheduler", "Feedback Collector", "Report Generator"],
    steps: ["Parse and screen resumes", "Score against job criteria", "Schedule interviews", "Collect interviewer feedback", "Generate hiring recommendation"],
    tools: ["Email", "Calendar", "PDF Parser", "Slack"],
    prompt: "Build a recruitment pipeline that screens and scores resumes against job criteria, schedules interviews, collects structured feedback from interviewers, and generates a hiring recommendation report.",
  },
  {
    title: "Bug Triage & Resolution Pipeline",
    category: "Engineering",
    complexity: "Intermediate",
    description: "Read new GitHub issues, classify severity, assign to the right team, suggest root causes, and track resolution time automatically.",
    agents: ["Issue Classifier", "Severity Scorer", "Assignment Router", "Root Cause Analyzer", "Resolution Tracker"],
    steps: ["Monitor GitHub for new issues", "Classify type and severity", "Assign to correct team", "Suggest root causes", "Track and report resolution time"],
    tools: ["GitHub", "Slack", "Webhook"],
    prompt: "Build a bug triage pipeline that monitors GitHub for new issues, classifies severity, assigns to the right team, suggests root causes from the codebase, and tracks resolution time.",
  },
];

const COMPLEXITY_COLOR: Record<string, string> = {
  Starter: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Intermediate: "bg-amber-50 text-amber-700 border-amber-200",
  Advanced: "bg-rose-50 text-rose-700 border-rose-200",
};

const CATEGORIES = ["All", "Research", "Content", "Sales", "HR", "Support", "Finance", "Engineering"];

function PreviewModal({ blueprint, onClose, onUse }: { blueprint: Blueprint; onClose: () => void; onUse: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-100">{blueprint.category}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${COMPLEXITY_COLOR[blueprint.complexity]}`}>
                {blueprint.complexity}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mt-2">{blueprint.title}</h2>
            <p className="text-sm text-gray-500 mt-1">{blueprint.description}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors ml-4 mt-1 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Agent Breakdown */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Agent Breakdown</p>
            <div className="space-y-1.5">
              {blueprint.agents.map((agent, i) => (
                <div key={agent} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-700">{agent}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow Steps */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Workflow Steps</p>
            <ol className="space-y-1.5">
              {blueprint.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="text-gray-400 font-medium flex-shrink-0">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Tools Used */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tools Used</p>
            <div className="flex flex-wrap gap-2">
              {blueprint.tools.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-0.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                  </svg>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onUse}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Use Blueprint →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Blueprints() {
  const [selected, setSelected] = useState("All");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Blueprint | null>(null);
  const navigate = useNavigate();

  const filtered = BLUEPRINTS.filter((b) => {
    const matchCat = selected === "All" || b.category === selected;
    const q = search.toLowerCase();
    const matchSearch = !q || b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q) || b.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const useBlueprint = (prompt: string) => {
    sessionStorage.setItem("architectPrompt", prompt);
    navigate("/architect");
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Blueprints</h1>
          <p className="text-gray-500 text-sm">Discover orchestration templates — multi-agent workflows ready to deploy</p>
        </div>
        <div className="relative w-64 flex-shrink-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search blueprints..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Category Filter with counts */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map((c) => {
          const count = c === "All" ? BLUEPRINTS.length : BLUEPRINTS.filter((b) => b.category === c).length;
          return (
            <button
              key={c}
              onClick={() => setSelected(c)}
              className={`px-4 py-1.5 rounded-full text-sm border transition-colors flex items-center gap-1.5 ${
                selected === c
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"
              }`}
            >
              {c}
              <span className={`text-xs ${selected === c ? "text-teal-200" : "text-gray-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Results summary */}
      {search && (
        <p className="text-sm text-gray-500 mb-4">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""} for "<span className="font-medium text-slate-700">{search}</span>"
        </p>
      )}

      {/* Blueprint Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">No blueprints match your search.</p>
          <button onClick={() => { setSearch(""); setSelected("All"); }} className="mt-3 text-sm text-indigo-600 hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <div key={`${b.category}-${b.title}`} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col">
              {/* Badges */}
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-100">
                  {b.category}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${COMPLEXITY_COLOR[b.complexity]}`}>
                  {b.complexity}
                </span>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">{b.title}</h3>
              <p className="text-sm text-gray-500 mb-3 flex-1 line-clamp-2">{b.description}</p>

              {/* Agent & Steps count chips */}
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-0.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {b.agents.length} agents
                </span>
                <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 rounded-full px-2.5 py-0.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {b.steps.length} steps
                </span>
              </div>

              {/* Tool tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {b.tools.map((t) => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setPreview(b)}
                  className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Preview
                </button>
                <button
                  onClick={() => useBlueprint(b.prompt)}
                  className="flex-1 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Use Blueprint →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <PreviewModal
          blueprint={preview}
          onClose={() => setPreview(null)}
          onUse={() => { setPreview(null); useBlueprint(preview.prompt); }}
        />
      )}
    </div>
  );
}
