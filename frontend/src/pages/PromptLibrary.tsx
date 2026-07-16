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
    prompt: `Build a Deep Research Assistant that takes any research topic and produces a comprehensive, cited report.

AI agents:
1. Query Planner Agent — Breaks the research topic into 4-8 focused sub-questions, identifies what source types are needed (news, academic, market data, forums), and builds a research plan with priority order.
2. Web Research Agent — Executes web searches for each sub-question in parallel, retrieves and scrapes top results, extracts relevant passages, and tags each finding with source URL, publish date, and credibility score (1-5).
3. Synthesis Agent — Merges findings across all sub-questions into a coherent narrative, resolves contradictions between sources by noting disagreement explicitly, and organizes content into report sections with inline numbered citations.
4. Fact-Check & Citation Agent — Verifies each claim in the draft report traces back to a specific source passage, flags any unsupported claims, and formats a final bibliography with clickable links.
5. Report Formatter Agent — Produces the final deliverable: executive summary, table of contents, body sections, key findings callout boxes, and a "Confidence & Gaps" appendix noting what remains uncertain.

Pages:
1. Research Intake — Form with fields: Research Topic (required), Depth (Quick/Standard/Deep), Focus Areas (tags), Excluded domains. Submit shows a live progress stepper: Planning → Researching (per sub-question progress bars) → Synthesizing → Fact-Checking → Formatting.
2. Report View — Full report with sticky table of contents sidebar, expandable source citations (click a citation number to see the source passage in a popover), credibility score badges per source, and a "Key Findings" highlight panel at the top.
3. Source Explorer — Table of every source used across all sub-questions (URL, title, credibility score, sub-question it answered, retrieval date). Filter by credibility score or sub-question. Bar chart: sources by credibility tier.
4. Research History — Live list from the database (NOT hardcoded) of past research runs: topic, date, number of sources, report length, status badge. Click to reopen a completed report.
5. Export & Reports Page — Export any report to PDF (jsPDF, with citations and bibliography) or Word-style formatted text. Line chart: research runs over time. Table: most-researched topics.

UI: Clean two-column layout — collapsible left nav (Intake, Reports, Sources, History), main content area with the report/table view. Citations rendered as small superscript numbers that open a source popover on click. Progress stepper uses animated indigo dots during the pipeline run.

Database: Persist every research run with sub-questions, all sources with credibility scores, synthesized report text, and fact-check flags. History page reads live from the DB.`,
    tools: ["Web Search", "RAG", "PDF Parser"],
    complexity: "Advanced",
    sampleFile: { name: "deep-research-assistant-sample.csv", url: "/samples/general/deep-research-assistant.csv" },
  },
  {
    category: "General",
    title: "Project Manager",
    description: "Break down complex goals into actionable tasks, assign deadlines, and track progress through daily check-ins.",
    prompt: `Build a Project Manager agent that breaks down goals into tasks, tracks progress, and keeps the team accountable through automated check-ins.

AI agents:
1. Goal Decomposition Agent — Takes a high-level project goal and constraints (deadline, team size, budget), and breaks it into epics, tasks, and subtasks with estimated effort (story points or hours) and dependency mapping.
2. Scheduler & Assignment Agent — Assigns tasks to team members based on stated skills/availability, sets due dates working backward from the project deadline, and flags scheduling conflicts or over-allocated team members.
3. Check-in Agent — Sends daily/weekly automated check-in prompts to each assignee via Slack/email, collects status updates (On Track / At Risk / Blocked), and parses free-text replies into structured status.
4. Risk & Blocker Agent — Monitors task status trends, detects tasks trending toward missed deadlines, flags blockers reported in check-ins, and proposes mitigation options (reassign, extend deadline, reduce scope).
5. Reporting Agent — Compiles a weekly project health report: burndown chart, task completion rate, at-risk task list, and a plain-language summary for stakeholders.

Pages:
1. Project Setup — Form: Project Name, Goal Description, Deadline, Team Members (name + skills + availability), Budget (optional). Submit triggers the Goal Decomposition Agent to generate the initial task breakdown for review/edit.
2. Task Board — Kanban board (Backlog, In Progress, At Risk, Blocked, Done) with drag-and-drop, task cards showing assignee avatar, due date, priority badge, and story points.
3. Check-in Center — Daily check-in feed showing each team member's latest status update, with sentiment/risk flags (green/yellow/red dot) and a "Send reminder" button for overdue check-ins.
4. Dashboard — KPI row (tasks completed this week, at-risk count, on-time completion rate, days to deadline) + burndown chart (Line) + task distribution by team member (Bar) + status breakdown (Donut).
5. Reports Page — Weekly health report list, each with a summary card. Export any report to PDF or Excel. Historical burndown trend chart across all past reports.

UI: Slate-900 sidebar, Kanban board as centerpiece with color-coded priority badges (P1 red, P2 amber, P3 gray). Check-in feed styled like a chat/activity stream with colored risk dots per entry.

Database: Persist projects, tasks, assignments, check-in history, and generated reports. Dashboard and Reports read live from the DB.`,
    tools: ["Calendar", "Email", "Slack"],
    complexity: "Advanced",
    sampleFile: { name: "project-manager-sample.csv", url: "/samples/general/project-manager.csv" },
  },
  {
    category: "General",
    title: "Voice AI Receptionist",
    description: "Answer inbound calls, respond to FAQs about your business, book appointments on Google Calendar, and transfer to a human when needed.",
    prompt: `Build a Voice AI Receptionist that answers inbound business calls, handles FAQs, books appointments, and escalates to a human when needed.

AI agents:
1. Call Intake & Intent Agent — Answers the inbound call, greets the caller, transcribes speech in real time, and classifies intent (FAQ question, appointment booking, complaint, request for human, other).
2. FAQ Answer Agent — Searches the business knowledge base (hours, services, pricing, location, policies) via RAG and responds conversationally with natural speech-friendly phrasing (short sentences, no bullet points read aloud).
3. Appointment Booking Agent — Checks Google Calendar availability, proposes 2-3 open slots to the caller, confirms the chosen slot, collects caller name/phone/reason for visit, and creates the calendar event with a confirmation callback/SMS.
4. Human Handoff Agent — Detects when the caller explicitly asks for a human, is frustrated (negative sentiment), or the FAQ Agent has low confidence (<70%), and transfers the call with a spoken summary handed to the human receptionist.
5. Call Quality & Analytics Agent — Scores each call transcript for resolution success, logs call duration, outcome (resolved/booked/escalated/abandoned), and produces daily call volume and outcome reports.

Pages:
1. Live Calls — Real-time view of active and recent calls: caller number, duration, current intent, live transcript snippet, status (in-progress/resolved/escalated). Click to open full transcript.
2. Call Transcript View — Full conversation transcript with speaker labels (Caller / AI), timestamps, and the detected intent + confidence score. Highlighted moments where the AI consulted the knowledge base or checked the calendar.
3. Appointments — Table of bookings made by the AI (caller name, requested slot, confirmed slot, reason, status) synced with a calendar view. Reschedule/cancel actions.
4. Knowledge Base Manager — Manage FAQ entries (question, answer, category). See which FAQs are asked most often, flag gaps from unanswered questions.
5. Analytics Dashboard — KPI row (calls today, resolution rate, human transfer rate, avg call duration) + Bar chart: call volume by hour + Donut: outcome distribution (resolved/booked/transferred/abandoned) + Line chart: daily call trend.

UI: Dashboard-first layout with a prominent "Live Calls" ticker at the top. Transcript view styled like a chat log with a phone/waveform icon per caller turn. Knowledge Base and Appointments as standard nav pages.

Database: Persist every call with full transcript, detected intent, outcome, and any appointment created. Analytics reads live from the DB.`,
    tools: ["Calendar", "Knowledge Base", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "voice-ai-receptionist-sample.csv", url: "/samples/general/voice-ai-receptionist.csv" },
  },
  {
    category: "General",
    title: "Career Advisor Chatbot",
    description: "Review skills and experience, generate personalized career roadmaps, suggest skill gaps to fill, and provide mock interview practice.",
    prompt: `Build a Career Advisor Chatbot that reviews a user's background and produces a personalized career roadmap with skill-gap analysis and mock interview practice.

AI agents:
1. Profile Analysis Agent — Parses the user's CV/LinkedIn profile and self-reported skills, extracts current role, years of experience, skills, and stated career goal, and produces a structured profile summary.
2. Market Research Agent — Searches the web for target-role job postings and industry trend reports to identify in-demand skills, typical career progression paths, and realistic salary bands for the target role.
3. Roadmap Generation Agent — Compares the user's current profile against market requirements, generates a phased career roadmap (0-3mo, 3-6mo, 6-12mo, 1-2yr) with specific milestones, and flags the top 3-5 skill gaps to close first.
4. Mock Interview Agent — Conducts a simulated interview for the target role: asks behavioral and technical questions one at a time, evaluates each answer against a rubric (clarity, structure, relevance, depth), and gives specific improvement feedback.
5. Progress Tracking Agent — Tracks which roadmap milestones and recommended courses/certifications the user has marked complete, and recalculates readiness score toward the target role over time.

Pages:
1. Profile Intake — Upload CV (PDF/DOCX) or fill a form (current role, skills, years experience, target role, target timeline). Submit triggers profile analysis and market research.
2. Career Roadmap — Visual timeline (0-3mo/3-6mo/6-12mo/1-2yr phases) with milestone cards, each showing recommended actions (course, certification, project, networking). Readiness score gauge at the top.
3. Skill Gap Analysis — Radar chart comparing user's current skill levels vs. target-role requirements. Table of top gaps ranked by impact, each with 2-3 recommended resources.
4. Mock Interview — Chat-style interview simulator. After each answer, shows a scorecard (clarity/structure/relevance/depth bars) and written feedback. Session summary at the end with overall score trend across sessions.
5. Progress Dashboard — KPI row (milestones completed, readiness score, interview sessions done, avg interview score) + Line chart: readiness score over time + checklist view of roadmap milestones with completion toggles.

UI: Friendly, encouraging tone throughout (progress bars, celebratory badges on milestone completion). Sidebar nav: Profile, Roadmap, Skill Gaps, Mock Interview, Progress. Radar chart and readiness gauge in brand indigo.

Database: Persist user profile, roadmap, skill gap analysis, interview session transcripts/scores, and milestone completion status.`,
    tools: ["RAG", "Web Search"],
    complexity: "Intermediate",
    sampleFile: { name: "career-advisor-chatbot-sample.csv", url: "/samples/general/career-advisor-chatbot.csv" },
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
    sampleFile: { name: "knowledge-base-qa-bot-sample.csv", url: "/samples/general/knowledge-base-qa-bot.csv" },
  },
  // ── Marketing ─────────────────────────────────────────────────────────────
  {
    category: "Marketing",
    title: "Content Marketing Team",
    description: "Write blog posts, create social media content, perform SEO analysis, and generate graphics for your brand.",
    prompt: `Build a Content Marketing Team — a coordinated group of agents that plan, write, optimize, and schedule brand content.

AI agents:
1. Content Strategist Agent — Takes the brand's content goals, target audience, and pillars, and generates a monthly content calendar of blog and social topics mapped to funnel stage (awareness/consideration/conversion).
2. Blog Writer Agent — Drafts full blog posts from the calendar (intro, body sections with subheads, conclusion, CTA) in the brand's specified tone of voice, with placeholder image briefs for the Graphics Agent.
3. Social Content Agent — Repurposes each blog post into platform-specific social posts (LinkedIn, Twitter/X, Instagram caption) with hashtags and optimal posting time suggestions.
4. SEO Analyst Agent — Reviews each draft for target keyword usage, meta title/description, readability score, and internal linking opportunities; returns a scored checklist with fixes.
5. Graphics Brief Agent — Generates image/graphic briefs per piece (concept description, dimensions, brand colors, text overlay suggestions) ready to hand to a designer or image generator.

Pages:
1. Content Calendar — Monthly calendar grid showing scheduled blog posts and social posts, color-coded by funnel stage, drag-and-drop rescheduling, status badges (idea/drafting/review/scheduled/published).
2. Draft Workspace — Split view: blog draft on the left with inline SEO score annotations, generated social variants on the right (LinkedIn/Twitter/Instagram tabs), graphics brief panel below.
3. SEO Scorecard — Table of all content pieces with SEO score (0-100), keyword usage, readability grade, and flagged issues. Bar chart: average SEO score trend over time.
4. Performance Dashboard — KPI row (pieces published this month, avg SEO score, social posts scheduled, top-performing piece) + Line chart: content output over time + Donut: content mix by funnel stage.
5. Reports Page — Export monthly content performance report to PDF/Excel with calendar summary, SEO scorecard, and social scheduling summary.

UI: Calendar-first landing page. Draft Workspace uses a document-editor feel (serif font for blog body) with a floating SEO score badge. Social variant tabs styled like platform mockups (LinkedIn card, tweet card, Instagram caption card).

Database: Persist the content calendar, all drafts and revisions, SEO scores, and social variants per piece.`,
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "content-marketing-team-sample.csv", url: "/samples/marketing/content-marketing-team.csv" },
  },
  {
    category: "Marketing",
    title: "Competitor Analysis Agent",
    description: "Monitor competitors' websites, social media, and news mentions to provide weekly strategic reports.",
    prompt: `Build a Competitor Analysis Agent that continuously monitors named competitors and produces weekly strategic intelligence reports.

AI agents:
1. Web Monitoring Agent — Crawls each tracked competitor's website (pricing page, product pages, blog) on a schedule, diffs content against the last snapshot, and flags meaningful changes (new feature, price change, new page).
2. Social & Press Monitoring Agent — Searches for competitor mentions across social media and news/press outlets, classifies each mention by sentiment and topic (product launch, funding, hiring, controversy).
3. Share-of-Voice Agent — Aggregates mention volume and sentiment across all tracked competitors plus the user's own brand, and computes relative share-of-voice and sentiment trend.
4. Strategic Synthesis Agent — Combines website changes, mentions, and share-of-voice data into a weekly strategic brief: key moves, threats, opportunities, and 3 recommended actions.
5. Report Distribution Agent — Formats the weekly brief into an email-ready summary and a full PDF report, and sends it to configured stakeholders on a schedule.

Pages:
1. Competitor Roster — Manage tracked competitors (name, website URL, social handles). Add/remove/edit. Last-crawled timestamp per competitor.
2. Change Feed — Chronological feed of detected website changes and mentions per competitor, with type badges (Pricing Change/New Feature/Press/Social) and a diff view for website changes.
3. Share-of-Voice Dashboard — Radar chart comparing share-of-voice across all tracked competitors + your brand. Line chart: sentiment trend per competitor over time. Bar chart: mention volume by source.
4. Weekly Brief — List of past weekly strategic briefs, each expandable to show key moves, threats/opportunities, and recommended actions. Export any brief to PDF.
5. Settings — Configure crawl frequency, keyword watchlist, and stakeholder email distribution list.

UI: Change Feed styled like an activity/timeline stream with competitor logos/initials as avatars. Share-of-Voice dashboard uses radar + line charts prominently on the main dashboard. Weekly Brief pages formatted like a clean executive memo.

Database: Persist competitor roster, all detected changes/mentions with timestamps and sentiment, and generated weekly briefs.`,
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "competitor-analysis-agent-sample.csv", url: "/samples/marketing/competitor-analysis-agent.csv" },
  },
  {
    category: "Marketing",
    title: "SEO Content Optimizer",
    description: "Audit website content, identify keyword opportunities, and generate optimized meta titles, descriptions, and internal linking suggestions.",
    prompt: `Build an SEO Content Optimizer that audits an entire website's content and produces a prioritized optimization plan.

AI agents:
1. Site Crawler Agent — Crawls the target website's URLs, extracts existing meta titles/descriptions, headings, word count, and internal link structure for every page.
2. Keyword Opportunity Agent — Researches search volume and difficulty for keywords relevant to each page's topic, identifies gap keywords (high volume, low current ranking), and maps opportunity keywords to specific pages.
3. On-Page Audit Agent — Scores each page on-page SEO factors (title length/keyword presence, meta description quality, heading structure, keyword density, readability) and produces a 0-100 SEO score with specific fixes.
4. Meta Rewrite Agent — Generates optimized meta title and description variants (2-3 options each) for pages scoring below threshold, respecting character limits and including the target keyword naturally.
5. Internal Linking Agent — Analyzes the site's link graph, identifies orphaned or under-linked high-value pages, and suggests specific internal link additions (source page, anchor text, target page).

Pages:
1. Site Audit — Table of all crawled pages with SEO score, word count, primary keyword, and issue count. Sort/filter by score. Bar chart: score distribution across the site.
2. Keyword Opportunities — Table of gap keywords (keyword, search volume, difficulty, current ranking page if any, opportunity score). Scatter plot: volume vs. difficulty with best opportunities highlighted.
3. Page Detail — Per-page deep dive: current vs. suggested meta title/description (side by side), heading structure tree, keyword density chart, and a checklist of on-page fixes with priority.
4. Internal Linking Map — Visual link graph (nodes = pages, edges = internal links) highlighting orphaned pages in red. Table of suggested new links (source, anchor text, target, expected impact).
5. Reports Page — Export a full site audit report to PDF/Excel with score summary, top opportunities, and a prioritized action plan ranked by expected traffic impact.

UI: Data-dense audit table as the landing page (typical SEO-tool feel). Page Detail view uses a before/after comparison layout for meta tags. Link graph rendered as an interactive node diagram.

Database: Persist crawled page data, SEO scores, keyword opportunities, and suggested internal links, with re-audit history so score trends can be tracked over time.`,
    tools: ["Web Search", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "seo-content-optimizer-sample.csv", url: "/samples/marketing/seo-content-optimizer.csv" },
  },
  {
    category: "Marketing",
    title: "Newsletter Intelligence Hub",
    description: "Monitor industry news daily, curate top stories, draft a polished newsletter edition, and publish it on schedule.",
    prompt: `Build a Newsletter Intelligence Hub that monitors industry news daily and produces a polished, ready-to-send newsletter edition.

AI agents:
1. News Monitoring Agent — Continuously scans configured news sources, RSS feeds, and topic keywords for new industry articles, and scores each for relevance to the newsletter's stated focus.
2. Curation Agent — Selects the top 5-8 stories for the current edition based on relevance score, recency, and topic diversity (avoids running 4 stories on the same sub-topic).
3. Summarization & Voice Agent — Writes a 2-3 sentence summary of each selected story in the newsletter's brand voice, plus a punchy one-line "why it matters" takeaway.
4. Newsletter Assembly Agent — Composes the full edition: subject line options (3 variants with predicted open-rate style), intro blurb, curated story blocks in order, and a closing CTA.
5. Publishing Agent — Formats the assembled edition into responsive HTML email, schedules the send at the configured time, and logs delivery status.

Pages:
1. Story Feed — Live feed of monitored articles with relevance score, topic tag, and source. Approve/reject stories manually to override AI curation before an edition locks.
2. Edition Builder — Current draft edition: subject line variants (select one), intro blurb (editable), ordered story blocks with summary + "why it matters" (drag to reorder, edit inline).
3. Edition Preview — Rendered email preview (desktop and mobile view toggle) exactly as subscribers will see it, with a "Send Test" button.
4. Archive & Analytics — List of past editions with open rate, click rate, and subscriber count charts. Line chart: open rate trend across editions. Table: top-clicked stories all-time.
5. Settings — Manage news sources/keywords, newsletter send schedule, and brand voice guidelines.

UI: Story Feed styled as a news-ticker card list. Edition Builder uses a drag-and-drop block editor. Edition Preview renders inside a phone/desktop frame mockup for realism.

Database: Persist monitored stories with relevance scores, assembled editions with full content, and send/open/click analytics per edition.`,
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "newsletter-intelligence-hub-sample.csv", url: "/samples/marketing/newsletter-intelligence-hub.csv" },
  },
  {
    category: "Marketing",
    title: "Social Media Manager",
    description: "Generate a week's worth of platform-specific posts for LinkedIn, Twitter, and Instagram with hashtags and optimal posting times.",
    prompt: `Build a Social Media Manager that plans, drafts, and schedules a full week of platform-specific content across LinkedIn, Twitter/X, and Instagram.

AI agents:
1. Content Planning Agent — Takes the brand's themes/campaigns for the week and generates a content plan: which day gets which theme, and which platform(s) each theme is best suited for.
2. Platform Copywriter Agent — Drafts platform-native copy for each planned post: LinkedIn (professional tone, longer form), Twitter/X (punchy, character-limited, thread-capable), Instagram (caption + emoji-friendly, line breaks).
3. Hashtag & Trend Agent — Researches trending and niche-relevant hashtags per platform and post topic, and appends an optimal hashtag set (avoiding overused/banned tags).
4. Scheduling Agent — Determines the optimal posting time per platform based on the brand's audience timezone and platform best practices, and queues each post to publish at that time.
5. Engagement Monitoring Agent — After posts go live, tracks likes/comments/shares/impressions per post, and flags posts underperforming their platform average for a manual boost/repost decision.

Pages:
1. Weekly Content Plan — Calendar grid (Mon-Sun columns x platform rows) showing theme and status per slot. Click a slot to open the draft.
2. Draft Editor — Per-post editor with platform preview mockup (LinkedIn card / tweet card / Instagram post), character counter, hashtag suggestions panel, and optimal posting time indicator.
3. Publishing Queue — List of all scheduled posts across platforms with countdown to publish time, status (queued/published/failed), and manual "publish now" override.
4. Engagement Dashboard — KPI row (posts this week, total engagement, avg engagement rate, best-performing platform) + Bar chart: engagement by platform + Line chart: engagement trend + table of top 5 posts by engagement.
5. Reports Page — Export a weekly performance report to PDF/Excel with the content calendar, engagement summary, and top hashtags used.

UI: Weekly calendar grid as the landing page with platform icon badges. Draft editor renders an accurate mini-mockup of each platform's post appearance. Engagement dashboard uses platform brand colors for the bar chart series (LinkedIn blue, Twitter/X black, Instagram gradient).

Database: Persist the weekly plan, all drafts, publishing status, and engagement metrics pulled per post.`,
    tools: ["Web Search", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "social-media-manager-sample.csv", url: "/samples/marketing/social-media-manager.csv" },
  },
  // ── Sales ─────────────────────────────────────────────────────────────────
  {
    category: "Sales",
    title: "Sales Outreach Specialist",
    description: "Find leads on LinkedIn, enrich their data, and draft personalized cold emails based on their recent activity.",
    prompt: `Build a Sales Outreach Specialist that finds, enriches, and personally engages prospects at scale.

AI agents:
1. Prospecting Agent — Searches LinkedIn and company websites for leads matching the target criteria (industry, title, company size), and compiles a raw lead list with name, title, company, and profile URL.
2. Enrichment Agent — Enriches each lead with company firmographics (size, industry, funding stage), recent activity (posts, job changes, company news), and contact info where available.
3. Personalization Agent — Reads each lead's recent activity and company news to identify a specific personalization hook (a post they made, a company milestone, a shared connection), and drafts a cold email/LinkedIn message referencing it.
4. Sequencing Agent — Builds a multi-touch outreach sequence per lead (initial email → follow-up 1 → follow-up 2 → breakup email) with recommended send-day spacing, and stops the sequence automatically on reply.
5. Reply & Sentiment Agent — Classifies inbound replies (interested/not interested/referred/out-of-office) and routes interested replies to the sales rep with a suggested next step.

Pages:
1. Lead List — Table of prospected leads (name, title, company, enrichment status, personalization hook, sequence stage). Bulk actions: enrich, start sequence, export.
2. Lead Detail — Full enrichment profile (firmographics, recent activity feed, personalization hook highlighted) plus the drafted outreach sequence for that lead, editable before sending.
3. Sequence Tracker — Kanban-style view of all leads by sequence stage (Not Started, Touch 1, Touch 2, Touch 3, Replied, Booked, Closed). Drag to advance manually.
4. Reply Inbox — Classified replies with sentiment badge (Interested/Not Interested/Referred/OOO) and suggested next action. One-click "book meeting" or "mark closed."
5. Performance Dashboard — KPI row (leads prospected, emails sent, reply rate, meetings booked) + Funnel chart: prospected → contacted → replied → booked + Bar chart: reply rate by personalization hook type.

UI: Lead List as the landing page with avatar initials and company logos (placeholder). Lead Detail styled as a rich profile card. Sequence Tracker uses a Kanban board with sequence-stage color coding.

Database: Persist leads, enrichment data, drafted sequences, send history, and classified replies. Dashboard reads live from the DB.`,
    tools: ["Web Search", "Email", "CRM"],
    complexity: "Advanced",
    sampleFile: { name: "sales-outreach-specialist-sample.csv", url: "/samples/sales/sales-outreach-specialist.csv" },
  },
  {
    category: "Sales",
    title: "CRM Data Manager",
    description: "Automatically update deal stages, log communications, and flag stale leads in your CRM.",
    prompt: `Build a CRM Data Manager that keeps deal data accurate and current without manual upkeep by the sales team.

AI agents:
1. Communication Logging Agent — Monitors connected email/calendar/call transcripts, matches each communication to the correct CRM contact/deal, and logs a structured activity entry (type, summary, sentiment, next step mentioned).
2. Deal Stage Inference Agent — Reads logged communications and explicit signals (contract sent, verbal commitment, pricing discussed) to infer the deal's true current stage, and proposes a stage update when it differs from the CRM's recorded stage.
3. Data Hygiene Agent — Scans all deals/contacts for missing required fields, duplicate records, and stale data (no activity in X days), and either auto-fixes safe issues or flags risky ones for rep review.
4. Stale Lead Agent — Identifies leads/deals with no activity beyond a configurable threshold, computes a risk-of-loss score, and generates a re-engagement task or auto-drafted nudge email for the rep.
5. Forecast Rollup Agent — Aggregates deal stage, value, and probability across the pipeline into a rolling revenue forecast, flagging deals that moved backward in stage as forecast risks.

Pages:
1. Deal Health Board — Table/Kanban of all deals with CRM-recorded stage vs. AI-inferred stage side by side (flagged when mismatched), last activity date, and a "Approve stage update" one-click action.
2. Activity Log — Chronological feed of all auto-logged communications per contact/deal, with type icons (email/call/meeting) and AI-generated summaries.
3. Data Hygiene Report — List of flagged issues (missing fields, duplicates, stale records) grouped by severity, with bulk "auto-fix" and "dismiss" actions.
4. Stale Leads — Table of at-risk leads ranked by risk-of-loss score, with a suggested re-engagement action and a "Send nudge" button that opens the drafted email for review.
5. Forecast Dashboard — KPI row (pipeline value, weighted forecast, deals at risk, data health score) + Bar chart: pipeline by stage + Line chart: forecast trend over time + table of deals that regressed in stage.

UI: Deal Health Board as the landing page, with a red/yellow/green mismatch indicator column. Activity Log styled as a timeline. Forecast Dashboard uses indigo/green/amber for on-track vs at-risk deal coloring.

Database: Persist all deals, contacts, logged activities, stage-change history, and hygiene flags. Forecast recalculates live from current DB state.`,
    tools: ["CRM", "Email", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "crm-data-manager-sample.csv", url: "/samples/sales/crm-data-manager.csv" },
  },
  {
    category: "Sales",
    title: "Product Recommendation Agent",
    description: "Take a customer's budget and requirements, then suggest optimal product bundles and upsell opportunities.",
    prompt: `Build a Product Recommendation Agent that turns a customer's budget and requirements into an optimal product bundle and upsell plan.

AI agents:
1. Requirements Intake Agent — Parses the customer's stated budget, use case, and must-have requirements (from a form or a sales rep's notes) into a structured requirement profile.
2. Catalog Matching Agent — Searches the product catalog (via RAG over product specs/pricing) to find products that satisfy the requirement profile, ranking matches by fit score.
3. Bundle Optimization Agent — Combines matched products into 2-3 candidate bundles that fit within budget, balancing coverage of requirements against total cost, and computes a value score per bundle.
4. Upsell & Cross-sell Agent — Identifies complementary add-ons or premium tier upgrades that increase deal value without breaking budget tolerance, tagging each with expected margin impact.
5. Proposal Draft Agent — Assembles the recommended bundle plus upsell options into a customer-facing comparison table with pricing, and a one-paragraph rationale per bundle tailored to the stated use case.

Pages:
1. Customer Intake — Form: budget, use case description, must-have requirements (tags), nice-to-haves. Submit triggers the matching and bundling pipeline.
2. Bundle Comparison — Side-by-side comparison of 2-3 recommended bundles: contents, total price, requirement coverage (checkmarks per requirement), and value score. Highlight the "Best Fit" bundle.
3. Upsell Opportunities — Table of suggested add-ons/upgrades per bundle with price delta, margin impact, and a one-line reason ("Customers with this use case typically also need X").
4. Product Catalog Explorer — Browsable/searchable catalog with specs, pricing, and a "fit score" indicator when a customer profile is active.
5. Deal Value Dashboard — KPI row (avg bundle value, upsell attach rate, avg margin lift) + Bar chart: bundle value distribution + Pie chart: product mix in accepted bundles + table of top-selling bundles.

UI: Bundle Comparison as the centerpiece with card-based layout, "Best Fit" bundle highlighted with an indigo border and badge. Requirement coverage shown as green check / gray X icons per requirement row.

Database: Persist customer intake profiles, generated bundles, upsell suggestions, and which bundle/upsells were ultimately accepted for deal-value analytics.`,
    tools: ["RAG", "CRM", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "product-recommendation-agent-sample.csv", url: "/samples/sales/product-recommendation-agent.csv" },
  },
  {
    category: "Sales",
    title: "Lead Scoring & Qualification",
    description: "Analyze incoming leads, score them based on engagement and fit, and route high-intent leads to sales reps instantly.",
    prompt: `Build a Lead Scoring & Qualification agent that scores incoming leads in real time and instantly routes the hottest ones to sales reps.

AI agents:
1. Lead Capture Agent — Ingests new leads from website forms, email campaign clicks, and chat widget conversations, normalizing them into a single lead record with source attribution.
2. Fit Scoring Agent — Scores each lead's fit (0-100) against the ideal customer profile using firmographic data (industry, company size, title seniority) and stated needs.
3. Engagement Scoring Agent — Scores each lead's engagement (0-100) based on behavioral signals: pages visited, content downloaded, email opens/clicks, and time-on-site, decaying older signals over time.
4. Qualification & Routing Agent — Combines fit + engagement into a composite score, classifies the lead (Hot/Warm/Cold), and for Hot leads instantly notifies the right sales rep (round-robin or territory-based) with full context.
5. Feedback Loop Agent — Tracks what happened to routed leads (converted/lost/no response) and periodically recalibrates the scoring weights based on which signals actually correlated with conversion.

Pages:
1. Lead Inbox — Real-time feed of incoming leads with fit score, engagement score, composite score, and classification badge (Hot/Warm/Cold). New Hot leads pulse/highlight and trigger a toast notification.
2. Lead Detail — Full scoring breakdown: fit factors (radar chart), engagement timeline (activity feed with score contribution per action), composite score gauge, and routing history.
3. Routing Rules — Configure territory/round-robin assignment rules per rep, score thresholds for Hot/Warm/Cold, and notification channels (email/Slack/webhook).
4. Scoring Model Dashboard — KPI row (leads scored today, hot lead conversion rate, avg time-to-first-touch) + scatter plot: fit vs engagement colored by classification + Bar chart: conversion rate by classification tier.
5. Calibration Report — Historical accuracy report: which scoring factors best predicted actual conversion, with a "Recalibrate weights" action and before/after comparison chart.

UI: Lead Inbox as the landing page with a live-updating feed and color-coded classification badges (Hot = red-orange, Warm = amber, Cold = blue-gray). Lead Detail radar chart and score gauge in indigo/green.

Database: Persist all leads, scoring history (fit/engagement/composite over time), routing events, and outcome tracking for the feedback loop.`,
    tools: ["CRM", "Email", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "lead-scoring-qualification-sample.csv", url: "/samples/sales/lead-scoring-qualification.csv" },
  },
  {
    category: "Sales",
    title: "Proposal & Quote Generator",
    description: "Take deal context and client requirements, then produce a polished sales proposal with pricing, timeline, and scope of work.",
    prompt: `Build a Proposal & Quote Generator that turns deal context and client requirements into a polished, ready-to-send sales proposal.

AI agents:
1. Requirements Extraction Agent — Parses deal notes, discovery call transcripts, and CRM fields to extract the client's stated requirements, budget range, timeline expectations, and any special terms discussed.
2. Scope & Pricing Agent — Maps extracted requirements to catalog line items/service packages, computes pricing (with configurable discount rules and approval thresholds for large discounts), and drafts a scope-of-work outline.
3. Timeline Agent — Generates a realistic project/delivery timeline broken into phases with milestones, based on the scope complexity and historical delivery data for similar deals.
4. Proposal Drafting Agent — Assembles the full proposal document: cover page, executive summary tailored to the client's stated pain points, scope of work, pricing table, timeline, terms, and next steps.
5. Approval & Send Agent — Routes proposals above the discount/value threshold to a manager for approval, tracks approval status, and once approved, sends the proposal via email with e-signature-ready formatting and tracks open/view status.

Pages:
1. Deal Intake — Form/import from CRM: client name, requirements, budget range, discovery notes. Submit triggers requirement extraction and scope/pricing generation for review.
2. Proposal Builder — Editable draft view: executive summary, scope-of-work line items (add/remove/reorder), pricing table with discount slider (flags when discount exceeds approval threshold), and timeline gantt-style view.
3. Approval Queue — List of proposals pending manager approval, showing discount %, deal value, and requester. Approve/reject with comment.
4. Sent Proposals Tracker — Table of sent proposals with status (sent/viewed/accepted/expired), view timestamp, and days since sent. Line chart: proposal-to-close conversion rate over time.
5. Reports Page — Export any proposal to a polished PDF. Dashboard: KPI row (proposals sent this month, avg deal value, win rate, avg approval time) + Bar chart: win rate by discount tier.

UI: Proposal Builder styled like a document editor with a live pricing summary sidebar that updates as line items/discounts change. Approval Queue uses amber "pending" badges. Sent Proposals Tracker uses status pill badges (sent=blue, viewed=indigo, accepted=green, expired=gray).

Database: Persist deal intake data, proposal drafts and versions, approval history, and sent/viewed/accepted tracking per proposal.`,
    tools: ["RAG", "CRM", "Email"],
    complexity: "Advanced",
    sampleFile: { name: "proposal-quote-generator-sample.csv", url: "/samples/sales/proposal-quote-generator.csv" },
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
