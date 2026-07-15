import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Prompt {
  category: string;
  title: string;
  description: string;
  prompt: string;
  tools: string[];
  complexity: "Starter" | "Intermediate" | "Advanced";
  sampleFile?: { name: string; url: string };
}

const PROMPTS: Prompt[] = [
  // ── General ──────────────────────────────────────────────────────────────
  {
    category: "General",
    title: "LLM Council",
    description: "Pressure-test any decision with 5 AI advisors who challenge, expand, and peer-review each other before a chairman delivers a structured verdict — with file upload, history dashboard, and Excel/PPT export.",
    prompt: `Build 'The Council' — a decision intelligence app where a user submits a question and context, and 5 specialized advisors (Contrarian, First Principles, Expansionist, Outsider, Executor) weigh in, peer-review each other blind, and a chairman returns a structured verdict with alignment matrix and recommendation.

AI agents:
1. CouncilOrchestrator — Receives the decision input, fans out to all 5 advisor agents in parallel, collects responses, triggers blind peer-review pass, then calls ChairmanAgent to synthesize the final verdict.
2. AdvisorAgent (x5 personas) — Each advisor analyzes the question from their unique lens and returns structured reasoning: key insights, risks, assumptions, and recommendation.
3. PeerReviewAgent — Each advisor blindly critiques anonymized responses from the other 4 advisors: agreement level, critique, what was missed.
4. ChairmanAgent — Synthesizes all advisor outputs and peer reviews into a final verdict: recommendation, alignment matrix, key tensions, tradeoffs, next steps, and confidence score (0–100).

Pages:
1. Decision Intake — Form with fields: Decision Title, Question (required), Context, Constraints, Stakes. Submit triggers the full advisor pipeline with live progress indicator (Intake → Advisor 1..5 → Peer Review → Chairman Verdict).
2. Verdict View — Full structured results page: each advisor panel (expandable), peer review matrix, chairman verdict with alignment score chart, recommendation highlighted, next steps list.
3. Decision History — Live list from the database (NOT hardcoded). Shows: title, question excerpt, confidence score badge, tags, date, status (running/completed). Searchable and filterable by tag.
4. Comparison View — Select 2–3 past decisions side by side: alignment scores, recommendation summaries, advisor agreement patterns.
5. Export Page — Export any completed decision verdict to Excel (.xlsx) with one sheet per advisor + a Summary sheet, or to PowerPoint (.pptx) with one slide per advisor + a Chairman Verdict slide. File downloads immediately in the browser.

Upload: On the Decision Intake page, add an "Upload context file" button that accepts .xlsx, .csv, .pdf, .docx, and .txt. Parsed content pre-fills the Context field. For .xlsx/.csv with multiple rows (batch mode), show a row selector so the user can pick which row to run as a decision.

UI: Slate-800 sidebar with nav icons. Rich results page with color-coded advisor cards (one color per persona). Alignment matrix as a visual grid. Chairman verdict in a prominent highlighted box. Progress stepper visible while the pipeline runs.

Database: Persist every decision run with full advisor outputs, peer reviews, verdict, tags, confidence score, and timestamps. History page reads live from the DB.`,
    tools: ["File Upload", "Excel Export", "PPT Export"],
    complexity: "Advanced",
    sampleFile: { name: "council-sample-decisions.xlsx", url: "/council-sample-decisions.xlsx" },
  },
  {
    category: "General",
    title: "Deep Research Assistant",
    description: "Search the web, synthesize information from multiple sources, and produce comprehensive reports with citations on any topic.",
    prompt: "Build a research assistant agent that can search the web, synthesize information from multiple sources, and provide comprehensive reports with citations on any given topic.",
    tools: ["Web Search", "RAG", "PDF Parser"],
    complexity: "Intermediate",
  },
  {
    category: "General",
    title: "Project Manager",
    description: "Break down complex goals into actionable tasks, assign deadlines, and track progress through daily check-ins.",
    prompt: "Build a project management agent that helps break down complex goals into actionable tasks, assigns deadlines, and tracks progress updates through daily check-ins.",
    tools: ["Calendar", "Email", "Slack"],
    complexity: "Intermediate",
  },
  {
    category: "General",
    title: "Voice AI Receptionist",
    description: "Answer inbound calls, respond to FAQs about your business, book appointments on Google Calendar, and transfer to a human when needed.",
    prompt: "Build a voice AI receptionist that answers inbound calls, responds to FAQs about my business, books appointments on Google Calendar, and transfers to a human when needed.",
    tools: ["Calendar", "Knowledge Base", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "General",
    title: "Career Advisor Chatbot",
    description: "Review skills and experience, generate personalized career roadmaps, suggest skill gaps to fill, and provide mock interview practice.",
    prompt: "Build a career advisor agent that reviews a user's skills and experience, generates personalized career roadmaps, suggests skill gaps to fill, and provides mock interview practice.",
    tools: ["RAG", "Web Search"],
    complexity: "Starter",
  },
  {
    category: "General",
    title: "Knowledge Base Q&A Bot",
    description: "Ingest company documents, PDFs, and wiki pages, then answer employee questions accurately with source references.",
    prompt: `Build a Knowledge Base Q&A agent that answers employee questions from company documents.

AI agents:
1. Ingestion Agent — Accepts PDF, DOCX, TXT, and web URLs. Chunks documents, generates embeddings, and stores them in a vector database. Tracks document metadata (source, date, owner).
2. Retrieval & Answer Agent — Takes a user question, retrieves the top-k most relevant chunks via semantic search, synthesizes a grounded answer, and returns source references with page/section citations.
3. Confidence & Escalation Agent — Scores answer confidence. If below threshold, flags the response and offers to escalate to a human or suggest related documents.

Pages:
1. Document Library — Upload and manage knowledge sources. Show ingestion status (pending/processing/ready). Preview extracted text. Delete or re-ingest documents.
2. Chat Interface — Conversational Q&A with source citations shown inline. Each answer links back to the source document and highlights the relevant passage.
3. Analytics — Most-asked questions, unanswered queries, top documents by retrieval frequency.

UI: Clean sidebar with document list on the left, chat on the right. Citations appear as numbered footnotes below each answer. Sources expand on click to show the exact passage.

Sample data: Pre-load with 3 sample company documents (HR Policy, IT Security Guidelines, Benefits Guide) so the agent is ready to answer questions immediately.`,
    tools: ["RAG", "Knowledge Base", "PDF Parser"],
    complexity: "Starter",
  },
  // ── Marketing ─────────────────────────────────────────────────────────────
  {
    category: "Marketing",
    title: "Content Marketing Team",
    description: "Write blog posts, create social media content, perform SEO analysis, and generate graphics for your brand.",
    prompt: "Build a marketing team of agents that can write blog posts, create social media content, perform SEO analysis, and generate graphics for my brand.",
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Marketing",
    title: "Competitor Analysis Agent",
    description: "Monitor competitors' websites, social media, and news mentions to provide weekly strategic reports.",
    prompt: "Build a competitor analysis agent that monitors my competitors' websites, social media, and news mentions to provide weekly strategic reports.",
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Marketing",
    title: "SEO Content Optimizer",
    description: "Audit website content, identify keyword opportunities, and generate optimized meta titles, descriptions, and internal linking suggestions.",
    prompt: "Build an SEO agent that audits my website content, identifies keyword opportunities, generates optimized meta titles and descriptions, and suggests internal linking improvements.",
    tools: ["Web Search", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Marketing",
    title: "Newsletter Intelligence Hub",
    description: "Monitor industry news daily, curate top stories, draft a polished newsletter edition, and publish it on schedule.",
    prompt: "Build an automated newsletter agent that monitors industry news daily, curates the top stories, drafts a polished newsletter edition, and publishes it on schedule.",
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Marketing",
    title: "Social Media Manager",
    description: "Generate a week's worth of platform-specific posts for LinkedIn, Twitter, and Instagram with hashtags and optimal posting times.",
    prompt: "Build a social media agent that generates a week's worth of platform-specific posts for LinkedIn, Twitter, and Instagram, complete with hashtags, captions, and optimal posting times.",
    tools: ["Web Search", "Webhook"],
    complexity: "Starter",
  },
  // ── Sales ─────────────────────────────────────────────────────────────────
  {
    category: "Sales",
    title: "Sales Outreach Specialist",
    description: "Find leads on LinkedIn, enrich their data, and draft personalized cold emails based on their recent activity.",
    prompt: "Build a sales outreach agent that can find leads on LinkedIn, enrich their data, and draft personalized cold emails based on their recent activity.",
    tools: ["Web Search", "Email", "CRM"],
    complexity: "Intermediate",
  },
  {
    category: "Sales",
    title: "CRM Data Manager",
    description: "Automatically update deal stages, log communications, and flag stale leads in your CRM.",
    prompt: "Build a CRM management agent that automatically updates deal stages, logs communications, and flags stale leads in my CRM.",
    tools: ["CRM", "Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Sales",
    title: "Product Recommendation Agent",
    description: "Take a customer's budget and requirements, then suggest optimal product bundles and upsell opportunities.",
    prompt: "Build a product recommendation agent that takes a customer's budget and requirements, then suggests optimal product bundles and upsell opportunities to maximize deal value.",
    tools: ["RAG", "CRM", "Webhook"],
    complexity: "Starter",
  },
  {
    category: "Sales",
    title: "Lead Scoring & Qualification",
    description: "Analyze incoming leads, score them based on engagement and fit, and route high-intent leads to sales reps instantly.",
    prompt: "Build a lead scoring agent that analyzes incoming leads from my website and email campaigns, scores them based on engagement and fit, and routes high-intent leads to sales reps instantly.",
    tools: ["CRM", "Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Sales",
    title: "Proposal & Quote Generator",
    description: "Take deal context and client requirements, then produce a polished sales proposal with pricing, timeline, and scope of work.",
    prompt: "Build a proposal generation agent that takes deal context and client requirements, then produces a polished sales proposal with pricing, timeline, and scope of work.",
    tools: ["RAG", "CRM", "Email"],
    complexity: "Intermediate",
  },
  // ── Legal ─────────────────────────────────────────────────────────────────
  {
    category: "Legal",
    title: "Contract Review Assistant",
    description: "Review contracts, highlight potential risks, summarize key clauses, and suggest redlines based on standard legal playbooks.",
    prompt: "Build a legal assistant agent that reviews contracts, highlights potential risks, summarizes key clauses, and suggests redlines based on standard legal playbooks.",
    tools: ["RAG", "PDF Parser", "Email"],
    complexity: "Advanced",
  },
  {
    category: "Legal",
    title: "Compliance Monitor",
    description: "Track changes in regulations relevant to your industry and alert you to potential compliance gaps in current policies.",
    prompt: "Build a compliance monitoring agent that tracks changes in regulations relevant to my industry and alerts me to potential compliance gaps in our current policies.",
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Legal",
    title: "NDA Workflow Manager",
    description: "Draft NDAs from templates, route them for approval, track signing status, and maintain a centralized repository.",
    prompt: "Build an NDA management agent that drafts NDAs from templates, routes them for approval, tracks signing status, sends reminders for expiring agreements, and maintains a centralized repository.",
    tools: ["Email", "Webhook", "PDF Parser"],
    complexity: "Intermediate",
  },
  {
    category: "Legal",
    title: "Policy Document Analyzer",
    description: "Ingest company policies and regulatory documents, then answer natural language questions about obligations and rights.",
    prompt: "Build a policy analysis agent that ingests company policies, employment agreements, and regulatory documents, then answers natural language questions about obligations and rights.",
    tools: ["RAG", "Knowledge Base", "PDF Parser"],
    complexity: "Starter",
  },
  {
    category: "Legal",
    title: "IP & Trademark Watcher",
    description: "Track new trademark filings, patent publications, and domain registrations related to your brand and alert on potential infringements.",
    prompt: "Build an intellectual property monitoring agent that tracks new trademark filings, patent publications, and domain registrations related to my brand and alerts me to potential infringements.",
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Advanced",
  },
  // ── HR ────────────────────────────────────────────────────────────────────
  {
    category: "HR",
    title: "AI Recruiter",
    description: "Screen incoming resumes against job descriptions, rank candidates, and automatically coordinate interview schedules.",
    prompt: "Build a recruitment agent that screens incoming resumes against job descriptions, ranks candidates, and automatically coordinates interview schedules with hiring managers.",
    tools: ["Email", "Calendar", "PDF Parser"],
    complexity: "Intermediate",
  },
  {
    category: "HR",
    title: "Employee Onboarding Buddy",
    description: "Guide new employees through paperwork, answer common policy questions, and schedule introductory meetings with key team members.",
    prompt: "Build an HR onboarding agent that guides new employees through paperwork, answers common policy questions, and schedules introductory meetings with key team members.",
    tools: ["Knowledge Base", "Email", "Calendar"],
    complexity: "Starter",
  },
  {
    category: "HR",
    title: "Resume Parser & Standardizer",
    description: "Accept PDF or Word resumes, extract key fields like skills, experience, and education, and output standardized JSON profiles for your ATS.",
    prompt: "Build a resume parsing agent that accepts PDF or Word resumes, extracts key fields like skills, experience, and education, and outputs standardized JSON profiles ready for my ATS.",
    tools: ["PDF Parser", "Email", "Webhook"],
    complexity: "Starter",
  },
  {
    category: "HR",
    title: "Employee Engagement Pulse",
    description: "Send periodic pulse surveys, analyze sentiment trends across teams, and recommend actionable steps to improve workplace satisfaction.",
    prompt: "Build an employee engagement agent that sends periodic pulse surveys, analyzes sentiment trends across teams, and recommends actionable steps to improve workplace satisfaction.",
    tools: ["Email", "Slack", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "HR",
    title: "Performance Review Assistant",
    description: "Collect peer feedback, summarize key themes for each employee, and draft balanced review narratives that managers can refine and approve.",
    prompt: "Build a performance review agent that collects peer feedback, summarizes key themes for each employee, and drafts balanced review narratives that managers can refine and approve.",
    tools: ["Email", "Slack", "Knowledge Base"],
    complexity: "Intermediate",
  },
  // ── Support ───────────────────────────────────────────────────────────────
  {
    category: "Support",
    title: "Omni-channel Support",
    description: "Handle inquiries from email, website chat, and Twitter, resolving common issues and escalating complex ones.",
    prompt: `Build an omni-channel customer support agent that handles inquiries from email, website chat, and social media.

AI agents:
1. Intake & Classifier Agent — Monitors email inbox, live chat widget, and Twitter/X mentions. Classifies each inquiry by channel, category (billing, technical, general), urgency (P1–P3), and sentiment.
2. Resolution Agent — Searches the knowledge base using RAG to find the best answer. Resolves common issues automatically with templated + personalized responses. Handles multi-turn conversations.
3. Escalation & Routing Agent — When the Resolution Agent cannot resolve with ≥80% confidence, routes to the right human team with full context, conversation history, and suggested next steps.
4. Quality & Analytics Agent — Scores every resolved ticket for accuracy and tone. Generates weekly reports on resolution rate, CSAT, escalation rate, and top issue categories.

Pages:
1. Unified Inbox — All channels in one view. Filter by channel, status, priority, assignee. Bulk actions (assign, close, escalate).
2. Conversation View — Full thread with AI-suggested replies the agent can send or edit. Customer history panel on the right. One-click escalate with auto-generated handoff summary.
3. Knowledge Base Manager — Add/edit/delete articles. See which articles are most retrieved. Flag gaps based on unanswered queries.
4. Analytics Dashboard — Resolution rate, first-response time, CSAT score, escalation rate, volume by channel and category. Weekly trend charts.

UI: Familiar helpdesk layout similar to Intercom/Zendesk. Dark sidebar, white conversation area. AI suggestions appear as light blue bubbles the agent can accept with one click.

Sample data: Pre-populate with 10 sample support tickets across all three channels showing different resolution states.`,
    tools: ["RAG", "Knowledge Base", "Email", "Slack"],
    complexity: "Advanced",
  },
  {
    category: "Support",
    title: "User Onboarding Guide",
    description: "Monitor new user activity and send proactive tips and tutorials when they seem stuck or inactive.",
    prompt: "Build a user onboarding agent that monitors new user activity and sends proactive tips and tutorials when they seem stuck or inactive.",
    tools: ["Email", "Slack", "Webhook"],
    complexity: "Starter",
  },
  {
    category: "Support",
    title: "Voice Customer Support",
    description: "Handle inbound customer calls, triage issues through guided conversation, resolve common problems, and create tickets for complex cases.",
    prompt: "Build a voice support agent that handles inbound customer calls, triages issues through guided conversation, resolves common problems, and creates tickets for complex cases.",
    tools: ["Knowledge Base", "Webhook", "Email"],
    complexity: "Advanced",
  },
  {
    category: "Support",
    title: "Ticket Triage & Routing",
    description: "Read incoming support tickets, classify by category and urgency, assign to the right team, and send an instant acknowledgment to the customer.",
    prompt: "Build a ticket triage agent that reads incoming support tickets, classifies them by category and urgency, assigns them to the right team, and sends an instant acknowledgment to the customer.",
    tools: ["Email", "Slack", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Support",
    title: "Self-Serve FAQ Builder",
    description: "Analyze past support conversations, identify the most common questions, and auto-generate help center articles with step-by-step solutions.",
    prompt: "Build an FAQ agent that analyzes past support conversations, identifies the most common questions, and auto-generates help center articles with step-by-step solutions.",
    tools: ["RAG", "Knowledge Base", "Webhook"],
    complexity: "Intermediate",
  },
  // ── Productivity ──────────────────────────────────────────────────────────
  {
    category: "Productivity",
    title: "Executive Meeting Assistant",
    description: "Review your calendar, prepare briefing notes for upcoming meetings, and draft follow-up emails based on meeting transcripts.",
    prompt: "Build a meeting assistant agent that reviews my calendar, prepares briefing notes for upcoming meetings, and drafts follow-up emails based on meeting transcripts.",
    tools: ["Calendar", "Email", "Slack"],
    complexity: "Starter",
  },
  {
    category: "Productivity",
    title: "Email Triage & Drafter",
    description: "Categorize incoming emails by urgency, draft responses for routine inquiries, and summarize long threads.",
    prompt: "Build an email triage agent that categorizes incoming emails by urgency, drafts responses for routine inquiries, and summarizes long threads.",
    tools: ["Email", "Slack"],
    complexity: "Starter",
  },
  {
    category: "Productivity",
    title: "Team Calendar Coordinator",
    description: "Check availability across team members, suggest optimal meeting times, send invites, and prevent double-bookings automatically.",
    prompt: "Build a calendar coordination agent that checks availability across team members, suggests optimal meeting times, sends invites, and prevents double-bookings automatically.",
    tools: ["Calendar", "Email", "Slack"],
    complexity: "Starter",
  },
  {
    category: "Productivity",
    title: "Morning Briefing Agent",
    description: "Compile calendar events, pending tasks, priority emails, and relevant industry news into a concise morning digest delivered at 8 AM.",
    prompt: "Build a daily briefing agent that compiles my calendar events, pending tasks, unread priority emails, and relevant industry news into a concise morning digest delivered at 8 AM.",
    tools: ["Calendar", "Email", "Web Search"],
    complexity: "Starter",
  },
  {
    category: "Productivity",
    title: "Notion Workspace Automator",
    description: "Capture action items from Slack conversations and meeting notes, create tasks in Notion, and send reminders before deadlines.",
    prompt: "Build a Notion automation agent that captures action items from Slack conversations and meeting notes, creates tasks in my Notion workspace, and sends reminders before deadlines.",
    tools: ["Slack", "Webhook", "Calendar"],
    complexity: "Intermediate",
  },
  // ── Development ───────────────────────────────────────────────────────────
  {
    category: "Development",
    title: "Automated Code Reviewer",
    description: "Analyze pull requests for security vulnerabilities, performance issues, and adherence to your style guide.",
    prompt: "Build a code review agent that analyzes pull requests for security vulnerabilities, performance issues, and adherence to our style guide.",
    tools: ["GitHub", "Webhook", "Slack"],
    complexity: "Advanced",
  },
  {
    category: "Development",
    title: "Documentation Generator",
    description: "Watch your codebase and automatically update API documentation and README files when code changes are merged.",
    prompt: "Build a documentation agent that watches my codebase and automatically updates the API documentation and README files when code changes are merged.",
    tools: ["GitHub", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Development",
    title: "API Documentation Assistant",
    description: "Connect to your GitHub repo, analyze endpoints and schemas, and generate developer-friendly documentation with request/response examples.",
    prompt: "Build an API docs agent that connects to my GitHub repo, analyzes endpoints and schemas, and generates developer-friendly documentation with request/response examples and edge cases.",
    tools: ["GitHub", "RAG", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Development",
    title: "Bug Triage Agent",
    description: "Read incoming GitHub issues, classify severity and affected component, suggest root causes, and assign to the right developer.",
    prompt: "Build a bug triage agent that reads incoming GitHub issues, classifies severity and affected component, suggests potential root causes from the codebase, and assigns to the right developer.",
    tools: ["GitHub", "Slack", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Development",
    title: "Release Notes Generator",
    description: "Analyze merged PRs and commits since the last release, categorize changes by type, and generate a polished changelog for users.",
    prompt: "Build a release notes agent that analyzes merged PRs and commits since the last release, categorizes changes by type, and generates a polished changelog for users.",
    tools: ["GitHub", "Slack", "Email"],
    complexity: "Starter",
  },
  // ── Analysts ──────────────────────────────────────────────────────────────
  {
    category: "Analysts",
    title: "Vendor Comparison Scorecard",
    description: "Define evaluation criteria with custom weights, score vendors, and get an auto-ranked comparison with a visual quadrant plot.",
    prompt: `Build a Vendor Comparison Scorecard platform for technology analysts.

AI agents:
1. Research Agent — When the user enters a vendor name, search the web for the vendor's latest product capabilities, pricing tiers, market position, recent funding, customer reviews, and analyst coverage. Return structured findings.
2. Scoring & Analysis Agent — Take the research output + user-defined evaluation criteria with custom weights, generate a weighted score for each vendor, produce a ranked comparison, identify strengths/weaknesses per vendor, and write a 2-paragraph analyst summary for each.
3. Visualization Agent — Generate an interactive quadrant-style plot positioning vendors by two user-selected dimensions. Also produce a sortable comparison table and a radar chart per vendor.

Pages:
1. Criteria Setup — Define evaluation criteria (e.g., product maturity, pricing, support, integrations, scalability) with drag-to-reorder and weight sliders (0–100). Save criteria templates for reuse.
2. Vendor Entry — Add vendors by name. "Auto-Research" button triggers the Research Agent to populate vendor data. User can edit/override any field. Bulk import via CSV.
3. Scoring Matrix — Full matrix view: vendors as columns, criteria as rows, scores in cells (1–10). Auto-calculated weighted totals. Color-coded cells (red/yellow/green). Click any cell to see the Research Agent's evidence for that score.
4. Results Dashboard — Ranked vendor list with overall scores. Interactive quadrant plot (user picks X and Y axes from criteria). Radar chart overlay comparing top 3 vendors. "Toggle Weights" panel — adjust any weight and watch rankings shift in real time. Export as PDF or CSV.
5. Analyst Notes — Per-vendor notes with AI-generated summary + space for the analyst's own assessment. Cross-vendor comparison view: pick a topic and see what the Research Agent found for each vendor side by side.

UI: Clean, professional light theme. Data-dense tables with compact rows. Charts should be interactive (hover for details, click to drill down). The quadrant plot should allow drag-and-drop repositioning of vendors.

Sample data: Pre-populate with 6 sample vendors in the "Cloud Data Warehouse" category (Snowflake, Databricks, BigQuery, Redshift, Azure Synapse, Firebolt) with realistic scores across 8 criteria.`,
    tools: ["RAG", "Web Search", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Analysts",
    title: "Market Sizing Calculator",
    description: "Enter assumptions like buyer count, deal size, and growth rates to calculate TAM, SAM, and SOM with a breakdown chart.",
    prompt: "Build a market sizing tool where I enter assumptions like number of potential buyers, average deal size, adoption rates, and growth rates, and it calculates TAM, SAM, and SOM with a breakdown chart and scenario comparison.",
    tools: ["Webhook"],
    complexity: "Starter",
  },
  {
    category: "Analysts",
    title: "Technology Hype Cycle Builder",
    description: "Plot emerging technologies on a hype cycle curve with stage placement and time-to-mainstream estimates.",
    prompt: "Build a technology hype cycle tool where I can add technology names, place them along the curve stages, and estimate time to mainstream adoption with a clean exportable output.",
    tools: ["Webhook"],
    complexity: "Starter",
  },
  {
    category: "Analysts",
    title: "Comparable Company Analyzer",
    description: "Build comp tables with revenue, EBITDA, and market cap data to automatically calculate EV/Revenue, EV/EBITDA, and P/E ratios.",
    prompt: "Build a comp table tool where I enter companies with their revenue, EBITDA, net income, market cap, and growth rates, and automatically get calculated multiples like EV/Revenue, EV/EBITDA, and P/E ratio with median, mean, and outlier highlighting.",
    tools: ["Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Analysts",
    title: "DCF Model Builder",
    description: "Input revenue projections, margins, capex, and discount rate to calculate free cash flows, present values, and implied share price.",
    prompt: "Build a DCF valuation tool where I can input revenue projections, margins, capex, working capital changes, discount rate, and terminal growth rate, and it calculates free cash flows, present values, and an implied share price with adjustable assumptions.",
    tools: ["Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Analysts",
    title: "ROI & Business Case Calculator",
    description: "Input upfront costs, ongoing costs, expected benefits, and discount rate to automatically get NPV, IRR, payback period, and cash flow chart.",
    prompt: "Build a business case calculator where I can input the upfront cost, ongoing costs, expected benefits per year, and a discount rate, and automatically get NPV, IRR, payback period, and a cumulative cash flow chart with adjustable assumptions.",
    tools: ["Webhook"],
    complexity: "Intermediate",
  },
  // ── Data & Analysis ───────────────────────────────────────────────────────
  {
    category: "Data & Analysis",
    title: "Stock Market Analyst",
    description: "Monitor portfolio tickers, aggregate news and analyst ratings, and send a pre-market summary every morning.",
    prompt: "Build a stock analysis agent that monitors my portfolio tickers, aggregates news and analyst ratings, and sends me a pre-market summary every morning.",
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Data & Analysis",
    title: "Text-to-SQL Explorer",
    description: "Connect to your SQL database and allow plain-English questions to generate charts and reports automatically.",
    prompt: "Build a data exploration agent that connects to my SQL database and allows me to ask questions in plain English to generate charts and reports.",
    tools: ["Webhook", "RAG"],
    complexity: "Advanced",
  },
  {
    category: "Data & Analysis",
    title: "Excel Data Insights Generator",
    description: "Accept Excel or CSV uploads, identify patterns and anomalies, and generate an executive summary with visualizations.",
    prompt: "Build a data analysis agent that accepts Excel or CSV uploads, identifies patterns and anomalies, and generates an executive summary with visualizations and actionable insights.",
    tools: ["PDF Parser", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Data & Analysis",
    title: "Business Intelligence Agent",
    description: "Connect to your ERP or database, generate weekly performance reports across sales, inventory, and finance, and highlight trends.",
    prompt: "Build a BI agent that connects to my ERP or database, generates weekly performance reports across sales, inventory, and finance, and highlights trends that need attention.",
    tools: ["Webhook", "Email", "Slack"],
    complexity: "Advanced",
  },
  {
    category: "Data & Analysis",
    title: "Customer Analytics Agent",
    description: "Segment users by behavior and demographics, identify churn risk patterns, and recommend targeted retention strategies.",
    prompt: "Build a customer analytics agent that segments users by behavior and demographics, identifies churn risk patterns, and recommends targeted retention strategies based on the data.",
    tools: ["Webhook", "CRM", "Email"],
    complexity: "Advanced",
  },
  {
    category: "Data & Analysis",
    title: "KPI Dashboard Builder",
    description: "Define KPIs with current value, target, and trend direction, then present a clean dashboard that updates as numbers change.",
    prompt: "Build a KPI dashboard tool where I can define KPIs with their current value, target, and trend direction, organise them into categories, and present a clean dashboard view that updates in real time.",
    tools: ["Webhook"],
    complexity: "Starter",
  },
  {
    category: "Data & Analysis",
    title: "Survey Results Analyzer",
    description: "Upload survey results, see response distributions, cross-tabulate by demographics, and filter results dynamically.",
    prompt: "Build a survey analysis tool where I can upload survey results, see response distributions for each question, cross-tabulate answers by demographics, and filter results dynamically with charts ready for client reports.",
    tools: ["PDF Parser", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Data & Analysis",
    title: "Competitive Landscape Mapper",
    description: "Plot competitors on a customizable 2×2 matrix with defined axes, company positions, and strategic annotations.",
    prompt: "Build a competitive landscape tool where I can plot competitors on a customisable 2×2 matrix with defined axes, adjust their positions, and add annotations about each competitor's strategy.",
    tools: ["Web Search", "Webhook"],
    complexity: "Starter",
  },
  // ── Analysts (additional) ─────────────────────────────────────────────────
  {
    category: "Analysts",
    title: "Vendor Briefing Note Taker",
    description: "Log vendor briefings with key claims, product updates, differentiators, and your assessment — then search and compare across all briefings.",
    prompt: "Build a vendor briefing tracker where I can log each briefing with company name, date, key claims, product updates, differentiators, and my assessment, then search across all notes and compare what different vendors said about the same topic.",
    tools: ["RAG", "Webhook"],
    complexity: "Starter",
  },
  {
    category: "Analysts",
    title: "Inquiry Tracker & Trend Spotter",
    description: "Log client inquiry calls by topic, industry, and company size, then spot trending topics and patterns over time.",
    prompt: "Build an inquiry tracker where I can log each client call with topic, industry, company size, and what they were trying to solve, then see which topics are trending and which industries are asking about what.",
    tools: ["Webhook"],
    complexity: "Starter",
  },
  {
    category: "Analysts",
    title: "Earnings Season Dashboard",
    description: "Track revenue, EPS, and guidance vs consensus for 15+ companies, flag beats/misses, and capture key management quotes.",
    prompt: "Build an earnings dashboard where I can enter each company's reported revenue, EPS, and guidance alongside consensus estimates, see instant beats/misses/surprises, jot down key management quotes, and flag companies where guidance changed meaningfully.",
    tools: ["Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Analysts",
    title: "Sector Performance Tracker",
    description: "Track YTD and 3-month returns for 20 stocks vs S&P 500 and NASDAQ with ranked tables and charts.",
    prompt: "Build a sector performance tracker where I can follow about 20 stocks, track each stock's YTD return, 3-month return, and performance vs the S&P 500 and NASDAQ, with a ranked table and chart showing outperformers and laggards.",
    tools: ["Web Search", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Analysts",
    title: "IPO Readiness Checklist",
    description: "Score companies across financial performance, governance, market positioning, competitive moat, and risk factors with an overall readiness score.",
    prompt: "Build an IPO readiness assessment tool where I can score a company across financial performance, governance readiness, market positioning, competitive moat, and risk factors, and get an overall readiness score with flags for areas needing attention.",
    tools: ["Webhook"],
    complexity: "Intermediate",
  },
  // ── Data & Analysis (additional) ──────────────────────────────────────────
  {
    category: "Data & Analysis",
    title: "Consumer Segmentation Tool",
    description: "Define customer segments based on purchase behaviour, demographics, and attitudes, then size each segment and visualize how they differ.",
    prompt: "Build a consumer segmentation tool where I can define customer segments based on purchase behaviour, demographics, and attitudes, then size each segment, describe their key characteristics, and visualise how they differ on important dimensions.",
    tools: ["Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Data & Analysis",
    title: "Brand Health Tracker",
    description: "Track awareness, consideration, purchase intent, NPS, and satisfaction for multiple brands each quarter with trend lines and comparisons.",
    prompt: "Build a brand health tracker where I can enter brand health metrics like awareness, consideration, purchase intent, NPS, and satisfaction for multiple brands each quarter, with trend lines over time, significant change highlights, and side-by-side brand comparisons.",
    tools: ["Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Data & Analysis",
    title: "Pricing Research Analyzer",
    description: "Enter Van Westendorp survey data and automatically get the optimal price point, indifference price, and acceptable price range chart.",
    prompt: "Build a Van Westendorp pricing analysis tool where I can enter responses about what price is too cheap, a bargain, getting expensive, and too expensive, and automatically get the optimal price point, indifference price point, and range of acceptable prices plotted on the classic chart.",
    tools: ["Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Data & Analysis",
    title: "Data Quality Scorecard",
    description: "Score each data source on completeness, accuracy, timeliness, and consistency, track scores over time, and flag sources that drop below threshold.",
    prompt: "Build a data quality scorecard where I can score each data source on dimensions like completeness, accuracy, timeliness, and consistency, track these scores over time, produce an overall data health score, and flag sources that drop below threshold.",
    tools: ["Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Data & Analysis",
    title: "A/B Test Calculator & Reporter",
    description: "Enter visitors and conversions for control and variant to instantly see conversion rates, lift, statistical significance, and whether you have a winner.",
    prompt: "Build an A/B test calculator where I can enter the number of visitors and conversions for control and variant groups and instantly see conversion rates, absolute and relative lift, statistical significance (p-value), confidence interval, and a plain-English winner declaration.",
    tools: ["Webhook"],
    complexity: "Starter",
  },
  {
    category: "Data & Analysis",
    title: "SQL Query Result Visualiser",
    description: "Paste tabular data from SQL queries and instantly pick from chart types to create presentation-ready visuals.",
    prompt: "Build a SQL result visualizer where I can paste in tabular data, pick from chart types like bar, line, pie, or scatter, and get charts presentable enough to drop into a Slack message or email.",
    tools: ["Webhook"],
    complexity: "Starter",
  },
  {
    category: "Data & Analysis",
    title: "Stakeholder Report Generator",
    description: "Enter this week's and last week's key business metrics to automatically get a formatted report with trends, week-over-week changes, and a summary.",
    prompt: "Build a weekly stakeholder report tool where I can enter this week's numbers and last week's numbers for metrics like revenue, active users, churn, support tickets, and NPS, and automatically get a formatted report showing the trend, week-over-week change, and a summary of what's up and what's down.",
    tools: ["Email", "Webhook"],
    complexity: "Starter",
  },
  {
    category: "Data & Analysis",
    title: "Policy Impact Calculator",
    description: "Input tax policy parameters across income brackets to see estimated revenue impact, who benefits, who pays more, and net budget effect.",
    prompt: "Build a policy impact calculator where I can input current tax rates, proposed rates, income brackets, and population data, then see the estimated revenue impact, who benefits, who pays more, and the net effect on the budget with adjustable proposed rates.",
    tools: ["Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Data & Analysis",
    title: "Demographic Trend Explorer",
    description: "Upload population data by age, region, income, and education to explore trends and project forward with different growth assumptions.",
    prompt: "Build a demographic trend explorer where I can upload population data broken down by age, region, income, and education level, explore trends over time, project forward using different growth assumptions, and create clear visualisations for policy briefs.",
    tools: ["PDF Parser", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Data & Analysis",
    title: "Grant & Funding Tracker",
    description: "Track each grant's budget, spend, deadlines, and reporting status with at-risk alerts and a portfolio-level funding health view.",
    prompt: "Build a grant tracker where I can track each grant's total budget, amount spent, remaining balance, key deadlines, and reporting status, see which grants are at risk of underspending or overspending, which reports are due soon, and get a portfolio-level view of funding health.",
    tools: ["Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Data & Analysis",
    title: "Regulatory Compliance Checker",
    description: "List regulations, map them to business practices, score compliance for each, and flag gaps when a regulation changes.",
    prompt: "Build a compliance checker where I can list regulations, map them to our business practices, score our compliance level for each, flag gaps, and see how our overall compliance posture shifts when a regulation changes.",
    tools: ["RAG", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Data & Analysis",
    title: "Public Comment Analyzer",
    description: "Upload public comments on proposed regulations, categorize by theme and sentiment, and get a summary for official response documents.",
    prompt: "Build a public comment analysis tool where I can upload hundreds of public comments on a proposed regulation, have them categorised by theme and sentiment, see which issues came up most frequently, and get a summary of the main arguments for and against thorough enough for an official response document.",
    tools: ["PDF Parser", "RAG", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Data & Analysis",
    title: "SWOT & Strategy Framework Builder",
    description: "Pick a framework (SWOT, Porter's Five Forces, value chain), fill in the analysis, and get a clean professional visual output ready to share.",
    prompt: "Build a strategy framework tool where I can pick a framework like SWOT, Porter's Five Forces, or value chain analysis, fill in my analysis, and get a clean professional visual output I can share with clients or drop into a presentation.",
    tools: ["Webhook"],
    complexity: "Starter",
  },
  {
    category: "Data & Analysis",
    title: "Process Efficiency Benchmarker",
    description: "Enter cycle time, cost per transaction, error rate, and throughput for your client and industry benchmarks to quantify gaps and estimate improvement value.",
    prompt: "Build a process benchmarking tool where I can enter metrics like cycle time, cost per transaction, error rate, and throughput for my client and for industry benchmarks, see where my client is above or below standard, calculate the gap, and estimate the value of closing it.",
    tools: ["Webhook"],
    complexity: "Intermediate",
  },
  // ── General (additional) ──────────────────────────────────────────────────
  {
    category: "General",
    title: "Meeting Cost Calculator",
    description: "Enter attendees, hourly cost, duration, and frequency to calculate the true weekly, monthly, and annual cost of a meeting across the organisation.",
    prompt: "Build a meeting cost calculator where I can enter the number of attendees, their average hourly cost, meeting duration, and frequency per week, and calculate the weekly, monthly, and annual cost of this meeting and what it adds up to across the organisation.",
    tools: ["Webhook"],
    complexity: "Starter",
  },
  {
    category: "General",
    title: "Client Health Scorecard",
    description: "Score each consulting client on satisfaction, engagement, contract value, renewal likelihood, and growth potential with at-risk flags and a portfolio view.",
    prompt: "Build a client health scorecard where I can score each client on dimensions like satisfaction, engagement level, contract value, renewal likelihood, and growth potential, get an overall health score per client, flag at-risk accounts, and see a portfolio view to prioritise attention.",
    tools: ["CRM", "Webhook"],
    complexity: "Intermediate",
  },
];

const COMPLEXITY_COLOR: Record<string, string> = {
  Starter: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Intermediate: "bg-amber-50 text-amber-700 border-amber-200",
  Advanced: "bg-rose-50 text-rose-700 border-rose-200",
};

const CATEGORIES = ["All", "General", "Marketing", "Sales", "Legal", "HR", "Support", "Productivity", "Development", "Analysts", "Data & Analysis"];

function PreviewModal({ prompt, onClose, onUse }: { prompt: Prompt; onClose: () => void; onUse: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-100">{prompt.category}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${COMPLEXITY_COLOR[prompt.complexity]}`}>
                {prompt.complexity}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mt-2">{prompt.title}</h2>
            <p className="text-sm text-gray-500 mt-1">{prompt.description}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors ml-4 mt-1 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Prompt Template</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-36 overflow-y-auto">
            <p className="text-sm text-slate-800 leading-relaxed">{prompt.prompt}</p>
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2">Suggested Tools</p>
          <div className="flex flex-wrap gap-2">
            {prompt.tools.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                </svg>
                {t}
              </span>
            ))}
          </div>
        </div>

        {prompt.sampleFile && (
          <div className="px-6 pb-2">
            <a
              href={prompt.sampleFile.url}
              download={prompt.sampleFile.name}
              className="flex items-center gap-2 w-full py-2 px-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium">Sample Data File</span>
              <span className="text-emerald-500 text-xs ml-auto">{prompt.sampleFile.name}</span>
            </a>
          </div>
        )}
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
            Use this prompt →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PromptLibrary() {
  const [selected, setSelected] = useState("All");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Prompt | null>(null);
  const navigate = useNavigate();

  const filtered = PROMPTS.filter((p) => {
    const matchCat = selected === "All" || p.category === selected;
    const q = search.toLowerCase();
    const matchSearch = !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const usePrompt = (p: Prompt) => {
    navigate("/architect", { state: { prompt: p.prompt, sampleFile: p.sampleFile } });
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Prompt Library</h1>
          <p className="text-gray-500 text-sm">Choose a template to get started instantly with a high-quality prompt.</p>
        </div>
        <div className="relative w-64 flex-shrink-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Category Filter with counts */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map((c) => {
          const count = c === "All" ? PROMPTS.length : PROMPTS.filter((p) => p.category === c).length;
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

      {/* Prompt Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">No prompts match your search.</p>
          <button onClick={() => { setSearch(""); setSelected("All"); }} className="mt-3 text-sm text-indigo-600 hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={`${p.category}-${p.title}`} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-100">
                  {p.category}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${COMPLEXITY_COLOR[p.complexity]}`}>
                  {p.complexity}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{p.title}</h3>
              <p className="text-sm text-gray-500 mb-3 flex-1">{p.description}</p>

              {/* Tool tags */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {p.tools.map((t) => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </div>

              {/* Sample file chip */}
              {p.sampleFile && (
                <a
                  href={p.sampleFile.url}
                  download={p.sampleFile.name}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 mb-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 hover:bg-emerald-100 transition-colors w-fit"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V19a2 2 0 002 2h14a2 2 0 002-2v-2" />
                  </svg>
                  Sample Data
                </a>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setPreview(p)}
                  className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Preview
                </button>
                <button
                  onClick={() => usePrompt(p)}
                  className="flex-1 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Use this prompt →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <PreviewModal
          prompt={preview}
          onClose={() => setPreview(null)}
          onUse={() => { setPreview(null); usePrompt(preview); }}
        />
      )}
    </div>
  );
}
