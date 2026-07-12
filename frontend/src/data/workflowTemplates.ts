import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

const arrow = {
  animated: true,
  style: { stroke: "#7c3aed", strokeWidth: 2.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed", width: 20, height: 20 },
};

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  tags: string[];
  nodes: Node[];
  edges: Edge[];
}

// Helper to create a node
const n = (id: string, label: string, role: string, description: string): Node => ({
  id,
  type: "roleNode",
  position: { x: 0, y: 0 },
  data: { label, role, description },
});

// Helper to create an edge
const e = (id: string, source: string, target: string, label?: string): Edge => ({
  id,
  source,
  target,
  ...(label ? {
    label,
    labelStyle: { fill: "#e5e7eb", fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "#4c1d95" },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 4,
  } : {}),
  ...arrow,
});

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [

  // ════════════════════════════════════════════════════════
  //  ARCHITECTURE
  // ════════════════════════════════════════════════════════

  {
    id: "multi-model-decision",
    name: "Multi-Model Decision System",
    category: "Architecture",
    icon: "🧠",
    description: "Manager routes tasks to specialist models (Opus, Sonnet, GPT) in parallel; synthesizes results for high-stakes decisions.",
    tags: ["parallel", "router", "architecture", "multi-model"],
    nodes: [
      n("n1", "Task Intake", "input", "Receives task or query"),
      n("n2", "Manager Agent", "router", "Plans and routes to specialist models"),
      n("n3", "Deep Reasoner", "responder", "Opus-class deep reasoning agent"),
      n("n4", "Fast Executor", "responder", "Sonnet-class fast execution agent"),
      n("n5", "Second Opinion", "responder", "GPT-class independent validation"),
      n("n6", "Result Synthesizer", "responder", "Merges all model outputs"),
      n("n7", "Decision Output", "output", "Final decision with reasoning"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3","Deep"),
      e("e3","n2","n4","Fast"),
      e("e4","n2","n5","Verify"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
    ],
  },

  {
    id: "storm-research",
    name: "STORM Multi-Perspective Research",
    category: "Architecture",
    icon: "🌀",
    description: "Stanford STORM: parallel perspective agents generate questions, build outline, then synthesize a full research article.",
    tags: ["parallel", "rag", "research", "architecture"],
    nodes: [
      n("n1", "Research Topic", "input", "Accepts topic or research question"),
      n("n2", "Perspective Router", "router", "Fans out to multiple viewpoint agents"),
      n("n3", "Tech Perspective", "rag", "Technical & engineering angle"),
      n("n4", "Business Perspective", "rag", "Market & business angle"),
      n("n5", "Academic Perspective", "rag", "Research & citations angle"),
      n("n6", "Outline Builder", "responder", "Merges questions into structured outline"),
      n("n7", "Article Synthesizer", "responder", "Writes full article from outline"),
      n("n8", "Final Report", "output", "Formatted research report"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
      e("e9","n7","n8"),
    ],
  },

  {
    id: "six-sigma-quality",
    name: "Six Sigma Quality Workflow",
    category: "Architecture",
    icon: "⚙️",
    description: "Decompose tasks into atomic steps, execute through independent micro-agents, validate with consensus quality gates.",
    tags: ["guard", "parallel", "architecture", "quality"],
    nodes: [
      n("n1", "Task Input", "input", "Complex task to be quality-checked"),
      n("n2", "Task Decomposer", "classifier", "Breaks task into atomic subtasks"),
      n("n3", "Executor A", "responder", "Independent executor agent 1"),
      n("n4", "Executor B", "responder", "Independent executor agent 2"),
      n("n5", "Executor C", "responder", "Independent executor agent 3"),
      n("n6", "Quality Gate", "guard", "Consensus validation across all results"),
      n("n7", "Verified Output", "output", "Quality-validated final result"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  SALES & MARKETING
  // ════════════════════════════════════════════════════════

  {
    id: "blog-writing",
    name: "AI Blog Writing Pipeline",
    category: "Sales & Marketing",
    icon: "✍️",
    description: "Research topic, build outline, draft full blog, then refine based on feedback — all automated.",
    tags: ["rag", "responder", "sequential", "content"],
    nodes: [
      n("n1", "Topic & Brief", "input", "User provides topic and target audience"),
      n("n2", "Research Agent", "rag", "Searches and summarises key sources"),
      n("n3", "Outline Builder", "classifier", "Creates structured heading outline"),
      n("n4", "Draft Writer", "responder", "Writes full blog from outline"),
      n("n5", "Feedback Guard", "guard", "Checks tone, accuracy, SEO keywords"),
      n("n6", "Final Blog", "output", "Polished, publish-ready article"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n3","n4"),
      e("e4","n4","n5"),
      e("e5","n5","n4","Revise"),
      e("e6","n5","n6","Approve"),
    ],
  },

  {
    id: "lead-qualification",
    name: "Sales Lead Qualification",
    category: "Sales & Marketing",
    icon: "📈",
    description: "Parallel enrichment agents (company, intent, ICP) score and route leads to the right rep with CRM sync.",
    tags: ["parallel", "rag", "classifier", "sales"],
    nodes: [
      n("n1", "Lead Capture", "input", "Inbound lead from form or email"),
      n("n2", "Enrichment Router", "router", "Fans out parallel enrichment"),
      n("n3", "Company Enricher", "rag", "Fetches company size, funding, industry"),
      n("n4", "Intent Scorer", "classifier", "Scores lead intent from behaviour"),
      n("n5", "ICP Matcher", "classifier", "Checks fit against ideal customer profile"),
      n("n6", "Lead Scorer", "responder", "Produces final score & segment"),
      n("n7", "CRM + Routing", "output", "Creates CRM record, assigns rep"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
    ],
  },

  {
    id: "daily-news-digest",
    name: "Daily News Digest",
    category: "Sales & Marketing",
    icon: "📰",
    description: "Track companies and topics, generate search queries, research content, and deliver formatted news by category.",
    tags: ["rag", "parallel", "classifier", "news"],
    nodes: [
      n("n1", "Topics Config", "input", "Companies & topics to track"),
      n("n2", "Query Generator", "classifier", "Builds optimised search queries per topic"),
      n("n3", "Tech News Agent", "rag", "Fetches tech sector news"),
      n("n4", "Market News Agent", "rag", "Fetches business & market news"),
      n("n5", "Industry News Agent", "rag", "Fetches domain-specific news"),
      n("n6", "Content Formatter", "responder", "Groups and formats articles by category"),
      n("n7", "Digest Output", "output", "Daily formatted news report"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  CUSTOMER SUPPORT
  // ════════════════════════════════════════════════════════

  {
    id: "customer-support-triage",
    name: "Customer Support Triage",
    category: "Customer Support",
    icon: "💬",
    description: "Classify queries and route to billing, tech, or general agent in parallel; merge into a single reply.",
    tags: ["router", "parallel", "classifier", "support"],
    nodes: [
      n("n1", "Query Intake", "input", "Receives customer query"),
      n("n2", "Query Classifier", "classifier", "Classifies as billing / tech / general"),
      n("n3", "Billing Agent", "responder", "Handles billing and payment issues"),
      n("n4", "Tech Support Agent", "responder", "Handles technical issues"),
      n("n5", "General FAQ Agent", "responder", "Answers general questions"),
      n("n6", "Reply Formatter", "output", "Formats and sends final reply"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3","Billing"),
      e("e3","n2","n4","Tech"),
      e("e4","n2","n5","General"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
    ],
  },

  {
    id: "post-conversation-intelligence",
    name: "Post-Conversation Intelligence",
    category: "Customer Support",
    icon: "🔎",
    description: "Analyse completed support transcripts for resolution, sentiment, agent performance, and next best action.",
    tags: ["parallel", "classifier", "guard", "support"],
    nodes: [
      n("n1", "Transcript Input", "input", "Completed support conversation"),
      n("n2", "Analysis Router", "router", "Fans out to specialised analysts"),
      n("n3", "Resolution Detector", "classifier", "Did the issue get resolved?"),
      n("n4", "Sentiment Analyser", "classifier", "How did the customer feel?"),
      n("n5", "Agent QA Scorer", "guard", "How well did the agent perform?"),
      n("n6", "Insight Merger", "responder", "Combines all analysis signals"),
      n("n7", "Intelligence Report", "output", "Structured action report"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
    ],
  },

  {
    id: "knowledge-health-check",
    name: "Knowledge Base Health Check",
    category: "Customer Support",
    icon: "📚",
    description: "Evaluate KB health by analysing support conversations — find gaps, stale articles, and coverage issues.",
    tags: ["rag", "classifier", "guard", "support"],
    nodes: [
      n("n1", "Conversation Batch", "input", "Batch of support conversation logs"),
      n("n2", "Topic Extractor", "classifier", "Extracts key topics from conversations"),
      n("n3", "KB Retriever", "rag", "Searches existing KB articles"),
      n("n4", "Gap Detector", "guard", "Identifies missing or outdated KB content"),
      n("n5", "Recommendation Agent", "responder", "Suggests new / updated articles"),
      n("n6", "KB Health Report", "output", "Coverage gaps and action list"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n3","n4"),
      e("e5","n4","n5"),
      e("e6","n5","n6"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  BANKING & INSURANCE
  // ════════════════════════════════════════════════════════

  {
    id: "loan-origination",
    name: "AI Loan Origination",
    category: "Banking & Insurance",
    icon: "🏦",
    description: "Automate loan intake, parallel credit & doc verification, then generate a compliance-ready decision.",
    tags: ["parallel", "guard", "classifier", "finance"],
    nodes: [
      n("n1", "Application Intake", "input", "Borrower submits loan application"),
      n("n2", "Application Router", "router", "Fans out to verification agents"),
      n("n3", "Credit Assessor", "classifier", "Scores credit risk from bureau data"),
      n("n4", "Document Verifier", "guard", "Validates ID, income, and address docs"),
      n("n5", "Compliance Checker", "guard", "Checks against lending regulations"),
      n("n6", "Decision Engine", "responder", "Produces approve / review / reject"),
      n("n7", "Offer Letter", "output", "Sends decision and offer terms"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
    ],
  },

  {
    id: "fraud-detection",
    name: "Fraud Detection Pipeline",
    category: "Banking & Insurance",
    icon: "🛡️",
    description: "Parallel velocity, device, and behaviour agents score transaction risk; approve / flag / block in real time.",
    tags: ["guard", "parallel", "classifier", "finance"],
    nodes: [
      n("n1", "Transaction Input", "input", "Incoming payment transaction"),
      n("n2", "Risk Router", "router", "Fans out to parallel risk agents"),
      n("n3", "Velocity Check", "guard", "Checks transaction frequency & amount"),
      n("n4", "Device Fingerprint", "guard", "Verifies device identity signals"),
      n("n5", "Behaviour Analyser", "rag", "Compares to historical patterns"),
      n("n6", "Risk Scorer", "classifier", "Aggregates signals into risk score"),
      n("n7", "Decision", "output", "Approve / Flag / Block transaction"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  IT OPS / SEC OPS / DEV OPS
  // ════════════════════════════════════════════════════════

  {
    id: "parallel-code-review",
    name: "Parallel Code Review",
    category: "IT Ops / Dev Ops",
    icon: "🛠️",
    description: "Security scan, style check, and logic review agents run in parallel; aggregated into PR approve / change decision.",
    tags: ["parallel", "guard", "rag", "devops"],
    nodes: [
      n("n1", "PR Intake", "input", "Incoming pull request diff"),
      n("n2", "Review Router", "router", "Fans out to all review agents"),
      n("n3", "Security Scanner", "guard", "Checks for vulnerabilities & secrets"),
      n("n4", "Style Linter", "classifier", "Enforces code style and naming"),
      n("n5", "Logic Reviewer", "rag", "Reviews logic against docs & patterns"),
      n("n6", "Review Aggregator", "responder", "Merges all review comments"),
      n("n7", "PR Decision", "output", "Approve / Request Changes / Reject"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
    ],
  },

  {
    id: "regulatory-compliance",
    name: "Regulatory Compliance Reviewer",
    category: "IT Ops / Dev Ops",
    icon: "📋",
    description: "Analyse documents against regulatory standards (FDA, GDPR, SOC2), flag gaps, and suggest remediation steps.",
    tags: ["rag", "guard", "classifier", "compliance"],
    nodes: [
      n("n1", "Document Input", "input", "Upload compliance document"),
      n("n2", "Standard Selector", "classifier", "Identifies applicable regulation"),
      n("n3", "Clause Extractor", "rag", "Extracts clauses from document"),
      n("n4", "Compliance Checker", "guard", "Maps clauses to regulation rules"),
      n("n5", "Gap Identifier", "classifier", "Flags non-compliant sections"),
      n("n6", "Remediation Agent", "responder", "Suggests corrective language"),
      n("n7", "Compliance Report", "output", "Gap report with remediation plan"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n3","n4"),
      e("e4","n4","n5"),
      e("e5","n5","n6"),
      e("e6","n6","n7"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  PROCUREMENT
  // ════════════════════════════════════════════════════════

  {
    id: "rfq-rfp-generator",
    name: "RFQ / RFP Document Generator",
    category: "Procurement",
    icon: "📄",
    description: "Gather requirements, research vendors, and auto-generate a professional RFQ or RFP document.",
    tags: ["rag", "responder", "sequential", "procurement"],
    nodes: [
      n("n1", "Requirements Input", "input", "Buyer provides procurement requirements"),
      n("n2", "Requirements Analyser", "classifier", "Extracts scope, budget, timeline"),
      n("n3", "Vendor Researcher", "rag", "Searches for qualified vendors"),
      n("n4", "Template Selector", "classifier", "Picks RFQ or RFP template"),
      n("n5", "Document Drafter", "responder", "Generates full RFQ/RFP document"),
      n("n6", "Compliance Guard", "guard", "Validates against procurement policy"),
      n("n7", "Final Document", "output", "Ready-to-send RFQ/RFP"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n3","n5"),
      e("e5","n4","n5"),
      e("e6","n5","n6"),
      e("e7","n6","n7"),
    ],
  },

  {
    id: "vendor-analysis",
    name: "Vendor Fetching & Analysis",
    category: "Procurement",
    icon: "🔍",
    description: "Fetch vendors from internal DB and external sources in parallel, then analyse for fit, certifications, and price.",
    tags: ["parallel", "rag", "classifier", "procurement"],
    nodes: [
      n("n1", "Category Input", "input", "Procurement category & criteria"),
      n("n2", "Vendor Router", "router", "Fans out to vendor sources"),
      n("n3", "Internal DB Agent", "rag", "Queries approved vendor database"),
      n("n4", "External Search Agent", "rag", "Searches external vendor directories"),
      n("n5", "Cert Validator", "guard", "Verifies required certifications"),
      n("n6", "Ranking Agent", "classifier", "Scores vendors against criteria"),
      n("n7", "Shortlist Report", "output", "Ranked vendor shortlist"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n3","n5"),
      e("e5","n4","n5"),
      e("e6","n5","n6"),
      e("e7","n6","n7"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  HR & LEGAL
  // ════════════════════════════════════════════════════════

  {
    id: "hr-hiring",
    name: "AI HR Hiring Manager",
    category: "HR & Legal",
    icon: "👥",
    description: "Generate JD, define evaluation criteria, and score resumes via parallel agents — standardised, bias-reduced hiring.",
    tags: ["parallel", "classifier", "rag", "hr"],
    nodes: [
      n("n1", "Role Brief", "input", "Hiring manager provides role requirements"),
      n("n2", "JD Generator", "responder", "Writes job description and competencies"),
      n("n3", "Eval Criteria Agent", "classifier", "Defines weighted scoring criteria"),
      n("n4", "Resume Router", "router", "Fans out resumes to scoring agents"),
      n("n5", "Tech Skills Scorer", "classifier", "Scores technical fit"),
      n("n6", "Experience Scorer", "classifier", "Scores experience & seniority"),
      n("n7", "Culture Fit Scorer", "rag", "Scores culture and soft skills"),
      n("n8", "Hiring Decision", "output", "Ranked shortlist with scores"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n3","n4"),
      e("e4","n4","n5"),
      e("e5","n4","n6"),
      e("e6","n4","n7"),
      e("e7","n5","n8"),
      e("e8","n6","n8"),
      e("e9","n7","n8"),
    ],
  },

  {
    id: "hr-onboarding",
    name: "HR Employee Onboarding",
    category: "HR & Legal",
    icon: "🚀",
    description: "IT, payroll, and department guide agents run in parallel for new hire; sends combined welcome package.",
    tags: ["parallel", "router", "responder", "hr"],
    nodes: [
      n("n1", "New Hire Intake", "input", "Employee details and start date"),
      n("n2", "Onboarding Router", "router", "Fans out to all onboarding tracks"),
      n("n3", "IT Setup Agent", "responder", "Provisions laptop, accounts, VPN"),
      n("n4", "Payroll Agent", "responder", "Sets up salary, tax, bank details"),
      n("n5", "Dept Guide Agent", "rag", "Shares team wiki and processes"),
      n("n6", "Welcome Package", "output", "Sends combined welcome email"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  E-COMMERCE & OPERATIONS
  // ════════════════════════════════════════════════════════

  {
    id: "order-fulfilment",
    name: "Order Fulfilment Pipeline",
    category: "E-commerce",
    icon: "📦",
    description: "Payment, inventory, and shipping agents run in parallel after order validation; sends confirmation.",
    tags: ["parallel", "router", "responder", "ecommerce"],
    nodes: [
      n("n1", "Order Intake", "input", "Customer places an order"),
      n("n2", "Order Validator", "guard", "Validates items, address, stock"),
      n("n3", "Fulfilment Router", "router", "Kicks off parallel fulfilment tasks"),
      n("n4", "Payment Agent", "responder", "Charges card and issues receipt"),
      n("n5", "Inventory Agent", "responder", "Reserves stock, updates warehouse"),
      n("n6", "Shipping Agent", "responder", "Books courier, generates label"),
      n("n7", "Confirmation", "output", "Sends order confirmation email/SMS"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n3","n4"),
      e("e4","n3","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n7"),
      e("e7","n5","n7"),
      e("e8","n6","n7"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  GENERAL
  // ════════════════════════════════════════════════════════

  {
    id: "content-moderation",
    name: "Content Moderation",
    category: "General",
    icon: "🔒",
    description: "Toxicity, spam, and policy agents run in parallel before publishing; merged decision approves, flags, or blocks.",
    tags: ["guard", "parallel", "classifier", "safety"],
    nodes: [
      n("n1", "Content Input", "input", "User submitted post or comment"),
      n("n2", "Mod Router", "router", "Sends to all moderation agents"),
      n("n3", "Toxicity Guard", "guard", "Detects hate speech and abuse"),
      n("n4", "Spam Detector", "classifier", "Identifies spam and phishing"),
      n("n5", "Policy Checker", "rag", "Checks against community guidelines"),
      n("n6", "Decision Merger", "classifier", "Combines all moderation signals"),
      n("n7", "Publish / Block", "output", "Approves, flags, or removes content"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n3","n6"),
      e("e6","n4","n6"),
      e("e7","n5","n6"),
      e("e8","n6","n7"),
    ],
  },

  {
    id: "document-intelligence",
    name: "Document Intelligence RAG",
    category: "General",
    icon: "📚",
    description: "Ingest documents, extract entities and intent in parallel, retrieve via vector search, answer with citations.",
    tags: ["rag", "classifier", "parallel", "document"],
    nodes: [
      n("n1", "Document Intake", "input", "Uploaded PDF / DOCX / TXT"),
      n("n2", "Doc Splitter", "classifier", "Splits document into chunks"),
      n("n3", "Entity Extractor", "rag", "Extracts names, dates, amounts"),
      n("n4", "Intent Classifier", "classifier", "Detects question intent"),
      n("n5", "RAG Retriever", "rag", "Retrieves relevant chunks via vector search"),
      n("n6", "Answer Generator", "responder", "Generates grounded answer"),
      n("n7", "Response", "output", "Answer with citations"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n3","n5"),
      e("e5","n4","n5"),
      e("e6","n5","n6"),
      e("e7","n6","n7"),
    ],
  },
];

export const TEMPLATE_CATEGORIES = [
  "All",
  "Architecture",
  "Sales & Marketing",
  "Customer Support",
  "Banking & Insurance",
  "IT Ops / Dev Ops",
  "Procurement",
  "HR & Legal",
  "E-commerce",
  "General",
];
