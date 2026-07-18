import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

const arrow = {
  animated: true,
  style: { stroke: "#3b82f6", strokeWidth: 2.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6", width: 20, height: 20 },
};

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  tags: string[];
  sampleInput: string;
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
    sampleInput: "Should we migrate our monolithic e-commerce platform to microservices? Current stack: Node.js monolith, 2M users, 99.9% uptime SLA, 12-engineer team. Evaluate risks, costs, and timeline.",
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
    sampleInput: "Research topic: The impact of large language models on software engineering productivity. Cover technical capabilities, business adoption, limitations, and future outlook.",
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
    sampleInput: "Task: Write a comprehensive API documentation for a REST API with 15 endpoints covering authentication, user management, orders, and payments. Must include examples, error codes, and rate limits.",
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
    sampleInput: "Topic: How generative AI is transforming B2B sales in 2025. Target audience: Sales directors and RevOps leaders at mid-market SaaS companies. Tone: authoritative but practical. Length: 1500 words.",
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
    sampleInput: "Lead: Priya Sharma, Head of Engineering at FinTechCo (500 employees, Series B, $12M ARR). Visited pricing page 3 times this week, downloaded the enterprise whitepaper, opened 4 emails. Company uses AWS, Datadog, Jira.",
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
    sampleInput: "Track: OpenAI, Anthropic, Google DeepMind, Microsoft AI, Nvidia. Topics: LLM releases, enterprise AI adoption, AI regulation, funding rounds. Audience: AI product team. Date: today.",
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
    sampleInput: "Customer: James Okafor, Enterprise plan. Issue: I was charged twice for my October invoice — $499 appeared on my card on Oct 1 and again on Oct 3. My dashboard also shows an error when I try to export reports to CSV. Please help urgently.",
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
    sampleInput: "Transcript: Customer called about failed payment. Agent checked account, found expired card on file. Customer updated card but agent forgot to retry the charge. Call ended without resolution. Customer tone: frustrated throughout, slightly calmer at end. Duration: 8 min.",
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
    sampleInput: "Conversation batch: 50 tickets from last 30 days. Top recurring topics: SSO configuration errors (12 tickets), API rate limit questions (9 tickets), billing portal access issues (8 tickets), mobile app crash on iOS 17 (7 tickets). Existing KB has 142 articles last updated 8 months ago.",
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
    sampleInput: "Applicant: John Martinez, 34. Loan amount: $320,000 mortgage (30-year fixed). Annual income: $95,000. Credit score: 718. Employment: 6 years at Accenture, senior consultant. Existing debts: $1,200/month. Down payment: $64,000 (20%). Property: 3BR/2BA in Austin TX, appraised at $380,000.",
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
    sampleInput: "Transaction ID: TXN-20240713-8821. Amount: $4,750.00 to merchant 'ElectroStore-Online'. Card: Visa ending 4412. Location: IP 91.245.12.33 (Romania) — cardholder's usual location: Chicago, IL. Time: 2:47 AM local. Previous transaction: $12.99 Netflix 4 hours ago from Chicago. Card limit: $5,000.",
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
    sampleInput: "PR #247 — feat: add JWT refresh token rotation. Files changed: auth/token_service.py (+120/-18), auth/middleware.py (+45/-12), tests/test_auth.py (+89). Summary: Implements sliding window refresh tokens, invalidates old tokens on rotation, adds Redis-backed token blacklist. Branch: feature/jwt-rotation → main.",
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
    sampleInput: "Document: SaaS Platform Privacy Policy v2.3 (uploaded PDF). Regulatory frameworks to check: GDPR (EU), CCPA (California), SOC2 Type II. Key areas to audit: data retention policy, user consent mechanisms, data subject rights (access/deletion), third-party data sharing clauses, breach notification timelines.",
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
    sampleInput: "Project: Enterprise HR Information System (HRIS) replacement. Budget: $500K-$800K. Timeline: Go-live by Q1 2025. Requirements: 5,000 employees, payroll integration, time & attendance, performance management, self-service portal, Azure AD SSO, SOC2 compliance. Shortlisted vendors: Workday, SAP SuccessFactors, Oracle HCM.",
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
    sampleInput: "Evaluate vendors for cloud infrastructure: 500TB storage, 99.99% SLA, GDPR compliance required, multi-region Europe + US. Budget ceiling: $120K/year. Must support Kubernetes, Terraform IaC, and SOC2 Type II certification. Compare AWS, Azure, GCP, and OVHcloud.",
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
    sampleInput: "Role: Senior Data Engineer. Team: Data Platform (5 people). Stack: Python, Apache Spark, dbt, Snowflake, Airflow, AWS. Level: L5 (6+ years). Must-haves: streaming pipelines (Kafka/Kinesis), SQL optimization, data modeling. Nice-to-have: MLOps experience. Salary band: $140K-$175K. Location: Remote-first, US timezone.",
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
    sampleInput: "New hire: Priya Sharma. Role: Product Manager. Department: Growth. Start date: 2024-08-01. Manager: James Liu (james.liu@company.com). Location: London office + remote. Equipment: MacBook Pro 16\", monitor, headset. Systems needed: Jira, Confluence, Slack, Salesforce, Figma, AWS console read-only. IT provisioning needed by: 2024-07-30.",
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
    sampleInput: "Order #ORD-2024-18821. Customer: Sarah Chen (sarah.chen@gmail.com). Items: 2x Nike Air Max 270 (Size 8, Black) @ $129.99 each, 1x Running Socks Pack @ $14.99. Subtotal: $274.97. Shipping: Standard (free). Payment: Visa ending 7731. Delivery address: 42 Oak Street, Portland OR 97201. Promo code: SUMMER10 (-$27.50).",
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
    sampleInput: "Post ID: USR-9921-POST. Platform: Community forum. Author: new_user_34 (joined 2 days ago, 0 prior posts). Content: \"Check out this amazing investment opportunity! 300% returns guaranteed. Click here: bit.ly/invest-now — only 50 spots left, act fast! DM me for exclusive access. [Posted in 12 different threads in the last hour]\"",
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
    sampleInput: "Documents: Q3 2024 Annual Report (PDF, 142 pages), Product Roadmap 2024-2025 (PPTX), Engineering Architecture Overview (Confluence export). Query: What are the top 3 strategic priorities for 2025, what is the planned infrastructure spend, and which product features are scheduled for Q1 2025 release?",
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

  // ════════════════════════════════════════════════════════
  //  ARCHITECTURE  (new Lyzr blueprints)
  // ════════════════════════════════════════════════════════

  {
    id: "claude-md-framework",
    name: "CLAUDE.md Multi-Agent Framework",
    category: "Architecture",
    icon: "🤖",
    description: "Karpathy's CLAUDE.md framework — supervisor routes to Task Analyst, Executor, and Verifier, each enforcing quality rules. Dropped Claude mistake rate 41%→3%.",
    tags: ["architecture", "parallel", "guard", "supervisor"],
    sampleInput: "Task: Refactor the authentication module in our FastAPI backend to support OAuth2 with PKCE flow. The current implementation uses simple JWT with no refresh tokens. Requirements: backward compatible, no downtime migration, add refresh token rotation, maintain existing /api/auth/login endpoint signature. Codebase: Python 3.11, FastAPI 0.104, SQLAlchemy 2.0.",
    nodes: [
      n("n1", "Task Input", "input", "Receives task or goal"),
      n("n2", "Supervisor", "router", "Routes task to specialist sub-agents"),
      n("n3", "Task Analyst", "classifier", "Analyses task, defines acceptance criteria"),
      n("n4", "Task Executor", "responder", "Executes the task step by step"),
      n("n5", "Verifier", "guard", "Verifies output against CLAUDE.md rules"),
      n("n6", "Verified Output", "output", "Quality-checked final result"),
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

  {
    id: "goal-driven-autonomous",
    name: "Goal-Driven Autonomous Agent",
    category: "Architecture",
    icon: "🎯",
    description: "Autonomous looping agent: Planner breaks down task → Executor does work → Goal Evaluator checks condition. Loops until goal is met.",
    tags: ["architecture", "autonomous", "loop", "supervisor"],
    sampleInput: "Goal: Achieve 95%+ test coverage on the payments module. Current coverage: 61%. Module: src/payments/ (8 files, ~1,200 lines). Tech: Python + pytest. Uncovered areas: edge cases in retry logic, webhook handler error paths, currency conversion rounding. Success criteria: pytest --cov reports ≥95% with all tests green.",
    nodes: [
      n("n1", "Task & Goal Input", "input", "Task description + goal condition"),
      n("n2", "Task Planner", "classifier", "Breaks task into actionable steps"),
      n("n3", "Task Executor", "responder", "Executes current step"),
      n("n4", "Goal Evaluator", "guard", "Checks if goal condition is met"),
      n("n5", "Loop Controller", "router", "Routes back to planner or exits"),
      n("n6", "Final Output", "output", "Completed goal result"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n3","n4"),
      e("e4","n4","n5"),
      e("e5","n5","n2","Retry"),
      e("e6","n5","n6","Done"),
    ],
  },

  {
    id: "agent-reach-research",
    name: "Agent Reach — Live Internet Research",
    category: "Architecture",
    icon: "🌐",
    description: "Manager routes to Social, Dev, Media and Web specialist agents; fetches live internet data and merges into a single answer with links and dates.",
    tags: ["parallel", "rag", "router", "research"],
    sampleInput: "Research topic: \"Anthropic Claude 3.5 Sonnet vs GPT-4o — enterprise AI adoption trends Q2 2024\". Gather: latest benchmark comparisons, developer community sentiment (GitHub/Reddit/HN), enterprise case studies, pricing changes, analyst reports. Output format: structured report with source links and dates, max 2 weeks old only.",
    nodes: [
      n("n1", "Research Query", "input", "Plain English research question"),
      n("n2", "Research Manager", "router", "Routes to specialist fetch agents"),
      n("n3", "Social Agent", "rag", "Fetches Twitter/X, LinkedIn, Instagram"),
      n("n4", "Dev Agent", "rag", "Fetches GitHub, HN, arXiv"),
      n("n5", "Media Agent", "rag", "Fetches YouTube content"),
      n("n6", "Web Agent", "rag", "General web search + URL fetch"),
      n("n7", "Answer Merger", "responder", "Merges all sources into one answer"),
      n("n8", "Research Report", "output", "Answer with links, dates, numbers"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n2","n6"),
      e("e6","n3","n7"),
      e("e7","n4","n7"),
      e("e8","n5","n7"),
      e("e9","n6","n7"),
      e("e10","n7","n8"),
    ],
  },

  {
    id: "open-deep-research",
    name: "Open Deep Research Synthesis",
    category: "Architecture",
    icon: "🔬",
    description: "Stanford STORM-inspired: 5 perspective agents explore topic from different angles, cross-validate findings, synthesize into comprehensive report.",
    tags: ["parallel", "rag", "research", "architecture"],
    sampleInput: "Topic: \"Agentic AI in enterprise software — the shift from copilots to autonomous agents\". Research depth: comprehensive (20+ sources). Perspectives needed: technical/engineering, business/ROI, ethics/risk, market/competitive, and user adoption. Target audience: C-suite technology leaders. Output: 3,000-word synthesis report with executive summary.",
    nodes: [
      n("n1", "Research Topic", "input", "Complex research question or topic"),
      n("n2", "Research Router", "router", "Fans out to perspective agents"),
      n("n3", "Market Research", "rag", "Market & competitive angle"),
      n("n4", "Technical Research", "rag", "Technical & engineering angle"),
      n("n5", "Academic Research", "rag", "Academic literature & citations"),
      n("n6", "Policy Research", "rag", "Regulatory & policy angle"),
      n("n7", "Cross Validator", "guard", "Validates & reconciles findings"),
      n("n8", "Synthesis Agent", "responder", "Writes comprehensive report"),
      n("n9", "Final Report", "output", "Multi-perspective research report"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n2","n6"),
      e("e6","n3","n7"),
      e("e7","n4","n7"),
      e("e8","n5","n7"),
      e("e9","n6","n7"),
      e("e10","n7","n8"),
      e("e11","n8","n9"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  SALES & MARKETING  (new Lyzr blueprints)
  // ════════════════════════════════════════════════════════

  {
    id: "brand-compliance",
    name: "Brand Compliance & Governance",
    category: "Sales & Marketing",
    icon: "🎨",
    description: "Review PDFs, presentations and marketing assets against brand guidelines. Flag violations, check tone, suggest compliant rewrites automatically.",
    tags: ["guard", "rag", "parallel", "compliance"],
    sampleInput: "Asset: Q3 Partner Sales Deck (28 slides, PDF). Brand guidelines version: 2024-v3. Check for: logo usage (minimum clear space, approved variants only), color palette adherence (Pantone 286C primary, no off-brand gradients), font usage (only Inter and Playfair Display), tone of voice (confident, not salesy), claim accuracy (no unverified statistics).",
    nodes: [
      n("n1", "Asset Upload", "input", "PDF, deck or marketing content"),
      n("n2", "Content Router", "router", "Fans out to compliance checkers"),
      n("n3", "Brand Guidelines RAG", "rag", "Retrieves brand rules and tone guide"),
      n("n4", "Tone Checker", "guard", "Checks voice, tone and messaging"),
      n("n5", "Risk Flagger", "guard", "Flags legal and regulatory risks"),
      n("n6", "Rewrite Agent", "responder", "Suggests compliant rewrites"),
      n("n7", "Compliance Report", "output", "Violations, risks and rewrites"),
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
    id: "content-strategy-calendar",
    name: "Content Strategy & Editorial Calendar",
    category: "Sales & Marketing",
    icon: "📅",
    description: "Define content pillars, audience narratives, channel plans and a practical editorial calendar. Turns ad-hoc content into a structured B2B content engine.",
    tags: ["parallel", "classifier", "responder", "content"],
    sampleInput: "Company: B2B SaaS, AI-powered project management tool. Target audience: engineering managers and CTOs at 50-500 person startups. Goal: 40% increase in organic trial signups over 6 months. Channels available: LinkedIn, company blog, YouTube, newsletter (8K subscribers). Team: 1 content writer, 1 designer (part-time). Budget: $2,000/month.",
    nodes: [
      n("n1", "Strategy Brief", "input", "Business goals, ICP, channels"),
      n("n2", "Strategy Router", "router", "Fans out to strategy agents"),
      n("n3", "Audience Analyser", "classifier", "Defines buyer personas & pain points"),
      n("n4", "Pillar Builder", "responder", "Creates content pillars & themes"),
      n("n5", "Channel Planner", "classifier", "Maps content to distribution channels"),
      n("n6", "Calendar Builder", "responder", "Generates editorial calendar with dates"),
      n("n7", "Content Strategy", "output", "Complete content strategy document"),
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
    id: "ai-news-intelligence",
    name: "AI News Intelligence Digest",
    category: "Sales & Marketing",
    icon: "📡",
    description: "Multi-agent system that retrieves high-signal AI industry news, filters event-level developments, classifies by strategic relevance for executive audiences.",
    tags: ["parallel", "rag", "classifier", "news"],
    sampleInput: "Digest for: Chief AI Officer, financial services firm. Focus areas: LLM regulatory developments (EU AI Act, SEC guidance), foundation model releases (GPT, Claude, Gemini), AI in banking/fintech use cases, enterprise AI security incidents. Time window: last 48 hours. Format: 8-10 bullet executive brief with strategic implications.",
    nodes: [
      n("n1", "Intelligence Brief", "input", "Topics, companies, sectors to track"),
      n("n2", "News Router", "router", "Fans out to specialist news agents"),
      n("n3", "Enterprise Deployments", "rag", "Tracks enterprise AI adoption news"),
      n("n4", "Funding & M&A", "rag", "Tracks investment and acquisition news"),
      n("n5", "Regulatory Actions", "rag", "Tracks policy and compliance news"),
      n("n6", "Model Releases", "rag", "Tracks new model and research releases"),
      n("n7", "Signal Filter", "guard", "Filters noise, keeps high-signal events"),
      n("n8", "Executive Digest", "output", "Structured AI intelligence report"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n2","n6"),
      e("e6","n3","n7"),
      e("e7","n4","n7"),
      e("e8","n5","n7"),
      e("e9","n6","n7"),
      e("e10","n7","n8"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  CUSTOMER SUPPORT  (new Lyzr blueprints)
  // ════════════════════════════════════════════════════════

  {
    id: "conversation-qa-scoring",
    name: "Conversation QA Scoring",
    category: "Customer Support",
    icon: "⭐",
    description: "Evaluate support transcripts against quality standards. Score agent performance, highlight strengths and gaps, provide actionable coaching feedback.",
    tags: ["classifier", "guard", "sequential", "support"],
    sampleInput: "Transcript ID: TKT-20240712-5531. Agent: Marcus Webb (6 months tenure). Customer: Enterprise account, billing dispute ($2,400 overcharge). Duration: 18 minutes. Channel: Phone. Outcome: Escalated to billing team. QA criteria: empathy (30%), resolution rate (25%), policy adherence (25%), call control (20%). SLA target: resolve or escalate within 15 min.",
    nodes: [
      n("n1", "Transcript Input", "input", "Support chat or email transcript"),
      n("n2", "Quality Standards", "rag", "Retrieves QA rubric and standards"),
      n("n3", "Compliance Checker", "guard", "Checks adherence to scripts & policy"),
      n("n4", "Empathy Scorer", "classifier", "Scores tone, empathy and rapport"),
      n("n5", "Resolution Scorer", "classifier", "Scores effectiveness of resolution"),
      n("n6", "Feedback Generator", "responder", "Writes coaching feedback report"),
      n("n7", "QA Score Report", "output", "Score, strengths, gaps, coaching"),
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
    id: "conversation-summary-tracker",
    name: "Conversation Summary & Action Tracker",
    category: "Customer Support",
    icon: "📝",
    description: "Analyse support transcripts to generate factual summaries, extract action items, capture customer concerns and record agent commitments.",
    tags: ["classifier", "responder", "sequential", "support"],
    sampleInput: "Transcript: 22-minute call. Customer (David Park, TechCorp account) reported: (1) API integration broken after last week's platform update, (2) incorrect invoice for July ($3,200 vs $2,800 contracted), (3) requested SLA upgrade to 99.9%. Agent promised: engineer callback within 4h, credit note by EOD, SLA upgrade proposal by Friday. Ticket: TKT-9912.",
    nodes: [
      n("n1", "Conversation Input", "input", "Call or chat transcript"),
      n("n2", "Summary Agent", "responder", "Generates concise factual summary"),
      n("n3", "Action Extractor", "classifier", "Extracts follow-up action items"),
      n("n4", "Concern Tracker", "classifier", "Captures customer concerns raised"),
      n("n5", "Commitment Recorder", "guard", "Records agent promises and commitments"),
      n("n6", "Structured Record", "output", "Summary + actions + concerns + commitments"),
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
  //  BANKING & INSURANCE  (new Lyzr blueprints)
  // ════════════════════════════════════════════════════════

  {
    id: "insurance-litigation",
    name: "Insurance Litigation Analyzer",
    category: "Banking & Insurance",
    icon: "⚖️",
    description: "Process insurance claim PDFs with parallel agents: extract key facts, analyse liability, check precedents, then produce a litigation risk report.",
    tags: ["rag", "parallel", "guard", "insurance"],
    sampleInput: "Claim #CLM-2024-00871. Type: Commercial property damage. Incident: Water damage from burst pipe, 3rd floor office, 2024-06-15. Insured: Nexus Consulting LLC. Policy: Commercial property, $2M coverage, $10K deductible, exclusion clause 4.2b (gradual damage). Claimed amount: $385,000. Contractor estimate: $290,000. Prior claim history: 1 claim in 5 years (storm damage, 2021).",
    nodes: [
      n("n1", "Claim Document", "input", "Insurance claim or policy PDF"),
      n("n2", "Document Router", "router", "Fans out to analysis agents"),
      n("n3", "Fact Extractor", "rag", "Extracts parties, dates, amounts, events"),
      n("n4", "Liability Analyser", "classifier", "Assesses liability and coverage gaps"),
      n("n5", "Precedent Checker", "rag", "Searches similar case precedents"),
      n("n6", "Risk Scorer", "guard", "Scores litigation risk level"),
      n("n7", "Litigation Report", "output", "Risk score, findings, recommendations"),
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
    id: "financial-credit-tear-sheet",
    name: "Financial Credit Tear Sheet",
    category: "Banking & Insurance",
    icon: "📊",
    description: "Analyse portfolio holdings, market data, news events and risk correlations to produce client-ready credit reports in compressed financial language.",
    tags: ["parallel", "rag", "classifier", "finance"],
    sampleInput: "Entity: Stripe Inc. (private). Report type: Credit Tear Sheet for $500M revolving credit facility. Data: Latest financials (2023 revenue $14.3B, net loss $554M), recent news (IPO delay, headcount reduction 14%), market context (fintech valuations, rising rates), peer comparison: Adyen, Braintree. Audience: Credit committee. Format: 2-page compressed financial narrative.",
    nodes: [
      n("n1", "Portfolio Input", "input", "Holdings, sector, client brief"),
      n("n2", "Analysis Router", "router", "Fans out to financial analysis agents"),
      n("n3", "Holdings Analyser", "classifier", "Analyses portfolio composition & weights"),
      n("n4", "Market Data Agent", "rag", "Fetches price, yield, spread data"),
      n("n5", "News Event Agent", "rag", "Scans for material news and events"),
      n("n6", "Risk Correlator", "guard", "Identifies risk correlations & concentrations"),
      n("n7", "Tear Sheet Writer", "responder", "Writes compressed credit language report"),
      n("n8", "Credit Tear Sheet", "output", "Client-ready credit report"),
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
    id: "universal-banking-support",
    name: "Universal Banking Support",
    category: "Banking & Insurance",
    icon: "🏛️",
    description: "Chat-based banking support that routes to 4 specialist agents: accounts, loans, cards and disputes — each with access to relevant banking data.",
    tags: ["router", "parallel", "responder", "banking"],
    sampleInput: "Customer: Account holder since 2018. Message: \"Hi, I have three issues — firstly my savings account isn't showing interest for June, secondly I want to check the remaining balance on my home loan, and thirdly I noticed a charge of $89.99 on my Visa card on July 10th that I don't recognize from a merchant called 'DGTAL-SVCS-EU'. Can you help with all three?\"",
    nodes: [
      n("n1", "Customer Query", "input", "Banking query via chat"),
      n("n2", "Universal Agent", "router", "Identifies domain and routes to specialist"),
      n("n3", "Account Agent", "responder", "Handles balances, transfers, statements"),
      n("n4", "Loan Agent", "responder", "Handles loan enquiries and applications"),
      n("n5", "Card Agent", "responder", "Handles card issues, limits, disputes"),
      n("n6", "Dispute Agent", "guard", "Handles complaints and escalations"),
      n("n7", "Response", "output", "Contextual banking response"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3","Accounts"),
      e("e3","n2","n4","Loans"),
      e("e4","n2","n5","Cards"),
      e("e5","n2","n6","Disputes"),
      e("e6","n3","n7"),
      e("e7","n4","n7"),
      e("e8","n5","n7"),
      e("e9","n6","n7"),
    ],
  },

  // ════════════════════════════════════════════════════════
  //  HR & LEGAL  (new Lyzr blueprints)
  // ════════════════════════════════════════════════════════

  {
    id: "hr-policy-generator",
    name: "HR Policy Generator",
    category: "HR & Legal",
    icon: "📜",
    description: "Guide HR through requirements gathering, validate compliance with labor laws, produce professional policy documents ready for implementation.",
    tags: ["rag", "guard", "sequential", "hr"],
    sampleInput: "Policy needed: Remote & Hybrid Work Policy. Company: 800-person tech company, US + UK + India offices. Context: Post-pandemic, 60% of workforce is now hybrid. Requirements: define eligible roles, minimum in-office days (suggesting 2 days/week), equipment stipend ($800/year), home office security standards, performance expectations, manager discretion rules. Must comply with UK Employment Rights Act and US FLSA.",
    nodes: [
      n("n1", "Policy Requirements", "input", "HR provides policy type and requirements"),
      n("n2", "Requirements Analyser", "classifier", "Extracts scope, jurisdiction, employees"),
      n("n3", "Labor Law Checker", "rag", "Retrieves applicable labor laws and regs"),
      n("n4", "Policy Drafter", "responder", "Drafts full policy document"),
      n("n5", "Compliance Validator", "guard", "Validates against legal requirements"),
      n("n6", "Final Policy", "output", "Compliant, implementation-ready policy"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n3","n4"),
      e("e4","n4","n5"),
      e("e5","n5","n4","Revise"),
      e("e6","n5","n6","Approved"),
    ],
  },

  {
    id: "interviewer-evaluator",
    name: "Interviewer & Evaluator Agent",
    category: "HR & Legal",
    icon: "🎤",
    description: "Two-agent managerial pipeline: Interviewer conducts structured interview, Evaluator scores responses against criteria and recommends hire/no-hire.",
    tags: ["sequential", "classifier", "guard", "hr"],
    sampleInput: "Candidate: Alex Torres. Role: Staff Software Engineer (Backend). Interview type: Technical + behavioral (45 min). Evaluation criteria: system design (35%), coding fundamentals (30%), communication (20%), culture fit (15%). Scorecard minimum: 70% overall, no single dimension below 50%. Candidate background: 7 years experience, strong in distributed systems, GitHub profile provided.",
    nodes: [
      n("n1", "Candidate Brief", "input", "Role, JD and candidate profile"),
      n("n2", "Interview Planner", "classifier", "Designs question set for role"),
      n("n3", "Interviewer Agent", "responder", "Conducts structured interview"),
      n("n4", "Response Recorder", "rag", "Captures and organises all answers"),
      n("n5", "Evaluator Agent", "guard", "Scores responses against criteria"),
      n("n6", "Hire Decision", "output", "Hire / No-hire with score breakdown"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n3","n4"),
      e("e4","n4","n5"),
      e("e5","n5","n6"),
    ],
  },

  {
    id: "legal-contract-analyzer",
    name: "Legal Contract Clause Analyzer",
    category: "HR & Legal",
    icon: "📋",
    description: "Multi-agent contract analysis: extract clauses, identify risks, compare to market standards, generate actionable summaries for vendor or M&A contracts.",
    tags: ["rag", "guard", "parallel", "legal"],
    sampleInput: "Contract: SaaS Master Service Agreement with Salesforce (PDF, 47 pages). Contract type: Enterprise software vendor. Review focus: data processing addendum (GDPR Article 28), liability cap (seeking mutual 12-month cap, they propose 3-month), IP ownership of customizations, termination for convenience (notice period), SLA credits and remedies. Our legal standard: Fortune 500 company playbook v2024.",
    nodes: [
      n("n1", "Contract Upload", "input", "PDF or text of contract"),
      n("n2", "Analysis Router", "router", "Fans out to analysis agents"),
      n("n3", "Clause Extractor", "rag", "Extracts and categorises key clauses"),
      n("n4", "Risk Identifier", "guard", "Flags hidden risks and obligations"),
      n("n5", "Market Comparator", "rag", "Compares clauses to market standards"),
      n("n6", "Summary Generator", "responder", "Produces actionable risk summary"),
      n("n7", "Contract Report", "output", "Clause map, risks, recommendations"),
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
  //  IT OPS / DEV OPS  (new Lyzr blueprints)
  // ════════════════════════════════════════════════════════

  {
    id: "pitchdeck-evaluator",
    name: "PitchDeck VC Evaluator",
    category: "IT Ops / Dev Ops",
    icon: "💼",
    description: "VC-grade pitch evaluation: parallel agents score market timing, business model, traction, and strategy; synthesise into structured investment analysis.",
    tags: ["parallel", "classifier", "rag", "finance"],
    sampleInput: "Startup: NovaMed AI. Stage: Series A. Ask: $12M at $60M pre-money valuation. Sector: AI-powered clinical documentation for hospitals. Traction: 8 hospital pilots, $1.2M ARR, 180% NRR. Team: 2 ex-Epic founders + CMO from UCSF. Market: $18B clinical documentation market. Competitors: Nuance DAX, Ambience Healthcare. Deck: 18 slides (PDF attached).",
    nodes: [
      n("n1", "Pitch Deck Input", "input", "Startup pitch deck or executive summary"),
      n("n2", "Evaluation Router", "router", "Fans out to scoring agents"),
      n("n3", "Market Timing Scorer", "classifier", "Scores market opportunity & timing"),
      n("n4", "Business Model Scorer", "classifier", "Scores revenue model & unit economics"),
      n("n5", "Traction Scorer", "classifier", "Scores growth, retention, revenue"),
      n("n6", "Strategy Scorer", "classifier", "Scores execution plan & team"),
      n("n7", "Investment Synthesiser", "responder", "Synthesises scores into VC verdict"),
      n("n8", "VC Report", "output", "Scores, analysis, invest/pass recommendation"),
    ],
    edges: [
      e("e1","n1","n2"),
      e("e2","n2","n3"),
      e("e3","n2","n4"),
      e("e4","n2","n5"),
      e("e5","n2","n6"),
      e("e6","n3","n7"),
      e("e7","n4","n7"),
      e("e8","n5","n7"),
      e("e9","n6","n7"),
      e("e10","n7","n8"),
    ],
  },

  {
    id: "market-color-analyst",
    name: "Market Color Analyst",
    category: "IT Ops / Dev Ops",
    icon: "📉",
    description: "Collect, filter and synthesise latest 24–48h sector news into compressed financial Market Color notes with forward-looking views for any industry sector.",
    tags: ["rag", "parallel", "classifier", "finance"],
    sampleInput: "Sector: Enterprise SaaS / Cloud Infrastructure. Time window: last 48 hours. Focus: earnings surprises, analyst rating changes, M&A signals, macro impact (Fed rate decision yesterday), major product launches. Key tickers to track: MSFT, CRM, NOW, SNOW, DDOG. Output format: 1-page Market Color note, bullet-point style, include forward-looking view and key risks.",
    nodes: [
      n("n1", "Sector Input", "input", "Industry sector and time window"),
      n("n2", "News Router", "router", "Fans out to news collection agents"),
      n("n3", "News Collector", "rag", "Fetches latest sector news & filings"),
      n("n4", "Signal Filter", "guard", "Filters noise, keeps market-moving events"),
      n("n5", "Macro Analyser", "classifier", "Identifies macro themes and drivers"),
      n("n6", "Color Writer", "responder", "Writes compressed Market Color note"),
      n("n7", "Market Color Report", "output", "Client-ready market color note"),
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
