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
    prompt: `Build a Contract Review Assistant that ingests contracts, flags risk, and drafts redlines against a standard legal playbook.

AI agents:
1. IntakeAgent — Accepts PDF/DOCX contract uploads, extracts full text, identifies contract type (NDA, MSA, vendor agreement, employment, lease), and pulls out parties, effective date, and term length.
2. ClauseAnalyzerAgent — Segments the contract into clauses (indemnification, liability cap, termination, IP assignment, governing law, auto-renewal, etc.), summarizes each in plain English, and flags non-standard or missing clauses against the playbook.
3. RiskScoringAgent — Scores each clause and the overall contract on a risk scale (Low/Medium/High/Critical), citing the specific playbook rule violated and the business exposure.
4. RedlineAgent — Generates suggested redline language for every flagged clause, with a rationale, and produces a track-changes-style comparison against the original text.
5. ApprovalRoutingAgent — Routes contracts above a risk threshold to the right legal reviewer, tracks approval status, and sends reminders for contracts stuck in review.

Pages:
1. Contract Upload & Queue — Drag-and-drop upload, live parsing status, table of all contracts (name, type, counterparty, risk score badge, status, uploaded date). Filterable by type and risk level.
2. Clause Review — Side-by-side original text and AI-suggested redline, per-clause risk badge, accept/reject/edit controls, comment thread per clause.
3. Risk Dashboard — Donut chart of contracts by risk tier, bar chart of most-flagged clause types across all contracts, trend line of average risk score over time.
4. Approval Kanban — Columns: Submitted → In Legal Review → Redlines Sent → Countersigned. Drag cards between stages; each card shows counterparty, risk score, and days in stage.
5. Playbook Manager — Table of standard clauses and acceptable fallback positions; edit rules that drive the RiskScoringAgent and RedlineAgent.

UI: Clean two-pane document workspace (original left, redline right) with a risk-colored sidebar (green/amber/red). Kanban board uses drag handles and colored priority chips.

Database: Persist every contract, extracted clauses, risk scores, redline history, approval status, and reviewer comments. All tables and charts read live from the database.`,
    tools: ["RAG", "PDF Parser", "Email"],
    complexity: "Advanced",
    sampleFile: { name: "contract-review-assistant-sample.csv", url: "/samples/legal/contract-review-assistant.csv" },
  },
  {
    category: "Legal",
    title: "Compliance Monitor",
    description: "Track changes in regulations relevant to your industry and alert you to potential compliance gaps in current policies.",
    prompt: `Build a Compliance Monitor that tracks regulatory changes and continuously checks internal policies for gaps.

AI agents:
1. RegulatoryWatchAgent — Monitors regulatory sources (agency bulletins, industry news, legal feeds) for changes relevant to configured jurisdictions and industries, and summarizes each change in plain language.
2. GapAnalysisAgent — Compares each regulatory change against ingested internal policies, identifies specific clauses that are now non-compliant or ambiguous, and estimates severity.
3. RemediationAgent — Drafts suggested policy language updates to close each identified gap, with a rationale tied to the specific regulation.
4. AlertAgent — Sends prioritized alerts to policy owners based on severity and deadline, tracks acknowledgment, and escalates unresolved critical gaps.

Pages:
1. Regulatory Feed — Chronological table of detected regulatory changes: source, jurisdiction, summary, date detected, affected policy count. Filter by jurisdiction/industry.
2. Gap Analysis Board — Table of open gaps: policy name, regulation triggering it, severity badge, owner, due date, status. Click a row to see the AI's side-by-side comparison.
3. Remediation Workspace — For each gap, shows current policy text, suggested new language, and an accept/edit/reject workflow with version history.
4. Compliance Dashboard — Donut chart of gaps by severity, bar chart of gaps by department/policy area, line chart of open vs. resolved gaps over time, and an overall compliance health score.
5. Policy Library — Searchable table of all ingested policies with last-reviewed date and current compliance status badge.

UI: Regulatory-grade dense tables with severity color coding (green/amber/red/critical-black). Dashboard uses a top KPI strip (open gaps, avg resolution time, compliance score) above the charts.

Database: Persist all regulatory changes, gap records, remediation drafts, approvals, and alert history. Dashboard and feed are fully database-driven, not mocked.`,
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "compliance-monitor-sample.csv", url: "/samples/legal/compliance-monitor.csv" },
  },
  {
    category: "Legal",
    title: "NDA Workflow Manager",
    description: "Draft NDAs from templates, route them for approval, track signing status, and maintain a centralized repository.",
    prompt: `Build an NDA Workflow Manager that drafts, routes, tracks, and archives non-disclosure agreements end to end.

AI agents:
1. DraftingAgent — Selects the correct NDA template (mutual, one-way, employee) based on request type, auto-fills party details, term, and jurisdiction, and flags any custom clauses requested.
2. ApprovalRoutingAgent — Routes the draft to the correct internal approver based on counterparty risk and agreement value, tracks approval decisions, and re-routes on rejection with comments.
3. SigningTrackerAgent — Monitors e-signature status for all parties, sends automated reminders to outstanding signers, and updates the record the moment full execution completes.
4. ExpirationWatchAgent — Scans the repository daily for NDAs nearing expiration or auto-renewal deadlines and notifies the requesting owner with renewal or termination options.

Pages:
1. New NDA Request — Form: counterparty name, type (mutual/one-way/employee), jurisdiction, term length, custom clause notes. Submitting triggers DraftingAgent and shows live generation progress.
2. Approval Queue Kanban — Columns: Draft → Pending Approval → Sent for Signature → Executed → Expired. Drag cards between stages; each card shows counterparty, requester, and days pending.
3. Signature Tracker — Table of all NDAs in signing: signer name, channel, sent date, signed status per party, reminder count. One-click "send reminder now."
4. Repository — Searchable, filterable table of all executed NDAs: counterparty, execution date, expiration date, status badge (Active/Expiring Soon/Expired). Download original PDF.
5. Analytics — Bar chart of NDAs by type, line chart of average time-to-execution over months, donut chart of current repository status mix.

UI: Kanban-first workflow view as the primary screen, with a document repository table as the secondary view. Expiring-soon rows highlighted in amber, expired in red.

Database: Persist every NDA request, draft version, approval decision, signature event, and expiration check. Repository and kanban board read live from the database.`,
    tools: ["Email", "Webhook", "PDF Parser"],
    complexity: "Advanced",
    sampleFile: { name: "nda-workflow-manager-sample.csv", url: "/samples/legal/nda-workflow-manager.csv" },
  },
  {
    category: "Legal",
    title: "Policy Document Analyzer",
    description: "Ingest company policies and regulatory documents, then answer natural language questions about obligations and rights.",
    prompt: `Build a Policy Document Analyzer that ingests policy documents and answers natural-language questions about obligations and rights with grounded citations.

AI agents:
1. IngestionAgent — Accepts PDF/DOCX policies, employment agreements, and regulatory documents, chunks and embeds them into a vector store, and tags each chunk by policy area (leave, conduct, compensation, data privacy, etc.).
2. QueryAgent — Takes a natural-language question, retrieves the most relevant chunks via semantic search, and synthesizes a grounded answer with exact clause citations.
3. ObligationMappingAgent — Extracts every obligation and right mentioned across ingested documents into a structured register (who owes what, to whom, under what condition).
4. ConflictDetectionAgent — Cross-checks newly ingested documents against the existing register to flag contradictory or superseding clauses between policies.

Pages:
1. Document Library — Upload and manage policies/agreements. Ingestion status per document, tag by policy area, delete/re-ingest controls.
2. Ask a Question — Chat interface for natural-language questions; each answer shows inline citations linking back to the exact clause and document.
3. Obligation Register — Table of all extracted obligations/rights: party, obligation description, source document, clause reference, category. Filterable and searchable.
4. Conflict Report — Table of detected conflicts between documents: conflicting clauses side by side, severity, recommended resolution.
5. Analytics — Bar chart of obligations by category, donut chart of documents by policy area, line chart of questions asked over time with top unanswered queries.

UI: Document list on the left, chat on the right (same pattern as a knowledge-base Q&A app), with citations as expandable footnotes. Obligation register as a dense, sortable data table.

Database: Persist ingested documents, extracted obligations, detected conflicts, and full question/answer history for analytics. All pages read live from the database.`,
    tools: ["RAG", "Knowledge Base", "PDF Parser"],
    complexity: "Intermediate",
    sampleFile: { name: "policy-document-analyzer-sample.csv", url: "/samples/legal/policy-document-analyzer.csv" },
  },
  {
    category: "Legal",
    title: "IP & Trademark Watcher",
    description: "Track new trademark filings, patent publications, and domain registrations related to your brand and alert on potential infringements.",
    prompt: `Build an IP & Trademark Watcher that continuously monitors filings and registrations for potential infringement of a brand's marks.

AI agents:
1. FilingWatchAgent — Monitors trademark filings, patent publications, and new domain registrations for names/marks similar to the protected brand portfolio.
2. SimilarityScoringAgent — Scores each detected filing/domain for visual, phonetic, and semantic similarity to protected marks, and classifies risk (Watch/Investigate/Likely Infringement).
3. InvestigationAgent — For flagged items, pulls filer/registrant details, jurisdiction, filing class, and prior related disputes to build an investigation dossier.
4. AlertAgent — Sends prioritized alerts to legal/brand owners based on similarity score and mark importance, and tracks the resolution action taken (monitor/cease-and-desist/opposition filed).

Pages:
1. Watchlist — Table of all protected marks/brands being monitored, with jurisdiction and registration class. Add/edit/remove marks.
2. Detections Feed — Chronological table of new filings/domains detected: mark, source (USPTO/WIPO/domain registrar), similarity score badge, date detected.
3. Investigation Case — Full dossier per flagged item: filer details, similarity breakdown, prior dispute history, recommended action, status (Open/Escalated/Resolved).
4. Analytics Dashboard — Bar chart of detections by source, donut chart of risk classification mix, line chart of detection volume over time by brand.
5. Action Log Kanban — Columns: New → Under Investigation → Legal Action Sent → Resolved. Cards show mark name and similarity score.

UI: Watch-and-alert dashboard feel — top KPI strip (active watches, new detections this week, open cases) above the detections table. Risk badges color-coded green/amber/red.

Database: Persist watched marks, all detections, similarity scores, investigation dossiers, and resolution actions. Dashboard, feed, and kanban board are fully database-driven.`,
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "ip-trademark-watcher-sample.csv", url: "/samples/legal/ip-trademark-watcher.csv" },
  },
  // ── HR ────────────────────────────────────────────────────────────────────
  {
    category: "HR",
    title: "AI Recruiter",
    description: "Screen incoming resumes against job descriptions, rank candidates, and automatically coordinate interview schedules.",
    prompt: `Build an AI Recruiter that screens resumes against open roles, ranks candidates, and coordinates interview scheduling automatically.

AI agents:
1. JobIntakeAgent — Ingests job descriptions, extracts required/preferred skills, experience level, and must-have qualifications into a structured rubric.
2. ResumeScreeningAgent — Parses incoming resumes (PDF/DOCX), extracts skills/experience/education, and scores each candidate against the job rubric with a match percentage and rationale.
3. RankingAgent — Ranks all candidates per open role, groups them into tiers (Strong Match / Possible / Not a Fit), and highlights standout differentiators.
4. SchedulingAgent — For shortlisted candidates, finds mutual availability between candidate and hiring manager, books the interview, and sends calendar invites and reminders to both sides.

Pages:
1. Job Requisitions — Table of open roles: title, department, applicant count, status (Open/Screening/Interviewing/Filled). Add a new requisition with a form.
2. Candidate Pipeline Kanban — Columns: Applied → Screened → Shortlisted → Interviewing → Offer. Cards show candidate name, match score badge, and role.
3. Candidate Detail — Resume preview, match score breakdown by rubric criterion, AI rationale, interview schedule status, notes from hiring manager.
4. Scheduling Board — Calendar view of upcoming interviews with candidate/interviewer pairs; conflict warnings shown inline.
5. Analytics — Funnel chart of candidates by pipeline stage, bar chart of average match score by role, line chart of time-to-hire trend over months.

UI: Kanban pipeline as the primary recruiter view with drag-and-drop stage changes. Match scores shown as colored percentage badges (green ≥80%, amber 50-79%, gray <50%).

Database: Persist requisitions, parsed resumes, match scores, pipeline stage history, and scheduled interviews. All boards and charts read live from the database.`,
    tools: ["Email", "Calendar", "PDF Parser"],
    complexity: "Advanced",
    sampleFile: { name: "ai-recruiter-sample.csv", url: "/samples/hr/ai-recruiter.csv" },
  },
  {
    category: "HR",
    title: "Employee Onboarding Buddy",
    description: "Guide new employees through paperwork, answer common policy questions, and schedule introductory meetings with key team members.",
    prompt: `Build an Employee Onboarding Buddy that guides new hires through paperwork, policy questions, and introductory meetings from offer acceptance through day 30.

AI agents:
1. OnboardingPlanAgent — Generates a personalized onboarding checklist (paperwork, equipment requests, training modules, intro meetings) based on the new hire's role, department, and location.
2. PaperworkAssistantAgent — Walks the new hire through required forms (tax, benefits, equipment), validates completion, and flags anything missing before the start date.
3. PolicyQAAgent — Answers the new hire's natural-language questions about company policy using the knowledge base, with source citations.
4. IntroSchedulerAgent — Identifies key team members (manager, buddy, cross-functional stakeholders) and auto-schedules 1:1 intro meetings across the first two weeks.

Pages:
1. New Hire Dashboard — Personalized checklist with progress bar, upcoming intro meetings list, quick-access policy chat.
2. Paperwork Tracker — Table of required documents per new hire: form name, status (Not Started/In Progress/Complete), due date. HR view across all current hires.
3. Policy Chat — Conversational Q&A interface with cited answers linking to source policy documents.
4. Intro Meeting Schedule — Calendar/list view of scheduled meetings with team members, topic, and confirmation status.
5. HR Cohort Dashboard — Bar chart of onboarding completion rate by department, donut chart of current cohort status mix (On Track/At Risk/Complete), line chart of average time-to-full-onboarding over recent cohorts.

UI: Friendly, welcoming new-hire dashboard with a progress ring at the top. HR cohort dashboard is denser and data-table-driven for people-ops users.

Database: Persist onboarding plans, paperwork status, policy Q&A history, and meeting schedules per new hire. Dashboards read live from the database, not hardcoded cohorts.`,
    tools: ["Knowledge Base", "Email", "Calendar"],
    complexity: "Intermediate",
    sampleFile: { name: "employee-onboarding-buddy-sample.csv", url: "/samples/hr/employee-onboarding-buddy.csv" },
  },
  {
    category: "HR",
    title: "Resume Parser & Standardizer",
    description: "Accept PDF or Word resumes, extract key fields like skills, experience, and education, and output standardized JSON profiles for your ATS.",
    prompt: `Build a Resume Parser & Standardizer that converts unstructured resumes into clean, standardized candidate profiles ready for any ATS.

AI agents:
1. ExtractionAgent — Accepts PDF/DOCX resumes, extracts contact info, work history, education, skills, and certifications, handling varied formats and layouts.
2. NormalizationAgent — Standardizes extracted data into a consistent schema: normalizes job titles, dates, skill names (e.g. "JS" -> "JavaScript"), and education levels.
3. QualityCheckAgent — Flags parsing gaps or low-confidence fields (missing dates, ambiguous titles) for manual review before export.
4. ExportAgent — Outputs standardized JSON profiles and pushes them to the ATS via webhook, or offers bulk CSV/JSON export for batch review.

Pages:
1. Upload Queue — Drag-and-drop bulk resume upload, table showing parse status per file (Pending/Parsed/Needs Review/Exported).
2. Profile Editor — Side-by-side original resume and extracted standardized profile fields; manual correction with inline validation.
3. Review Queue — Table of all low-confidence extractions flagged by QualityCheckAgent, sorted by confidence score, with quick accept/fix actions.
4. Export Center — Select profiles and export as JSON/CSV, or trigger the ATS webhook push; shows export history log.
5. Analytics — Bar chart of parse confidence distribution, donut chart of resumes by status, line chart of daily parsing volume.

UI: Efficient batch-processing workspace — table-first with a document preview panel that slides in on row click. Confidence scores shown as small colored dots (green/amber/red).

Database: Persist every uploaded resume, extracted fields, correction history, and export log. Review queue and analytics are fully database-driven.`,
    tools: ["PDF Parser", "Email", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "resume-parser-standardizer-sample.csv", url: "/samples/hr/resume-parser-standardizer.csv" },
  },
  {
    category: "HR",
    title: "Employee Engagement Pulse",
    description: "Send periodic pulse surveys, analyze sentiment trends across teams, and recommend actionable steps to improve workplace satisfaction.",
    prompt: `Build an Employee Engagement Pulse platform that runs recurring surveys, tracks sentiment trends, and recommends concrete actions to leaders.

AI agents:
1. SurveyDesignAgent — Generates pulse survey question sets (rotating themes: workload, management, growth, belonging) and schedules recurring send cadences per team.
2. SentimentAnalysisAgent — Analyzes open-text responses for sentiment and theme clustering, and computes quantitative eNPS and satisfaction scores per team/department.
3. TrendDetectionAgent — Compares current-cycle scores against historical trends, flags statistically significant drops, and identifies which teams are diverging from the org average.
4. RecommendationAgent — For flagged teams, generates specific, actionable recommendations (e.g. workload rebalancing, 1:1 cadence increase) tied to the underlying survey themes, and drafts a manager briefing.

Pages:
1. Survey Builder — Configure question sets, cadence, and target teams; preview and schedule the next pulse send.
2. Response Dashboard — Live eNPS score, response rate, sentiment breakdown by theme, all filterable by team/department/time range.
3. Team Trend View — Line chart of engagement score over time per team, with flagged inflection points annotated.
4. Action Recommendations — List of flagged teams with AI-generated recommendation, supporting theme evidence, and a manager sign-off/track-progress workflow.
5. Org-Wide Analytics — Bar chart of eNPS by department, donut chart of sentiment theme distribution, funnel chart of survey send -> open -> complete rates.

UI: Executive dashboard feel — top KPI strip (org eNPS, response rate, flagged teams) above trend charts. Recommendation cards use a soft highlight color to stand out.

Database: Persist survey definitions, every response (anonymized), computed scores, trend flags, and recommendation/action tracking. All dashboards read live from the database.`,
    tools: ["Email", "Slack", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "employee-engagement-pulse-sample.csv", url: "/samples/hr/employee-engagement-pulse.csv" },
  },
  {
    category: "HR",
    title: "Performance Review Assistant",
    description: "Collect peer feedback, summarize key themes for each employee, and draft balanced review narratives that managers can refine and approve.",
    prompt: `Build a Performance Review Assistant that collects 360 feedback, synthesizes themes, and drafts balanced review narratives for managers to refine.

AI agents:
1. FeedbackCollectionAgent — Sends structured 360 feedback requests to peers, direct reports, and managers, tracks response completion, and sends reminders for outstanding requests.
2. ThemeSynthesisAgent — Analyzes all collected feedback per employee, clusters comments into themes (strengths, growth areas, collaboration, impact), and identifies consensus vs. outlier opinions.
3. NarrativeDraftingAgent — Drafts a balanced, evidence-backed review narrative per employee, citing anonymized feedback themes and tying them to the company's performance rubric/rating scale.
4. CalibrationAgent — Compares draft ratings across a manager's team (and across peer manager teams) to flag rating inconsistencies or leniency/severity bias before final approval.

Pages:
1. Review Cycle Setup — Configure the review period, select participants, and launch feedback requests; track collection progress per employee.
2. Feedback Collection Tracker — Table of feedback requests: reviewer, subject, relationship (peer/manager/report), status (Sent/Reminded/Completed).
3. Draft Review Editor — Per-employee draft narrative with theme evidence panel alongside, manager edit controls, and approve/send-back workflow.
4. Calibration Dashboard — Bar chart of rating distribution per manager/team, flagged outlier reviews highlighted, side-by-side rating comparison view.
5. Cycle Analytics — Donut chart of review completion status org-wide, line chart of average rating trend across cycles, funnel chart of feedback requested -> collected -> reviewed -> approved.

UI: Narrative editor is the centerpiece — clean document-style layout with a collapsible feedback-evidence sidebar. Calibration dashboard uses a dense comparison grid across managers.

Database: Persist review cycles, all feedback submissions (with reviewer anonymization for subjects), draft/approved narratives, and calibration flags. All dashboards read live from the database.`,
    tools: ["Email", "Slack", "Knowledge Base"],
    complexity: "Advanced",
    sampleFile: { name: "performance-review-assistant-sample.csv", url: "/samples/hr/performance-review-assistant.csv" },
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
    sampleFile: { name: "omni-channel-support-sample.csv", url: "/samples/support/omni-channel-support.csv" },
  },
  {
    category: "Support",
    title: "User Onboarding Guide",
    description: "Monitor new user activity and send proactive tips and tutorials when they seem stuck or inactive.",
    prompt: `Build a User Onboarding Guide that monitors in-product activity and proactively nudges users toward activation with the right tip at the right moment.

AI agents:
1. ActivityMonitorAgent — Ingests product usage events per user, tracks progress against key activation milestones, and detects stuck/inactive patterns (e.g. no login in 3 days, feature started but not completed).
2. SegmentationAgent — Groups users into onboarding segments (New/Activating/Stuck/Churning Risk) based on activity patterns and plan type.
3. NudgeAgent — Selects and sends the most relevant tip, tutorial, or in-app message for each user's current blocker, personalized to their segment and last action taken.
4. EffectivenessAgent — Tracks whether each nudge led to the intended next action, and continuously improves nudge selection using response data.

Pages:
1. User Activity Table — All users with activation milestone progress bar, current segment badge, last active date, last nudge sent.
2. User Detail — Full activity timeline, milestones completed/pending, nudge history with response outcome for that user.
3. Nudge Library — Manage tip/tutorial content mapped to specific blockers or milestones; edit copy and trigger conditions.
4. Segment Kanban — Columns: New → Activating → Stuck → Activated → Churn Risk. Cards show user name, plan, and days in segment.
5. Analytics Dashboard — Funnel chart of activation milestone completion, bar chart of nudge effectiveness by type, line chart of overall activation rate over time.

UI: Lightweight admin console feel — activity table as primary view, segment kanban as a secondary strategic view. Nudge effectiveness shown with green/red response indicators.

Database: Persist user activity events, segment assignments, nudge sends, and outcome tracking. All views and charts read live from the database.`,
    tools: ["Email", "Slack", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "user-onboarding-guide-sample.csv", url: "/samples/support/user-onboarding-guide.csv" },
  },
  {
    category: "Support",
    title: "Voice Customer Support",
    description: "Handle inbound customer calls, triage issues through guided conversation, resolve common problems, and create tickets for complex cases.",
    prompt: `Build a Voice Customer Support agent that handles inbound calls, triages through guided conversation, resolves common issues, and escalates complex ones with a full ticket handoff.

AI agents:
1. CallIntakeAgent — Answers inbound calls, verifies caller identity, and captures the initial issue description via guided voice prompts.
2. TriageAgent — Classifies the issue (billing, technical, account, general), determines urgency, and decides whether it can be resolved on the call or needs escalation.
3. ResolutionAgent — For resolvable issues, walks the caller through a guided troubleshooting or self-service flow using the knowledge base, confirming resolution before ending the call.
4. TicketHandoffAgent — For unresolved or complex issues, creates a structured ticket with call transcript, classification, and suggested next steps, and routes it to the right team.

Pages:
1. Live Calls Monitor — Real-time view of active calls: caller, duration, current triage category, live transcript excerpt.
2. Call Log — Table of completed calls: caller, issue category, resolution status (Resolved/Escalated), duration, timestamp. Click through to full transcript.
3. Ticket Handoffs — Table of tickets created from calls: linked transcript, category, urgency, assigned team, status.
4. Knowledge Base Manager — Manage the guided troubleshooting scripts and articles the ResolutionAgent uses, with usage/success-rate stats per article.
5. Analytics Dashboard — Bar chart of call volume by category, donut chart of resolved-on-call vs. escalated, line chart of average call duration and resolution rate over time.

UI: Call-center style monitor with a live-calls strip at the top and a searchable call log table below. Transcript viewer shows a clean two-column speaker layout (Caller / Agent).

Database: Persist every call, transcript, triage classification, resolution outcome, and any resulting ticket. All dashboards and logs read live from the database.`,
    tools: ["Knowledge Base", "Webhook", "Email"],
    complexity: "Advanced",
    sampleFile: { name: "voice-customer-support-sample.csv", url: "/samples/support/voice-customer-support.csv" },
  },
  {
    category: "Support",
    title: "Ticket Triage & Routing",
    description: "Read incoming support tickets, classify by category and urgency, assign to the right team, and send an instant acknowledgment to the customer.",
    prompt: `Build a Ticket Triage & Routing agent that classifies, prioritizes, and assigns incoming support tickets with an instant customer acknowledgment.

AI agents:
1. IntakeAgent — Ingests tickets from email, web form, and chat, normalizes them into a common schema, and captures customer, subject, and description.
2. ClassificationAgent — Categorizes each ticket (billing, technical, account, feature request) and assigns an urgency level (P1–P4) based on keywords, customer tier, and sentiment.
3. RoutingAgent — Assigns the ticket to the correct team/agent based on category, current workload, and skill match, rebalancing when a team is overloaded.
4. AcknowledgmentAgent — Sends an instant, personalized acknowledgment to the customer with expected response time based on urgency and current queue depth.

Pages:
1. Ticket Queue — Table of all tickets: subject, category, urgency badge, assigned team/agent, status, age. Filterable and sortable.
2. Ticket Detail — Full ticket content, AI classification rationale, routing history, and acknowledgment sent log.
3. Team Workload Board — Kanban-style view per team showing assigned ticket counts and capacity; drag tickets to manually reassign.
4. Routing Rules Manager — Configure category-to-team mapping, urgency thresholds, and workload rebalancing rules.
5. Analytics Dashboard — Bar chart of tickets by category, donut chart of tickets by urgency, funnel chart of ticket status progression (New -> Assigned -> In Progress -> Resolved), line chart of average acknowledgment time.

UI: Dense, sortable ticket queue as the primary view (helpdesk style), with urgency shown as colored left-border stripes on each row. Team workload board as a secondary drag-and-drop view.

Database: Persist every ticket, classification result, routing decision, workload snapshots, and acknowledgment log. Queue and dashboards read live from the database.`,
    tools: ["Email", "Slack", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "ticket-triage-routing-sample.csv", url: "/samples/support/ticket-triage-routing.csv" },
  },
  {
    category: "Support",
    title: "Self-Serve FAQ Builder",
    description: "Analyze past support conversations, identify the most common questions, and auto-generate help center articles with step-by-step solutions.",
    prompt: `Build a Self-Serve FAQ Builder that mines past support conversations to auto-generate and maintain a help center.

AI agents:
1. ConversationMiningAgent — Ingests historical support tickets/chats/calls and clusters them by underlying question or issue, ranking clusters by frequency and resolution cost.
2. ArticleDraftingAgent — For each high-frequency cluster, drafts a help center article with a clear title, step-by-step solution, and screenshots/placeholders where relevant, sourced from the highest-quality historical resolutions.
3. GapDetectionAgent — Identifies recurring questions that have no existing or adequate help article, and flags them as content gaps.
4. FreshnessAgent — Periodically re-checks published articles against recent support conversations to detect when an article's steps have gone stale (e.g. product UI changed) and flags it for review.

Pages:
1. Question Clusters — Table of mined question clusters: representative question, frequency count, average resolution cost, has-article status.
2. Article Editor — Draft/edit help center articles with step-by-step formatting, linked source conversations for reference, and a publish/unpublish toggle.
3. Content Gap Report — Table of high-frequency clusters with no article, sorted by frequency, with a one-click "generate draft" action.
4. Article Health Dashboard — Table of published articles flagged as stale, with the reason (e.g. "12 recent tickets contradict these steps") and last-reviewed date.
5. Analytics — Bar chart of top question clusters by volume, donut chart of article coverage (Covered/Gap/Stale), line chart of ticket deflection rate over time since publishing new articles.

UI: Content-management style workspace — article list with status badges (Published/Draft/Stale/Gap) on the left, rich text editor on the right showing source conversation excerpts in a collapsible panel.

Database: Persist mined clusters, source conversation links, drafted/published articles, gap flags, staleness checks, and deflection metrics. All dashboards and reports read live from the database.`,
    tools: ["RAG", "Knowledge Base", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "self-serve-faq-builder-sample.csv", url: "/samples/support/self-serve-faq-builder.csv" },
  },
  // ── Productivity ──────────────────────────────────────────────────────────
  {
    category: "Productivity",
    title: "Executive Meeting Assistant",
    description: "Review your calendar, prepare briefing notes for upcoming meetings, and draft follow-up emails based on meeting transcripts.",
    prompt: `Build 'MeetingIQ' — an executive meeting assistant that reviews the calendar, prepares briefing notes ahead of every meeting, and drafts follow-up emails and action items from transcripts.

AI agents:
1. CalendarScannerAgent — Scans the upcoming calendar, identifies meetings needing prep (external attendees, recurring 1:1s, high-value external meetings), and pulls attendee context from connected contact records and email history.
2. BriefingAgent — Generates a pre-meeting brief per event: attendee bios, last interaction summary, open action items, talking points, and suggested agenda.
3. TranscriptAgent — Ingests meeting transcripts (uploaded or auto-captured), extracts decisions, action items (owner + due date), and key quotes.
4. FollowUpAgent — Drafts a follow-up email per meeting summarizing decisions and action items, ready to send or edit, and schedules reminder nudges for overdue items.

Pages:
1. Today's Agenda — Timeline view of today's meetings with a "Brief Ready" badge per event; click to expand the full briefing card (attendees, history, talking points).
2. Meeting Briefs — Searchable list/table of all upcoming briefs with columns: meeting, time, attendees, prep status, priority. Filter by priority and date range.
3. Action Items Board — Kanban view (To Do / In Progress / Done) of action items extracted from transcripts, grouped by meeting, with owner avatars and due-date badges; overdue items highlighted red.
4. Analytics — Bar chart of meetings prepped vs. attended per week, donut chart of action-item completion rate, line chart of average follow-up turnaround time.
5. Follow-Up Drafts — List of AI-drafted follow-up emails with send/edit/schedule actions and a status column (Draft / Sent / Scheduled).

UI: Slate sidebar with calendar-style nav icons, light content area, briefing cards use a left accent bar colored by priority. Kanban columns use soft background tints. Charts rendered with Recharts.

Database: Persist every meeting, briefing, transcript, extracted action item, and follow-up draft with timestamps and status; all pages read live from the DB, never hardcoded.`,
    tools: ["Calendar", "Email", "Slack"],
    complexity: "Intermediate",
    sampleFile: { name: "executive-meeting-assistant-sample.csv", url: "/samples/productivity/executive-meeting-assistant.csv" },
  },
  {
    category: "Productivity",
    title: "Email Triage & Drafter",
    description: "Categorize incoming emails by urgency, draft responses for routine inquiries, and summarize long threads.",
    prompt: `Build 'InboxPilot' — an email triage and drafting agent that classifies incoming email by urgency, drafts responses for routine inquiries, and condenses long threads into digestible summaries.

AI agents:
1. TriageAgent — Classifies each incoming email by urgency (Urgent/Normal/Low), category (billing, request, FYI, spam), and sentiment; flags anything needing same-day response.
2. DraftingAgent — For routine, pattern-matched inquiries, generates a ready-to-send reply using prior thread context and a tone matched to the sender relationship.
3. SummarizerAgent — Condenses long threads (10+ messages) into a 3-5 bullet summary with key decisions and open questions highlighted.
4. FollowUpTrackerAgent — Detects emails awaiting a reply past a configurable SLA and surfaces them as reminders.

Pages:
1. Priority Inbox — Table view of emails with columns: sender, subject, urgency badge (color-coded), category, AI-suggested action, received time. Sortable and filterable by urgency/category.
2. Thread View — Full email thread with the AI-generated summary pinned at the top, draft reply panel on the right (editable before sending), and a "Mark Resolved" action.
3. Draft Queue — Kanban board (Awaiting Review / Approved / Sent) of AI-drafted responses so the user can batch-approve routine replies.
4. Analytics Dashboard — Bar chart of email volume by category, donut chart of urgency distribution, line chart of average response time trend over the last 30 days.
5. SLA Watchlist — List of emails past their response SLA with days-overdue counter and one-click "Draft Reply Now" action.

UI: Two-pane layout — inbox list on the left, thread/detail on the right, similar to Superhuman/Gmail. Urgency badges use red/amber/green. Charts in Analytics use Recharts with a clean light theme.

Database: Every email, its classification, draft, summary, and SLA status is persisted; all list and analytics views query the database live.`,
    tools: ["Email", "Slack"],
    complexity: "Intermediate",
    sampleFile: { name: "email-triage-drafter-sample.csv", url: "/samples/productivity/email-triage-drafter.csv" },
  },
  {
    category: "Productivity",
    title: "Team Calendar Coordinator",
    description: "Check availability across team members, suggest optimal meeting times, send invites, and prevent double-bookings automatically.",
    prompt: `Build 'SyncBoard' — a team calendar coordination agent that checks cross-team availability, suggests optimal meeting slots, sends invites, and prevents double-bookings automatically.

AI agents:
1. AvailabilityAgent — Aggregates free/busy data across all team members' calendars and computes overlapping open slots for a requested meeting duration and date range.
2. SchedulingAgent — Ranks the open time slots by attendee preference, timezone fairness, and meeting-fatigue score (avoids back-to-back overload), then proposes the top 3.
3. InviteAgent — Sends calendar invites once a slot is confirmed, attaches agenda and video link, and manages RSVPs and reschedule requests.
4. ConflictGuardAgent — Continuously monitors the team calendar for double-bookings or last-minute conflicts and proactively alerts affected attendees with reschedule options.

Pages:
1. Team Calendar — Weekly calendar grid view showing all team members' events side by side with color-coding per person; conflicts highlighted with a red outline.
2. Schedule a Meeting — Form: title, attendees (multi-select), duration, date range, preferences. Submit triggers Availability + Scheduling agents and shows the top 3 suggested slots with a one-click "Book" button.
3. Conflict Center — Kanban view (Detected / Notified / Resolved) of scheduling conflicts with affected attendees and suggested resolution slots.
4. Team Load Dashboard — Bar chart of meeting hours per team member this week, donut chart of meeting-type distribution (1:1, standup, external), line chart of meeting-fatigue score trend.
5. Invite History — Table of sent invites with columns: meeting, attendees, status (Pending/Accepted/Declined), sent date; filter by status.

UI: Calendar-first layout with a left mini-calendar navigator, main weekly grid, and a right "Suggestions" panel. Conflict rows pulse subtly until resolved. Charts via Recharts.

Database: All meetings, availability snapshots, conflicts, and invite statuses are stored and read live; nothing is hardcoded or mocked.`,
    tools: ["Calendar", "Email", "Slack"],
    complexity: "Intermediate",
    sampleFile: { name: "team-calendar-coordinator-sample.csv", url: "/samples/productivity/team-calendar-coordinator.csv" },
  },
  {
    category: "Productivity",
    title: "Morning Briefing Agent",
    description: "Compile calendar events, pending tasks, priority emails, and relevant industry news into a concise morning digest delivered at 8 AM.",
    prompt: `Build 'DawnBrief' — a daily morning briefing agent that compiles calendar events, pending tasks, priority emails, and relevant industry news into one concise digest delivered every morning.

AI agents:
1. AggregatorAgent — Pulls today's calendar events, open tasks, unread priority emails, and top industry news for the user's tracked topics into a single raw feed.
2. PrioritizerAgent — Ranks items across all sources by urgency and relevance, trims to the top 8-10, and groups them into digest sections (Meetings, Tasks, Inbox, News).
3. DigestWriterAgent — Writes the final digest in a concise, scannable narrative with a one-line "Focus of the Day" summary at the top.
4. DeliveryAgent — Assembles the digest into the app and optionally emails/Slacks it at the configured delivery time, then tracks read/open status.

Pages:
1. Today's Digest — The rendered morning brief: "Focus of the Day" banner, then sectioned cards for Meetings, Tasks, Priority Emails, and News, each with source links.
2. Digest History — Calendar view where each day shows a colored dot if a digest was generated; click a day to view that digest in full.
3. Task & Email Sources — Table view of the raw items feeding today's digest (task, email, calendar item) with an "Include/Exclude from digest" toggle per row.
4. Engagement Analytics — Line chart of digest open rate over the last 30 days, bar chart of item counts per section per day, donut chart of news topic distribution.
5. Preferences — Form to configure delivery time, delivery channel (email/Slack/in-app), tracked news topics, and max items per section.

UI: Warm, editorial "morning newspaper" light theme with a masthead header showing the date. Digest sections use card layout with icons. Calendar history view uses a heatmap-style dot calendar. Charts via Recharts.

Database: Every generated digest, its source items, and open/read events are persisted; history and analytics pages read live from the database.`,
    tools: ["Calendar", "Email", "Web Search"],
    complexity: "Intermediate",
    sampleFile: { name: "morning-briefing-agent-sample.csv", url: "/samples/productivity/morning-briefing-agent.csv" },
  },
  {
    category: "Productivity",
    title: "Notion Workspace Automator",
    description: "Capture action items from Slack conversations and meeting notes, create tasks in Notion, and send reminders before deadlines.",
    prompt: `Build 'TaskWeave' — a Notion workspace automation agent that captures action items from Slack conversations and meeting notes, creates and tracks tasks in the connected workspace, and sends deadline reminders.

AI agents:
1. CaptureAgent — Monitors connected Slack channels and uploaded meeting notes, extracts likely action items (owner, description, implied due date) using NLP.
2. TaskCreationAgent — De-duplicates extracted items against existing workspace tasks, then creates new task entries with title, assignee, status, priority, and due date.
3. ReminderAgent — Tracks upcoming and overdue due dates and sends reminders to assignees via Slack/email on a configurable cadence (T-2 days, T-0, overdue).
4. WorkspaceSyncAgent — Keeps task status changes bidirectionally in sync between the app's database and the connected workspace, and reconciles conflicts.

Pages:
1. Task Board — Kanban view (Not Started / In Progress / Blocked / Done) of all tasks with assignee avatars, priority tags, and due-date badges (red if overdue).
2. Capture Log — Table of raw items captured from Slack/notes with columns: source, extracted text, confidence, action taken (Created/Merged/Ignored), date.
3. Reminders Center — List of scheduled and sent reminders per task with delivery channel and status (Scheduled/Sent/Acknowledged).
4. Team Workload — Bar chart of open tasks per assignee, donut chart of tasks by status, line chart of tasks completed per week over the last quarter.
5. Source Connections — Form/list to manage connected Slack channels and meeting-note folders, with a toggle to enable/disable capture per source.

UI: Notion-inspired minimal light theme with a left workspace-style sidebar (Board, Log, Reminders, Workload, Connections) and card-based task tiles with subtle drag-and-drop shadows. Charts via Recharts.

Database: Every captured item, created task, reminder, and sync event is persisted with full history; the board and analytics always reflect live database state, never hardcoded demo tasks.`,
    tools: ["Slack", "Webhook", "Calendar"],
    complexity: "Advanced",
    sampleFile: { name: "notion-workspace-automator-sample.csv", url: "/samples/productivity/notion-workspace-automator.csv" },
  },
  // ── Development ───────────────────────────────────────────────────────────
  {
    category: "Development",
    title: "Automated Code Reviewer",
    description: "Analyze pull requests for security vulnerabilities, performance issues, and adherence to your style guide.",
    prompt: `Build 'ReviewGuard' — an automated code review agent that analyzes every pull request for security vulnerabilities, performance issues, and style-guide adherence, then posts structured feedback.

AI agents:
1. StaticAnalysisAgent — Runs on each PR diff, flags security vulnerabilities (injection risks, secrets in code, unsafe deserialization), and severity-scores each finding.
2. PerformanceAgent — Reviews diffs for performance anti-patterns (N+1 queries, unbounded loops, blocking calls in async code) and suggests fixes with code snippets.
3. StyleGuideAgent — Checks the diff against the team's configured style guide (naming, formatting, file structure, comment conventions) and auto-suggests corrections.
4. ReviewSynthesizerAgent — Merges findings from all three agents into a single structured PR comment with a pass/fail outcome and blocking vs. non-blocking issues.

Pages:
1. PR Review Queue — Table of open PRs with columns: repo, title, author, risk score (color-coded), findings count, review status (Pending/Reviewed/Blocked).
2. Review Detail — Full diff view with inline AI comments per line, grouped by category (Security/Performance/Style), each with severity tag and suggested fix; approve/request-changes actions.
3. Findings Library — Searchable/filterable table of all historical findings across PRs by type, severity, and repo, with a "resolved" toggle.
4. Analytics Dashboard — Bar chart of findings by category per week, donut chart of severity distribution, line chart of average time-to-resolution trend across repos.
5. Style Guide Config — Form to define/edit style rules (naming conventions, max function length, required doc comments) with a live preview of how a sample diff would be flagged.

UI: Developer-dark theme (GitHub-style), monospace diff panels with color-coded line annotations (red=security, amber=performance, blue=style). Charts via Recharts on a dark-compatible palette.

Database: Every PR, finding, outcome, and style-rule change is persisted with timestamps; the queue, library, and analytics pages always read live data, never mocked results.`,
    tools: ["GitHub", "Webhook", "Slack"],
    complexity: "Advanced",
    sampleFile: { name: "automated-code-reviewer-sample.csv", url: "/samples/development/automated-code-reviewer.csv" },
  },
  {
    category: "Development",
    title: "Documentation Generator",
    description: "Watch your codebase and automatically update API documentation and README files when code changes are merged.",
    prompt: `Build 'DocSync' — a documentation generator agent that watches the codebase for merged changes and automatically keeps API documentation and README files accurate and current.

AI agents:
1. ChangeWatcherAgent — Monitors merged commits/PRs, detects changes to public functions, endpoints, config, or exported types, and diffs them against existing docs.
2. DocDraftAgent — Generates or updates documentation sections (function signatures, parameters, examples, README feature lists) matching the detected code changes.
3. ConsistencyAgent — Cross-checks generated docs against the actual code for drift (renamed params, removed endpoints, outdated examples) and flags mismatches.
4. PublishAgent — Opens a documentation PR with the proposed changes, or auto-merges low-risk updates (typo-level, formatting) based on configured trust thresholds.

Pages:
1. Doc Health Dashboard — Bar chart of docs coverage by module/file, donut chart of doc freshness (Up to date / Stale / Missing), line chart of drift incidents over time.
2. Pending Updates — Table of detected code changes awaiting doc updates: file, change type, affected doc section, status (Drafted/Awaiting Review/Published).
3. Doc Editor — Side-by-side view of the code diff and the AI-drafted doc update, with accept/edit/reject controls per section.
4. Drift Log — List of consistency findings (doc says X, code does Y) with severity and a "Regenerate" action per item.
5. Publish History — Table of documentation PRs/commits made by the agent with timestamp, files touched, and merge status.

UI: Clean docs-site aesthetic (light theme, sidebar table-of-contents style navigation) with a Markdown preview pane. Diff/editor view uses split panels. Charts via Recharts.

Database: Every detected change, drafted doc update, drift finding, and publish event is persisted with timestamps; dashboards and logs always reflect live database state.`,
    tools: ["GitHub", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "documentation-generator-sample.csv", url: "/samples/development/documentation-generator.csv" },
  },
  {
    category: "Development",
    title: "API Documentation Assistant",
    description: "Connect to your GitHub repo, analyze endpoints and schemas, and generate developer-friendly documentation with request/response examples.",
    prompt: `Build 'EndpointScribe' — an API documentation assistant that connects to a GitHub repo, analyzes endpoints and schemas, and generates developer-friendly docs with request/response examples and edge cases.

AI agents:
1. RepoAnalyzerAgent — Scans the connected repo for route definitions, request/response schemas, and auth requirements, and builds a structured endpoint inventory.
2. ExampleGeneratorAgent — For each endpoint, generates realistic request/response JSON examples, common error responses, and edge-case scenarios (rate limits, invalid input, auth failure).
3. NarrativeAgent — Writes human-readable descriptions per endpoint (purpose, when to use it, gotchas) in a consistent developer-friendly voice.
4. VersionDiffAgent — Detects breaking vs. non-breaking changes between repo versions and flags endpoints whose docs need re-review.

Pages:
1. Endpoint Catalog — Table of all discovered endpoints: method, path, auth required, last updated, doc status (Generated/Reviewed/Stale). Filterable by tag/service.
2. Endpoint Detail — Full doc page per endpoint: description, parameters table, request/response example blocks (syntax-highlighted), error codes, edge cases.
3. Version Diff View — Side-by-side comparison of an endpoint's schema across two repo versions with breaking changes highlighted in red.
4. Coverage Dashboard — Bar chart of documented vs. undocumented endpoints per service, donut chart of doc freshness, line chart of breaking-change frequency over releases.
5. Export & Publish — Page to export the full catalog as OpenAPI/Swagger JSON or a static docs site bundle, with a history of past exports.

UI: Developer-docs aesthetic similar to Stripe/Swagger UI — left endpoint tree navigation, main content with tabbed request/response examples, syntax-highlighted code blocks. Charts via Recharts.

Database: Every endpoint, generated example, narrative, and version diff is persisted; catalog and dashboard pages always read live from the database, never a static spec file.`,
    tools: ["GitHub", "RAG", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "api-documentation-assistant-sample.csv", url: "/samples/development/api-documentation-assistant.csv" },
  },
  {
    category: "Development",
    title: "Bug Triage Agent",
    description: "Read incoming GitHub issues, classify severity and affected component, suggest root causes, and assign to the right developer.",
    prompt: `Build 'TriageBot' — a bug triage agent that reads incoming GitHub issues, classifies severity and affected component, suggests likely root causes from the codebase, and assigns each bug to the right developer.

AI agents:
1. IssueClassifierAgent — Reads each new GitHub issue, classifies severity (Critical/High/Medium/Low), affected component/module, and issue type (bug/regression/feature request misfiled as bug).
2. RootCauseAgent — Searches the codebase and recent commit history for likely root cause locations, linking suspect files/functions and recent related changes.
3. AssignmentAgent — Matches the classified bug to the best-fit developer based on code ownership, recent activity in the affected component, and current workload.
4. DuplicateDetectionAgent — Checks new issues against open issues for semantic duplicates and links/merges them automatically with a confidence score.

Pages:
1. Triage Queue — Table of incoming issues with columns: title, severity badge, component, suggested assignee, duplicate flag, status (New/Triaged/Assigned).
2. Issue Detail — Full issue view with AI-suggested root cause files/functions linked to the repo, suggested assignee with rationale, and a "Confirm Assignment" action.
3. Bug Board — Kanban view (New / Triaged / In Progress / Resolved) grouped by severity color, with assignee avatars per card.
4. Analytics Dashboard — Bar chart of bugs by component, donut chart of severity distribution, line chart of average triage-to-assignment time over the last quarter.
5. Duplicate Clusters — List of detected duplicate issue groups with a merge/unmerge action and confidence score per cluster.

UI: Developer-dark theme matching GitHub Issues conventions, severity badges in red/orange/yellow/gray, root-cause suggestions shown as clickable file-path chips. Charts via Recharts.

Database: Every issue, classification, root-cause suggestion, assignment, and duplicate link is persisted; the queue, board, and analytics pages always read live database state.`,
    tools: ["GitHub", "Slack", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "bug-triage-agent-sample.csv", url: "/samples/development/bug-triage-agent.csv" },
  },
  {
    category: "Development",
    title: "Release Notes Generator",
    description: "Analyze merged PRs and commits since the last release, categorize changes by type, and generate a polished changelog for users.",
    prompt: `Build 'ChangelogForge' — a release notes generator that analyzes merged PRs and commits since the last release, categorizes changes by type, and produces a polished, user-facing changelog.

AI agents:
1. CommitCollectorAgent — Pulls all merged PRs and commits since the last tagged release, extracting PR titles, descriptions, and linked issue references.
2. CategorizerAgent — Classifies each change into categories (Features, Fixes, Improvements, Breaking Changes, Deprecations) using commit conventions and PR labels.
3. RewriteAgent — Rewrites internal, technical PR titles into clear, user-facing changelog entries, removing jargon and grouping related changes.
4. PublishAgent — Assembles the final changelog, versions it, and publishes it to the release notes page and optionally emails/Slacks a summary to subscribers.

Pages:
1. Release Builder — Form/wizard: select version range or "since last release," trigger the workflow, preview categorized draft entries with edit-in-place before publishing.
2. Changelog Archive — List of all published releases (version, date, entry count) with expandable full changelog per version.
3. Draft Review — Table of AI-categorized entries awaiting review: original PR title, rewritten entry, category, include/exclude toggle.
4. Analytics Dashboard — Bar chart of changes by category per release, donut chart of breaking vs. non-breaking changes, line chart of release cadence (days between releases) over the last year.
5. Subscriber Notifications — Table of past notification sends (email/Slack) per release with delivery status and open-rate tracking.

UI: Clean, product-marketing-style light theme for the public changelog archive (like a public "What's New" page) paired with an internal dark-toned review/draft workspace. Charts via Recharts.

Database: Every commit/PR pulled, categorized entry, rewritten changelog line, and published release is persisted with version history; archive and analytics pages always read live from the database.`,
    tools: ["GitHub", "Slack", "Email"],
    complexity: "Intermediate",
    sampleFile: { name: "release-notes-generator-sample.csv", url: "/samples/development/release-notes-generator.csv" },
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
    sampleFile: { name: "vendor-comparison-scorecard-sample.csv", url: "/samples/analysts/vendor-comparison-scorecard.csv" },
  },
  {
    category: "Analysts",
    title: "Market Sizing Calculator",
    description: "Enter assumptions like buyer count, deal size, and growth rates to calculate TAM, SAM, and SOM with a breakdown chart.",
    prompt: `Build a Market Sizing Calculator platform for analysts sizing new markets.

AI agents:
1. Assumptions Agent — Takes user inputs (total potential buyers, average purchase size, adoption rate, penetration rate, growth rate, geography/segment filters) and validates them against typical industry ranges, flagging assumptions that look unrealistic with a suggested benchmark range.
2. Calculation Agent — Computes TAM (Total Addressable Market), SAM (Serviceable Addressable Market), and SOM (Serviceable Obtainable Market) from the assumptions, produces a 5-year growth projection, and runs three scenarios (Conservative, Base, Aggressive) by flexing adoption and growth rates.
3. Narrative Agent — Writes a 2-3 paragraph executive summary explaining the sizing logic, key assumptions driving the result, and the biggest risks to the estimate, in plain analyst language suitable for a client deck.

Pages:
1. Assumptions Builder — Form with fields for total buyers, average purchase size, adoption %, penetration %, annual growth %, plus optional segment/geography breakdown rows. "Validate Assumptions" button runs the Assumptions Agent and shows inline benchmark warnings.
2. TAM/SAM/SOM Dashboard — Funnel chart showing TAM > SAM > SOM narrowing, KPI tiles for each figure, and a stacked bar chart of the 5-year projection. Scenario toggle (Conservative/Base/Aggressive) updates all charts live.
3. Scenario Comparison — Side-by-side table and grouped bar chart comparing all three scenarios across Year 1, Year 3, Year 5. Sensitivity slider showing how SOM changes as adoption rate moves.
4. Report — Auto-generated summary combining the Narrative Agent's write-up, the funnel chart, and the scenario table. Export as PDF (jsPDF) or Excel (xlsx) for client-ready deliverables.

UI: Clean light theme, large number KPI tiles with currency formatting, funnel and bar charts via Recharts, scenario toggle pills at top of dashboard.

Sample data: Pre-populate with a SaaS market sizing example (50,000 potential buyers, $12,000 average purchase size, 8% adoption, 15% annual growth).`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "market-sizing-calculator-sample.csv", url: "/samples/analysts/market-sizing-calculator.csv" },
  },
  {
    category: "Analysts",
    title: "Technology Hype Cycle Builder",
    description: "Plot emerging technologies on a hype cycle curve with stage placement and time-to-mainstream estimates.",
    prompt: `Build a Technology Hype Cycle Builder for analysts tracking emerging tech.

AI agents:
1. Research Agent — Given a technology name, searches the web for recent news, funding activity, adoption signals, and vendor announcements, and suggests a starting hype-cycle stage (Innovation Trigger, Peak of Inflated Expectations, Trough of Disillusionment, Slope of Enlightenment, Plateau of Productivity) with supporting evidence.
2. Positioning Agent — Places each technology on the curve x/y coordinates based on stage and estimated years-to-mainstream, and detects clustering/overlap to auto-space labels for readability.
3. Narrative Agent — Writes a one-paragraph rationale per technology explaining why it sits where it does and what would move it to the next stage.

Pages:
1. Technology Registry — Add technologies by name (manual or "Auto-Research" via the Research Agent). Table view: name, category, current stage badge, years-to-mainstream estimate, last updated.
2. Hype Cycle Curve — Interactive SVG/Recharts curve with technologies plotted as draggable dots along the classic hype-cycle line, color-coded by category, labeled with technology name and years-to-mainstream on hover.
3. Technology Detail — Click any technology to see the Research Agent's evidence, the Narrative Agent's rationale, and a small trend chart of stage movement over past updates (if tracked over time).
4. Export & Reports — Clean exportable curve image plus a categorized table (by stage, by years-to-mainstream) for inclusion in research reports. Export as PDF or PNG.

UI: Professional light theme resembling analyst-firm hype cycle charts — smooth S-curve, color-coded category legend, draggable/clickable dots.

Sample data: Pre-populate with 10 technologies across AI, cloud, and biotech (e.g. Agentic AI, Quantum Computing, Synthetic Biology, Edge AI) at varied stages.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "technology-hype-cycle-builder-sample.csv", url: "/samples/analysts/technology-hype-cycle-builder.csv" },
  },
  {
    category: "Analysts",
    title: "Comparable Company Analyzer",
    description: "Build comp tables with revenue, EBITDA, and market cap data to automatically calculate EV/Revenue, EV/EBITDA, and P/E ratios.",
    prompt: `Build a Comparable Company Analyzer for equity research and valuation work.

AI agents:
1. Data Intake Agent — Accepts company financials (revenue, EBITDA, net income, market cap, total debt, cash, growth rate) via manual entry or CSV upload, validates completeness, and calculates enterprise value (EV = market cap + debt - cash) for each company.
2. Multiples Agent — Calculates EV/Revenue, EV/EBITDA, and P/E ratio for every company, computes the peer group median, mean, and standard deviation for each multiple, and flags statistical outliers (>1.5 std dev from median).
3. Valuation Agent — Applies the peer median multiple to a target company's own financials (if provided) to produce an implied valuation range, and writes a short analyst commentary on which peers are most/least comparable and why.

Pages:
1. Peer Group Builder — Table to add/edit companies with financial inputs, CSV bulk import, inline validation (negative EBITDA flagged, missing fields highlighted).
2. Comp Table — Full comparable company table: company name, revenue, EBITDA, EV, EV/Revenue, EV/EBITDA, P/E, growth rate. Median and mean rows pinned at bottom. Outlier cells highlighted in amber with a tooltip explaining why.
3. Valuation Summary — Bar chart comparing each peer's EV/EBITDA multiple against the peer median line, plus an implied valuation range card for the target company using median/mean multiples (low/base/high).
4. Analyst Report — Auto-generated commentary from the Valuation Agent plus the comp table and chart, exportable as PDF or Excel with formulas intact.

UI: Data-dense, spreadsheet-style table with sortable columns, color-coded outlier highlighting (red high / green low relative to median), professional light theme.

Sample data: Pre-populate with 8 cloud software companies with realistic FY financials and multiples.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "comparable-company-analyzer-sample.csv", url: "/samples/analysts/comparable-company-analyzer.csv" },
  },
  {
    category: "Analysts",
    title: "DCF Model Builder",
    description: "Input revenue projections, margins, capex, and discount rate to calculate free cash flows, present values, and implied share price.",
    prompt: `Build a DCF Model Builder for financial analysts and equity researchers.

AI agents:
1. Projections Agent — Takes revenue growth assumptions, margin assumptions, capex %, and working capital change % across a 5-10 year horizon and builds out the full projected income statement and free cash flow schedule.
2. Valuation Agent — Discounts each year's free cash flow to present value using the user's WACC/discount rate, calculates terminal value using the Gordon Growth method (terminal growth rate) or exit multiple method, sums to enterprise value, then bridges to implied equity value and per-share price using shares outstanding and net debt.
3. Sensitivity Agent — Runs the model across a grid of discount rate x terminal growth rate combinations and produces a sensitivity table/heatmap showing implied share price at each combination, plus identifies which single assumption the valuation is most sensitive to.

Pages:
1. Assumptions Input — Form for revenue growth (per year or CAGR), EBITDA margin, D&A %, tax rate, capex %, working capital change %, WACC/discount rate, terminal growth rate, shares outstanding, net debt.
2. Projection Model — Full year-by-year table: revenue, EBITDA, EBIT, taxes, D&A, capex, change in WC, unlevered free cash flow, discount factor, present value. Editable inline with live recalculation.
3. Valuation Output — KPI tiles for Enterprise Value, Equity Value, Implied Share Price. Waterfall chart bridging EV to equity value. Bar chart of yearly free cash flow and present value.
4. Sensitivity & Export — Heatmap table of implied share price across discount rate x terminal growth rate grid (color-scaled). Export full model to Excel (with all inputs/formulas visible) or PDF summary.

UI: Financial-modeling aesthetic — monospace numbers, right-aligned columns, green/red for positive/negative deltas, professional light theme with a sticky assumptions panel.

Sample data: Pre-populate with a mid-cap SaaS company DCF (revenue $200M, 20% growth tapering to 3% terminal, 25% EBITDA margin, 9% WACC, 2.5% terminal growth).`,
    tools: ["Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "dcf-model-builder-sample.csv", url: "/samples/analysts/dcf-model-builder.csv" },
  },
  {
    category: "Analysts",
    title: "ROI & Business Case Calculator",
    description: "Input upfront costs, ongoing costs, expected benefits, and discount rate to automatically get NPV, IRR, payback period, and cash flow chart.",
    prompt: `Build an ROI & Business Case Calculator for consultants and analysts justifying investments.

AI agents:
1. Cash Flow Agent — Builds a year-by-year cash flow schedule from upfront cost, recurring/ongoing costs, and expected benefits per year across the chosen time horizon.
2. Financial Metrics Agent — Calculates NPV using the user's discount rate, IRR (via iterative solve), simple and discounted payback period, and benefit-cost ratio.
3. Risk & Narrative Agent — Flags business cases with thin margins (NPV close to zero, payback beyond 3 years) as "marginal", runs a quick best/worst case using +/-20% benefit variance, and writes a one-paragraph investment recommendation.

Pages:
1. Business Case Inputs — Form for project name, upfront cost, ongoing annual cost, expected annual benefit (can vary by year), time horizon, discount rate.
2. Cash Flow Schedule — Table of year-by-year cash flow, cumulative cash flow, and discounted cash flow. Line chart showing cumulative cash flow crossing zero at the payback point.
3. Results Dashboard — KPI tiles for NPV, IRR, Payback Period, Benefit-Cost Ratio, each with a green/amber/red status badge. Best/worst case range chart (tornado-style) showing NPV under +/-20% benefit swings.
4. Business Case Report — Auto-generated one-page summary (Narrative Agent recommendation + key metrics + cash flow chart) exportable as PDF, ready to attach to a business case document.

UI: Clean light theme, prominent KPI cards with status badges (green "Strong", amber "Marginal", red "Weak"), Recharts line and bar charts.

Sample data: Pre-populate with a process automation business case ($150K upfront, $20K/year ongoing cost, $80K/year benefit, 5-year horizon, 8% discount rate).`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "roi-business-case-calculator-sample.csv", url: "/samples/analysts/roi-business-case-calculator.csv" },
  },
  // ── Data & Analysis ───────────────────────────────────────────────────────
  {
    category: "Data & Analysis",
    title: "Stock Market Analyst",
    description: "Monitor portfolio tickers, aggregate news and analyst ratings, and send a pre-market summary every morning.",
    prompt: `Build a Stock Market Analyst platform for portfolio monitoring.

AI agents:
1. News Aggregation Agent — Monitors a user-defined list of portfolio tickers, searches the web for overnight news, earnings announcements, and price-moving events for each ticker, and summarizes each into 1-2 sentences.
2. Ratings & Sentiment Agent — Aggregates recent analyst rating changes (upgrades/downgrades/price target changes) per ticker and computes an overall sentiment score (Bullish/Neutral/Bearish) based on news tone and rating activity.
3. Pre-Market Briefing Agent — Compiles the news summaries and sentiment scores into a structured pre-market digest ranked by relevance/magnitude of overnight movement, and drafts an email-ready summary.

Pages:
1. Portfolio Setup — Add/manage tickers in the watchlist, group into custom categories (e.g. "Core Holdings", "Watch List"), set alert thresholds for price moves.
2. Pre-Market Dashboard — Card per ticker showing overnight price change %, news summary, sentiment badge, and analyst rating changes. Sorted by absolute price move by default.
3. News & Ratings Feed — Chronological feed of all aggregated news items and rating changes across the portfolio, filterable by ticker and by sentiment.
4. Daily Digest & Reports — Auto-compiled pre-market summary formatted for email distribution (send via Email tool), plus a historical archive of past daily digests with a line chart of portfolio sentiment trend over time.

UI: Financial dashboard styling, sentiment badges (green/gray/red), ticker cards with sparkline mini-charts, professional dark-on-light theme.

Sample data: Pre-populate with an 8-ticker portfolio (mix of tech, finance, and healthcare names) with sample overnight news and rating changes.`,
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "stock-market-analyst-sample.csv", url: "/samples/data-analysis/stock-market-analyst.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Text-to-SQL Explorer",
    description: "Connect to your SQL database and allow plain-English questions to generate charts and reports automatically.",
    prompt: `Build a Text-to-SQL Explorer for self-service data analysis.

AI agents:
1. Schema Understanding Agent — Introspects the connected database schema (tables, columns, relationships) and builds a semantic map so plain-English questions can be matched to the right tables and joins.
2. Query Generation Agent — Converts a plain-English question into a validated SQL query using the schema map, explains the query logic in plain English, and runs it safely (read-only) against the database.
3. Visualization Agent — Analyzes the query result shape (single value, time series, categorical breakdown, etc.) and automatically suggests and renders the best chart type (KPI tile, line, bar, pie, table) for the result.

Pages:
1. Ask a Question — Chat-style input box: "Ask anything about your data" with example prompt chips. Shows the generated SQL (collapsible), the plain-English explanation, and the result — either a chart or table depending on shape.
2. Schema Explorer — Browsable list of connected tables and columns with descriptions, row counts, and sample values, so users know what's queryable.
3. Query History — Live list from the database of past questions asked, the SQL generated, and a "re-run" button. Searchable and filterable by date.
4. Saved Reports — Pin any question+result combo to a personal dashboard of saved charts/tables; export any report to PDF or Excel.

UI: Clean light theme, chat-style question input at top, generated SQL shown in a collapsible code block, chart area below with export icon.

Sample data: Pre-populate with a sample "orders/customers/products" schema and 5 example questions with pre-computed results (e.g. "What were sales by region last quarter?").`,
    tools: ["Webhook", "RAG"],
    complexity: "Advanced",
    sampleFile: { name: "text-to-sql-explorer-sample.csv", url: "/samples/data-analysis/text-to-sql-explorer.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Excel Data Insights Generator",
    description: "Accept Excel or CSV uploads, identify patterns and anomalies, and generate an executive summary with visualizations.",
    prompt: `Build an Excel Data Insights Generator for quick self-service analysis.

AI agents:
1. Profiling Agent — Parses an uploaded Excel/CSV file, profiles every column (data type, null %, distinct values, min/max/mean for numeric columns), and detects the likely purpose of the dataset.
2. Pattern & Anomaly Agent — Scans for statistical outliers, unexpected nulls, duplicate rows, and notable trends or correlations between columns, ranking findings by significance.
3. Insight Narrative Agent — Synthesizes the profiling and anomaly results into an executive summary: 3-5 key findings in plain English, each paired with a supporting chart, plus 2-3 recommended next actions.

Pages:
1. Upload & Profile — Drag-and-drop upload for Excel/CSV. Shows a data preview table with per-column stat badges (nulls %, distinct count, type) as soon as parsing completes.
2. Findings Dashboard — Card list of detected patterns/anomalies (e.g. "Revenue column has 4 outliers above 3 std dev", "Region and Channel are highly correlated"), each with an inline chart (bar/scatter/line as appropriate).
3. Executive Summary — Auto-generated summary page: key findings narrative, top 3 supporting charts, recommended actions list. Formatted for pasting into a deck or email.
4. Export & History — Export the full insights report as PDF or Excel (with charts embedded); history list of previously analyzed files with re-open capability.

UI: Clean light theme, drag-and-drop upload zone front and center, stat badges using color (green/amber/red) for data quality signals.

Sample data: Pre-populate with a sample sales transactions CSV (500 rows) containing a few intentional outliers and a null-heavy column for the demo to surface.`,
    tools: ["PDF Parser", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "excel-data-insights-generator-sample.csv", url: "/samples/data-analysis/excel-data-insights-generator.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Business Intelligence Agent",
    description: "Connect to your ERP or database, generate weekly performance reports across sales, inventory, and finance, and highlight trends.",
    prompt: `Build a Business Intelligence Agent for weekly operational reporting.

AI agents:
1. Data Sync Agent — Connects to the ERP/database data source, pulls the latest weekly figures across Sales, Inventory, and Finance modules, and reconciles them into a unified weekly snapshot.
2. Trend Detection Agent — Compares this week's snapshot to prior weeks, calculates week-over-week and month-over-month changes for every key metric, and flags metrics moving outside their normal range (>2 std dev from trailing average).
3. Report Writing Agent — Drafts a structured weekly performance narrative per module (Sales, Inventory, Finance) highlighting what changed, why it likely happened (based on flagged trends), and what needs attention this week.

Pages:
1. Executive Dashboard — KPI tiles across Sales (revenue, orders), Inventory (stock levels, turnover), Finance (cash position, AR/AP) with week-over-week delta arrows. Line charts for each module's primary metric over the trailing 12 weeks.
2. Module Deep Dive — Tabs for Sales / Inventory / Finance, each with a detailed breakdown table and bar/line charts, plus the Trend Detection Agent's flagged anomalies highlighted inline.
3. Weekly Report — Auto-generated narrative report combining all three modules, formatted for distribution, with a "Needs Attention" callout box listing this week's flagged items.
4. Report Archive & Export — Searchable history of past weekly reports, export any week's report to PDF or send via Email/Slack.

UI: Executive dashboard styling, module tabs, delta arrows (green up/red down contextual to metric type), professional light theme.

Sample data: Pre-populate with 12 weeks of sample Sales/Inventory/Finance data showing a realistic seasonal dip and one flagged anomaly (inventory stockout risk).`,
    tools: ["Webhook", "Email", "Slack"],
    complexity: "Advanced",
    sampleFile: { name: "business-intelligence-agent-sample.csv", url: "/samples/data-analysis/business-intelligence-agent.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Customer Analytics Agent",
    description: "Segment users by behavior and demographics, identify churn risk patterns, and recommend targeted retention strategies.",
    prompt: `Build a Customer Analytics Agent for churn prevention and segmentation.

AI agents:
1. Segmentation Agent — Clusters uploaded customer data (behavioral + demographic fields) into meaningful segments (e.g. "Power Users", "At-Risk", "New/Onboarding", "Dormant") using rule-based or statistical clustering, and describes each segment's defining characteristics.
2. Churn Risk Agent — Scores each customer's churn risk (0-100) based on engagement decline, help-request volume, and usage recency, and ranks customers by risk within each segment.
3. Retention Strategy Agent — For each at-risk segment, recommends 2-3 targeted retention actions (e.g. "re-engagement email sequence", "proactive account check-in", "discount offer") based on the segment's characteristics and churn drivers.

Pages:
1. Customer Upload & Segments — CSV upload of customer data (usage metrics, demographics, support history). Segmentation Agent auto-clusters and displays segment cards with size and description.
2. Churn Risk Board — Sortable table of all customers with churn risk score, segment tag, and key risk drivers (e.g. "usage down 40% in 30 days"). Color-coded risk badges (green/amber/red).
3. Segment Analytics — Bar chart of segment sizes, radar chart comparing segment characteristics (engagement, tenure, spend), line chart of churn risk trend by segment over time.
4. Retention Playbook — Per-segment recommended actions from the Retention Strategy Agent, with a "Mark Action Taken" tracker and outcome notes field. Export segment lists to CSV for import into your customer database.

UI: Clean light theme, segment cards with distinct colors, risk badges prominent in the customer table, professional analytics dashboard feel.

Sample data: Pre-populate with 200 sample customer records spanning 4 segments with realistic usage/demographic fields and a range of churn risk scores.`,
    tools: ["Webhook", "CRM", "Email"],
    complexity: "Advanced",
    sampleFile: { name: "customer-analytics-agent-sample.csv", url: "/samples/data-analysis/customer-analytics-agent.csv" },
  },
  {
    category: "Data & Analysis",
    title: "KPI Dashboard Builder",
    description: "Define KPIs with current value, target, and trend direction, then present a clean dashboard that updates as numbers change.",
    prompt: `Build a KPI Dashboard Builder for cross-functional performance tracking.

AI agents:
1. KPI Definition Agent — Takes user-defined KPIs (name, current value, target, unit, category, trend direction) and validates completeness, suggesting a sensible visualization type (gauge, line, bar) based on the KPI's nature.
2. Progress Calculation Agent — Calculates percent-to-target for each KPI, classifies status (On Track / At Risk / Off Track) based on configurable thresholds, and computes trend direction from historical entries if available.
3. Narrative Agent — Generates a short auto-summary per category (e.g. "Sales KPIs: 3 of 4 on track, Revenue trending up 8% this month") for a quick-scan executive view.

Pages:
1. KPI Builder — Form to define a KPI: name, category, current value, target value, unit, update frequency. Organize KPIs by drag-and-drop into categories (Sales, Ops, Finance, Customer, etc.).
2. Live Dashboard — Grid of KPI cards grouped by category, each showing current value, progress bar to target, trend arrow, and status badge (green/amber/red). Updates as new values are logged.
3. Trend View — Line chart per KPI showing historical values over time (if multiple entries logged), with target line overlay.
4. Executive Summary & Export — Auto-generated per-category narrative summary from the Narrative Agent, full dashboard export to PDF/PNG for sharing in meetings.

UI: Clean grid dashboard, category color-coding, progress bars and status badges, professional light theme suitable for TV-wall display.

Sample data: Pre-populate with 12 sample KPIs across Sales, Ops, and Customer categories with a mix of on-track/at-risk statuses.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "kpi-dashboard-builder-sample.csv", url: "/samples/data-analysis/kpi-dashboard-builder.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Survey Results Analyzer",
    description: "Upload survey results, see response distributions, cross-tabulate by demographics, and filter results dynamically.",
    prompt: `Build a Survey Results Analyzer for market research analysts.

AI agents:
1. Response Parsing Agent — Parses an uploaded survey results file (CSV/Excel), identifies question columns and demographic columns, and classifies each question type (multiple choice, scale/Likert, open text, numeric).
2. Distribution Agent — Calculates response distributions for every question (counts and percentages per option, mean/median for scale questions), and cross-tabulates any question against selected demographic fields.
3. Insight Agent — Scans open-text responses for common themes/keywords, and writes a short summary of notable findings per question, including any significant demographic differences detected in the cross-tabs.

Pages:
1. Upload & Question Map — Upload survey data, review auto-detected question types and demographic fields (editable if misclassified).
2. Question-by-Question View — Select any question to see its response distribution as a bar or pie chart, with a demographic filter panel (age, region, gender, etc.) that updates the chart live.
3. Cross-Tab Explorer — Pick a question and a demographic dimension to see a cross-tabulated stacked bar chart and data table (e.g. satisfaction score by age group).
4. Client Report — Auto-compiled report with the Insight Agent's key findings per question, embedded charts, and cross-tab highlights, exportable as PDF ready for client delivery.

UI: Clean light theme, filter panel on the left of the Question-by-Question view, charts styled for client presentation quality.

Sample data: Pre-populate with a 300-respondent customer satisfaction survey (8 questions, 4 demographic fields) with realistic distributions.`,
    tools: ["PDF Parser", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "survey-results-analyzer-sample.csv", url: "/samples/data-analysis/survey-results-analyzer.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Competitive Landscape Mapper",
    description: "Plot competitors on a customizable 2×2 matrix with defined axes, company positions, and strategic annotations.",
    prompt: `Build a Competitive Landscape Mapper for strategy and market analysts.

AI agents:
1. Research Agent — Given a competitor name, searches the web for recent strategic moves, product positioning, pricing, and market share signals, returning structured findings to inform axis placement.
2. Positioning Agent — Given user-defined axis labels (e.g. "Price" vs "Feature Breadth") and the Research Agent's findings, suggests an initial x/y position for each competitor on the 2x2 matrix with a confidence note.
3. Narrative Agent — Writes a short strategic annotation per competitor explaining their positioning and what strategic move might shift them on the matrix.

Pages:
1. Matrix Setup — Define the two axes (label + low/high description for each end), select or add competitors, "Auto-Research" button per competitor to trigger the Research Agent.
2. Landscape Matrix — Interactive 2x2 (or 2xN) scatter plot with draggable competitor dots, quadrant labels, color-coded by competitor category/tier.
3. Competitor Detail — Click any competitor dot to see the Research Agent's findings and the Narrative Agent's strategic annotation, editable by the analyst.
4. Report & Export — Clean exportable matrix image plus a competitor summary table (position, category, annotation), export as PDF or PNG for client decks.

UI: Professional light theme, clean quadrant grid with subtle gridlines, draggable dots with hover tooltips showing competitor name and annotation snippet.

Sample data: Pre-populate with 8 competitors in the "Project Management Software" space plotted on Price vs Feature Breadth axes.`,
    tools: ["Web Search", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "competitive-landscape-mapper-sample.csv", url: "/samples/data-analysis/competitive-landscape-mapper.csv" },
  },
  // ── Analysts (additional) ─────────────────────────────────────────────────
  {
    category: "Analysts",
    title: "Vendor Briefing Note Taker",
    description: "Log vendor briefings with key claims, product updates, differentiators, and your assessment — then search and compare across all briefings.",
    prompt: `Build a Vendor Briefing Note Taker for analysts tracking vendor relationship intelligence.

AI agents:
1. Note Structuring Agent — Takes raw briefing notes (typed or pasted transcript) and extracts structured fields: key claims, product updates, roadmap items, differentiators mentioned, and competitive comparisons made by the vendor.
2. Cross-Briefing Search Agent — Given a topic or keyword (e.g. "pricing model", "AI features"), searches across all logged briefings and returns what each vendor said about that topic, side by side, with source briefing date.
3. Trend Agent — Analyzes briefings over time per vendor to detect narrative shifts (e.g. messaging pivots, new claims not made in prior briefings) and flags notable changes.

Pages:
1. Log Briefing — Form: company name, date, attendees, raw notes/transcript paste box. "Structure Notes" button runs the Note Structuring Agent to auto-populate key claims, product updates, and differentiators fields (editable).
2. Briefing History — Live list from the database, filterable by vendor and date range, searchable by keyword, card view showing date, key claims summary, and assessment badge.
3. Topic Comparison — Enter a topic; Cross-Briefing Search Agent returns a side-by-side comparison table of what each vendor said, with links back to the source briefing.
4. Vendor Trend View — Per-vendor timeline of briefings with the Trend Agent's flagged narrative shifts highlighted, plus a simple line chart of "assessment score" over time if the analyst scores each briefing.

UI: Clean light theme, timeline-style briefing history, search bar prominent on Topic Comparison page.

Sample data: Pre-populate with 6 briefings across 3 vendors over the past 2 quarters.`,
    tools: ["RAG", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "vendor-briefing-note-taker-sample.csv", url: "/samples/analysts/vendor-briefing-note-taker.csv" },
  },
  {
    category: "Analysts",
    title: "Inquiry Tracker & Trend Spotter",
    description: "Log client inquiry calls by topic, industry, and company size, then spot trending topics and patterns over time.",
    prompt: `Build an Inquiry Tracker & Trend Spotter for analyst relations teams.

AI agents:
1. Inquiry Logging Agent — Structures raw call notes into fields: topic, industry, company size, problem being solved, and auto-tags the inquiry with 1-3 relevant categories from a taxonomy.
2. Trend Detection Agent — Analyzes all logged inquiries over time to identify trending topics (rising volume week-over-week), emerging industries asking new questions, and topic clusters that frequently co-occur.
3. Briefing Agent — Generates a weekly digest summarizing top trending topics, notable industry patterns, and 2-3 illustrative inquiry excerpts, formatted for internal distribution.

Pages:
1. Log Inquiry — Form: client/company, industry, company size, topic, call notes. Auto-tag suggestion from the Inquiry Logging Agent, editable before saving.
2. Inquiry Log — Live searchable/filterable table (topic, industry, company size, date) reading from the database.
3. Trend Dashboard — Bar chart of topic volume this month vs last month, line chart of top 5 topics over the past 6 months, heatmap of industry x topic frequency.
4. Weekly Digest — Auto-generated summary from the Briefing Agent with trending topics, industry call-outs, and example excerpts. Export as PDF or send via email.

UI: Clean light theme, tag pills for topics, heatmap using color intensity for the industry x topic matrix.

Sample data: Pre-populate with 40 sample inquiries spanning 6 topics and 5 industries over 3 months.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "inquiry-tracker-trend-spotter-sample.csv", url: "/samples/analysts/inquiry-tracker-trend-spotter.csv" },
  },
  {
    category: "Analysts",
    title: "Earnings Season Dashboard",
    description: "Track revenue, EPS, and guidance vs consensus for 15+ companies, flag beats/misses, and capture key management quotes.",
    prompt: `Build an Earnings Season Dashboard for equity research analysts.

AI agents:
1. Surprise Calculation Agent — Takes reported revenue/EPS/guidance alongside consensus estimates and calculates beat/miss/in-line status and surprise percentage for each metric, per company.
2. Guidance Change Agent — Compares newly issued guidance to the company's prior guidance and flags "raised", "lowered", or "maintained" with the magnitude of change, highlighting meaningful shifts (>5%).
3. Summary Agent — Writes a short 2-3 sentence takeaway per company combining the surprise result, guidance direction, and any management quote entered, plus an overall "season summary" once 15+ companies are logged.

Pages:
1. Log Earnings — Form per company: ticker, reported revenue, consensus revenue, reported EPS, consensus EPS, new guidance, prior guidance, key management quote (free text).
2. Earnings Board — Live table of all logged companies: ticker, revenue surprise %, EPS surprise %, beat/miss/inline badges (green/red/gray), guidance direction arrow, date reported.
3. Season Dashboard — Bar chart of EPS surprise % across all companies (sorted), donut chart of beat/miss/inline distribution, list of companies with meaningful guidance changes highlighted.
4. Management Quotes & Report — Searchable card view of all logged quotes tagged by company and sentiment, plus the Summary Agent's season-level takeaway. Export full dashboard as PDF or Excel.

UI: Data-dense financial dashboard, green/red beat-miss badges, sortable columns, professional light theme.

Sample data: Pre-populate with 15 companies' Q-over-Q earnings results with realistic beats, misses, and guidance changes.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "earnings-season-dashboard-sample.csv", url: "/samples/analysts/earnings-season-dashboard.csv" },
  },
  {
    category: "Analysts",
    title: "Sector Performance Tracker",
    description: "Track YTD and 3-month returns for 20 stocks vs S&P 500 and NASDAQ with ranked tables and charts.",
    prompt: `Build a Sector Performance Tracker for equity research and portfolio analysts.

AI agents:
1. Data Aggregation Agent — Given a list of ~20 tickers, fetches/accepts YTD return, 3-month return, and current price for each, along with the same period returns for S&P 500 and NASDAQ benchmarks.
2. Relative Performance Agent — Calculates each stock's alpha (return minus benchmark return) for both YTD and 3-month periods, ranks all stocks by relative performance, and classifies each as Outperformer, In-Line, or Laggard.
3. Sector Insight Agent — Groups stocks by sector (if provided) and writes a short paragraph on which sectors are leading/lagging the benchmark this period and any notable divergence within a sector.

Pages:
1. Watchlist Setup — Add/edit ~20 tickers with sector tag, CSV bulk import, manual entry of returns or connect to a data feed placeholder.
2. Ranked Performance Table — Sortable table: ticker, sector, YTD return, 3-month return, alpha vs S&P 500, alpha vs NASDAQ, classification badge (Outperformer/In-Line/Laggard color-coded).
3. Performance Chart — Bar chart of all stocks ranked by YTD alpha vs S&P 500, with a zero-line reference. Toggle between YTD/3-month view and between S&P 500/NASDAQ benchmark.
4. Sector Summary & Report — Grouped bar chart of average alpha by sector, Sector Insight Agent commentary, exportable as PDF or Excel for weekly distribution.

UI: Financial dashboard styling, green/red bars for above/below benchmark, sortable data-dense table.

Sample data: Pre-populate with 20 large-cap tickers across 5 sectors with realistic YTD/3-month returns vs S&P 500 and NASDAQ.`,
    tools: ["Web Search", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "sector-performance-tracker-sample.csv", url: "/samples/analysts/sector-performance-tracker.csv" },
  },
  {
    category: "Analysts",
    title: "IPO Readiness Checklist",
    description: "Score companies across financial performance, governance, market positioning, competitive moat, and risk factors with an overall readiness score.",
    prompt: `Build an IPO Readiness Checklist platform for capital markets analysts.

AI agents:
1. Scoring Agent — Takes analyst-entered scores (1-10) across five dimensions — Financial Performance, Governance Readiness, Market Positioning, Competitive Moat, Risk Factors — plus supporting notes per dimension, and calculates a weighted overall readiness score.
2. Gap Analysis Agent — Identifies the lowest-scoring dimensions, flags any dimension scoring below a configurable threshold (default 6/10) as "needs attention", and suggests 2-3 concrete remediation actions per flagged dimension based on the notes provided.
3. Benchmark Agent — Compares the company's dimension scores against a reference set of previously assessed companies (or industry norms) to show whether it's ahead of or behind typical IPO-ready peers on each dimension.

Pages:
1. Assessment Input — Form with the five dimensions, each with a 1-10 slider and a notes textarea for supporting evidence (financials, governance structure, competitive analysis, risk register).
2. Readiness Dashboard — Radar chart showing the company's score across all five dimensions vs a benchmark overlay. Overall readiness score as a large gauge/KPI tile with a status badge (Ready / Nearly Ready / Not Ready).
3. Gap Analysis — List view of flagged dimensions with the Gap Analysis Agent's remediation suggestions, sortable by severity (lowest score first).
4. Assessment History & Report — Track multiple assessments of the same company over time (line chart of overall score trend), export a full readiness report as PDF for IPO committee review.

UI: Professional light theme, radar chart as the centerpiece, gauge-style overall score tile, red/amber/green flags on the gap analysis list.

Sample data: Pre-populate with 2 sample company assessments — one "Nearly Ready" (score 7.2) and one "Not Ready" (score 4.8) — with realistic dimension scores and notes.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "ipo-readiness-checklist-sample.csv", url: "/samples/analysts/ipo-readiness-checklist.csv" },
  },
  // ── Data & Analysis (additional) ──────────────────────────────────────────
  {
    category: "Data & Analysis",
    title: "Consumer Segmentation Tool",
    description: "Define customer segments based on purchase behaviour, demographics, and attitudes, then size each segment and visualize how they differ.",
    prompt: `Build a Consumer Segmentation Tool for market research analysts.

AI agents:
1. Segment Definition Agent — Takes user-defined segmentation criteria (purchase behavior, demographics, attitudinal survey data) and clusters the uploaded consumer dataset into distinct segments, naming each with a descriptive label.
2. Sizing Agent — Calculates the size (count and % of total) of each segment and computes key summary statistics (average spend, average frequency, top demographic profile) per segment.
3. Differentiation Agent — Identifies the dimensions on which segments differ most (e.g. price sensitivity, brand loyalty, channel preference) and writes a short comparative description per segment highlighting what makes it distinct.

Pages:
1. Data Upload & Criteria — Upload consumer dataset (behavioral + demographic + attitudinal columns), select segmentation criteria/dimensions to cluster on.
2. Segment Overview — Card grid of segments with size (count + %), descriptive name, and 2-3 key characteristics each, generated by the Segment Definition Agent.
3. Segment Comparison — Radar chart comparing all segments across key dimensions (spend, frequency, loyalty, price sensitivity), plus a bar chart of segment sizes.
4. Segment Deep Dive & Export — Per-segment detail page with full characteristic breakdown and the Differentiation Agent's narrative, export segment profiles to PDF or Excel for client presentation.

UI: Clean light theme, distinct color per segment used consistently across cards/charts, radar chart as centerpiece of comparison page.

Sample data: Pre-populate with a 500-respondent consumer dataset clustering into 4 segments (e.g. "Value Seekers", "Brand Loyalists", "Convenience Shoppers", "Premium Explorers").`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "consumer-segmentation-tool-sample.csv", url: "/samples/data-analysis/consumer-segmentation-tool.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Brand Health Tracker",
    description: "Track awareness, consideration, purchase intent, NPS, and satisfaction for multiple brands each quarter with trend lines and comparisons.",
    prompt: `Build a Brand Health Tracker for brand and marketing analysts.

AI agents:
1. Metric Logging Agent — Structures quarterly-entered brand health metrics (awareness, consideration, purchase intent, NPS, satisfaction) per brand, validating ranges and flagging missing quarters.
2. Change Detection Agent — Compares each brand's metrics quarter-over-quarter, flags statistically or practically significant changes (e.g. >5 point swing), and classifies the change as positive or concerning.
3. Comparative Insight Agent — Writes a short narrative comparing brands within a category, highlighting which brand is gaining/losing ground on which specific metric and a plausible explanation based on trend patterns.

Pages:
1. Quarterly Data Entry — Form to log each brand's metrics for the current quarter, with a running view of past quarters for reference.
2. Brand Trend Dashboard — Line charts per metric (awareness, consideration, purchase intent, NPS, satisfaction) showing trend over time, one line per brand, with significant-change markers annotated on the chart.
3. Brand Comparison — Side-by-side radar chart comparing selected brands across all metrics for the latest quarter, plus a table of quarter-over-quarter deltas with color-coded significance flags.
4. Insights Report — Auto-generated comparative narrative from the Comparative Insight Agent, embedded with the key trend charts, exportable as PDF for stakeholder distribution.

UI: Clean light theme, one consistent color per brand across all charts, significant-change markers as small callout icons on trend lines.

Sample data: Pre-populate with 4 competing brands tracked across 6 quarters with realistic metric fluctuations including one notable dip for a brand.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "brand-health-tracker-sample.csv", url: "/samples/data-analysis/brand-health-tracker.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Pricing Research Analyzer",
    description: "Enter Van Westendorp survey data and automatically get the optimal price point, indifference price, and acceptable price range chart.",
    prompt: `Build a Pricing Research Analyzer (Van Westendorp Price Sensitivity Meter) for pricing analysts.

AI agents:
1. Response Intake Agent — Accepts survey responses for the four Van Westendorp questions (Too Cheap, Bargain, Getting Expensive, Too Expensive) per respondent via manual entry or CSV upload, validates logical consistency (e.g. Too Cheap < Bargain < Getting Expensive < Too Expensive) and flags inconsistent respondents.
2. Curve Calculation Agent — Builds the four cumulative distribution curves from the response data and calculates the key intersection points: Point of Marginal Cheapness, Point of Marginal Expensiveness, Optimal Price Point (OPP), and Indifference Price Point (IPP), deriving the acceptable price range.
3. Recommendation Agent — Writes a short pricing recommendation summarizing the acceptable range, the optimal price point, and considerations for where within the range to position given stated business goals (e.g. volume vs margin).

Pages:
1. Data Collection — Form/CSV upload for the four price-point responses per respondent, with a running count and consistency-check status.
2. Price Sensitivity Chart — The classic Van Westendorp chart: four cumulative curves plotted together with the OPP and IPP intersection points marked and labeled, acceptable range shaded.
3. Results Summary — KPI tiles for Optimal Price Point, Indifference Price Point, Point of Marginal Cheapness, Point of Marginal Expensiveness, and the full acceptable price range.
4. Recommendation Report — Auto-generated pricing recommendation from the Recommendation Agent plus the chart and KPIs, exportable as PDF for client/stakeholder presentation.

UI: Clean light theme, classic 4-line intersection chart as centerpiece, shaded acceptable-range band, KPI tiles with currency formatting.

Sample data: Pre-populate with 150 sample respondent price-point sets for a consumer subscription product, yielding a realistic $12-$18 acceptable range.`,
    tools: ["Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "pricing-research-analyzer-sample.csv", url: "/samples/data-analysis/pricing-research-analyzer.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Data Quality Scorecard",
    description: "Score each data source on completeness, accuracy, timeliness, and consistency, track scores over time, and flag sources that drop below threshold.",
    prompt: `Build a Data Quality Scorecard for data governance analysts.

AI agents:
1. Scoring Agent — Takes analyst-entered or auto-computed scores (0-100) per data source across Completeness, Accuracy, Timeliness, and Consistency dimensions, and calculates a weighted overall data health score per source.
2. Threshold Monitoring Agent — Compares each source's overall score and per-dimension scores against a configurable threshold (default 75), flags sources that drop below threshold, and detects which dimension is driving the drop.
3. Trend Agent — Tracks each source's scores over time (weekly/monthly entries) and writes a short note on sources that are improving, stable, or declining, prioritizing declining sources for attention.

Pages:
1. Source Registry & Scoring — List of data sources with a scoring form per source (four dimension sliders + notes), auto-calculated overall score displayed live.
2. Scorecard Dashboard — Grid of source cards showing overall health score (gauge), dimension breakdown (mini radar or bar), and a threshold-flag badge (green/amber/red) for sources below threshold.
3. Trend View — Line chart of overall score over time per source, with threshold line overlay; table of sources trending down over the last 3 periods.
4. Governance Report — Auto-compiled report listing flagged sources, root-cause dimension per flag, and the Trend Agent's commentary, exportable as PDF or Excel for data governance review.

UI: Clean light theme, gauge charts for overall score, radar mini-charts per source card, red/amber/green threshold flags.

Sample data: Pre-populate with 10 data sources (customer database, ERP, marketing analytics DB, etc.) scored across the 4 dimensions over 6 months, with 2 sources flagged below threshold.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "data-quality-scorecard-sample.csv", url: "/samples/data-analysis/data-quality-scorecard.csv" },
  },
  {
    category: "Data & Analysis",
    title: "A/B Test Calculator & Reporter",
    description: "Enter visitors and conversions for control and variant to instantly see conversion rates, lift, statistical significance, and whether you have a winner.",
    prompt: `Build an A/B Test Calculator & Reporter for growth and product analysts.

AI agents:
1. Statistics Agent — Takes visitor and conversion counts for control and variant groups, calculates conversion rates, absolute and relative lift, runs a two-proportion z-test to compute the p-value, and calculates the 95% confidence interval for the lift.
2. Significance Interpretation Agent — Determines statistical significance at standard thresholds (90%/95%/99%), checks for adequate sample size (minimum detectable effect check), and produces a plain-English winner declaration or "inconclusive, need more data" outcome.
3. Report Agent — Writes a short summary paragraph explaining the result in non-technical language suitable for sharing with stakeholders, including a caveat about sample size or test duration if applicable.

Pages:
1. Test Setup — Form: test name, control visitors, control conversions, variant visitors, variant conversions, desired confidence level (90/95/99%).
2. Results Dashboard — KPI tiles for conversion rate (control vs variant), absolute lift, relative lift %, p-value, confidence interval. Bar chart comparing conversion rates with error bars for the confidence interval.
3. Significance & Outcome — Large winner declaration banner (green "Variant Wins", gray "Inconclusive", red "Control Wins") with the Significance Interpretation Agent's explanation and sample-size adequacy check.
4. Test Log & Report — History of past tests run, searchable table, export any test's full result as a PDF one-pager for sharing.

UI: Clean light theme, prominent winner-declaration banner at top of results, bar chart with error bars, KPI tiles below.

Sample data: Pre-populate with 3 past A/B tests (one clear winner, one inconclusive, one control wins) with realistic visitor/conversion counts.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "ab-test-calculator-reporter-sample.csv", url: "/samples/data-analysis/ab-test-calculator-reporter.csv" },
  },
  {
    category: "Data & Analysis",
    title: "SQL Query Result Visualiser",
    description: "Paste tabular data from SQL queries and instantly pick from chart types to create presentation-ready visuals.",
    prompt: `Build a SQL Query Result Visualiser for analysts sharing quick data cuts.

AI agents:
1. Data Parsing Agent — Parses pasted tabular data (CSV/TSV/query output) into structured rows and columns, auto-detects column types (numeric, categorical, date), and suggests which columns are best suited for X-axis, Y-axis, and grouping.
2. Chart Recommendation Agent — Based on the data shape (time series, categorical comparison, distribution, correlation), recommends the best chart type (bar, line, pie, scatter) and pre-configures axis mappings.
3. Styling Agent — Applies presentation-ready styling (clean colors, legible labels, title suggestion based on column names) so the output chart is ready to screenshot into Slack or email without further editing.

Pages:
1. Paste Data — Large paste box for tabular data. Auto-parses on paste and shows a preview table with detected column types.
2. Chart Builder — Chart type selector (bar/line/pie/scatter) pre-set by the Chart Recommendation Agent, with axis/field pickers, live chart preview that updates as selections change.
3. Style & Export — Title/subtitle fields (auto-suggested), color theme picker, "Copy as Image" and "Download PNG" buttons sized for Slack/email embedding.
4. Recent Charts — History of recently built charts (thumbnail + data snapshot) for quick re-use or re-export.

UI: Minimal clean interface, large paste box front and center, instant chart preview, one-click copy/export actions.

Sample data: Pre-populate the paste box with a sample "monthly signups by channel" dataset ready to visualize on load.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "sql-query-result-visualiser-sample.csv", url: "/samples/data-analysis/sql-query-result-visualiser.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Stakeholder Report Generator",
    description: "Enter this week's and last week's key business metrics to automatically get a formatted report with trends, week-over-week changes, and a summary.",
    prompt: `Build a Stakeholder Report Generator for weekly business updates.

AI agents:
1. Metrics Intake Agent — Takes this week's and last week's values for key metrics (revenue, active users, churn, support volume, NPS, or any custom metric set), validates entries, and calculates week-over-week absolute and percentage change for each.
2. Trend Classification Agent — Classifies each metric's movement as "Improving", "Stable", or "Declining" based on direction and magnitude of change, accounting for metrics where "down is good" (e.g. churn, support volume) vs "up is good" (e.g. revenue).
3. Summary Writing Agent — Drafts a concise "What's Up / What's Down" executive summary paragraph plus a one-line headline for the whole report (e.g. "Solid week: revenue up 6%, churn down slightly, NPS flat").

Pages:
1. Weekly Entry — Form to enter this week's and last week's value for each tracked metric, with a running list of previously tracked metrics for quick re-entry.
2. Report Dashboard — KPI tiles per metric showing current value, WoW change (arrow + %), and trend classification badge (green/gray/red, direction-aware). Bar chart comparing this week vs last week across all metrics.
3. Executive Summary — Auto-drafted headline and "What's Up / What's Down" narrative from the Summary Writing Agent, editable before sending.
4. Report History & Export — Archive of past weekly reports (searchable by date), export current report as PDF or send directly via Email.

UI: Clean light theme, KPI tiles with directional arrows colored correctly per metric type (not always green=up), headline banner at top of report.

Sample data: Pre-populate with a sample week's data for 5 metrics (revenue, active users, churn, support volume, NPS) showing a realistic mixed week.`,
    tools: ["Email", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "stakeholder-report-generator-sample.csv", url: "/samples/data-analysis/stakeholder-report-generator.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Policy Impact Calculator",
    description: "Input tax policy parameters across income brackets to see estimated revenue impact, who benefits, who pays more, and net budget effect.",
    prompt: `Build a Policy Impact Calculator for public policy analysts.

AI agents:
1. Tax Modeling Agent — Takes current tax rates, proposed rates, income brackets, and population/taxpayer counts per bracket, and calculates total tax revenue under both current and proposed scenarios.
2. Distributional Impact Agent — Calculates the per-bracket change in tax burden (who pays more, who pays less, by how much), and classifies each bracket as a net winner or net loser under the proposed policy.
3. Budget Narrative Agent — Writes a plain-English summary of the net budget impact (revenue gain/loss), which brackets are most affected, and the overall progressivity shift of the proposed change.

Pages:
1. Policy Inputs — Form: income brackets with current rate, proposed rate, and population/taxpayer count per bracket. "Adjust Proposed Rates" sliders for quick scenario testing.
2. Revenue Impact Dashboard — KPI tiles for Current Total Revenue, Proposed Total Revenue, Net Budget Impact ($ and %). Bar chart comparing revenue by bracket under current vs proposed rates.
3. Distributional Analysis — Table and chart showing per-bracket change in average tax burden, color-coded (green = pays less, red = pays more), sorted by income bracket.
4. Policy Brief & Export — Auto-generated narrative from the Budget Narrative Agent combined with the key charts, exportable as PDF for a policy brief or legislative summary.

UI: Clean, neutral government/policy-report styling, sliders for rate adjustment with live-updating charts, professional light theme.

Sample data: Pre-populate with 5 income brackets, current rates, one proposed rate scenario, and realistic taxpayer population figures.`,
    tools: ["Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "policy-impact-calculator-sample.csv", url: "/samples/data-analysis/policy-impact-calculator.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Demographic Trend Explorer",
    description: "Upload population data by age, region, income, and education to explore trends and project forward with different growth assumptions.",
    prompt: `Build a Demographic Trend Explorer for policy and public sector analysts.

AI agents:
1. Data Ingestion Agent — Parses uploaded population data broken down by age, region, income, and education level across multiple time periods, validating consistency and flagging gaps in the time series.
2. Trend Analysis Agent — Identifies key demographic trends over time (e.g. aging population share, regional migration patterns, income distribution shifts) and quantifies the rate of change per dimension.
3. Projection Agent — Projects each dimension forward under user-adjustable growth assumptions (e.g. birth rate, migration rate, income growth), producing a forward-looking scenario alongside the historical trend.

Pages:
1. Data Upload — Upload population dataset with age/region/income/education breakdowns across time periods, preview and validate the parsed data.
2. Trend Explorer — Interactive charts (line/area) for each dimension over the historical period, with a dimension/region filter panel to slice the view.
3. Projection Scenarios — Adjustable assumption sliders (growth rate, migration rate) with a projected trend line extending beyond the historical data, toggle between Conservative/Base/Aggressive presets.
4. Policy Brief Visuals — Curated set of clean, labeled charts (historical + projected) formatted for a policy brief, exportable as PDF or PNG.

UI: Clean, neutral government-report styling, filter panel on the left, historical data solid line transitioning to dashed projected line.

Sample data: Pre-populate with 20 years of sample population data broken down by 4 age bands, 3 regions, and income/education tiers.`,
    tools: ["PDF Parser", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "demographic-trend-explorer-sample.csv", url: "/samples/data-analysis/demographic-trend-explorer.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Grant & Funding Tracker",
    description: "Track each grant's budget, spend, deadlines, and reporting status with at-risk alerts and a portfolio-level funding health view.",
    prompt: `Build a Grant & Funding Tracker for nonprofit and public sector grant managers.

AI agents:
1. Budget Tracking Agent — Takes each grant's total budget, amount spent to date, and time elapsed in the grant period, and calculates burn rate, remaining balance, and projected end-of-period spend.
2. Risk Detection Agent — Compares actual burn rate to the expected pace (based on time elapsed vs grant period), flags grants at risk of underspending (may need reallocation or return of funds) or overspending (budget overrun risk), and flags reporting deadlines due within 30 days.
3. Portfolio Summary Agent — Rolls up all grants into a portfolio-level funding health view, writing a short summary of overall spend pace, total at-risk funding, and upcoming reporting obligations.

Pages:
1. Grant Registry — Table/form to add and manage grants: name, funder, total budget, amount spent, grant period start/end, next reporting deadline, reporting status.
2. Grant Health Dashboard — Card per grant showing burn rate gauge, remaining balance, risk badge (underspending/on-pace/overspending), and days until next report due.
3. Portfolio View — Stacked bar chart of budget vs spent across all grants, donut chart of portfolio risk distribution, upcoming deadlines timeline (next 90 days).
4. Reporting & Export — List of reports due soon with reminder status, export full portfolio summary as PDF or Excel, send deadline reminders via Email.

UI: Clean nonprofit/public-sector styling, burn-rate gauges, risk badges (green/amber/red), timeline view for deadlines.

Sample data: Pre-populate with 8 grants of varying size and pace, including one underspending and one overspending example.`,
    tools: ["Email", "Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "grant-funding-tracker-sample.csv", url: "/samples/data-analysis/grant-funding-tracker.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Regulatory Compliance Checker",
    description: "List regulations, map them to business practices, score compliance for each, and flag gaps when a regulation changes.",
    prompt: `Build a Regulatory Compliance Checker for compliance and risk analysts.

AI agents:
1. Requirement Mapping Agent — Given a list of compliance requirements and a set of internal business practices/controls, maps each requirement to the relevant practice(s) that address it, flagging requirements with no mapped practice at all.
2. Compliance Scoring Agent — Takes analyst-entered compliance scores (0-100) per requirement-practice mapping, calculates an overall compliance posture score, and flags gaps below a configurable threshold with a severity rating.
3. Change Impact Agent — When a compliance requirement is updated, re-evaluates the affected mappings and estimates how the overall compliance posture score would shift, highlighting which practices need review first.

Pages:
1. Requirement & Practice Registry — Manage lists of compliance requirements and internal business practices, with a mapping matrix to link them.
2. Compliance Scorecard — Matrix view: compliance requirements as rows, mapped practices as columns, compliance score per cell, overall score per requirement. Color-coded (red/amber/green) gap highlighting.
3. Gap Analysis — Sorted list of flagged gaps (requirement, unmapped or low-scoring practice, severity), with recommended next steps field for the analyst to fill in.
4. Change Simulation & Report — Select a compliance requirement, simulate an update to it, see projected posture score shift via the Change Impact Agent, export full compliance report as PDF for audit purposes.

UI: Clean, formal compliance-dashboard styling, matrix view with color-coded cells, severity badges on the gap analysis list.

Sample data: Pre-populate with 10 compliance requirements mapped to 15 internal practices, with 3 intentional gaps for the demo to surface.`,
    tools: ["RAG", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "regulatory-compliance-checker-sample.csv", url: "/samples/data-analysis/regulatory-compliance-checker.csv" },
  },
  {
    category: "Data & Analysis",
    title: "Public Comment Analyzer",
    description: "Upload public comments on proposed regulations, categorize by theme and sentiment, and get a summary for official response documents.",
    prompt: `Build a Public Comment Analyzer for regulatory affairs analysts.

AI agents:
1. Categorization Agent — Ingests hundreds of uploaded public comments, classifies each into recurring themes (e.g. "Cost Impact", "Environmental Concern", "Implementation Timeline") and tags overall sentiment (Support/Oppose/Neutral).
2. Frequency Analysis Agent — Tallies theme frequency and sentiment breakdown across all comments, identifies the top issues raised, and surfaces representative comment excerpts for each theme.
3. Response Drafting Agent — Synthesizes the main arguments for and against the proposed rule into a structured summary suitable as the basis for an official response document, organized by theme with representative quotes cited.

Pages:
1. Upload Comments — Bulk upload of comment files (CSV/text/PDF), parsing progress indicator, preview of parsed comment count.
2. Theme & Sentiment Dashboard — Bar chart of comment volume by theme, donut chart of overall sentiment (Support/Oppose/Neutral), sortable table of themes with counts.
3. Comment Explorer — Browse/search all comments filtered by theme and sentiment, with representative excerpts highlighted per theme.
4. Response Document Draft — Auto-generated structured summary (by theme, arguments for/against, representative quotes) from the Response Drafting Agent, editable and exportable as a Word-ready PDF for the official response.

UI: Clean, formal government-affairs styling, theme bar chart and sentiment donut side by side, comment excerpts shown as quote cards.

Sample data: Pre-populate with 200 sample public comments on a proposed zoning ordinance, spanning 5 themes with mixed sentiment.`,
    tools: ["PDF Parser", "RAG", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "public-comment-analyzer-sample.csv", url: "/samples/data-analysis/public-comment-analyzer.csv" },
  },
  {
    category: "Data & Analysis",
    title: "SWOT & Strategy Framework Builder",
    description: "Pick a framework (SWOT, Porter's Five Forces, value chain), fill in the analysis, and get a clean professional visual output ready to share.",
    prompt: `Build a SWOT & Strategy Framework Builder for management consultants and strategy analysts.

AI agents:
1. Framework Guidance Agent — Given the selected framework (SWOT, Porter's Five Forces, Value Chain), provides guiding prompts/questions for each section to help the analyst fill it in thoroughly (e.g. for Porter's Five Forces: "What substitute products threaten this market?").
2. Synthesis Agent — Once all sections are filled in, analyzes cross-connections (e.g. a Strength that could offset a Threat in SWOT) and drafts a short "So What" strategic implication paragraph.
3. Visual Layout Agent — Formats the completed framework into the classic visual layout for that framework type (2x2 grid for SWOT, five-force radial diagram for Porter's, horizontal flow for Value Chain) ready for export.

Pages:
1. Framework Selection — Choose framework type (SWOT / Porter's Five Forces / Value Chain), name the analysis subject (company/market/product).
2. Guided Input — Section-by-section input form with the Framework Guidance Agent's prompting questions shown as placeholder hints, auto-save as you type.
3. Visual Output — Clean, presentation-ready rendering of the completed framework in its classic visual format (SWOT quadrant grid, Porter's radial diagram, or Value Chain flow), with the Synthesis Agent's "So What" callout box.
4. Library & Export — Save and browse past framework analyses, export any as PDF or PNG for client decks/presentations.

UI: Clean, professional consulting-deck styling, framework-appropriate visual layouts (quadrant/radial/flow), export button prominent.

Sample data: Pre-populate with a sample completed SWOT analysis for a mid-market retail company.`,
    tools: ["Webhook"],
    complexity: "Intermediate",
    sampleFile: { name: "swot-strategy-framework-builder-sample.csv", url: "/samples/data-analysis/swot-strategy-framework-builder.csv" },
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
