// Curated AgentForge app templates for the Marketplace gallery.
// Reuses the UX pattern (categories, use cases, integrations, LLM model
// filters, card/detail-modal fields) observed on Lyzr AI's Marketplace, but
// every name/description/prompt/tag/test-data sample below is original
// AgentForge content -- nothing is copied from Lyzr.
//
// See docs/superpowers/specs/2026-07-27-agentforge-marketplace-design.md

export interface MarketplaceTemplate {
  id: string;
  name: string;
  category: string;
  useCases: string[];
  integrations: string[];
  llmModel: string;
  shortDescription: string;
  about: string;
  tags: string[];
  prompt: string;
  // Realistic sample data (CSV/plain text) that a user would actually upload
  // to test this app once built. Passed to Architect via the same
  // {files:[{name,text}]} handoff used for sample-file blueprints, so
  // clicking "Use This Template" both queues the prompt and pre-loads a
  // real test file.
  testDataFileName: string;
  testData: string;
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

export const USE_CASES = [
  "Lead Generation",
  "Customer Engagement",
  "Workflow Automation",
  "Data Analysis",
  "Content Creation",
  "Task Management",
  "Reporting",
  "Scheduling",
] as const;

export const INTEGRATIONS = [
  "Slack",
  "Gmail",
  "Google Drive",
  "Notion",
  "Zapier",
  "HubSpot",
  "Salesforce",
  "Zendesk",
  "Stripe",
  "GitHub",
  "Jira",
  "Airtable",
] as const;

export const LLM_MODELS = [
  "GPT-4",
  "GPT-4o",
  "GPT-4o Mini",
  "GPT-3.5",
  "Claude 3 Opus",
  "Claude 3 Sonnet",
] as const;

export const MARKETPLACE_TEMPLATES: MarketplaceTemplate[] = [
  {
    id: "hr-policy-faq",
    name: "HR Policy FAQ Assistant",
    category: "HR & Recruiting",
    useCases: ["Customer Engagement", "Workflow Automation"],
    integrations: ["Google Drive", "Slack"],
    llmModel: "GPT-4o",
    shortDescription: "Answers employee questions from uploaded HR policy documents, with SSO.",
    about:
      "An internal HR assistant that answers employee questions from uploaded HR policy PDFs/DOCX, citing the exact source document and confidence for every answer, with Microsoft Entra ID (Azure AD) SSO login for authentication.",
    tags: ["hr", "rag", "sso", "chatbot"],
    prompt:
      "An internal HR FAQ chatbot that authenticates employees via Microsoft Entra ID SSO and answers questions from uploaded HR policy documents, with document upload, admin audit log, and rate limiting.",
    testDataFileName: "hr-leave-policy.txt",
    testData:
      "ACME CORP - LEAVE POLICY (effective 2026-01-01)\n\n1. Annual Leave: All full-time employees accrue 18 paid leave days per calendar year, credited monthly at 1.5 days/month.\n2. Sick Leave: 10 paid sick days per year. A medical certificate is required for absences longer than 2 consecutive days.\n3. Maternity Leave: 26 weeks paid leave for the primary caregiver, as per statutory requirement.\n4. Paternity Leave: 2 weeks paid leave, must be taken within 3 months of the child's birth.\n5. Work From Home: Employees may work remotely up to 2 days/week with manager approval logged in the HRMS.\n6. Notice Period: 60 days written notice required for resignation from all confirmed employees.\n7. Leave Carry Forward: Up to 10 unused annual leave days may be carried forward to the next calendar year; excess days lapse on Dec 31.",
    previewImagePath: "/marketplace-previews/hr-policy-faq.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-02",
  },
  {
    id: "sales-lead-scorer",
    name: "Sales Lead Scorer",
    category: "Sales & CRM",
    useCases: ["Lead Generation", "Reporting"],
    integrations: ["Salesforce", "HubSpot"],
    llmModel: "GPT-4",
    shortDescription: "Scores inbound leads and drafts personalized outreach emails.",
    about:
      "A sales intelligence app that scores inbound leads 0-100 from CRM data, explains the score with an AI-written rationale, and drafts a personalized first-touch outreach email per lead.",
    tags: ["sales", "crm", "lead-scoring", "outreach"],
    prompt:
      "A sales intelligence app for scoring inbound leads and drafting personalized cold outreach emails, with a leads table (name, company, score, stage) and an AI email composer.",
    testDataFileName: "inbound-leads.csv",
    testData:
      "name,company,title,employees,industry,last_activity,source\nPriya Menon,Bluewave Retail,VP Operations,450,Retail,2026-07-20,Website Demo Request\nCarlos Diaz,Northgate Logistics,IT Director,1200,Logistics,2026-07-18,LinkedIn Ad\nAyesha Khan,Finlytics Corp,CFO,80,FinTech,2026-07-25,Referral\nTom Becker,GreenFields Agri,Owner,15,Agriculture,2026-07-10,Cold Email Reply\nLena Fischer,Orbit Health,Head of Procurement,600,Healthcare,2026-07-22,Webinar Signup",
    previewImagePath: "/marketplace-previews/sales-lead-scorer.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-05",
  },
  {
    id: "support-ticket-triage",
    name: "Support Ticket Triage",
    category: "Customer Support",
    useCases: ["Customer Engagement", "Workflow Automation"],
    integrations: ["Zendesk", "Slack"],
    llmModel: "GPT-4o",
    shortDescription: "Classifies and prioritizes incoming support tickets automatically.",
    about:
      "An omni-channel support triage app that classifies incoming tickets by category and urgency, suggests a resolution from the knowledge base, and escalates unresolved tickets to a human agent.",
    tags: ["support", "helpdesk", "triage", "csat"],
    prompt:
      "A customer support ticket triage app that classifies incoming tickets by category and urgency, suggests resolutions from a knowledge base, and escalates unresolved tickets to a human agent.",
    testDataFileName: "support-tickets.csv",
    testData:
      "ticket_id,customer,subject,message,channel,created_at\nT-1042,Rahul S.,Cannot log in,\"I reset my password twice but still get 'invalid credentials' on the mobile app.\",Email,2026-07-24\nT-1043,Green Leaf Cafe,Billing discrepancy,\"We were charged twice for the June invoice, please refund the duplicate charge.\",Chat,2026-07-24\nT-1044,Meera P.,Feature request,\"Would love a dark mode option in the dashboard.\",Portal,2026-07-25\nT-1045,David K.,App crashing,\"The app crashes every time I try to export a report to PDF on iOS 18.\",Email,2026-07-25",
    previewImagePath: "/marketplace-previews/support-ticket-triage.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-08",
  },
  {
    id: "kpi-dashboard-builder",
    name: "KPI Dashboard Builder",
    category: "Analytics & Insights",
    useCases: ["Data Analysis", "Reporting"],
    integrations: ["Google Drive", "Airtable"],
    llmModel: "GPT-4",
    shortDescription: "Turns an uploaded spreadsheet into a live KPI dashboard.",
    about:
      "A business intelligence app that ingests an uploaded CSV/Excel file and builds a KPI dashboard (charts, trend lines, summary stats) derived entirely from the real uploaded data.",
    tags: ["analytics", "dashboard", "bi", "data"],
    prompt:
      "A business intelligence dashboard app that ingests an uploaded CSV or Excel file and builds KPI charts, trend lines, and summary stats derived from the real uploaded data.",
    testDataFileName: "monthly-sales.csv",
    testData:
      "month,region,revenue,units_sold,new_customers\n2026-01,North,182000,910,42\n2026-02,North,175500,875,38\n2026-03,North,201300,1005,55\n2026-01,South,143200,716,29\n2026-02,South,151800,759,33\n2026-03,South,168900,844,41",
    previewImagePath: "/marketplace-previews/kpi-dashboard-builder.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-10",
  },
  {
    id: "invoice-processor",
    name: "Invoice Processing Agent",
    category: "Finance & Accounting",
    useCases: ["Data Analysis", "Workflow Automation"],
    integrations: ["Stripe", "Google Drive"],
    llmModel: "GPT-4o",
    shortDescription: "Extracts line items from uploaded invoices and flags anomalies.",
    about:
      "A finance automation app that extracts vendor, line items, and totals from uploaded invoice PDFs, checks them against a budget threshold, and flags anomalies for manual review.",
    tags: ["finance", "invoicing", "automation", "ocr"],
    prompt:
      "An invoice processing app that extracts vendor, line items, and totals from uploaded invoice PDFs, checks them against a budget threshold, and flags anomalies for manual review.",
    testDataFileName: "vendor-invoices.csv",
    testData:
      "invoice_no,vendor,date,line_item,amount,budget_limit\nINV-3301,Skyline Office Supplies,2026-07-01,Printer paper (50 reams),620.00,1000\nINV-3302,Skyline Office Supplies,2026-07-01,Toner cartridges,1450.00,1000\nINV-3401,CloudHost Inc,2026-07-05,Monthly server hosting,3200.00,3500\nINV-3402,Bright Marketing Co,2026-07-08,Q3 campaign design,8900.00,5000",
    previewImagePath: "/marketplace-previews/invoice-processor.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-12",
  },
  {
    id: "meeting-notes-summarizer",
    name: "Meeting Notes Summarizer",
    category: "Productivity",
    useCases: ["Task Management", "Content Creation"],
    integrations: ["Notion", "Slack"],
    llmModel: "GPT-4o Mini",
    shortDescription: "Turns raw meeting transcripts into action items and summaries.",
    about:
      "A productivity app that takes an uploaded meeting transcript and produces a concise summary, a list of decisions made, and action items with owners, ready to share with the team.",
    tags: ["productivity", "meetings", "summarization"],
    prompt:
      "A meeting notes app that takes an uploaded meeting transcript and produces a concise summary, decisions made, and action items with owners.",
    testDataFileName: "standup-transcript.txt",
    testData:
      "[Weekly Product Sync - 2026-07-22]\nPriya: We finished the onboarding flow redesign, ready for QA on Monday.\nCarlos: API rate limiting is still blocked on the infra ticket, ETA slipped to next Friday.\nAyesha: Marketing wants the release notes page live before the webinar on the 30th.\nTom: I'll pair with Carlos tomorrow to unblock the rate limiting ticket.\nDecision: Webinar date stays fixed at July 30; release notes page is now the top priority for Ayesha's team.\nAction items: Priya -> hand off to QA Monday. Carlos & Tom -> unblock rate limiting by Thursday. Ayesha -> ship release notes page by July 29.",
    previewImagePath: "/marketplace-previews/meeting-notes-summarizer.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-14",
  },
  {
    id: "code-review-assistant",
    name: "Code Review Assistant",
    category: "Developer Tools",
    useCases: ["Workflow Automation", "Task Management"],
    integrations: ["GitHub", "Jira"],
    llmModel: "Claude 3 Sonnet",
    shortDescription: "Reviews uploaded code diffs and suggests improvements.",
    about:
      "A developer tool that reviews an uploaded code diff for bugs, style issues, and missing tests, and generates a structured review comment ready to paste into a pull request.",
    tags: ["devtools", "code-review", "engineering"],
    prompt:
      "A code review assistant app that reviews an uploaded code diff for bugs, style issues, and missing tests, and generates a structured pull-request review comment.",
    testDataFileName: "sample.diff",
    testData:
      "--- a/src/utils/discount.ts\n+++ b/src/utils/discount.ts\n@@ -1,7 +1,10 @@\n-export function applyDiscount(price: number, pct: number) {\n-  return price - price * pct;\n+export function applyDiscount(price: number, pct: number) {\n+  if (pct < 0 || pct > 1) throw new Error(\"pct must be between 0 and 1\");\n+  const discounted = price - price * pct;\n+  return Math.round(discounted * 100) / 100;\n }\n+\n+// NOTE: no unit test added for the new bounds check yet",
    previewImagePath: "/marketplace-previews/code-review-assistant.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-16",
  },
  {
    id: "social-content-planner",
    name: "Social Content Planner",
    category: "Marketing",
    useCases: ["Content Creation", "Scheduling"],
    integrations: ["Zapier", "Notion"],
    llmModel: "GPT-4",
    shortDescription: "Generates a week of on-brand social posts from a topic list.",
    about:
      "A marketing app that takes a list of topics and a brand voice description, and generates a week's worth of social media post drafts with suggested posting times.",
    tags: ["marketing", "social-media", "content"],
    prompt:
      "A social content planner app that takes a list of topics and a brand voice description, and generates a week's worth of social media post drafts with suggested posting times.",
    testDataFileName: "content-topics.txt",
    testData:
      "Brand voice: Friendly, upbeat, plain-spoken. Avoid jargon and exclamation overload.\n\nTopics for next week:\n1. Launch of our new eco-friendly packaging\n2. Customer spotlight: a small bakery using our platform\n3. Behind-the-scenes: how our support team resolves tickets in under an hour\n4. Reminder: free onboarding webinar this Thursday at 3pm\n5. Quick tip: 3 ways to reduce checkout abandonment",
    previewImagePath: "/marketplace-previews/social-content-planner.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-18",
  },
  {
    id: "onboarding-buddy",
    name: "New Hire Onboarding Buddy",
    category: "HR & Recruiting",
    useCases: ["Task Management", "Customer Engagement"],
    integrations: ["Slack", "Notion"],
    llmModel: "GPT-4o Mini",
    shortDescription: "Guides new hires through their first-week checklist.",
    about:
      "An HR onboarding app that walks new hires through a first-week checklist (paperwork, tool access, introductions), tracks completion, and answers onboarding-related questions.",
    tags: ["hr", "onboarding", "checklist"],
    prompt:
      "A new hire onboarding app that walks employees through a first-week checklist, tracks completion progress, and answers onboarding-related questions.",
    testDataFileName: "onboarding-checklist.txt",
    testData:
      "Week 1 Checklist - New Hire\n[ ] Day 1: Complete I-9 / tax paperwork in HRMS\n[ ] Day 1: Laptop and badge pickup from IT desk\n[ ] Day 1: Meet your onboarding buddy and manager\n[ ] Day 2: Set up Slack, email, and VPN access\n[ ] Day 2: Complete security & compliance training module\n[ ] Day 3: 1:1 intro meetings with immediate team members\n[ ] Day 4: Shadow a live customer call or sprint standup\n[ ] Day 5: Submit first-week feedback survey",
    previewImagePath: "/marketplace-previews/onboarding-buddy.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-20",
  },
  {
    id: "expense-report-assistant",
    name: "Expense Report Assistant",
    category: "Finance & Accounting",
    useCases: ["Data Analysis", "Reporting"],
    integrations: ["Stripe", "Airtable"],
    llmModel: "GPT-4o",
    shortDescription: "Extracts and categorizes receipts into a submittable expense report.",
    about:
      "A finance app that extracts amount, vendor, and date from uploaded receipt images, auto-categorizes each expense, and compiles them into a submittable expense report.",
    tags: ["finance", "expenses", "receipts"],
    prompt:
      "An expense report app that extracts amount, vendor, and date from uploaded receipt images, auto-categorizes each expense, and compiles a submittable expense report.",
    testDataFileName: "expenses.csv",
    testData:
      "date,vendor,amount,note\n2026-07-14,Delta Airlines,412.50,Flight to client site - Chicago\n2026-07-14,Hilton Downtown,238.00,Hotel - 1 night, client visit\n2026-07-15,Uber,18.75,Airport to hotel\n2026-07-16,Cafe Roma,24.30,Team lunch with client",
    previewImagePath: "/marketplace-previews/expense-report-assistant.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-22",
  },
  {
    id: "document-qa-workspace",
    name: "Document Q&A Workspace",
    category: "Data Processing",
    useCases: ["Data Analysis", "Workflow Automation"],
    integrations: ["Google Drive", "Notion"],
    llmModel: "GPT-4",
    shortDescription: "Upload any documents and ask questions grounded in their content.",
    about:
      "A general-purpose document Q&A app: upload any mix of PDFs, DOCX, and text files, then ask questions and get answers grounded in and cited from the actual uploaded content.",
    tags: ["rag", "documents", "search"],
    prompt:
      "A document Q&A workspace app where users upload PDFs, DOCX, and text files, then ask questions and get answers grounded in and cited from the actual uploaded content.",
    testDataFileName: "vendor-contract.txt",
    testData:
      "SERVICE AGREEMENT SUMMARY\nParties: Acme Corp (Client) and Northwind Consulting (Vendor)\nTerm: 12 months, effective 2026-08-01, auto-renews unless either party gives 30 days written notice.\nScope: Vendor provides quarterly IT infrastructure audits and a dedicated support engineer during business hours (9am-6pm IST).\nFees: $12,000/quarter, invoiced net-30.\nSLA: Critical incidents acknowledged within 2 hours, resolved or mitigated within 24 hours.\nTermination: Either party may terminate for material breach with a 15-day cure period.",
    previewImagePath: "/marketplace-previews/document-qa-workspace.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-24",
  },
  {
    id: "release-notes-generator",
    name: "Release Notes Generator",
    category: "Automation",
    useCases: ["Content Creation", "Reporting"],
    integrations: ["GitHub", "Slack"],
    llmModel: "GPT-4o Mini",
    shortDescription: "Turns a list of merged PR titles into polished release notes.",
    about:
      "An automation app that takes a raw list of merged pull request titles and generates polished, categorized release notes (Features, Fixes, Breaking Changes) ready to publish.",
    tags: ["automation", "devtools", "release-notes"],
    prompt:
      "A release notes generator app that takes a list of merged pull request titles and generates polished, categorized release notes (Features, Fixes, Breaking Changes).",
    testDataFileName: "merged-prs.txt",
    testData:
      "#412 Add dark mode toggle to settings page\n#415 Fix crash when exporting empty report to PDF\n#418 BREAKING: rename /api/v1/users to /api/v2/accounts\n#421 Add bulk CSV import for contacts\n#423 Fix incorrect timezone offset in scheduled reports\n#426 Improve load time of dashboard by lazy-loading charts",
    previewImagePath: "/marketplace-previews/release-notes-generator.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-26",
  },
  {
    id: "event-outreach-tracker",
    name: "Event Outreach Tracker",
    category: "Sales & CRM",
    useCases: ["Lead Generation", "Scheduling"],
    integrations: ["HubSpot", "Google Drive"],
    llmModel: "GPT-4",
    shortDescription: "Finds relevant industry events and tracks outreach status per contact.",
    about:
      "A sales/events app that helps reps track which industry events matter for their pipeline, log outreach attempts per contact, and get AI-suggested follow-up messages based on event context.",
    tags: ["sales", "events", "outreach", "pipeline"],
    prompt:
      "An event outreach tracker app where reps log target industry events, add contacts met at each event, track outreach status per contact, and get AI-drafted follow-up messages referencing the event.",
    testDataFileName: "event-contacts.csv",
    testData:
      "event,contact_name,company,met_date,outreach_status\nCloud Summit 2026,Nina Patel,Vertex Systems,2026-06-10,Follow-up sent\nCloud Summit 2026,Marcus Lee,DataForge Inc,2026-06-10,Not contacted\nFinTech Connect,Sara Ibrahim,PayNorth,2026-07-02,Meeting scheduled\nFinTech Connect,Omar Haddad,LedgerWorks,2026-07-02,Not contacted",
    previewImagePath: "/marketplace-previews/event-outreach-tracker.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-28",
  },
  {
    id: "habit-tracker",
    name: "Daily Habit Tracker",
    category: "Productivity",
    useCases: ["Task Management", "Data Analysis"],
    integrations: ["Notion", "Slack"],
    llmModel: "GPT-4o Mini",
    shortDescription: "Logs daily habits and surfaces streaks, gaps, and gentle nudges.",
    about:
      "A personal productivity app for logging daily habits (exercise, reading, sleep, etc.), visualizing streaks over time, and getting a short AI-written weekly reflection on patterns and gaps.",
    tags: ["productivity", "habits", "wellness", "tracking"],
    prompt:
      "A daily habit tracker app where users log habits each day, see streaks and a calendar heatmap, and get a weekly AI-written reflection summarizing patterns and suggesting one small adjustment.",
    testDataFileName: "habit-log.csv",
    testData:
      "date,habit,completed\n2026-07-20,Exercise,yes\n2026-07-20,Read 20 min,yes\n2026-07-21,Exercise,no\n2026-07-21,Read 20 min,yes\n2026-07-22,Exercise,yes\n2026-07-22,Read 20 min,no\n2026-07-23,Exercise,yes\n2026-07-23,Read 20 min,yes",
    previewImagePath: "/marketplace-previews/habit-tracker.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-06-30",
  },
  {
    id: "claims-review-assistant",
    name: "Insurance Claims Review Assistant",
    category: "Finance & Accounting",
    useCases: ["Data Analysis", "Workflow Automation"],
    integrations: ["Google Drive", "Zendesk"],
    llmModel: "GPT-4",
    shortDescription: "Reviews uploaded insurance claim details and flags ones needing manual review.",
    about:
      "A claims operations app that reviews an uploaded claim's details against policy rules, calculates a risk/anomaly flag, and produces a short written rationale for whether it should auto-approve or escalate to a human adjuster.",
    tags: ["insurance", "claims", "risk", "compliance"],
    prompt:
      "An insurance claims review app that takes uploaded claim records, checks each against policy coverage rules, flags anomalies (amount outliers, mismatched dates, missing documentation), and recommends auto-approve vs escalate to a human adjuster with a written rationale.",
    testDataFileName: "claims.csv",
    testData:
      "claim_id,policy_no,claim_type,amount,incident_date,filed_date,documents_attached\nCLM-8801,POL-4021,Auto Collision,4200,2026-07-01,2026-07-03,yes\nCLM-8802,POL-4055,Water Damage,18500,2026-06-15,2026-07-20,no\nCLM-8803,POL-4021,Auto Collision,950,2026-07-10,2026-07-11,yes\nCLM-8804,POL-4099,Theft,12000,2026-07-05,2026-07-06,yes",
    previewImagePath: "/marketplace-previews/claims-review-assistant.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-02",
  },
  {
    id: "research-digest-mailer",
    name: "Research Digest Mailer",
    category: "Automation",
    useCases: ["Content Creation", "Scheduling"],
    integrations: ["Gmail", "Zapier"],
    llmModel: "GPT-4o",
    shortDescription: "Summarizes a batch of research paper abstracts into a weekly digest email.",
    about:
      "An automation app for research teams: upload a list of paper titles and abstracts, and it drafts a categorized weekly digest email (by topic) with one-line summaries and relevance notes, ready to send.",
    tags: ["research", "email", "summarization", "automation"],
    prompt:
      "A research digest app that takes an uploaded list of paper titles and abstracts, groups them by topic, and drafts a weekly digest email with one-line summaries and a relevance note per paper.",
    testDataFileName: "paper-abstracts.txt",
    testData:
      "Title: Efficient Retrieval-Augmented Generation for Long Documents\nAbstract: We propose a chunking strategy that improves retrieval precision on documents over 200 pages by 18% without added latency.\n\nTitle: Calibrating Confidence Scores in Customer Support Chatbots\nAbstract: A lightweight calibration method that reduces overconfident wrong answers in production support bots by 27%.\n\nTitle: Cost-Aware Scheduling for Multi-Agent LLM Pipelines\nAbstract: A scheduler that reduces average pipeline cost by 31% by routing simple sub-tasks to smaller models.",
    previewImagePath: "/marketplace-previews/research-digest-mailer.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-04",
  },
  {
    id: "standup-scheduler",
    name: "Team Standup Scheduler",
    category: "Communication",
    useCases: ["Scheduling", "Workflow Automation"],
    integrations: ["Slack", "Google Drive"],
    llmModel: "GPT-3.5",
    shortDescription: "Collects async standup updates and posts a rolled-up summary daily.",
    about:
      "A communication app where team members submit their daily standup update (yesterday/today/blockers) through a simple form, and the app posts an AI-rolled-up team summary highlighting shared blockers.",
    tags: ["communication", "standup", "team", "async"],
    prompt:
      "A team standup scheduler app where each member submits yesterday/today/blockers updates, and the app generates a rolled-up daily summary that groups shared blockers and flags anyone who hasn't submitted yet.",
    testDataFileName: "standup-updates.csv",
    testData:
      "name,yesterday,today,blockers\nPriya,Finished onboarding UI,Start QA pass,None\nCarlos,Debugged rate limiter,Pair with Tom on infra ticket,Waiting on infra access\nTom,Reviewed 3 PRs,Help Carlos on infra ticket,Waiting on infra access\nAyesha,Drafted release notes,Publish release notes page,None",
    previewImagePath: "/marketplace-previews/standup-scheduler.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-06",
  },
  {
    id: "contract-clause-extractor",
    name: "Contract Clause Extractor",
    category: "Data Processing",
    useCases: ["Data Analysis", "Reporting"],
    integrations: ["Google Drive", "Airtable"],
    llmModel: "Claude 3 Opus",
    shortDescription: "Extracts key clauses (term, fees, SLA, termination) from uploaded contracts.",
    about:
      "A legal-ops app that scans an uploaded contract and extracts a structured summary of key clauses (term length, fees, SLA commitments, termination conditions), flagging any clause that looks unusual versus a standard template.",
    tags: ["legal", "contracts", "extraction", "compliance"],
    prompt:
      "A contract clause extractor app that takes an uploaded contract document and produces a structured summary table of term length, fees, SLA commitments, and termination conditions, flagging any clause that deviates from a standard template.",
    testDataFileName: "sample-contract.txt",
    testData:
      "MASTER SERVICES AGREEMENT (excerpt)\nTerm: This agreement is effective for 24 months from the Effective Date and renews automatically for successive 12-month terms unless either party provides 45 days' written notice.\nFees: Client shall pay $9,500 monthly, due within 15 days of invoice (non-standard: most templates use net-30).\nSLA: Provider guarantees 99.5% uptime measured monthly; credits of 5% of monthly fee per 0.1% below threshold.\nTermination: Either party may terminate immediately for a security breach affecting Client data.",
    previewImagePath: "/marketplace-previews/contract-clause-extractor.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-08",
  },
  {
    id: "candidate-screener",
    name: "Resume Screening Assistant",
    category: "HR & Recruiting",
    useCases: ["Data Analysis", "Workflow Automation"],
    integrations: ["Google Drive", "Slack"],
    llmModel: "GPT-4",
    shortDescription: "Screens uploaded resumes against a job description and ranks candidates.",
    about:
      "A recruiting app that takes an uploaded job description and a batch of resumes, scores each candidate's fit with an explained rationale, and produces a ranked shortlist for the hiring manager.",
    tags: ["hr", "recruiting", "resume-screening", "ranking"],
    prompt:
      "A resume screening app that takes an uploaded job description and a batch of candidate resumes, scores each candidate 0-100 for fit with a written rationale, and outputs a ranked shortlist.",
    testDataFileName: "candidates.csv",
    testData:
      "name,years_experience,current_title,key_skills,notice_period_days\nJordan Alvarez,6,Senior Backend Engineer,\"Python, Postgres, AWS\",30\nMei Lin,3,Backend Engineer,\"Node.js, MongoDB\",15\nSam O'Connor,9,Staff Engineer,\"Python, Kubernetes, Kafka\",60\nRitika Sharma,4,Backend Engineer,\"Python, Postgres, Docker\",30",
    previewImagePath: "/marketplace-previews/candidate-screener.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-10",
  },
  {
    id: "churn-risk-detector",
    name: "Customer Churn Risk Detector",
    category: "Analytics & Insights",
    useCases: ["Data Analysis", "Reporting"],
    integrations: ["Salesforce", "Stripe"],
    llmModel: "GPT-4o",
    shortDescription: "Flags at-risk accounts from usage/billing data and suggests retention actions.",
    about:
      "A customer success app that ingests uploaded account usage and billing data, flags accounts showing churn-risk signals (declining usage, late payments, support escalations), and suggests a tailored retention action per account.",
    tags: ["customer-success", "churn", "retention", "analytics"],
    prompt:
      "A churn risk detector app that takes uploaded account usage and billing data, flags accounts with declining usage or payment issues as at-risk, and suggests a specific retention action per flagged account.",
    testDataFileName: "account-usage.csv",
    testData:
      "account,monthly_active_users,logins_last_30d,mrr,payment_status,last_login\nAcme Retail,42,180,2400,current,2026-07-25\nNorthgate Logistics,8,12,1800,overdue,2026-07-05\nBlueSky Media,15,20,900,current,2026-07-24\nOrbit Health,30,5,3200,overdue,2026-06-30",
    previewImagePath: "/marketplace-previews/churn-risk-detector.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-12",
  },
  {
    id: "faq-widget-builder",
    name: "Website FAQ Widget Builder",
    category: "Customer Support",
    useCases: ["Customer Engagement", "Content Creation"],
    integrations: ["Zendesk", "Notion"],
    llmModel: "GPT-4o Mini",
    shortDescription: "Turns an uploaded help-center export into a searchable FAQ widget.",
    about:
      "A support-content app that takes an uploaded help-center article export, organizes it into categorized FAQ entries, and generates a searchable widget preview ready to embed on a marketing site.",
    tags: ["support", "faq", "content", "widget"],
    prompt:
      "A website FAQ widget builder app that takes an uploaded help-center article export, organizes entries into categories, and renders a searchable FAQ widget preview with expandable answers.",
    testDataFileName: "help-articles.txt",
    testData:
      "Q: How do I reset my password?\nA: Go to Settings > Account > Reset Password. A reset link is emailed within 5 minutes.\n\nQ: Can I change my billing cycle?\nA: Yes, from Settings > Billing you can switch between monthly and annual billing at any time; changes apply next cycle.\n\nQ: Is there a free trial?\nA: Yes, all plans include a 14-day free trial, no credit card required.\n\nQ: How do I export my data?\nA: Settings > Data > Export All generates a CSV download within a few minutes.",
    previewImagePath: "/marketplace-previews/faq-widget-builder.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-14",
  },
  {
    id: "business-analysis-consultant",
    name: "Business Analysis Consultant",
    category: "Analytics & Insights",
    useCases: ["Data Analysis", "Reporting"],
    integrations: ["Google Drive", "Airtable"],
    llmModel: "GPT-4",
    shortDescription: "Turns a short business intake form into a full multi-agent consulting report.",
    about:
      "A multi-agent business consulting app: the user fills in a short intake form about their company, and a manager agent orchestrates strategy, market/finance, and growth sub-agents to produce a complete report (executive summary, SWOT, market & financial notes, and a 4-week growth plan), saved to a running Reports list.",
    tags: ["consulting", "business-analysis", "multi-agent", "strategy"],
    prompt:
      "A business analysis consultant app with: (1) a Home dashboard showing Total Analyses, Reports Saved, and Latest Industry stat cards plus a Recent Analyses list with a 'Start New Analysis' call to action; (2) a New Analysis page with a multi-section intake form (Company Basics: business name, industry, business stage; Team & Revenue: team size, monthly revenue range; Audience & Goals: target audience, current challenges, goals) with a form-completion progress bar; (3) a Reports page listing saved past analyses with a 'New Analysis' shortcut; (4) a Settings page showing workspace name/logo fields and a read-only Agents section listing the orchestration agents (Manager Agent - orchestrates business analysis; Strategy Sub-Agent - executive summary, SWOT, personas; Market & Finance Sub-Agent - marketing, sales, revenue, costs; Growth Sub-Agent - AI tools and a 4-week growth plan), each shown as Active. Submitting the intake form generates a full structured consulting report (executive summary, SWOT, market & finance notes, 4-week growth plan) and saves it to Reports.",
    testDataFileName: "sample-business-intake.txt",
    testData:
      "Business Name: Acme Analytics Co.\nIndustry: B2B SaaS - Data Analytics\nBusiness Stage: Early revenue (seed funded)\nTeam Size: 12\nMonthly Revenue: $15,000 - $50,000\nTarget Audience: Series A startups in North America with 20-200 employees\nCurrent Challenges: Long sales cycles, low trial-to-paid conversion (8%), and inconsistent onboarding leading to early churn.\nGoals (next 90 days): Raise trial-to-paid conversion above 15%, cut onboarding time from 3 weeks to 1 week, and close 5 new logo deals.",
    previewImagePath: "/marketplace-previews/business-analysis-consultant.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-28",
  },
  {
    id: "pitch-deck-panel",
    name: "Pitch Deck Review Panel",
    category: "Analytics & Insights",
    useCases: ["Data Analysis", "Reporting"],
    integrations: ["Google Drive", "Airtable"],
    llmModel: "GPT-4",
    shortDescription: "Multiple reviewer personas debate an uploaded pitch deck and return a verdict.",
    about:
      "An investor-readiness app where an uploaded pitch deck is reviewed by several AI reviewer personas (market skeptic, product champion, financial analyst, ops realist), each posting a short take, before a moderator agent renders a final Go / Pass / Follow-up verdict with reasoning.",
    tags: ["fundraising", "pitch-deck", "multi-agent", "investing"],
    prompt:
      "A pitch deck review panel app: user uploads a pitch deck summary, and four reviewer-persona agents (market skeptic, product champion, financial analyst, ops realist) each post a short critique, then a moderator agent renders a final Go / Pass / Follow-up verdict with a one-paragraph rationale citing which reviewers agreed or disagreed.",
    testDataFileName: "pitch-deck-summary.txt",
    testData:
      "Company: FieldSync -- field service scheduling software for HVAC/plumbing SMBs.\nProblem: SMB field service teams lose 2-3 hours/week on manual dispatch and double-booking.\nTraction: 40 paying customers, $9k MRR, 6% monthly churn.\nAsk: $750k seed at $6M post-money, 18-month runway to $50k MRR.\nTeam: 2 co-founders, ex-ServiceTitan engineers, first-time founders.\nCompetition: ServiceTitan (enterprise-focused), Jobber (broader SMB, less scheduling depth).",
    previewImagePath: "/marketplace-previews/pitch-deck-panel.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-28",
  },
  {
    id: "csv-insight-narrator",
    name: "CSV Insight Narrator",
    category: "Analytics & Insights",
    useCases: ["Data Analysis", "Reporting"],
    integrations: ["Google Drive", "Airtable"],
    llmModel: "GPT-4o",
    shortDescription: "Upload any CSV and get charts, anomaly flags, and a plain-English narrative.",
    about:
      "A general-purpose data analysis app: upload any CSV, and it auto-detects column types, renders relevant charts, flags statistical anomalies (outliers, sudden trend breaks), and writes a short plain-English narrative summarizing what the data shows -- no SQL or setup required.",
    tags: ["analytics", "csv", "anomaly-detection", "no-code"],
    prompt:
      "A CSV insight narrator app where a user uploads any CSV file, the app auto-detects column types, renders appropriate charts (trend lines for time series, bar charts for categories), flags rows that look like statistical anomalies or outliers, and writes a short plain-English narrative summarizing the key patterns and any anomalies found.",
    testDataFileName: "weekly-metrics.csv",
    testData:
      "week,signups,activated_users,revenue,support_tickets\n2026-06-01,320,210,18400,42\n2026-06-08,305,198,17650,39\n2026-06-15,298,190,17200,201\n2026-06-22,340,225,19800,45\n2026-06-29,355,240,20600,50",
    previewImagePath: "/marketplace-previews/csv-insight-narrator.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-28",
  },
  {
    id: "decision-bias-auditor",
    name: "Decision Bias Auditor",
    category: "Analytics & Insights",
    useCases: ["Data Analysis", "Reporting"],
    integrations: ["Notion", "Airtable"],
    llmModel: "Claude 3 Sonnet",
    shortDescription: "Reviews a log of past decisions and flags recurring cognitive biases.",
    about:
      "A reflection tool for teams and individuals: upload a log of past decisions (what was decided, why, and the outcome), and it identifies recurring cognitive biases (sunk cost, confirmation bias, anchoring, optimism bias), surfaces patterns across the log, and suggests one concrete process change to reduce repeat mistakes.",
    tags: ["decision-making", "bias", "reflection", "process-improvement"],
    prompt:
      "A decision bias auditor app that takes an uploaded log of past decisions (decision, reasoning, outcome), identifies which cognitive biases appear to have influenced each one (sunk cost, confirmation bias, anchoring, optimism bias), highlights recurring patterns across the whole log, and suggests one concrete process change to reduce repeat mistakes.",
    testDataFileName: "decision-log.csv",
    testData:
      "date,decision,reasoning,outcome\n2026-03-10,Kept underperforming vendor for another quarter,\"We've already invested 6 months integrating them\",Missed SLA again, switched in Q3 anyway\n2026-04-02,Launched feature without user testing,\"Team was confident it would land well\",Adoption was 4% vs 25% projected\n2026-05-20,Doubled ad spend on underperforming channel,\"Results will surely improve with more volume\",ROAS stayed flat, budget wasted\n2026-06-15,Delayed a hire because current team said they could manage,\"They've handled worse before\",Team burned out, two resignations",
    previewImagePath: "/marketplace-previews/decision-bias-auditor.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-28",
  },
  {
    id: "investment-memo-generator",
    name: "Investment Due Diligence Memo",
    category: "Finance & Accounting",
    useCases: ["Data Analysis", "Reporting"],
    integrations: ["Google Drive", "Airtable"],
    llmModel: "GPT-4",
    shortDescription: "Turns pitch materials and competitor notes into a structured investment memo.",
    about:
      "A due-diligence assistant for investors: upload a company's pitch summary plus a few competitor notes, and it generates a structured investment memo (opportunity, team, market, competition, risks) with a 1-5 risk score and a recommendation to proceed, pass, or request more information.",
    tags: ["investing", "due-diligence", "memo", "risk-scoring"],
    prompt:
      "An investment due diligence memo app that takes an uploaded pitch summary and competitor notes, and generates a structured investment memo with sections for opportunity, team, market size, competitive landscape, and key risks, ending with a 1-5 risk score and a proceed/pass/request-more-info recommendation.",
    testDataFileName: "diligence-notes.txt",
    testData:
      "Target company: FieldSync (field service scheduling SaaS)\nCompetitor notes:\n- ServiceTitan: enterprise-focused, $100M+ ARR, weak SMB pricing\n- Jobber: broad SMB tool, less scheduling depth, $50/mo entry price\n- Housecall Pro: similar SMB focus, strong marketing, weaker integrations\nFinancials shared: $9k MRR, 6% monthly churn, 40 customers, $750k ask at $6M post-money.\nTeam notes: 2 first-time founders, strong technical background, no prior exits.",
    previewImagePath: "/marketplace-previews/investment-memo-generator.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-28",
  },
  {
    id: "incident-response-coordinator",
    name: "Incident Response Coordinator",
    category: "Developer Tools",
    useCases: ["Workflow Automation", "Reporting"],
    integrations: ["Slack", "Jira"],
    llmModel: "GPT-4o",
    shortDescription: "Turns a raw incident description into a structured response plan.",
    about:
      "An SRE/on-call support app: describe an incident (outage, server failure, security alert) as it's happening, and it generates a structured response plan (likely root causes to check first, immediate mitigation steps, who to page, and a draft customer-facing status update), then compiles a postmortem outline once resolved.",
    tags: ["incident-response", "sre", "on-call", "postmortem"],
    prompt:
      "An incident response coordinator app where an on-call engineer describes an incident in plain text, and the app generates a structured response plan (likely root causes to check first, immediate mitigation steps, who on the team to page based on the affected system, and a draft customer-facing status update), plus a postmortem outline template once the incident is marked resolved.",
    testDataFileName: "incident-report.txt",
    testData:
      "Incident: API error rate spiked to 22% starting 14:05 UTC. Affects /api/v2/orders and /api/v2/payments endpoints. Database CPU is at 95%. No recent deploys in the last 6 hours. Traffic volume is normal, not a spike. Started right after a scheduled nightly backup job kicked off at 14:00 UTC.",
    previewImagePath: "/marketplace-previews/incident-response-coordinator.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-28",
  },
  {
    id: "pr-review-scorecard",
    name: "PR Review Scorecard",
    category: "Developer Tools",
    useCases: ["Workflow Automation", "Reporting"],
    integrations: ["GitHub", "Jira"],
    llmModel: "Claude 3 Sonnet",
    shortDescription: "Scores an uploaded PR diff on security, performance, and test coverage.",
    about:
      "A code review app that goes beyond a single pass/fail: an uploaded pull-request diff is analyzed for security issues, performance concerns, and test coverage gaps, then scored on each dimension with an overall Merge Confidence Score and suggested fix snippets for the top issues found.",
    tags: ["devtools", "code-review", "ci", "quality"],
    prompt:
      "A PR review scorecard app that takes an uploaded pull-request diff, scores it on security, performance, and test coverage (each 0-100), computes an overall Merge Confidence Score, and lists the top 3 issues found with a suggested fix snippet for each.",
    testDataFileName: "feature-branch.diff",
    testData:
      "--- a/src/api/payments.ts\n+++ b/src/api/payments.ts\n@@ -10,8 +10,15 @@\n export async function chargeCard(req, res) {\n-  const amount = req.body.amount;\n-  const card = req.body.card;\n+  const amount = req.body.amount;\n+  const card = req.body.card;\n+  // TODO: validate amount is positive before charging\n   const result = await stripe.charges.create({ amount, source: card });\n+  console.log('charge result', result); // debug log, remove before merge\n   res.json(result);\n }\n+\n+// no new tests added for this endpoint",
    previewImagePath: "/marketplace-previews/pr-review-scorecard.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-28",
  },
  {
    id: "pr-doc-sync",
    name: "PR-to-Docs Sync Assistant",
    category: "Developer Tools",
    useCases: ["Content Creation", "Workflow Automation"],
    integrations: ["GitHub", "Notion"],
    llmModel: "GPT-4o Mini",
    shortDescription: "Turns a batch of merged PR diffs into structured, publish-ready documentation updates.",
    about:
      "A docs-automation app for engineering teams: upload a batch of merged PR titles and diffs, and it drafts the corresponding documentation updates (API reference changes, changelog entries, migration notes) in a structured format ready to paste into a docs site.",
    tags: ["documentation", "devtools", "automation", "changelog"],
    prompt:
      "A PR-to-docs sync assistant app that takes an uploaded batch of merged PR titles and diffs, and drafts structured documentation updates: an API reference change summary, a changelog entry, and migration notes for anything breaking, ready to paste into a docs site.",
    testDataFileName: "merged-prs.diff",
    testData:
      "PR #501: Add `sortBy` query param to GET /api/v2/orders (defaults to created_at desc)\n--- a/src/routes/orders.ts\n+++ b/src/routes/orders.ts\n@@ -3,6 +3,7 @@\n router.get('/orders', (req, res) => {\n+  const sortBy = req.query.sortBy || 'created_at';\n   ...\n });\n\nPR #504: BREAKING - rename `customer_id` to `account_id` in POST /api/v2/invoices\n--- a/src/routes/invoices.ts\n+++ b/src/routes/invoices.ts\n@@ -12,7 +12,7 @@\n-  const { customer_id, amount } = req.body;\n+  const { account_id, amount } = req.body;",
    previewImagePath: "/marketplace-previews/pr-doc-sync.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-28",
  },
  {
    id: "project-health-tracker",
    name: "GitHub Project Health Tracker",
    category: "Developer Tools",
    useCases: ["Task Management", "Reporting"],
    integrations: ["GitHub", "Slack"],
    llmModel: "GPT-4o Mini",
    shortDescription: "Reviews an uploaded issue/PR export and flags stale or at-risk project work.",
    about:
      "A lightweight project-health app for engineering managers and academic project leads: upload an export of open issues and PRs, and it flags items that are stale, unassigned, or approaching a deadline, and drafts a short weekly status summary highlighting what needs attention.",
    tags: ["project-management", "github", "reporting", "status"],
    prompt:
      "A GitHub project health tracker app that takes an uploaded export of open issues and pull requests (title, assignee, status, last updated, due date), flags items that are stale, unassigned, or approaching their deadline, and drafts a short weekly status summary highlighting what needs attention.",
    testDataFileName: "issues-export.csv",
    testData:
      "id,title,assignee,status,last_updated,due_date\n#88,Fix pagination bug in search results,unassigned,open,2026-06-10,2026-07-01\n#91,Add dark mode support,priya,in-progress,2026-07-20,2026-08-05\n#93,Upgrade dependency for security patch,unassigned,open,2026-07-25,2026-07-26\n#95,Write onboarding docs,carlos,in-progress,2026-07-22,2026-08-15",
    previewImagePath: "/marketplace-previews/project-health-tracker.png",
    hasPreview: false,
    createdBy: "AgentForge Team",
    publishedDate: "2026-07-28",
  },
];
