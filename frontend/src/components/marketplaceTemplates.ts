// Curated AgentForge app templates for the Marketplace gallery.
// Reuses the UX pattern (categories, card/detail-modal fields) observed on
// Lyzr AI's Marketplace, but every name/description/prompt/tag below is
// original AgentForge content -- nothing is copied from Lyzr.
//
// See docs/superpowers/specs/2026-07-27-agentforge-marketplace-design.md

export interface MarketplaceTemplate {
  id: string;
  name: string;
  category: string;
  shortDescription: string;
  about: string;
  tags: string[];
  prompt: string;
  previewImagePath: string;
  // Whether previewImagePath actually points at a real, generated
  // screenshot yet. Most templates don't have one until someone runs
  // their prompt through Architect once and saves the result (see the
  // design spec's Content plan) -- rather than showing a broken/blank
  // image when "View App" is clicked, the UI hides/disables that button
  // entirely until this is true.
  hasPreview: boolean;
  createdBy: string;
  publishedDate: string;
}

export const CATEGORIES = [
  "Automation",
  "Analytics & Insights",
  "Communication",
  "Content Creation",
  "Customer Support",
  "Data Processing",
  "Developer Tools",
  "Finance & Accounting",
  "HR & Recruiting",
  "Marketing",
  "Productivity",
  "Sales & CRM",
  "Other",
] as const;

export const MARKETPLACE_TEMPLATES: MarketplaceTemplate[] = [
  {
    id: "hr-policy-faq",
    name: "HR Policy FAQ Assistant",
    category: "HR & Recruiting",
    shortDescription: "Answers employee questions from uploaded HR policy documents, with SSO.",
    about:
      "An internal HR assistant that answers employee questions from uploaded HR policy PDFs/DOCX, citing the exact source document and confidence for every answer, with Microsoft Entra ID (Azure AD) SSO login for authentication.",
    tags: ["hr", "rag", "sso", "chatbot"],
    prompt:
      "An internal HR FAQ chatbot that authenticates employees via Microsoft Entra ID SSO and answers questions from uploaded HR policy documents, with document upload, admin audit log, and rate limiting.",
    previewImagePath: "/marketplace-previews/hr-policy-faq.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-02",
  },
  {
    id: "sales-lead-scorer",
    name: "Sales Lead Scorer",
    category: "Sales & CRM",
    shortDescription: "Scores inbound leads and drafts personalized outreach emails.",
    about:
      "A sales intelligence app that scores inbound leads 0-100 from CRM data, explains the score with an AI-written rationale, and drafts a personalized first-touch outreach email per lead.",
    tags: ["sales", "crm", "lead-scoring", "outreach"],
    prompt:
      "A sales intelligence app for scoring inbound leads and drafting personalized cold outreach emails, with a leads table (name, company, score, stage) and an AI email composer.",
    previewImagePath: "/marketplace-previews/sales-lead-scorer.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-05",
  },
  {
    id: "support-ticket-triage",
    name: "Support Ticket Triage",
    category: "Customer Support",
    shortDescription: "Classifies and prioritizes incoming support tickets automatically.",
    about:
      "An omni-channel support triage app that classifies incoming tickets by category and urgency, suggests a resolution from the knowledge base, and escalates unresolved tickets to a human agent.",
    tags: ["support", "helpdesk", "triage", "csat"],
    prompt:
      "A customer support ticket triage app that classifies incoming tickets by category and urgency, suggests resolutions from a knowledge base, and escalates unresolved tickets to a human agent.",
    previewImagePath: "/marketplace-previews/support-ticket-triage.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-08",
  },
  {
    id: "kpi-dashboard-builder",
    name: "KPI Dashboard Builder",
    category: "Analytics & Insights",
    shortDescription: "Turns an uploaded spreadsheet into a live KPI dashboard.",
    about:
      "A business intelligence app that ingests an uploaded CSV/Excel file and builds a KPI dashboard (charts, trend lines, summary stats) derived entirely from the real uploaded data.",
    tags: ["analytics", "dashboard", "bi", "data"],
    prompt:
      "A business intelligence dashboard app that ingests an uploaded CSV or Excel file and builds KPI charts, trend lines, and summary stats derived from the real uploaded data.",
    previewImagePath: "/marketplace-previews/kpi-dashboard-builder.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-10",
  },
  {
    id: "invoice-processor",
    name: "Invoice Processing Agent",
    category: "Finance & Accounting",
    shortDescription: "Extracts line items from uploaded invoices and flags anomalies.",
    about:
      "A finance automation app that extracts vendor, line items, and totals from uploaded invoice PDFs, checks them against a budget threshold, and flags anomalies for manual review.",
    tags: ["finance", "invoicing", "automation", "ocr"],
    prompt:
      "An invoice processing app that extracts vendor, line items, and totals from uploaded invoice PDFs, checks them against a budget threshold, and flags anomalies for manual review.",
    previewImagePath: "/marketplace-previews/invoice-processor.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-12",
  },
  {
    id: "meeting-notes-summarizer",
    name: "Meeting Notes Summarizer",
    category: "Productivity",
    shortDescription: "Turns raw meeting transcripts into action items and summaries.",
    about:
      "A productivity app that takes an uploaded meeting transcript and produces a concise summary, a list of decisions made, and action items with owners, ready to share with the team.",
    tags: ["productivity", "meetings", "summarization"],
    prompt:
      "A meeting notes app that takes an uploaded meeting transcript and produces a concise summary, decisions made, and action items with owners.",
    previewImagePath: "/marketplace-previews/meeting-notes-summarizer.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-14",
  },
  {
    id: "code-review-assistant",
    name: "Code Review Assistant",
    category: "Developer Tools",
    shortDescription: "Reviews uploaded code diffs and suggests improvements.",
    about:
      "A developer tool that reviews an uploaded code diff for bugs, style issues, and missing tests, and generates a structured review comment ready to paste into a pull request.",
    tags: ["devtools", "code-review", "engineering"],
    prompt:
      "A code review assistant app that reviews an uploaded code diff for bugs, style issues, and missing tests, and generates a structured pull-request review comment.",
    previewImagePath: "/marketplace-previews/code-review-assistant.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-16",
  },
  {
    id: "social-content-planner",
    name: "Social Content Planner",
    category: "Marketing",
    shortDescription: "Generates a week of on-brand social posts from a topic list.",
    about:
      "A marketing app that takes a list of topics and a brand voice description, and generates a week's worth of social media post drafts with suggested posting times.",
    tags: ["marketing", "social-media", "content"],
    prompt:
      "A social content planner app that takes a list of topics and a brand voice description, and generates a week's worth of social media post drafts with suggested posting times.",
    previewImagePath: "/marketplace-previews/social-content-planner.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-18",
  },
  {
    id: "onboarding-buddy",
    name: "New Hire Onboarding Buddy",
    category: "HR & Recruiting",
    shortDescription: "Guides new hires through their first-week checklist.",
    about:
      "An HR onboarding app that walks new hires through a first-week checklist (paperwork, tool access, introductions), tracks completion, and answers onboarding-related questions.",
    tags: ["hr", "onboarding", "checklist"],
    prompt:
      "A new hire onboarding app that walks employees through a first-week checklist, tracks completion progress, and answers onboarding-related questions.",
    previewImagePath: "/marketplace-previews/onboarding-buddy.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-20",
  },
  {
    id: "expense-report-assistant",
    name: "Expense Report Assistant",
    category: "Finance & Accounting",
    shortDescription: "Extracts and categorizes receipts into a submittable expense report.",
    about:
      "A finance app that extracts amount, vendor, and date from uploaded receipt images, auto-categorizes each expense, and compiles them into a submittable expense report.",
    tags: ["finance", "expenses", "receipts"],
    prompt:
      "An expense report app that extracts amount, vendor, and date from uploaded receipt images, auto-categorizes each expense, and compiles a submittable expense report.",
    previewImagePath: "/marketplace-previews/expense-report-assistant.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-22",
  },
  {
    id: "document-qa-workspace",
    name: "Document Q&A Workspace",
    category: "Data Processing",
    shortDescription: "Upload any documents and ask questions grounded in their content.",
    about:
      "A general-purpose document Q&A app: upload any mix of PDFs, DOCX, and text files, then ask questions and get answers grounded in and cited from the actual uploaded content.",
    tags: ["rag", "documents", "search"],
    prompt:
      "A document Q&A workspace app where users upload PDFs, DOCX, and text files, then ask questions and get answers grounded in and cited from the actual uploaded content.",
    previewImagePath: "/marketplace-previews/document-qa-workspace.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-24",
  },
  {
    id: "release-notes-generator",
    name: "Release Notes Generator",
    category: "Automation",
    shortDescription: "Turns a list of merged PR titles into polished release notes.",
    about:
      "An automation app that takes a raw list of merged pull request titles and generates polished, categorized release notes (Features, Fixes, Breaking Changes) ready to publish.",
    tags: ["automation", "devtools", "release-notes"],
    prompt:
      "A release notes generator app that takes a list of merged pull request titles and generates polished, categorized release notes (Features, Fixes, Breaking Changes).",
    previewImagePath: "/marketplace-previews/release-notes-generator.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-26",
  },
];
