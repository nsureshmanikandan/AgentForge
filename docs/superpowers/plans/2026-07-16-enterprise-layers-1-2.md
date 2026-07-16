# Enterprise Layers 1+2 Implementation Plan (Domain-Aware Generation + Enterprise UI Standards)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AgentForge's hardcoded council-only "CUSTOM" app template with 11 domain-aware app types (HR, Sales, Legal, Support, Marketing, Dev, Analyst, Data, Chatbot, Dashboard, Council/Custom), each with its own enterprise-grade UI layout (charts, error handling, export, responsive sidebar), and upgrade all 43 non-Council prompts in PromptLibrary.tsx to multi-agent quality with matching sample data files.

**Architecture:** `backend/app/api/architect.py` gains an expanded keyword-based domain detector and per-domain UI_GEN_PROMPT blocks plus a mandatory "Enterprise UI Standards" block injected for every app type. Post-generation label normalization is extended from CUSTOM-only to all 11 domains. `frontend/src/pages/PromptLibrary.tsx` prompts are rewritten to multi-agent specs with `sampleFile` references pointing to new CSVs under `frontend/public/samples/<category>/`.

**Tech Stack:** FastAPI (Python) backend, React/TypeScript frontend, Azure OpenAI (GPT-4o) for UI generation, Recharts/jsPDF/SheetJS via CDN in generated sandbox HTML.

---

## Task 1: Expand domain type detection in architect.py

**Files:**
- Modify: `backend/app/api/architect.py:1673-1701`

- [ ] **Step 1: Replace the existing detection block**

Find this exact block (currently lines ~1673-1701):

```python
    prompt_lower = (req.summary + " " + req.app_name).lower()
    # CUSTOM check runs FIRST — decision/council apps must never be misclassified as CHATBOT
    if any(k in prompt_lower for k in ["decision intelligence", "decision advisor", "verdict", "the council",
                                        "multi-agent deliberation", "advisor panel", "chairman", "peer review board",
                                        "council app", "review board", "blind review"]):
        detected_type = "CUSTOM"
    elif any(k in prompt_lower for k in ["chatbot", "chat bot", "support bot", "virtual agent", "rag", "faq",
                                        "knowledge base", "it support", "service desk", "helpdesk", "help desk",
                                        "customer support", "support ticket", "qa bot", "q&a bot",
                                        "conversational", "assistant bot"]):
        detected_type = "CHATBOT"
    elif any(k in prompt_lower for k in ["dashboard", "analytics", "kpi", "metrics", "monitor", "report", "chart"]):
        detected_type = "DASHBOARD"
    elif any(k in prompt_lower for k in ["table", "crud", "inventory", "records", "manage", "employees"]):
        detected_type = "DATA TABLE"
    elif any(k in prompt_lower for k in ["wizard", "onboard", "multi-step", "intake", "step by step form"]):
        detected_type = "WIZARD"
    elif any(k in prompt_lower for k in ["booking", "appointment", "schedule", "calendar", "slot"]):
        detected_type = "SCHEDULER"
    elif any(k in prompt_lower for k in ["search", "knowledge base finder", "document finder", "catalogue"]):
        detected_type = "SEARCH APP"
    elif any(k in prompt_lower for k in ["survey", "feedback", "data entry", "collect"]):
        detected_type = "FORM APP"
    elif any(k in prompt_lower for k in ["portal", "self-service", "employee portal", "client portal"]):
        detected_type = "PORTAL"
    elif any(k in prompt_lower for k in ["decision", "advisor", "council", "intelligence", "recommendation"]):
        detected_type = "CUSTOM"
    else:
        detected_type = "CUSTOM"
```

Replace with:

```python
    prompt_lower = (req.summary + " " + req.app_name).lower()

    # Priority 1: Council/decision-intelligence apps (checked first, most specific)
    if any(k in prompt_lower for k in ["decision intelligence", "decision advisor", "verdict", "the council",
                                        "multi-agent deliberation", "advisor panel", "chairman", "peer review board",
                                        "council app", "review board", "blind review", "decision intel"]):
        detected_type = "COUNCIL_APP"

    # Priority 2: Specific enterprise domains (checked before generic chatbot/dashboard)
    elif any(k in prompt_lower for k in ["recruiter", "resume", "onboarding buddy", "payroll", "performance review",
                                          "employee engagement", "hr ", "human resource", "talent", "headcount",
                                          "workforce", "leave request", "time off", "org chart", "candidate"]):
        detected_type = "HR_APP"

    elif any(k in prompt_lower for k in ["sales outreach", "crm", "lead scoring", "pipeline", "deal", "quota",
                                          "cold email", "prospect", "close rate", "revenue forecast",
                                          "account executive", "sales rep", "proposal", "quote generator"]):
        detected_type = "SALES_APP"

    elif any(k in prompt_lower for k in ["contract review", "nda", "legal assistant", "compliance monitor",
                                          "regulation", "clause", "trademark", "ip watch", "litigation",
                                          "legal document", "policy analyzer", "redline"]):
        detected_type = "LEGAL_APP"

    elif any(k in prompt_lower for k in ["support ticket", "helpdesk", "customer support", "omni-channel",
                                          "ticket triage", "self-serve faq", "csat", "escalation",
                                          "unified inbox", "voice support", "voice customer"]):
        detected_type = "SUPPORT_APP"

    elif any(k in prompt_lower for k in ["marketing team", "content marketing", "competitor analysis", "seo agent",
                                          "seo content", "newsletter", "social media manager", "campaign",
                                          "content calendar"]):
        detected_type = "MARKETING_APP"

    elif any(k in prompt_lower for k in ["code review", "code reviewer", "pull request", "documentation generator",
                                          "api documentation", "api docs", "bug triage", "release notes",
                                          "github", "ci/cd", "devops"]):
        detected_type = "DEV_TOOL"

    elif any(k in prompt_lower for k in ["vendor comparison", "scorecard", "market sizing", "hype cycle",
                                          "comparable company", "dcf", "roi calculator", "roi & business case",
                                          "business case calculator", "equity research", "comp table",
                                          "earnings", "ipo readiness", "briefing note"]):
        detected_type = "ANALYST_APP"

    elif any(k in prompt_lower for k in ["stock market", "text-to-sql", "excel data insights", "business intelligence",
                                          "customer analytics", "kpi dashboard builder", "survey results",
                                          "data quality", "a/b test", "segmentation", "demographic",
                                          "sql query result", "pricing research", "brand health"]):
        detected_type = "DATA_APP"

    # Priority 3: Generic chatbot / dashboard fallback keywords
    elif any(k in prompt_lower for k in ["chatbot", "chat bot", "support bot", "virtual agent", "rag", "faq",
                                          "knowledge base", "it support", "service desk", "helpdesk", "help desk",
                                          "customer support", "support ticket", "qa bot", "q&a bot",
                                          "conversational", "assistant bot"]):
        detected_type = "CHATBOT"

    elif any(k in prompt_lower for k in ["dashboard", "analytics", "kpi", "metrics", "monitor", "report", "chart"]):
        detected_type = "DASHBOARD"

    else:
        detected_type = "CUSTOM"
```

- [ ] **Step 2: Sanity-check the file still parses**

Run: `python -c "import ast; ast.parse(open('backend/app/api/architect.py', encoding=\"utf-8\").read())"`
Expected: no output (no SyntaxError)

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/architect.py
git commit -m "feat: expand detected_type to 11 domain-specific app types"
```

---

## Task 2: Add mandatory Enterprise UI Standards block to UI_GEN_PROMPT

**Files:**
- Modify: `backend/app/api/architect.py` (locate `UI_GEN_PROMPT` definition)

- [ ] **Step 1: Find the UI_GEN_PROMPT variable**

Run: `grep -n "UI_GEN_PROMPT = " backend/app/api/architect.py`
Expected: one match showing the line where the prompt string starts (e.g. a line like `UI_GEN_PROMPT = """...`)

- [ ] **Step 2: Insert the Enterprise UI Standards block immediately after the opening `"""` of UI_GEN_PROMPT**

Find the first line of the UI_GEN_PROMPT string (the line containing `UI_GEN_PROMPT = """` or `UI_GEN_PROMPT = r"""`). Insert the following text as the very next lines, before any existing prompt content:

```python
==================================================
MANDATORY ENTERPRISE UI STANDARDS (apply to ALL app types below)
==================================================

CHARTS: Use Recharts via CDN (https://unpkg.com/recharts/umd/Recharts.js).
  Available: BarChart, LineChart, PieChart, RadarChart, AreaChart, ScatterChart, FunnelChart.
  All charts must have: tooltips, legends, responsive container (width="100%" height={300}).
  Destructure once at top of script: const { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, Legend, XAxis, YAxis, CartesianGrid, RadarChart, Radar, PolarGrid,
  PolarAngleAxis } = Recharts;

ERROR HANDLING: Every async operation must show:
  - Loading skeleton (gray animated pulsing div) while fetching
  - Toast notification (top-right, auto-dismiss 4s) on API error: red background, error message, X button
  - Empty state (centered icon + message + action button) when data is empty
  Toast component pattern:
    const [toast, setToast] = React.useState(null);
    const showToast = (msg, type) => { setToast({msg, type: type||'error'}); setTimeout(() => setToast(null), 4000); };
    // In JSX: {toast && <div style={{position:'fixed',top:16,right:16,zIndex:9999,
    //   background: toast.type==='error'?'#ef4444':'#22c55e',color:'white',padding:'12px 20px',
    //   borderRadius:8,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',display:'flex',alignItems:'center',gap:8}}>
    //   {toast.msg}<button onClick={()=>setToast(null)} style={{background:'none',border:'none',color:'white',cursor:'pointer',fontSize:18}}>×</button></div>}

EXPORT: Every app must include Export functionality:
  - PDF: use jsPDF via CDN (https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js)
    Pattern: const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.text("Title", 10, 10); doc.save("report.pdf");
  - Excel: use SheetJS via CDN (https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js)
    Pattern: const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1"); XLSX.writeFile(wb, "export.xlsx");
  Export buttons: slate-800 bg, white text, download icon emoji, positioned in a toolbar or Reports page.

RESPONSIVE: Sidebar collapses to hamburger at screen width < 768px using CSS media query.
  Add toggle button: visible only on mobile via media query.

COLOR SYSTEM (use as inline styles or Tailwind classes if Tailwind CDN is present):
  Primary bg: #0f172a (slate-900)  Sidebar text: #f1f5f9
  Content bg: #f8fafc  Card bg: white  Border: #e2e8f0
  Primary accent: #6366f1 (indigo-500)  Success: #22c55e  Warning: #f59e0b  Danger: #ef4444
  Badge backgrounds: indigo #eef2ff text #4f46e5, green #dcfce7 text #16a34a, red #fef2f2 text #dc2626

LOADING SKELETONS:
  Pattern: <div style={{height:20,background:'#e2e8f0',borderRadius:4,animation:'pulse 1.5s infinite'}}>
  Add keyframe once in a <style> tag: @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}

ACCESSIBILITY: All interactive elements must have aria-label. Color contrast ratio >= 4.5:1.

CDN SCRIPTS to include in every generated HTML <head>, in this order:
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://unpkg.com/recharts/umd/Recharts.js"></script>
  <script src="https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js"></script>
  <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>

```

- [ ] **Step 3: Sanity-check the file still parses**

Run: `python -c "import ast; ast.parse(open('backend/app/api/architect.py', encoding=\"utf-8\").read())"`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/architect.py
git commit -m "feat: add mandatory Enterprise UI Standards block to UI_GEN_PROMPT"
```

---

## Task 3: Add domain-specific UI_GEN_PROMPT blocks (HR_APP, SALES_APP, LEGAL_APP, SUPPORT_APP)

**Files:**
- Modify: `backend/app/api/architect.py` (append inside `UI_GEN_PROMPT`, after the existing CHATBOT/DASHBOARD/etc. blocks and before the closing `"""`)

- [ ] **Step 1: Locate the end of the UI_GEN_PROMPT string**

Run: `grep -n '"""$' backend/app/api/architect.py | head -20`

Find the closing `"""` that ends the `UI_GEN_PROMPT` string (it will be the first `"""`-only line after the `UI_GEN_PROMPT = ` assignment found in Task 2). Note that line number.

- [ ] **Step 2: Insert the following 4 domain blocks immediately BEFORE that closing `"""`**

```python
--- IF APP TYPE = HR_APP ---
Build an enterprise HR application with this EXACT 3-column layout:

LEFT SIDEBAR (w-56, bg #0f172a, text white):
- App logo + name + "HR Platform" tagline
- Nav: Dashboard, Employees, Recruitment, Onboarding, Performance, Reports
- Bottom: logged-in HR manager name + avatar

MAIN CONTENT (flex-1, bg #f8fafc):
- Header: app name + "HR Active" green badge + "DB Connected" badge + employee count badge
- Dashboard (default): KPI row (headcount, open roles, onboarding this month, avg tenure) +
  Bar chart: headcount by department + Line chart: hiring trend last 12 months +
  Donut chart: employee status (active/on-leave/terminated)
- Employees page: searchable/filterable table (Name, Role, Department, Start Date, Status, Manager) +
  row click opens employee detail drawer
- Recruitment page: Kanban board with columns New, Screening, Interview, Offer, Hired, Rejected —
  each card shows candidate name, role, date applied
- Onboarding page: checklist view per new employee — tasks with due dates and completion status
- Performance page: review cycles table, per-employee score over time line chart
- Reports page: export buttons (PDF, CSV, Excel) for headcount, attrition, time-to-hire

RIGHT PANEL (w-64, bg white, border-l):
- "Attached Files" header with count badge
- File cards with "✓ Indexed" status
- "Filter by Department" pills with employee counts
- Quick stats: Avg Tenure, Attrition Rate this quarter

CRITICAL: NEVER use "Knowledge Base" or "Filter by Topic" — use "Attached Files" and "Filter by Department".

--- IF APP TYPE = SALES_APP ---
Build an enterprise Sales Intelligence application:

LEFT SIDEBAR (w-56, bg #0f172a, text white):
- App logo + name + "Sales Intelligence" tagline
- Nav: Dashboard, Leads, Pipeline, Outreach, Proposals, Reports
- Bottom: rep name + quota progress bar (e.g. 73% of $2.4M)

MAIN CONTENT (flex-1, bg #f8fafc):
- Header: app name + "AI Active" badge + "CRM Synced" badge + open deal count
- Dashboard: KPI row (pipeline value, leads this week, win rate, avg deal size) +
  Bar chart: pipeline by stage + Line chart: revenue trend + Funnel chart: conversion rates
- Leads page: table (Name, Company, Score badge 0-100, Stage, Assigned To, Last Contact) +
  bulk actions + AI score explanation tooltip
- Pipeline page: Kanban board — Prospecting, Qualification, Proposal, Negotiation, Closed Won/Lost
- Outreach page: AI-drafted email composer. Left: lead list. Right: personalized email draft with
  subject, body, send button, and "Regenerate" option
- Proposals page: list of generated proposals with status, download PDF button
- Reports page: win/loss analysis chart, rep performance table, export options

RIGHT PANEL (w-64, bg white, border-l):
- "Attached Files" header
- "Filter by Stage" pills
- Top 5 deals by value widget

CRITICAL: NEVER use "Knowledge Base" or "Filter by Topic" — use "Attached Files" and "Filter by Stage".

--- IF APP TYPE = LEGAL_APP ---
Build an enterprise Legal Intelligence application:

LEFT SIDEBAR (w-56, bg #1e293b, text white):
- App logo + name + "Legal AI" tagline
- Nav: Dashboard, Contracts, Compliance, NDA Tracker, Policy Docs, IP Watch

MAIN CONTENT (flex-1, bg #f8fafc):
- Header: app name + "Analysis Active" badge + document count
- Dashboard: KPI row (contracts under review, compliance gaps, NDAs expiring this month, IP alerts) +
  Donut chart: risk distribution (High/Medium/Low) + Bar: contract types breakdown +
  Timeline: upcoming expirations
- Contracts page: table (Title, Party, Value, Risk Level badge, Status, Expiry Date) +
  upload button + AI risk analysis panel with highlighted clause list
- Compliance page: regulation checklist with status icons, gap analysis chart, alert timeline
- NDA Tracker: table (counterparty, type, signed date, expiry, status) + reminder badges
- Policy Docs: document list with Q&A interface — type a question, get clause-level answer
- IP Watch: alerts table (filing type, brand match %, date, action required)

RIGHT PANEL (w-64, bg white, border-l):
- "Attached Files" + risk score summary
- "Filter by Risk Level" pills (High/Medium/Low) with counts
- Upcoming deadlines widget

CRITICAL: NEVER use "Knowledge Base" or "Filter by Topic" — use "Attached Files" and "Filter by Risk Level".

--- IF APP TYPE = SUPPORT_APP ---
Build a Zendesk-style enterprise support platform:

LEFT SIDEBAR (w-56, bg #0f172a, text white):
- App logo + name + "Support Hub" tagline
- Nav: Inbox, Open Tickets, Knowledge Base, Analytics, Settings
- Unread badge on Inbox nav item

MAIN CONTENT:
- Unified Inbox (default): ticket list with channel icon (email/chat/social), subject, category badge,
  priority (P1-P3) color dot, assignee avatar, time ago. Click opens Conversation View.
- Conversation View: full thread. AI-suggested reply in light blue panel with Accept/Edit/Reject buttons.
  Customer info sidebar (right within main). One-click escalate.
- Knowledge Base: article list with search, most-retrieved articles chart, flag gaps button
- Analytics: line chart resolution rate trend, bar chart volume by channel, CSAT gauge,
  escalation rate donut, first-response time histogram
- Settings: routing rules, auto-response templates

RIGHT PANEL:
- "Attached Files" (knowledge base docs)
- "Filter by Category" pills with ticket counts
- Live stats: open P1s, avg response time today

NOTE: For SUPPORT_APP specifically, "Knowledge Base" as a NAV PAGE NAME is allowed (it's a real feature
of a support tool), but the RIGHT PANEL header must still say "Attached Files", not "Knowledge Base".
```

- [ ] **Step 3: Sanity-check the file still parses**

Run: `python -c "import ast; ast.parse(open('backend/app/api/architect.py', encoding=\"utf-8\").read())"`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/architect.py
git commit -m "feat: add HR_APP, SALES_APP, LEGAL_APP, SUPPORT_APP layout blocks to UI_GEN_PROMPT"
```

---

## Task 4: Add domain-specific UI_GEN_PROMPT blocks (MARKETING_APP, DEV_TOOL, ANALYST_APP, DATA_APP)

**Files:**
- Modify: `backend/app/api/architect.py` (append inside `UI_GEN_PROMPT`, immediately after the SUPPORT_APP block added in Task 3, before the closing `"""`)

- [ ] **Step 1: Insert the following 4 domain blocks**

```python
--- IF APP TYPE = MARKETING_APP ---
Build a Marketing Intelligence platform:

LEFT SIDEBAR (w-56, bg #0f172a, text white):
- Nav: Dashboard, Content Calendar, Competitors, SEO Audit, Campaigns, Reports

MAIN CONTENT:
- Dashboard: KPI row (content pieces this month, competitor alerts, SEO opportunities, campaign ROI) +
  Line chart: organic traffic trend + Bar: content performance by type +
  Donut: channel distribution
- Content Calendar: calendar grid view with scheduled posts, drag-and-drop rescheduling,
  platform icons (LinkedIn/Twitter/Instagram), status badges (draft/scheduled/published)
- Competitors: table of tracked competitors with weekly change indicators,
  spider/radar chart comparing share of voice
- SEO Audit: URL list with score, issues count, opportunity tags; click for detail
- Campaigns: table with budget, spend, ROI, status; bar chart ROI comparison
- Reports: downloadable PDF/CSV marketing performance reports

RIGHT PANEL (w-64, bg white, border-l):
- "Attached Files" (brand guidelines, content docs)
- "Filter by Channel" pills
- Trending topics widget

CRITICAL: NEVER use "Knowledge Base" or "Filter by Topic" — use "Attached Files" and "Filter by Channel".

--- IF APP TYPE = DEV_TOOL ---
Build a developer-facing code intelligence platform:

LEFT SIDEBAR (w-56, bg #0f172a, text white):
- Nav: Dashboard, Code Reviews, Issues, Documentation, Release Notes, Settings

MAIN CONTENT:
- Dashboard: KPI row (PRs reviewed today, open bugs, docs coverage %, avg review time) +
  Line chart: PR velocity trend + Bar: bug count by component +
  Donut: issue severity distribution
- Code Reviews: PR list (title, author, repo, status, risk score badge, age) +
  click opens diff view with AI-annotated comments panel
- Issues: table (ID, title, severity badge, component, assignee, suggested fix) +
  bulk triage actions
- Documentation: file tree of documented/undocumented functions, coverage progress bar,
  click to generate docs for a file
- Release Notes: version list, click to view/edit/export changelog; AI-draft button
- Settings: GitHub repo connections, review rules, notification preferences

RIGHT PANEL (w-64, bg white, border-l):
- "Attached Files" (codebase docs, style guide)
- "Filter by Severity" pills
- Top 5 flagged files widget

CRITICAL: NEVER use "Knowledge Base" or "Filter by Topic" — use "Attached Files" and "Filter by Severity".

--- IF APP TYPE = ANALYST_APP ---
Build a financial/technology analyst workbench:

LEFT SIDEBAR (w-56, bg #0f172a, text white):
- Nav: Dashboard, Scorecard, Research, Models, Reports, Notes

MAIN CONTENT:
- Dashboard: KPI tiles (vendors tracked, criteria defined, top scorer, last updated) +
  Radar chart: top 3 vendors overlaid + Quadrant scatter plot (user picks X/Y axes)
- Scorecard: data-dense table — criteria rows x vendor columns, color-coded cells,
  weighted total row, sort by score, highlight top performer
- Research: per-vendor research panel. AI-populated fields (web search results).
  Evidence accordion per criterion.
- Models: financial model inputs (DCF / Market Sizing / ROI) with live calculated outputs,
  assumption sliders with real-time chart updates
- Reports: auto-generated analyst report with executive summary, ranked tables, charts
  embedded. Export to PDF (jsPDF) or Excel (xlsx).
- Notes: per-vendor/per-topic note cards with AI summary + analyst's own text

RIGHT PANEL (w-64, bg white, border-l):
- "Attached Files" (vendor docs, annual reports)
- "Filter by Category" pills (product maturity, pricing, support, etc.)
- Comparison quick-select widget

CRITICAL: NEVER use "Knowledge Base" or "Filter by Topic" — use "Attached Files" and "Filter by Category".

--- IF APP TYPE = DATA_APP ---
Build a Business Intelligence / Data Analytics platform:

LEFT SIDEBAR (w-56, bg #0f172a, text white):
- Nav: Dashboard, Explorer, Charts, SQL Lab, Reports, Settings

MAIN CONTENT:
- Dashboard: KPI tiles + Line chart: primary metric trend + Bar chart: breakdown +
  Scatter/heatmap: correlation view. All charts interactive (hover tooltips, click drill-down).
- Explorer: upload CSV/Excel. Show data preview table with column stats (nulls %, distinct count,
  min/max). Column type badges. One-click chart suggestions.
- Charts: chart builder — pick chart type (bar/line/pie/scatter/heatmap/funnel), X axis, Y axis,
  color dimension. Live preview. Save to dashboard.
- SQL Lab: code editor with SQL, run button, results table, "Visualise" button on results
- Reports: scheduled report list, download historical exports, email report config
- Settings: data source connections, refresh schedule

RIGHT PANEL (w-64, bg white, border-l):
- "Attached Files" (data files)
- "Filter by Dataset" pills
- Column quick-stats widget

CRITICAL: NEVER use "Knowledge Base" or "Filter by Topic" — use "Attached Files" and "Filter by Dataset".
```

- [ ] **Step 2: Sanity-check the file still parses**

Run: `python -c "import ast; ast.parse(open('backend/app/api/architect.py', encoding=\"utf-8\").read())"`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/architect.py
git commit -m "feat: add MARKETING_APP, DEV_TOOL, ANALYST_APP, DATA_APP layout blocks to UI_GEN_PROMPT"
```

---

## Task 5: Improve the CUSTOM/fallback block and extend post-processing label fixes to all domains

**Files:**
- Modify: `backend/app/api/architect.py` — the existing CUSTOM section inside `UI_GEN_PROMPT`
- Modify: `backend/app/api/architect.py` — the post-processing block added in the earlier session (search for `detected_type == "CUSTOM"` near the end of the `generate_ui` function)

- [ ] **Step 1: Find the existing CUSTOM block inside UI_GEN_PROMPT**

Run: `grep -n "IF APP TYPE = CUSTOM" backend/app/api/architect.py`

- [ ] **Step 2: Replace the CUSTOM block's layout description**

Find the text starting `--- IF APP TYPE = CUSTOM` through its `CRITICAL:` closing lines (the block that currently hardcodes "Decision Library" / Decision Intake / Chairman Verdict language). Replace the MAIN CONTENT and RIGHT PANEL sections with a more generic version, keeping the same block delimiter:

```python
--- IF APP TYPE = CUSTOM (fallback for unclassified apps — infer domain from the prompt) ---
Build a production-quality multi-page web application. Infer the actual domain and purpose from
the prompt text below and adapt ALL labels, nav items, and page content to match that domain —
do NOT default to generic decision/council/chatbot language unless the prompt is actually about
decisions or councils.

LEFT SIDEBAR (w-56, bg #0f172a, text white):
- App logo/icon (first letter in purple circle) + app name + domain-appropriate tagline
- Nav items derived from the app's core features (4-6 items with relevant icons) — name them
  after what the app actually does, not generic terms like "Decision Intake"
- Status indicator at bottom relevant to the domain

MAIN CONTENT (flex-1, bg white):
- Header: app full name + subtitle + 2 status badge pills (e.g. "AI Active", "DB Connected") + avatar
- Dashboard (default): KPI cards relevant to the domain + at least one chart (bar or line using Recharts)
- Feature pages: one page per major feature described in the prompt, with domain-appropriate
  forms, tables, or views (not the council Decision Intake / Verdict pattern unless the prompt
  is actually about decisions or councils)
- Reports/Export page: always include an export page with PDF/CSV download buttons

RIGHT PANEL (w-64, bg white, border-l):
- "Attached Files" header with count badge (NOT "Knowledge Base")
- List of uploaded files as domain-relevant cards (e.g. "Dataset", "Document") with a "✓ Indexed" tag
- "Session" section: Messages count, Last Query timestamp
- "Filter by Category" section (NOT "Filter by Topic"): category pills derived from the domain

CRITICAL:
- NEVER use "Knowledge Base", "Filter by Topic", or generic chatbot-style language
- Use "Attached Files", "Filter by Category" instead
- All branding, nav labels, and page content must reflect the app's actual domain and purpose
  from the prompt — infer it, don't default to decision/council templates
```

- [ ] **Step 3: Replace the post-processing block**

Find this block (added in the earlier session, near the end of `generate_ui`):

```python
    # For CUSTOM (decision/council) apps, enforce correct panel labels
    # GPT-4o sometimes ignores the explicit instructions in UI_GEN_PROMPT
    if detected_type == "CUSTOM":
        html = html.replace("Knowledge Base", "Decision Library")
        html = html.replace("knowledge base", "decision library")
        html = html.replace("Filter by Topic", "Filter by Category")
        html = html.replace("filter by topic", "filter by category")
```

Replace it with:

```python
    # Domain-specific label normalization — GPT-4o sometimes ignores prompt instructions
    # and falls back to generic "Knowledge Base" / "Filter by Topic" chatbot labels.
    _DOMAIN_LABEL_FIXES = {
        "HR_APP": [
            ("Knowledge Base", "Attached Files"),
            ("knowledge base", "attached files"),
            ("Filter by Topic", "Filter by Department"),
            ("filter by topic", "filter by department"),
        ],
        "SALES_APP": [
            ("Knowledge Base", "Attached Files"),
            ("knowledge base", "attached files"),
            ("Filter by Topic", "Filter by Stage"),
            ("filter by topic", "filter by stage"),
        ],
        "LEGAL_APP": [
            ("Knowledge Base", "Attached Files"),
            ("knowledge base", "attached files"),
            ("Filter by Topic", "Filter by Risk Level"),
            ("filter by topic", "filter by risk level"),
        ],
        "MARKETING_APP": [
            ("Knowledge Base", "Attached Files"),
            ("knowledge base", "attached files"),
            ("Filter by Topic", "Filter by Channel"),
            ("filter by topic", "filter by channel"),
        ],
        "DEV_TOOL": [
            ("Knowledge Base", "Attached Files"),
            ("knowledge base", "attached files"),
            ("Filter by Topic", "Filter by Severity"),
            ("filter by topic", "filter by severity"),
        ],
        "ANALYST_APP": [
            ("Knowledge Base", "Attached Files"),
            ("knowledge base", "attached files"),
            ("Filter by Topic", "Filter by Category"),
            ("filter by topic", "filter by category"),
        ],
        "DATA_APP": [
            ("Knowledge Base", "Attached Files"),
            ("knowledge base", "attached files"),
            ("Filter by Topic", "Filter by Dataset"),
            ("filter by topic", "filter by dataset"),
        ],
        "COUNCIL_APP": [
            ("Knowledge Base", "Decision Library"),
            ("knowledge base", "decision library"),
            ("Filter by Topic", "Filter by Category"),
            ("filter by topic", "filter by category"),
        ],
        "CUSTOM": [
            ("Knowledge Base", "Attached Files"),
            ("knowledge base", "attached files"),
            ("Filter by Topic", "Filter by Category"),
            ("filter by topic", "filter by category"),
        ],
    }
    # SUPPORT_APP deliberately excluded — "Knowledge Base" is a legitimate nav page there;
    # only its right-panel usage needs fixing, which the prompt instructions already handle
    # since the nav page and right-panel header are structurally distinct in the generated HTML.

    for old, new in _DOMAIN_LABEL_FIXES.get(detected_type, []):
        html = html.replace(old, new)
```

- [ ] **Step 4: Sanity-check the file still parses**

Run: `python -c "import ast; ast.parse(open('backend/app/api/architect.py', encoding=\"utf-8\").read())"`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/architect.py
git commit -m "feat: generalize CUSTOM fallback template and extend label post-processing to all 11 domains"
```

---

## Task 7: Upgrade Legal, HR, and Support prompts in PromptLibrary.tsx

**Files:**
- Modify: `frontend/src/pages/PromptLibrary.tsx`

- [ ] Legal 1/5 — Contract Review Assistant. Find this in PromptLibrary.tsx:

`"Build a legal assistant agent that reviews contracts, highlights potential risks, summarizes key clauses, and suggests redlines based on standard legal playbooks."`

Replace with:

```
Build a Contract Review Assistant that ingests contracts, flags risk, and drafts redlines against a standard legal playbook.

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

Database: Persist every contract, extracted clauses, risk scores, redline history, approval status, and reviewer comments. All tables and charts read live from the database.
```

- [ ] Legal 2/5 — Compliance Monitor. Find this in PromptLibrary.tsx:

`"Build a compliance monitoring agent that tracks changes in regulations relevant to my industry and alerts me to potential compliance gaps in our current policies."`

Replace with:

```
Build a Compliance Monitor that tracks regulatory changes and continuously checks internal policies for gaps.

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

Database: Persist all regulatory changes, gap records, remediation drafts, approvals, and alert history. Dashboard and feed are fully database-driven, not mocked.
```

- [ ] Legal 3/5 — NDA Workflow Manager. Find this in PromptLibrary.tsx:

`"Build an NDA management agent that drafts NDAs from templates, routes them for approval, tracks signing status, sends reminders for expiring agreements, and maintains a centralized repository."`

Replace with:

```
Build an NDA Workflow Manager that drafts, routes, tracks, and archives non-disclosure agreements end to end.

AI agents:
1. DraftingAgent — Selects the correct NDA template (mutual, one-way, employee) based on request type, auto-fills party details, term, and jurisdiction, and flags any custom clauses requested.
2. ApprovalRoutingAgent — Routes the draft to the correct internal approver based on counterparty risk and deal size, tracks approval decisions, and re-routes on rejection with comments.
3. SigningTrackerAgent — Monitors e-signature status for all parties, sends automated reminders to outstanding signers, and updates the record the moment full execution completes.
4. ExpirationWatchAgent — Scans the repository daily for NDAs nearing expiration or auto-renewal deadlines and notifies the requesting owner with renewal or termination options.

Pages:
1. New NDA Request — Form: counterparty name, type (mutual/one-way/employee), jurisdiction, term length, custom clause notes. Submitting triggers DraftingAgent and shows live generation progress.
2. Approval Queue Kanban — Columns: Draft → Pending Approval → Sent for Signature → Executed → Expired. Drag cards between stages; each card shows counterparty, requester, and days pending.
3. Signature Tracker — Table of all NDAs in signing: signer name, channel, sent date, signed status per party, reminder count. One-click "send reminder now."
4. Repository — Searchable, filterable table of all executed NDAs: counterparty, execution date, expiration date, status badge (Active/Expiring Soon/Expired). Download original PDF.
5. Analytics — Bar chart of NDAs by type, line chart of average time-to-execution over months, donut chart of current repository status mix.

UI: Kanban-first workflow view as the primary screen, with a document repository table as the secondary view. Expiring-soon rows highlighted in amber, expired in red.

Database: Persist every NDA request, draft version, approval decision, signature event, and expiration check. Repository and kanban board read live from the database.
```

- [ ] Legal 4/5 — Policy Document Analyzer. Find this in PromptLibrary.tsx:

`"Build a policy analysis agent that ingests company policies, employment agreements, and regulatory documents, then answers natural language questions about obligations and rights."`

Replace with:

```
Build a Policy Document Analyzer that ingests policy documents and answers natural-language questions about obligations and rights with grounded citations.

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

Database: Persist ingested documents, extracted obligations, detected conflicts, and full question/answer history for analytics. All pages read live from the database.
```

- [ ] Legal 5/5 — IP & Trademark Watcher. Find this in PromptLibrary.tsx:

`"Build an intellectual property monitoring agent that tracks new trademark filings, patent publications, and domain registrations related to my brand and alerts me to potential infringements."`

Replace with:

```
Build an IP & Trademark Watcher that continuously monitors filings and registrations for potential infringement of a brand's marks.

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

Database: Persist watched marks, all detections, similarity scores, investigation dossiers, and resolution actions. Dashboard, feed, and kanban board are fully database-driven.
```

- [ ] HR 1/5 — AI Recruiter. Find this in PromptLibrary.tsx:

`"Build a recruitment agent that screens incoming resumes against job descriptions, ranks candidates, and automatically coordinates interview schedules with hiring managers."`

Replace with:

```
Build an AI Recruiter that screens resumes against open roles, ranks candidates, and coordinates interview scheduling automatically.

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

Database: Persist requisitions, parsed resumes, match scores, pipeline stage history, and scheduled interviews. All boards and charts read live from the database.
```

- [ ] HR 2/5 — Employee Onboarding Buddy. Find this in PromptLibrary.tsx:

`"Build an HR onboarding agent that guides new employees through paperwork, answers common policy questions, and schedules introductory meetings with key team members."`

Replace with:

```
Build an Employee Onboarding Buddy that guides new hires through paperwork, policy questions, and introductory meetings from offer acceptance through day 30.

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

Database: Persist onboarding plans, paperwork status, policy Q&A history, and meeting schedules per new hire. Dashboards read live from the database, not hardcoded cohorts.
```

- [ ] HR 3/5 — Resume Parser & Standardizer. Find this in PromptLibrary.tsx:

`"Build a resume parsing agent that accepts PDF or Word resumes, extracts key fields like skills, experience, and education, and outputs standardized JSON profiles ready for my ATS."`

Replace with:

```
Build a Resume Parser & Standardizer that converts unstructured resumes into clean, standardized candidate profiles ready for any ATS.

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

Database: Persist every uploaded resume, extracted fields, correction history, and export log. Review queue and analytics are fully database-driven.
```

- [ ] HR 4/5 — Employee Engagement Pulse. Find this in PromptLibrary.tsx:

`"Build an employee engagement agent that sends periodic pulse surveys, analyzes sentiment trends across teams, and recommends actionable steps to improve workplace satisfaction."`

Replace with:

```
Build an Employee Engagement Pulse platform that runs recurring surveys, tracks sentiment trends, and recommends concrete actions to leaders.

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

Database: Persist survey definitions, every response (anonymized), computed scores, trend flags, and recommendation/action tracking. All dashboards read live from the database.
```

- [ ] HR 5/5 — Performance Review Assistant. Find this in PromptLibrary.tsx:

`"Build a performance review agent that collects peer feedback, summarizes key themes for each employee, and drafts balanced review narratives that managers can refine and approve."`

Replace with:

```
Build a Performance Review Assistant that collects 360 feedback, synthesizes themes, and drafts balanced review narratives for managers to refine.

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

Database: Persist review cycles, all feedback submissions (with reviewer anonymization for subjects), draft/approved narratives, and calibration flags. All dashboards read live from the database.
```

- [ ] Support 1/5 — Omni-channel Support (no prompt rewrite; the existing prompt text in PromptLibrary.tsx is already full quality — leave it untouched). Only add a `sampleFile` field to this entry, immediately after its `complexity: "Advanced",` line:

```
    sampleFile: { name: "omni-channel-support-sample.csv", url: "/samples/support/omni-channel-support.csv" },
```

- [ ] Support 2/5 — User Onboarding Guide. Find this in PromptLibrary.tsx:

`"Build a user onboarding agent that monitors new user activity and sends proactive tips and tutorials when they seem stuck or inactive."`

Replace with:

```
Build a User Onboarding Guide that monitors in-product activity and proactively nudges users toward activation with the right tip at the right moment.

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

Database: Persist user activity events, segment assignments, nudge sends, and outcome tracking. All views and charts read live from the database.
```

- [ ] Support 3/5 — Voice Customer Support. Find this in PromptLibrary.tsx:

`"Build a voice support agent that handles inbound customer calls, triages issues through guided conversation, resolves common problems, and creates tickets for complex cases."`

Replace with:

```
Build a Voice Customer Support agent that handles inbound calls, triages through guided conversation, resolves common issues, and escalates complex ones with a full ticket handoff.

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

Database: Persist every call, transcript, triage classification, resolution outcome, and any resulting ticket. All dashboards and logs read live from the database.
```

- [ ] Support 4/5 — Ticket Triage & Routing. Find this in PromptLibrary.tsx:

`"Build a ticket triage agent that reads incoming support tickets, classifies them by category and urgency, assigns them to the right team, and sends an instant acknowledgment to the customer."`

Replace with:

```
Build a Ticket Triage & Routing agent that classifies, prioritizes, and assigns incoming support tickets with an instant customer acknowledgment.

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

Database: Persist every ticket, classification result, routing decision, workload snapshots, and acknowledgment log. Queue and dashboards read live from the database.
```

- [ ] Support 5/5 — Self-Serve FAQ Builder. Find this in PromptLibrary.tsx:

`"Build an FAQ agent that analyzes past support conversations, identifies the most common questions, and auto-generates help center articles with step-by-step solutions."`

Replace with:

```
Build a Self-Serve FAQ Builder that mines past support conversations to auto-generate and maintain a help center.

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

Database: Persist mined clusters, source conversation links, drafted/published articles, gap flags, staleness checks, and deflection metrics. All dashboards and reports read live from the database.
```

- [ ] Add `sampleFile` to all Legal and HR prompt objects, right after each object's `complexity` line:

```
    // Contract Review Assistant
    sampleFile: { name: "contract-review-assistant-sample.csv", url: "/samples/legal/contract-review-assistant.csv" },
    // Compliance Monitor
    sampleFile: { name: "compliance-monitor-sample.csv", url: "/samples/legal/compliance-monitor.csv" },
    // NDA Workflow Manager
    sampleFile: { name: "nda-workflow-manager-sample.csv", url: "/samples/legal/nda-workflow-manager.csv" },
    // Policy Document Analyzer
    sampleFile: { name: "policy-document-analyzer-sample.csv", url: "/samples/legal/policy-document-analyzer.csv" },
    // IP & Trademark Watcher
    sampleFile: { name: "ip-trademark-watcher-sample.csv", url: "/samples/legal/ip-trademark-watcher.csv" },
    // AI Recruiter
    sampleFile: { name: "ai-recruiter-sample.csv", url: "/samples/hr/ai-recruiter.csv" },
    // Employee Onboarding Buddy
    sampleFile: { name: "employee-onboarding-buddy-sample.csv", url: "/samples/hr/employee-onboarding-buddy.csv" },
    // Resume Parser & Standardizer
    sampleFile: { name: "resume-parser-standardizer-sample.csv", url: "/samples/hr/resume-parser-standardizer.csv" },
    // Employee Engagement Pulse
    sampleFile: { name: "employee-engagement-pulse-sample.csv", url: "/samples/hr/employee-engagement-pulse.csv" },
    // Performance Review Assistant
    sampleFile: { name: "performance-review-assistant-sample.csv", url: "/samples/hr/performance-review-assistant.csv" },
```

- [ ] Add `sampleFile` to the remaining 4 Support prompt objects (Omni-channel Support handled above):

```
    // User Onboarding Guide
    sampleFile: { name: "user-onboarding-guide-sample.csv", url: "/samples/support/user-onboarding-guide.csv" },
    // Voice Customer Support
    sampleFile: { name: "voice-customer-support-sample.csv", url: "/samples/support/voice-customer-support.csv" },
    // Ticket Triage & Routing
    sampleFile: { name: "ticket-triage-routing-sample.csv", url: "/samples/support/ticket-triage-routing.csv" },
    // Self-Serve FAQ Builder
    sampleFile: { name: "self-serve-faq-builder-sample.csv", url: "/samples/support/self-serve-faq-builder.csv" },
```

- [ ] Update `complexity` fields to reflect the new multi-agent scope:
  - Contract Review Assistant: keep `"Advanced"`
  - Compliance Monitor: keep `"Advanced"`
  - NDA Workflow Manager: bump `"Intermediate"` → `"Advanced"`
  - Policy Document Analyzer: bump `"Starter"` → `"Intermediate"`
  - IP & Trademark Watcher: keep `"Advanced"`
  - AI Recruiter: bump `"Intermediate"` → `"Advanced"`
  - Employee Onboarding Buddy: bump `"Starter"` → `"Intermediate"`
  - Resume Parser & Standardizer: bump `"Starter"` → `"Intermediate"`
  - Employee Engagement Pulse: keep `"Intermediate"`
  - Performance Review Assistant: bump `"Intermediate"` → `"Advanced"`
  - Omni-channel Support: keep `"Advanced"` (no change; only sampleFile added)
  - User Onboarding Guide: bump `"Starter"` → `"Intermediate"`
  - Voice Customer Support: keep `"Advanced"`
  - Ticket Triage & Routing: keep `"Intermediate"`
  - Self-Serve FAQ Builder: keep `"Intermediate"`

- [ ] Run the frontend build/lint to confirm no TypeScript/syntax errors were introduced by the multi-line template literals and new `sampleFile` fields.

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: no new TypeScript errors introduced by the edits.

- [ ] Commit:

```bash
git add frontend/src/pages/PromptLibrary.tsx
git commit -m "feat: upgrade Legal/HR/Support prompts to multi-agent enterprise quality"
```

---

## Task 8: Upgrade Productivity and Development prompts in PromptLibrary.tsx

**Files:**
- Modify: `frontend/src/pages/PromptLibrary.tsx` — the 10 prompt objects in the `// ── Productivity ──` and `// ── Development ──` sections

- [ ] **Step 1: Executive Meeting Assistant**

Find this in PromptLibrary.tsx: `"Build a meeting assistant agent that reviews my calendar, prepares briefing notes for upcoming meetings, and drafts follow-up emails based on meeting transcripts."` — Replace with:

```
Build 'MeetingIQ' — an executive meeting assistant that reviews the calendar, prepares briefing notes ahead of every meeting, and drafts follow-up emails and action items from transcripts.

AI agents:
1. CalendarScannerAgent — Scans the upcoming calendar, identifies meetings needing prep (external attendees, recurring 1:1s, high-stakes deals), and pulls attendee context from CRM/email history.
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

Database: Persist every meeting, briefing, transcript, extracted action item, and follow-up draft with timestamps and status; all pages read live from the DB, never hardcoded.
```

- [ ] **Step 2: Email Triage & Drafter**

Find this in PromptLibrary.tsx: `"Build an email triage agent that categorizes incoming emails by urgency, drafts responses for routine inquiries, and summarizes long threads."` — Replace with:

```
Build 'InboxPilot' — an email triage and drafting agent that classifies incoming email by urgency, drafts responses for routine inquiries, and condenses long threads into digestible summaries.

AI agents:
1. TriageAgent — Classifies each incoming email by urgency (Urgent/Normal/Low), category (billing, request, FYI, spam), and sentiment; flags anything needing same-day response.
2. DraftingAgent — For routine, pattern-matched inquiries, generates a ready-to-send reply using prior thread context and a tone matched to the sender relationship.
3. SummarizerAgent — Condenses long threads (10+ messages) into a 3-5 bullet summary with key decisions and open questions highlighted.
4. FollowUpTrackerAgent — Detects emails awaiting a reply past a configurable SLA and surfaces them as reminders.

Pages:
1. Unified Inbox — Table view of emails with columns: sender, subject, urgency badge (color-coded), category, AI-suggested action, received time. Sortable and filterable by urgency/category.
2. Thread View — Full email thread with the AI-generated summary pinned at the top, draft reply panel on the right (editable before sending), and a "Mark Resolved" action.
3. Draft Queue — Kanban board (Awaiting Review / Approved / Sent) of AI-drafted responses so the user can batch-approve routine replies.
4. Analytics Dashboard — Bar chart of email volume by category, donut chart of urgency distribution, line chart of average response time trend over the last 30 days.
5. SLA Watchlist — List of emails past their response SLA with days-overdue counter and one-click "Draft Reply Now" action.

UI: Two-pane layout — inbox list on the left, thread/detail on the right, similar to Superhuman/Gmail. Urgency badges use red/amber/green. Charts in Analytics use Recharts with a clean light theme.

Database: Every email, its classification, draft, summary, and SLA status is persisted; all list and analytics views query the database live.
```

- [ ] **Step 3: Team Calendar Coordinator**

Find this in PromptLibrary.tsx: `"Build a calendar coordination agent that checks availability across team members, suggests optimal meeting times, sends invites, and prevents double-bookings automatically."` — Replace with:

```
Build 'SyncBoard' — a team calendar coordination agent that checks cross-team availability, suggests optimal meeting slots, sends invites, and prevents double-bookings automatically.

AI agents:
1. AvailabilityAgent — Aggregates free/busy data across all team members' calendars and computes overlapping open slots for a requested meeting duration and date range.
2. SchedulingAgent — Ranks candidate time slots by attendee preference, timezone fairness, and meeting-fatigue score (avoids back-to-back overload), then proposes the top 3.
3. InviteAgent — Sends calendar invites once a slot is confirmed, attaches agenda and video link, and manages RSVPs and reschedule requests.
4. ConflictGuardAgent — Continuously monitors the team calendar for double-bookings or last-minute conflicts and proactively alerts affected attendees with reschedule options.

Pages:
1. Team Calendar — Weekly calendar grid view showing all team members' events side by side with color-coding per person; conflicts highlighted with a red outline.
2. Schedule a Meeting — Form: title, attendees (multi-select), duration, date range, preferences. Submit triggers Availability + Scheduling agents and shows the top 3 suggested slots with a one-click "Book" button.
3. Conflict Center — Kanban view (Detected / Notified / Resolved) of scheduling conflicts with affected attendees and suggested resolution slots.
4. Team Load Dashboard — Bar chart of meeting hours per team member this week, donut chart of meeting-type distribution (1:1, standup, external), line chart of meeting-fatigue score trend.
5. Invite History — Table of sent invites with columns: meeting, attendees, status (Pending/Accepted/Declined), sent date; filter by status.

UI: Calendar-first layout with a left mini-calendar navigator, main weekly grid, and a right "Suggestions" panel. Conflict rows pulse subtly until resolved. Charts via Recharts.

Database: All meetings, availability snapshots, conflicts, and invite statuses are stored and read live; nothing is hardcoded or mocked.
```

- [ ] **Step 4: Morning Briefing Agent**

Find this in PromptLibrary.tsx: `"Build a daily briefing agent that compiles my calendar events, pending tasks, unread priority emails, and relevant industry news into a concise morning digest delivered at 8 AM."` — Replace with:

```
Build 'DawnBrief' — a daily morning briefing agent that compiles calendar events, pending tasks, priority emails, and relevant industry news into one concise digest delivered every morning.

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

Database: Every generated digest, its source items, and open/read events are persisted; history and analytics pages read live from the database.
```

- [ ] **Step 5: Notion Workspace Automator**

Find this in PromptLibrary.tsx: `"Build a Notion automation agent that captures action items from Slack conversations and meeting notes, creates tasks in my Notion workspace, and sends reminders before deadlines."` — Replace with:

```
Build 'TaskWeave' — a Notion workspace automation agent that captures action items from Slack conversations and meeting notes, creates and tracks tasks in the connected workspace, and sends deadline reminders.

AI agents:
1. CaptureAgent — Monitors connected Slack channels and uploaded meeting notes, extracts candidate action items (owner, description, implied due date) using NLP.
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

Database: Every captured item, created task, reminder, and sync event is persisted with full history; the board and analytics always reflect live database state, never hardcoded demo tasks.
```

- [ ] **Step 6: Automated Code Reviewer**

Find this in PromptLibrary.tsx: `"Build a code review agent that analyzes pull requests for security vulnerabilities, performance issues, and adherence to our style guide."` — Replace with:

```
Build 'ReviewGuard' — an automated code review agent that analyzes every pull request for security vulnerabilities, performance issues, and style-guide adherence, then posts structured feedback.

AI agents:
1. StaticAnalysisAgent — Runs on each PR diff, flags security vulnerabilities (injection risks, secrets in code, unsafe deserialization), and severity-scores each finding.
2. PerformanceAgent — Reviews diffs for performance anti-patterns (N+1 queries, unbounded loops, blocking calls in async code) and suggests fixes with code snippets.
3. StyleGuideAgent — Checks the diff against the team's configured style guide (naming, formatting, file structure, comment conventions) and auto-suggests corrections.
4. ReviewSynthesizerAgent — Merges findings from all three agents into a single structured PR comment with a pass/fail verdict and blocking vs. non-blocking issues.

Pages:
1. PR Review Queue — Table of open PRs with columns: repo, title, author, risk score (color-coded), findings count, review status (Pending/Reviewed/Blocked).
2. Review Detail — Full diff view with inline AI comments per line, grouped by category (Security/Performance/Style), each with severity tag and suggested fix; approve/request-changes actions.
3. Findings Library — Searchable/filterable table of all historical findings across PRs by type, severity, and repo, with a "resolved" toggle.
4. Analytics Dashboard — Bar chart of findings by category per week, donut chart of severity distribution, line chart of average time-to-resolution trend across repos.
5. Style Guide Config — Form to define/edit style rules (naming conventions, max function length, required doc comments) with a live preview of how a sample diff would be flagged.

UI: Developer-dark theme (GitHub-style), monospace diff panels with color-coded line annotations (red=security, amber=performance, blue=style). Charts via Recharts on a dark-compatible palette.

Database: Every PR, finding, verdict, and style-rule change is persisted with timestamps; the queue, library, and analytics pages always read live data, never mocked results.
```

- [ ] **Step 7: Documentation Generator**

Find this in PromptLibrary.tsx: `"Build a documentation agent that watches my codebase and automatically updates the API documentation and README files when code changes are merged."` — Replace with:

```
Build 'DocSync' — a documentation generator agent that watches the codebase for merged changes and automatically keeps API documentation and README files accurate and current.

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

Database: Every detected change, drafted doc update, drift finding, and publish event is persisted with timestamps; dashboards and logs always reflect live database state.
```

- [ ] **Step 8: API Documentation Assistant**

Find this in PromptLibrary.tsx: `"Build an API docs agent that connects to my GitHub repo, analyzes endpoints and schemas, and generates developer-friendly documentation with request/response examples and edge cases."` — Replace with:

```
Build 'EndpointScribe' — an API documentation assistant that connects to a GitHub repo, analyzes endpoints and schemas, and generates developer-friendly docs with request/response examples and edge cases.

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

Database: Every endpoint, generated example, narrative, and version diff is persisted; catalog and dashboard pages always read live from the database, never a static spec file.
```

- [ ] **Step 9: Bug Triage Agent**

Find this in PromptLibrary.tsx: `"Build a bug triage agent that reads incoming GitHub issues, classifies severity and affected component, suggests potential root causes from the codebase, and assigns to the right developer."` — Replace with:

```
Build 'TriageBot' — a bug triage agent that reads incoming GitHub issues, classifies severity and affected component, suggests likely root causes from the codebase, and assigns each bug to the right developer.

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

Database: Every issue, classification, root-cause suggestion, assignment, and duplicate link is persisted; the queue, board, and analytics pages always read live database state.
```

- [ ] **Step 10: Release Notes Generator**

Find this in PromptLibrary.tsx: `"Build a release notes agent that analyzes merged PRs and commits since the last release, categorizes changes by type, and generates a polished changelog for users."` — Replace with:

```
Build 'ChangelogForge' — a release notes generator that analyzes merged PRs and commits since the last release, categorizes changes by type, and produces a polished, user-facing changelog.

AI agents:
1. CommitCollectorAgent — Pulls all merged PRs and commits since the last tagged release, extracting PR titles, descriptions, and linked issue references.
2. CategorizerAgent — Classifies each change into categories (Features, Fixes, Improvements, Breaking Changes, Deprecations) using commit conventions and PR labels.
3. RewriteAgent — Rewrites internal, technical PR titles into clear, user-facing changelog entries, removing jargon and grouping related changes.
4. PublishAgent — Assembles the final changelog, versions it, and publishes it to the release notes page and optionally emails/Slacks a summary to subscribers.

Pages:
1. Release Builder — Form/wizard: select version range or "since last release," trigger the pipeline, preview categorized draft entries with edit-in-place before publishing.
2. Changelog Archive — List of all published releases (version, date, entry count) with expandable full changelog per version.
3. Draft Review — Table of AI-categorized entries awaiting review: original PR title, rewritten entry, category, include/exclude toggle.
4. Analytics Dashboard — Bar chart of changes by category per release, donut chart of breaking vs. non-breaking changes, line chart of release cadence (days between releases) over the last year.
5. Subscriber Notifications — Table of past notification sends (email/Slack) per release with delivery status and open-rate tracking.

UI: Clean, product-marketing-style light theme for the public changelog archive (like a public "What's New" page) paired with an internal dark-toned review/draft workspace. Charts via Recharts.

Database: Every commit/PR pulled, categorized entry, rewritten changelog line, and published release is persisted with version history; archive and analytics pages always read live from the database.
```

- [ ] **Step 11: Add sampleFile references and bump complexity for all 10 prompts**

For each of the 10 prompt objects above, add a `sampleFile` field right after `tools`, and set `complexity` as follows:

```
Executive Meeting Assistant   -> complexity: "Intermediate", sampleFile: { name: "executive-meeting-assistant-sample.csv", url: "/samples/productivity/executive-meeting-assistant.csv" }
Email Triage & Drafter        -> complexity: "Intermediate", sampleFile: { name: "email-triage-drafter-sample.csv", url: "/samples/productivity/email-triage-drafter.csv" }
Team Calendar Coordinator     -> complexity: "Intermediate", sampleFile: { name: "team-calendar-coordinator-sample.csv", url: "/samples/productivity/team-calendar-coordinator.csv" }
Morning Briefing Agent        -> complexity: "Intermediate", sampleFile: { name: "morning-briefing-agent-sample.csv", url: "/samples/productivity/morning-briefing-agent.csv" }
Notion Workspace Automator    -> complexity: "Advanced",     sampleFile: { name: "notion-workspace-automator-sample.csv", url: "/samples/productivity/notion-workspace-automator.csv" }
Automated Code Reviewer       -> complexity: "Advanced",     sampleFile: { name: "automated-code-reviewer-sample.csv", url: "/samples/development/automated-code-reviewer.csv" }
Documentation Generator       -> complexity: "Intermediate", sampleFile: { name: "documentation-generator-sample.csv", url: "/samples/development/documentation-generator.csv" }
API Documentation Assistant   -> complexity: "Advanced",     sampleFile: { name: "api-documentation-assistant-sample.csv", url: "/samples/development/api-documentation-assistant.csv" }
Bug Triage Agent              -> complexity: "Advanced",     sampleFile: { name: "bug-triage-agent-sample.csv", url: "/samples/development/bug-triage-agent.csv" }
Release Notes Generator       -> complexity: "Intermediate", sampleFile: { name: "release-notes-generator-sample.csv", url: "/samples/development/release-notes-generator.csv" }
```

Example edit shape for one object (Executive Meeting Assistant), showing where `sampleFile` and updated `complexity` go:

```typescript
    tools: ["Calendar", "Email", "Slack"],
    complexity: "Intermediate",
    sampleFile: { name: "executive-meeting-assistant-sample.csv", url: "/samples/productivity/executive-meeting-assistant.csv" },
  },
```

- [ ] **Step 12: Verify the file still parses / builds**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: no new TypeScript errors introduced by the edits.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/pages/PromptLibrary.tsx
git commit -m "feat: upgrade Productivity/Development prompts to multi-agent enterprise quality"
```

---

## Task 6: Upgrade General, Marketing, and Sales prompts in PromptLibrary.tsx

**Files:**
- Modify: `frontend/src/pages/PromptLibrary.tsx`

This task rewrites 14 of the 16 prompts in the General, Marketing, and Sales categories to multi-agent
enterprise quality (matching the existing "LLM Council" and "Omni-channel Support" prompts already in the
file), and adds a `sampleFile` reference to all 16. "LLM Council" is already upgraded and is skipped.
"Knowledge Base Q&A Bot" already has multi-agent quality prompt text — only its `sampleFile` field is added.

- [ ] **Step 1: Deep Research Assistant — General**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a research assistant agent that can search the web, synthesize information from multiple sources, and provide comprehensive reports with citations on any given topic.",
    tools: ["Web Search", "RAG", "PDF Parser"],
    complexity: "Intermediate",
  },
  {
    category: "General",
    title: "Project Manager",
```

Replace with:
```
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
```

- [ ] **Step 2: Project Manager — General**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a project management agent that helps break down complex goals into actionable tasks, assigns deadlines, and tracks progress updates through daily check-ins.",
    tools: ["Calendar", "Email", "Slack"],
    complexity: "Intermediate",
  },
  {
    category: "General",
    title: "Voice AI Receptionist",
```

Replace with:
```
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
```

- [ ] **Step 3: Voice AI Receptionist — General**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a voice AI receptionist that answers inbound calls, responds to FAQs about my business, books appointments on Google Calendar, and transfers to a human when needed.",
    tools: ["Calendar", "Knowledge Base", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "General",
    title: "Career Advisor Chatbot",
```

Replace with:
```
    prompt: `Build a Voice AI Receptionist that answers inbound business calls, handles FAQs, books appointments, and escalates to a human when needed.

AI agents:
1. Call Intake & Intent Agent — Answers the inbound call, greets the caller, transcribes speech in real time, and classifies intent (FAQ question, appointment booking, complaint, request for human, other).
2. FAQ Answer Agent — Searches the business knowledge base (hours, services, pricing, location, policies) via RAG and responds conversationally with natural speech-friendly phrasing (short sentences, no bullet points read aloud).
3. Appointment Booking Agent — Checks Google Calendar availability, proposes 2-3 open slots to the caller, confirms the chosen slot, collects caller name/phone/reason for visit, and creates the calendar event with a confirmation callback/SMS.
4. Escalation Agent — Detects when the caller explicitly asks for a human, is frustrated (negative sentiment), or the FAQ Agent has low confidence (<70%), and transfers the call with a spoken summary handed to the human receptionist.
5. Call Quality & Analytics Agent — Scores each call transcript for resolution success, logs call duration, outcome (resolved/booked/escalated/abandoned), and produces daily call volume and outcome reports.

Pages:
1. Live Calls — Real-time view of active and recent calls: caller number, duration, current intent, live transcript snippet, status (in-progress/resolved/escalated). Click to open full transcript.
2. Call Transcript View — Full conversation transcript with speaker labels (Caller / AI), timestamps, and the detected intent + confidence score. Highlighted moments where the AI consulted the knowledge base or checked the calendar.
3. Appointments — Table of bookings made by the AI (caller name, requested slot, confirmed slot, reason, status) synced with a calendar view. Reschedule/cancel actions.
4. Knowledge Base Manager — Manage FAQ entries (question, answer, category). See which FAQs are asked most often, flag gaps from unanswered questions.
5. Analytics Dashboard — KPI row (calls today, resolution rate, escalation rate, avg call duration) + Bar chart: call volume by hour + Donut: outcome distribution (resolved/booked/escalated/abandoned) + Line chart: daily call trend.

UI: Dashboard-first layout with a prominent "Live Calls" ticker at the top. Transcript view styled like a chat log with a phone/waveform icon per caller turn. Knowledge Base and Appointments as standard nav pages.

Database: Persist every call with full transcript, detected intent, outcome, and any appointment created. Analytics reads live from the DB.`,
    tools: ["Calendar", "Knowledge Base", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "voice-ai-receptionist-sample.csv", url: "/samples/general/voice-ai-receptionist.csv" },
  },
  {
    category: "General",
    title: "Career Advisor Chatbot",
```

- [ ] **Step 4: Career Advisor Chatbot — General**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a career advisor agent that reviews a user's skills and experience, generates personalized career roadmaps, suggests skill gaps to fill, and provides mock interview practice.",
    tools: ["RAG", "Web Search"],
    complexity: "Starter",
  },
  {
    category: "General",
    title: "Knowledge Base Q&A Bot",
```

Replace with:
```
    prompt: `Build a Career Advisor Chatbot that reviews a user's background and produces a personalized career roadmap with skill-gap analysis and mock interview practice.

AI agents:
1. Profile Analysis Agent — Parses the user's resume/LinkedIn profile and self-reported skills, extracts current role, years of experience, skills, and stated career goal, and produces a structured profile summary.
2. Market Research Agent — Searches the web for target-role job postings and industry trend reports to identify in-demand skills, typical career progression paths, and realistic salary bands for the target role.
3. Roadmap Generation Agent — Compares the user's current profile against market requirements, generates a phased career roadmap (0-3mo, 3-6mo, 6-12mo, 1-2yr) with specific milestones, and flags the top 3-5 skill gaps to close first.
4. Mock Interview Agent — Conducts a simulated interview for the target role: asks behavioral and technical questions one at a time, evaluates each answer against a rubric (clarity, structure, relevance, depth), and gives specific improvement feedback.
5. Progress Tracking Agent — Tracks which roadmap milestones and recommended courses/certifications the user has marked complete, and recalculates readiness score toward the target role over time.

Pages:
1. Profile Intake — Upload resume (PDF/DOCX) or fill a form (current role, skills, years experience, target role, target timeline). Submit triggers profile analysis and market research.
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
```

- [ ] **Step 5: Knowledge Base Q&A Bot — General (sampleFile only, prompt text unchanged)**

Find this in PromptLibrary.tsx:
```
    tools: ["RAG", "Knowledge Base", "PDF Parser"],
    complexity: "Starter",
  },
  // ── Marketing ─────────────────────────────────────────────────────────────
```

Replace with:
```
    tools: ["RAG", "Knowledge Base", "PDF Parser"],
    complexity: "Starter",
    sampleFile: { name: "knowledge-base-qa-bot-sample.csv", url: "/samples/general/knowledge-base-qa-bot.csv" },
  },
  // ── Marketing ─────────────────────────────────────────────────────────────
```

- [ ] **Step 6: Content Marketing Team — Marketing**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a marketing team of agents that can write blog posts, create social media content, perform SEO analysis, and generate graphics for my brand.",
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Marketing",
    title: "Competitor Analysis Agent",
```

Replace with:
```
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
```

- [ ] **Step 7: Competitor Analysis Agent — Marketing**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a competitor analysis agent that monitors my competitors' websites, social media, and news mentions to provide weekly strategic reports.",
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Marketing",
    title: "SEO Content Optimizer",
```

Replace with:
```
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
```

- [ ] **Step 8: SEO Content Optimizer — Marketing**

Find this in PromptLibrary.tsx:
```
    prompt: "Build an SEO agent that audits my website content, identifies keyword opportunities, generates optimized meta titles and descriptions, and suggests internal linking improvements.",
    tools: ["Web Search", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Marketing",
    title: "Newsletter Intelligence Hub",
```

Replace with:
```
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
```

- [ ] **Step 9: Newsletter Intelligence Hub — Marketing**

Find this in PromptLibrary.tsx:
```
    prompt: "Build an automated newsletter agent that monitors industry news daily, curates the top stories, drafts a polished newsletter edition, and publishes it on schedule.",
    tools: ["Web Search", "Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Marketing",
    title: "Social Media Manager",
```

Replace with:
```
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
```

- [ ] **Step 10: Social Media Manager — Marketing**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a social media agent that generates a week's worth of platform-specific posts for LinkedIn, Twitter, and Instagram, complete with hashtags, captions, and optimal posting times.",
    tools: ["Web Search", "Webhook"],
    complexity: "Starter",
  },
  // ── Sales ─────────────────────────────────────────────────────────────────
```

Replace with:
```
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
```

- [ ] **Step 11: Sales Outreach Specialist — Sales**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a sales outreach agent that can find leads on LinkedIn, enrich their data, and draft personalized cold emails based on their recent activity.",
    tools: ["Web Search", "Email", "CRM"],
    complexity: "Intermediate",
  },
  {
    category: "Sales",
    title: "CRM Data Manager",
```

Replace with:
```
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
```

- [ ] **Step 12: CRM Data Manager — Sales**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a CRM management agent that automatically updates deal stages, logs communications, and flags stale leads in my CRM.",
    tools: ["CRM", "Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Sales",
    title: "Product Recommendation Agent",
```

Replace with:
```
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
```

- [ ] **Step 13: Product Recommendation Agent — Sales**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a product recommendation agent that takes a customer's budget and requirements, then suggests optimal product bundles and upsell opportunities to maximize deal value.",
    tools: ["RAG", "CRM", "Webhook"],
    complexity: "Starter",
  },
  {
    category: "Sales",
    title: "Lead Scoring & Qualification",
```

Replace with:
```
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
```

- [ ] **Step 14: Lead Scoring & Qualification — Sales**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a lead scoring agent that analyzes incoming leads from my website and email campaigns, scores them based on engagement and fit, and routes high-intent leads to sales reps instantly.",
    tools: ["CRM", "Email", "Webhook"],
    complexity: "Intermediate",
  },
  {
    category: "Sales",
    title: "Proposal & Quote Generator",
```

Replace with:
```
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
```

- [ ] **Step 15: Proposal & Quote Generator — Sales**

Find this in PromptLibrary.tsx:
```
    prompt: "Build a proposal generation agent that takes deal context and client requirements, then produces a polished sales proposal with pricing, timeline, and scope of work.",
    tools: ["RAG", "CRM", "Email"],
    complexity: "Intermediate",
  },
  // ── Legal ─────────────────────────────────────────────────────────────────
```

Replace with:
```
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
```

- [ ] **Step 16: TypeScript syntax sanity check**

Run:
```bash
cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -50
```
Expected: no output, or only pre-existing errors unrelated to `PromptLibrary.tsx` (confirm no new errors reference `PromptLibrary.tsx`).

- [ ] **Step 17: Commit**

```bash
git add frontend/src/pages/PromptLibrary.tsx
git commit -m "feat: upgrade General/Marketing/Sales prompts to multi-agent enterprise quality"
```

---

## Task 9: Upgrade Analysts and Data & Analysis prompts + add sampleFile to all remaining prompts in PromptLibrary.tsx

**Files:**
- Modify: `frontend/src/pages/PromptLibrary.tsx`

- [ ] **Step 1: Add sampleFile to Vendor Comparison Scorecard (Analysts) — do NOT rewrite its prompt text**

Find this in PromptLibrary.tsx:
```
    tools: ["RAG", "Web Search", "Webhook"],
    complexity: "Advanced",
  },
  {
    category: "Analysts",
    title: "Market Sizing Calculator",
```
Replace with:
```
    tools: ["RAG", "Web Search", "Webhook"],
    complexity: "Advanced",
    sampleFile: { name: "vendor-comparison-scorecard-sample.csv", url: "/samples/analysts/vendor-comparison-scorecard.csv" },
  },
  {
    category: "Analysts",
    title: "Market Sizing Calculator",
```

- [ ] **Step 2: Upgrade Market Sizing Calculator**

Find this in PromptLibrary.tsx: `"Build a market sizing tool where I enter assumptions like number of potential buyers, average deal size, adoption rates, and growth rates, and it calculates TAM, SAM, and SOM with a breakdown chart and scenario comparison."`

Replace with:
```
Build a Market Sizing Calculator platform for analysts sizing new markets.

AI agents:
1. Assumptions Agent — Takes user inputs (total potential buyers, average deal size, adoption rate, penetration rate, growth rate, geography/segment filters) and validates them against typical industry ranges, flagging assumptions that look unrealistic with a suggested benchmark range.
2. Calculation Agent — Computes TAM (Total Addressable Market), SAM (Serviceable Addressable Market), and SOM (Serviceable Obtainable Market) from the assumptions, produces a 5-year growth projection, and runs three scenarios (Conservative, Base, Aggressive) by flexing adoption and growth rates.
3. Narrative Agent — Writes a 2-3 paragraph executive summary explaining the sizing logic, key assumptions driving the result, and the biggest risks to the estimate, in plain analyst language suitable for a client deck.

Pages:
1. Assumptions Builder — Form with fields for total buyers, average deal size, adoption %, penetration %, annual growth %, plus optional segment/geography breakdown rows. "Validate Assumptions" button runs the Assumptions Agent and shows inline benchmark warnings.
2. TAM/SAM/SOM Dashboard — Funnel chart showing TAM > SAM > SOM narrowing, KPI tiles for each figure, and a stacked bar chart of the 5-year projection. Scenario toggle (Conservative/Base/Aggressive) updates all charts live.
3. Scenario Comparison — Side-by-side table and grouped bar chart comparing all three scenarios across Year 1, Year 3, Year 5. Sensitivity slider showing how SOM changes as adoption rate moves.
4. Report — Auto-generated summary combining the Narrative Agent's write-up, the funnel chart, and the scenario table. Export as PDF (jsPDF) or Excel (xlsx) for client-ready deliverables.

UI: Clean light theme, large number KPI tiles with currency formatting, funnel and bar charts via Recharts, scenario toggle pills at top of dashboard.

Sample data: Pre-populate with a SaaS market sizing example (50,000 potential buyers, $12,000 average deal size, 8% adoption, 15% annual growth).
```

- [ ] **Step 3: Upgrade Technology Hype Cycle Builder**

Find this in PromptLibrary.tsx: `"Build a technology hype cycle tool where I can add technology names, place them along the curve stages, and estimate time to mainstream adoption with a clean exportable output."`

Replace with:
```
Build a Technology Hype Cycle Builder for analysts tracking emerging tech.

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

Sample data: Pre-populate with 10 technologies across AI, cloud, and biotech (e.g. Agentic AI, Quantum Computing, Synthetic Biology, Edge AI) at varied stages.
```

- [ ] **Step 4: Upgrade Comparable Company Analyzer**

Find this in PromptLibrary.tsx: `"Build a comp table tool where I enter companies with their revenue, EBITDA, net income, market cap, and growth rates, and automatically get calculated multiples like EV/Revenue, EV/EBITDA, and P/E ratio with median, mean, and outlier highlighting."`

Replace with:
```
Build a Comparable Company Analyzer for equity research and valuation work.

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

Sample data: Pre-populate with 8 cloud software companies with realistic FY financials and multiples.
```

- [ ] **Step 5: Upgrade DCF Model Builder**

Find this in PromptLibrary.tsx: `"Build a DCF valuation tool where I can input revenue projections, margins, capex, working capital changes, discount rate, and terminal growth rate, and it calculates free cash flows, present values, and an implied share price with adjustable assumptions."`

Replace with:
```
Build a DCF Model Builder for financial analysts and equity researchers.

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

Sample data: Pre-populate with a mid-cap SaaS company DCF (revenue $200M, 20% growth tapering to 3% terminal, 25% EBITDA margin, 9% WACC, 2.5% terminal growth).
```

- [ ] **Step 6: Upgrade ROI & Business Case Calculator**

Find this in PromptLibrary.tsx: `"Build a business case calculator where I can input the upfront cost, ongoing costs, expected benefits per year, and a discount rate, and automatically get NPV, IRR, payback period, and a cumulative cash flow chart with adjustable assumptions."`

Replace with:
```
Build an ROI & Business Case Calculator for consultants and analysts justifying investments.

AI agents:
1. Cash Flow Agent — Builds a year-by-year cash flow schedule from upfront cost, recurring/ongoing costs, and expected benefits per year across the chosen time horizon.
2. Financial Metrics Agent — Calculates NPV using the user's discount rate, IRR (via iterative solve), simple and discounted payback period, and benefit-cost ratio.
3. Risk & Narrative Agent — Flags business cases with thin margins (NPV close to zero, payback beyond 3 years) as "marginal", runs a quick best/worst case using +/-20% benefit variance, and writes a one-paragraph investment recommendation.

Pages:
1. Business Case Inputs — Form for project name, upfront cost, ongoing annual cost, expected annual benefit (can vary by year), time horizon, discount rate.
2. Cash Flow Schedule — Table of year-by-year cash flow, cumulative cash flow, and discounted cash flow. Line chart showing cumulative cash flow crossing zero at the payback point.
3. Results Dashboard — KPI tiles for NPV, IRR, Payback Period, Benefit-Cost Ratio, each with a green/amber/red verdict badge. Best/worst case range chart (tornado-style) showing NPV under +/-20% benefit swings.
4. Business Case Report — Auto-generated one-page summary (Narrative Agent recommendation + key metrics + cash flow chart) exportable as PDF, ready to attach to a business case document.

UI: Clean light theme, prominent KPI cards with verdict badges (green "Strong", amber "Marginal", red "Weak"), Recharts line and bar charts.

Sample data: Pre-populate with a process automation business case ($150K upfront, $20K/year ongoing cost, $80K/year benefit, 5-year horizon, 8% discount rate).
```

- [ ] **Step 7: Upgrade Vendor Briefing Note Taker**

Find this in PromptLibrary.tsx: `"Build a vendor briefing tracker where I can log each briefing with company name, date, key claims, product updates, differentiators, and my assessment, then search across all notes and compare what different vendors said about the same topic."`

Replace with:
```
Build a Vendor Briefing Note Taker for analysts tracking vendor relationship intelligence.

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

Sample data: Pre-populate with 6 briefings across 3 vendors over the past 2 quarters.
```

- [ ] **Step 8: Upgrade Inquiry Tracker & Trend Spotter**

Find this in PromptLibrary.tsx: `"Build an inquiry tracker where I can log each client call with topic, industry, company size, and what they were trying to solve, then see which topics are trending and which industries are asking about what."`

Replace with:
```
Build an Inquiry Tracker & Trend Spotter for analyst relations teams.

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

Sample data: Pre-populate with 40 sample inquiries spanning 6 topics and 5 industries over 3 months.
```

- [ ] **Step 9: Upgrade Earnings Season Dashboard**

Find this in PromptLibrary.tsx: `"Build an earnings dashboard where I can enter each company's reported revenue, EPS, and guidance alongside consensus estimates, see instant beats/misses/surprises, jot down key management quotes, and flag companies where guidance changed meaningfully."`

Replace with:
```
Build an Earnings Season Dashboard for equity research analysts.

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

Sample data: Pre-populate with 15 companies' Q-over-Q earnings results with realistic beats, misses, and guidance changes.
```

- [ ] **Step 10: Upgrade Sector Performance Tracker**

Find this in PromptLibrary.tsx: `"Build a sector performance tracker where I can follow about 20 stocks, track each stock's YTD return, 3-month return, and performance vs the S&P 500 and NASDAQ, with a ranked table and chart showing outperformers and laggards."`

Replace with:
```
Build a Sector Performance Tracker for equity research and portfolio analysts.

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

Sample data: Pre-populate with 20 large-cap tickers across 5 sectors with realistic YTD/3-month returns vs S&P 500 and NASDAQ.
```

- [ ] **Step 11: Upgrade IPO Readiness Checklist**

Find this in PromptLibrary.tsx: `"Build an IPO readiness assessment tool where I can score a company across financial performance, governance readiness, market positioning, competitive moat, and risk factors, and get an overall readiness score with flags for areas needing attention."`

Replace with:
```
Build an IPO Readiness Checklist platform for capital markets analysts.

AI agents:
1. Scoring Agent — Takes analyst-entered scores (1-10) across five dimensions — Financial Performance, Governance Readiness, Market Positioning, Competitive Moat, Risk Factors — plus supporting notes per dimension, and calculates a weighted overall readiness score.
2. Gap Analysis Agent — Identifies the lowest-scoring dimensions, flags any dimension scoring below a configurable threshold (default 6/10) as "needs attention", and suggests 2-3 concrete remediation actions per flagged dimension based on the notes provided.
3. Benchmark Agent — Compares the company's dimension scores against a reference set of previously assessed companies (or industry norms) to show whether it's ahead of or behind typical IPO-ready peers on each dimension.

Pages:
1. Assessment Input — Form with the five dimensions, each with a 1-10 slider and a notes textarea for supporting evidence (financials, governance structure, competitive analysis, risk register).
2. Readiness Dashboard — Radar chart showing the company's score across all five dimensions vs a benchmark overlay. Overall readiness score as a large gauge/KPI tile with a verdict badge (Ready / Nearly Ready / Not Ready).
3. Gap Analysis — List view of flagged dimensions with the Gap Analysis Agent's remediation suggestions, sortable by severity (lowest score first).
4. Assessment History & Report — Track multiple assessments of the same company over time (line chart of overall score trend), export a full readiness report as PDF for IPO committee review.

UI: Professional light theme, radar chart as the centerpiece, gauge-style overall score tile, red/amber/green flags on the gap analysis list.

Sample data: Pre-populate with 2 sample company assessments — one "Nearly Ready" (score 7.2) and one "Not Ready" (score 4.8) — with realistic dimension scores and notes.
```

- [ ] **Step 12: Upgrade Stock Market Analyst**

Find this in PromptLibrary.tsx: `"Build a stock analysis agent that monitors my portfolio tickers, aggregates news and analyst ratings, and sends me a pre-market summary every morning."`

Replace with:
```
Build a Stock Market Analyst platform for portfolio monitoring.

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

Sample data: Pre-populate with an 8-ticker portfolio (mix of tech, finance, and healthcare names) with sample overnight news and rating changes.
```

- [ ] **Step 13: Upgrade Text-to-SQL Explorer**

Find this in PromptLibrary.tsx: `"Build a data exploration agent that connects to my SQL database and allows me to ask questions in plain English to generate charts and reports."`

Replace with:
```
Build a Text-to-SQL Explorer for self-service data analysis.

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

Sample data: Pre-populate with a sample "orders/customers/products" schema and 5 example questions with pre-computed results (e.g. "What were sales by region last quarter?").
```

- [ ] **Step 14: Upgrade Excel Data Insights Generator**

Find this in PromptLibrary.tsx: `"Build a data analysis agent that accepts Excel or CSV uploads, identifies patterns and anomalies, and generates an executive summary with visualizations and actionable insights."`

Replace with:
```
Build an Excel Data Insights Generator for quick self-service analysis.

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

Sample data: Pre-populate with a sample sales transactions CSV (500 rows) containing a few intentional outliers and a null-heavy column for the demo to surface.
```

- [ ] **Step 15: Upgrade Business Intelligence Agent**

Find this in PromptLibrary.tsx: `"Build a BI agent that connects to my ERP or database, generates weekly performance reports across sales, inventory, and finance, and highlights trends that need attention."`

Replace with:
```
Build a Business Intelligence Agent for weekly operational reporting.

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

Sample data: Pre-populate with 12 weeks of sample Sales/Inventory/Finance data showing a realistic seasonal dip and one flagged anomaly (inventory stockout risk).
```

- [ ] **Step 16: Upgrade Customer Analytics Agent**

Find this in PromptLibrary.tsx: `"Build a customer analytics agent that segments users by behavior and demographics, identifies churn risk patterns, and recommends targeted retention strategies based on the data."`

Replace with:
```
Build a Customer Analytics Agent for churn prevention and segmentation.

AI agents:
1. Segmentation Agent — Clusters uploaded customer data (behavioral + demographic fields) into meaningful segments (e.g. "Power Users", "At-Risk", "New/Onboarding", "Dormant") using rule-based or statistical clustering, and describes each segment's defining characteristics.
2. Churn Risk Agent — Scores each customer's churn risk (0-100) based on engagement decline, support ticket volume, and usage recency, and ranks customers by risk within each segment.
3. Retention Strategy Agent — For each at-risk segment, recommends 2-3 targeted retention actions (e.g. "re-engagement email sequence", "proactive account check-in", "discount offer") based on the segment's characteristics and churn drivers.

Pages:
1. Customer Upload & Segments — CSV upload of customer data (usage metrics, demographics, support history). Segmentation Agent auto-clusters and displays segment cards with size and description.
2. Churn Risk Board — Sortable table of all customers with churn risk score, segment tag, and key risk drivers (e.g. "usage down 40% in 30 days"). Color-coded risk badges (green/amber/red).
3. Segment Analytics — Bar chart of segment sizes, radar chart comparing segment characteristics (engagement, tenure, spend), line chart of churn risk trend by segment over time.
4. Retention Playbook — Per-segment recommended actions from the Retention Strategy Agent, with a "Mark Action Taken" tracker and outcome notes field. Export segment lists to CSV for CRM import.

UI: Clean light theme, segment cards with distinct colors, risk badges prominent in the customer table, professional analytics dashboard feel.

Sample data: Pre-populate with 200 sample customer records spanning 4 segments with realistic usage/demographic fields and a range of churn risk scores.
```

- [ ] **Step 17: Upgrade KPI Dashboard Builder**

Find this in PromptLibrary.tsx: `"Build a KPI dashboard tool where I can define KPIs with their current value, target, and trend direction, organise them into categories, and present a clean dashboard view that updates in real time."`

Replace with:
```
Build a KPI Dashboard Builder for cross-functional performance tracking.

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

Sample data: Pre-populate with 12 sample KPIs across Sales, Ops, and Customer categories with a mix of on-track/at-risk statuses.
```

- [ ] **Step 18: Upgrade Survey Results Analyzer**

Find this in PromptLibrary.tsx: `"Build a survey analysis tool where I can upload survey results, see response distributions for each question, cross-tabulate answers by demographics, and filter results dynamically with charts ready for client reports."`

Replace with:
```
Build a Survey Results Analyzer for market research analysts.

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

Sample data: Pre-populate with a 300-respondent customer satisfaction survey (8 questions, 4 demographic fields) with realistic distributions.
```

- [ ] **Step 19: Upgrade Competitive Landscape Mapper**

Find this in PromptLibrary.tsx: `"Build a competitive landscape tool where I can plot competitors on a customisable 2×2 matrix with defined axes, adjust their positions, and add annotations about each competitor's strategy."`

Replace with:
```
Build a Competitive Landscape Mapper for strategy and market analysts.

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

Sample data: Pre-populate with 8 competitors in the "Project Management Software" space plotted on Price vs Feature Breadth axes.
```

- [ ] **Step 20: Upgrade Consumer Segmentation Tool**

Find this in PromptLibrary.tsx: `"Build a consumer segmentation tool where I can define customer segments based on purchase behaviour, demographics, and attitudes, then size each segment, describe their key characteristics, and visualise how they differ on important dimensions."`

Replace with:
```
Build a Consumer Segmentation Tool for market research analysts.

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

Sample data: Pre-populate with a 500-respondent consumer dataset clustering into 4 segments (e.g. "Value Seekers", "Brand Loyalists", "Convenience Shoppers", "Premium Explorers").
```

- [ ] **Step 21: Upgrade Brand Health Tracker**

Find this in PromptLibrary.tsx: `"Build a brand health tracker where I can enter brand health metrics like awareness, consideration, purchase intent, NPS, and satisfaction for multiple brands each quarter, with trend lines over time, significant change highlights, and side-by-side brand comparisons."`

Replace with:
```
Build a Brand Health Tracker for brand and marketing analysts.

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

Sample data: Pre-populate with 4 competing brands tracked across 6 quarters with realistic metric fluctuations including one notable dip for a brand.
```

- [ ] **Step 22: Upgrade Pricing Research Analyzer**

Find this in PromptLibrary.tsx: `"Build a Van Westendorp pricing analysis tool where I can enter responses about what price is too cheap, a bargain, getting expensive, and too expensive, and automatically get the optimal price point, indifference price point, and range of acceptable prices plotted on the classic chart."`

Replace with:
```
Build a Pricing Research Analyzer (Van Westendorp Price Sensitivity Meter) for pricing analysts.

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

Sample data: Pre-populate with 150 sample respondent price-point sets for a consumer subscription product, yielding a realistic $12-$18 acceptable range.
```

- [ ] **Step 23: Upgrade Data Quality Scorecard**

Find this in PromptLibrary.tsx: `"Build a data quality scorecard where I can score each data source on dimensions like completeness, accuracy, timeliness, and consistency, track these scores over time, produce an overall data health score, and flag sources that drop below threshold."`

Replace with:
```
Build a Data Quality Scorecard for data governance analysts.

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

Sample data: Pre-populate with 10 data sources (CRM, ERP, Marketing DB, etc.) scored across the 4 dimensions over 6 months, with 2 sources flagged below threshold.
```

- [ ] **Step 24: Upgrade A/B Test Calculator & Reporter**

Find this in PromptLibrary.tsx: `"Build an A/B test calculator where I can enter the number of visitors and conversions for control and variant groups and instantly see conversion rates, absolute and relative lift, statistical significance (p-value), confidence interval, and a plain-English winner declaration."`

Replace with:
```
Build an A/B Test Calculator & Reporter for growth and product analysts.

AI agents:
1. Statistics Agent — Takes visitor and conversion counts for control and variant groups, calculates conversion rates, absolute and relative lift, runs a two-proportion z-test to compute the p-value, and calculates the 95% confidence interval for the lift.
2. Significance Interpretation Agent — Determines statistical significance at standard thresholds (90%/95%/99%), checks for adequate sample size (minimum detectable effect check), and produces a plain-English winner declaration or "inconclusive, need more data" verdict.
3. Report Agent — Writes a short summary paragraph explaining the result in non-technical language suitable for sharing with stakeholders, including a caveat about sample size or test duration if applicable.

Pages:
1. Test Setup — Form: test name, control visitors, control conversions, variant visitors, variant conversions, desired confidence level (90/95/99%).
2. Results Dashboard — KPI tiles for conversion rate (control vs variant), absolute lift, relative lift %, p-value, confidence interval. Bar chart comparing conversion rates with error bars for the confidence interval.
3. Significance & Verdict — Large winner declaration banner (green "Variant Wins", gray "Inconclusive", red "Control Wins") with the Significance Interpretation Agent's explanation and sample-size adequacy check.
4. Test Log & Report — History of past tests run, searchable table, export any test's full result as a PDF one-pager for sharing.

UI: Clean light theme, prominent winner-declaration banner at top of results, bar chart with error bars, KPI tiles below.

Sample data: Pre-populate with 3 past A/B tests (one clear winner, one inconclusive, one control wins) with realistic visitor/conversion counts.
```

- [ ] **Step 25: Upgrade SQL Query Result Visualiser**

Find this in PromptLibrary.tsx: `"Build a SQL result visualizer where I can paste in tabular data, pick from chart types like bar, line, pie, or scatter, and get charts presentable enough to drop into a Slack message or email."`

Replace with:
```
Build a SQL Query Result Visualiser for analysts sharing quick data cuts.

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

Sample data: Pre-populate the paste box with a sample "monthly signups by channel" dataset ready to visualize on load.
```

- [ ] **Step 26: Upgrade Stakeholder Report Generator**

Find this in PromptLibrary.tsx: `"Build a weekly stakeholder report tool where I can enter this week's numbers and last week's numbers for metrics like revenue, active users, churn, support tickets, and NPS, and automatically get a formatted report showing the trend, week-over-week change, and a summary of what's up and what's down."`

Replace with:
```
Build a Stakeholder Report Generator for weekly business updates.

AI agents:
1. Metrics Intake Agent — Takes this week's and last week's values for key metrics (revenue, active users, churn, support tickets, NPS, or any custom metric set), validates entries, and calculates week-over-week absolute and percentage change for each.
2. Trend Classification Agent — Classifies each metric's movement as "Improving", "Stable", or "Declining" based on direction and magnitude of change, accounting for metrics where "down is good" (e.g. churn, tickets) vs "up is good" (e.g. revenue).
3. Summary Writing Agent — Drafts a concise "What's Up / What's Down" executive summary paragraph plus a one-line headline for the whole report (e.g. "Solid week: revenue up 6%, churn down slightly, NPS flat").

Pages:
1. Weekly Entry — Form to enter this week's and last week's value for each tracked metric, with a running list of previously tracked metrics for quick re-entry.
2. Report Dashboard — KPI tiles per metric showing current value, WoW change (arrow + %), and trend classification badge (green/gray/red, direction-aware). Bar chart comparing this week vs last week across all metrics.
3. Executive Summary — Auto-drafted headline and "What's Up / What's Down" narrative from the Summary Writing Agent, editable before sending.
4. Report History & Export — Archive of past weekly reports (searchable by date), export current report as PDF or send directly via Email.

UI: Clean light theme, KPI tiles with directional arrows colored correctly per metric type (not always green=up), headline banner at top of report.

Sample data: Pre-populate with a sample week's data for 5 metrics (revenue, active users, churn, support tickets, NPS) showing a realistic mixed week.
```

- [ ] **Step 27: Upgrade Policy Impact Calculator**

Find this in PromptLibrary.tsx: `"Build a policy impact calculator where I can input current tax rates, proposed rates, income brackets, and population data, then see the estimated revenue impact, who benefits, who pays more, and the net effect on the budget with adjustable proposed rates."`

Replace with:
```
Build a Policy Impact Calculator for public policy analysts.

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

Sample data: Pre-populate with 5 income brackets, current rates, one proposed rate scenario, and realistic taxpayer population figures.
```

- [ ] **Step 28: Upgrade Demographic Trend Explorer**

Find this in PromptLibrary.tsx: `"Build a demographic trend explorer where I can upload population data broken down by age, region, income, and education level, explore trends over time, project forward using different growth assumptions, and create clear visualisations for policy briefs."`

Replace with:
```
Build a Demographic Trend Explorer for policy and public sector analysts.

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

Sample data: Pre-populate with 20 years of sample population data broken down by 4 age bands, 3 regions, and income/education tiers.
```

- [ ] **Step 29: Upgrade Grant & Funding Tracker**

Find this in PromptLibrary.tsx: `"Build a grant tracker where I can track each grant's total budget, amount spent, remaining balance, key deadlines, and reporting status, see which grants are at risk of underspending or overspending, which reports are due soon, and get a portfolio-level view of funding health."`

Replace with:
```
Build a Grant & Funding Tracker for nonprofit and public sector grant managers.

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

Sample data: Pre-populate with 8 grants of varying size and pace, including one underspending and one overspending example.
```

- [ ] **Step 30: Upgrade Regulatory Compliance Checker**

Find this in PromptLibrary.tsx: `"Build a compliance checker where I can list regulations, map them to our business practices, score our compliance level for each, flag gaps, and see how our overall compliance posture shifts when a regulation changes."`

Replace with:
```
Build a Regulatory Compliance Checker for compliance and risk analysts.

AI agents:
1. Regulation Mapping Agent — Given a list of regulations and a set of internal business practices/controls, maps each regulation to the relevant practice(s) that address it, flagging regulations with no mapped practice at all.
2. Compliance Scoring Agent — Takes analyst-entered compliance scores (0-100) per regulation-practice mapping, calculates an overall compliance posture score, and flags gaps below a configurable threshold with a severity rating.
3. Change Impact Agent — When a regulation's requirements are updated, re-evaluates the affected mappings and estimates how the overall compliance posture score would shift, highlighting which practices need review first.

Pages:
1. Regulation & Practice Registry — Manage lists of regulations and internal business practices, with a mapping matrix to link them.
2. Compliance Scorecard — Matrix view: regulations as rows, mapped practices as columns, compliance score per cell, overall score per regulation. Color-coded (red/amber/green) gap highlighting.
3. Gap Analysis — Sorted list of flagged gaps (regulation, unmapped or low-scoring practice, severity), with recommended next steps field for the analyst to fill in.
4. Change Simulation & Report — Select a regulation, simulate an updated requirement, see projected posture score shift via the Change Impact Agent, export full compliance report as PDF for audit purposes.

UI: Clean, formal compliance-dashboard styling, matrix view with color-coded cells, severity badges on the gap analysis list.

Sample data: Pre-populate with 10 regulations mapped to 15 internal practices, with 3 intentional gaps for the demo to surface.
```

- [ ] **Step 31: Upgrade Public Comment Analyzer**

Find this in PromptLibrary.tsx: `"Build a public comment analysis tool where I can upload hundreds of public comments on a proposed regulation, have them categorised by theme and sentiment, see which issues came up most frequently, and get a summary of the main arguments for and against thorough enough for an official response document."`

Replace with:
```
Build a Public Comment Analyzer for regulatory affairs analysts.

AI agents:
1. Categorization Agent — Ingests hundreds of uploaded public comments, classifies each into recurring themes (e.g. "Cost Impact", "Environmental Concern", "Implementation Timeline") and tags overall sentiment (Support/Oppose/Neutral).
2. Frequency Analysis Agent — Tallies theme frequency and sentiment breakdown across all comments, identifies the top issues raised, and surfaces representative comment excerpts for each theme.
3. Response Drafting Agent — Synthesizes the main arguments for and against the proposed regulation into a structured summary suitable as the basis for an official response document, organized by theme with representative quotes cited.

Pages:
1. Upload Comments — Bulk upload of comment files (CSV/text/PDF), parsing progress indicator, preview of parsed comment count.
2. Theme & Sentiment Dashboard — Bar chart of comment volume by theme, donut chart of overall sentiment (Support/Oppose/Neutral), sortable table of themes with counts.
3. Comment Explorer — Browse/search all comments filtered by theme and sentiment, with representative excerpts highlighted per theme.
4. Response Document Draft — Auto-generated structured summary (by theme, arguments for/against, representative quotes) from the Response Drafting Agent, editable and exportable as a Word-ready PDF for the official response.

UI: Clean, formal government-affairs styling, theme bar chart and sentiment donut side by side, comment excerpts shown as quote cards.

Sample data: Pre-populate with 200 sample public comments on a proposed zoning regulation, spanning 5 themes with mixed sentiment.
```

- [ ] **Step 32: Upgrade SWOT & Strategy Framework Builder**

Find this in PromptLibrary.tsx: `"Build a strategy framework tool where I can pick a framework like SWOT, Porter's Five Forces, or value chain analysis, fill in my analysis, and get a clean professional visual output I can share with clients or drop into a presentation."`

Replace with:
```
Build a SWOT & Strategy Framework Builder for management consultants and strategy analysts.

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

Sample data: Pre-populate with a sample completed SWOT analysis for a mid-market retail company.
```

- [ ] **Step 33: Add sampleFile to remaining Analysts and Data & Analysis prompts not yet touched**

Find this in PromptLibrary.tsx:
```
    tools: ["Web Search", "Webhook"],
    complexity: "Starter",
  },
  // ── Analysts (additional) ─────────────────────────────────────────────────
```
(this closes the Competitive Landscape Mapper entry) — Replace with:
```
    tools: ["Web Search", "Webhook"],
    complexity: "Starter",
    sampleFile: { name: "competitive-landscape-mapper-sample.csv", url: "/samples/data-analysis/competitive-landscape-mapper.csv" },
  },
  // ── Analysts (additional) ─────────────────────────────────────────────────
```

Then, for each remaining prompt object in both categories (Market Sizing Calculator, Technology Hype Cycle Builder, Comparable Company Analyzer, DCF Model Builder, ROI & Business Case Calculator, Vendor Briefing Note Taker, Inquiry Tracker & Trend Spotter, Earnings Season Dashboard, Sector Performance Tracker, IPO Readiness Checklist, Stock Market Analyst, Text-to-SQL Explorer, Excel Data Insights Generator, Business Intelligence Agent, Customer Analytics Agent, KPI Dashboard Builder, Survey Results Analyzer, Consumer Segmentation Tool, Brand Health Tracker, Pricing Research Analyzer, Data Quality Scorecard, A/B Test Calculator & Reporter, SQL Query Result Visualiser, Stakeholder Report Generator, Policy Impact Calculator, Demographic Trend Explorer, Grant & Funding Tracker, Regulatory Compliance Checker, Public Comment Analyzer, SWOT & Strategy Framework Builder), append a `sampleFile` field immediately after that entry's `complexity` line, following the pattern:
```
    sampleFile: { name: "<title-slug>-sample.csv", url: "/samples/<category-slug>/<title-slug>.csv" },
```
using `analysts` as `<category-slug>` for Analysts entries and `data-analysis` for Data & Analysis entries, and `<title-slug>` as the lowercase-hyphenated form of the prompt's `title` (e.g. `title: "DCF Model Builder"` → `dcf-model-builder`; `title: "SQL Query Result Visualiser"` → `sql-query-result-visualiser`).

- [ ] **Step 34: Bump complexity where upgraded prompts now warrant it**

Since every upgraded prompt now specifies 3-4 AI agents and 3-4 multi-page UIs with charts/tables/export, review and bump `complexity` on the following entries (all previously "Starter" or under-rated given the new prompt depth) to at least `"Intermediate"`, and to `"Advanced"` where the domain involves financial modeling, statistical methods, or multi-source synthesis:
- Market Sizing Calculator → `"Intermediate"`
- Technology Hype Cycle Builder → `"Intermediate"`
- Vendor Briefing Note Taker → `"Intermediate"`
- Inquiry Tracker & Trend Spotter → `"Intermediate"`
- KPI Dashboard Builder → `"Intermediate"`
- Competitive Landscape Mapper → `"Intermediate"`
- SQL Query Result Visualiser → `"Intermediate"`
- Stakeholder Report Generator → `"Intermediate"`
- A/B Test Calculator & Reporter → `"Intermediate"`
- SWOT & Strategy Framework Builder → `"Intermediate"`
- DCF Model Builder → keep `"Advanced"`
- Pricing Research Analyzer → keep `"Advanced"`
- Policy Impact Calculator → keep `"Advanced"`
- Demographic Trend Explorer → keep `"Advanced"`
- Regulatory Compliance Checker → keep `"Advanced"`
- Public Comment Analyzer → keep `"Advanced"`
- Text-to-SQL Explorer → keep `"Advanced"`
- Business Intelligence Agent → keep `"Advanced"`
- Customer Analytics Agent → keep `"Advanced"`

All other entries (Comparable Company Analyzer, ROI & Business Case Calculator, Earnings Season Dashboard, Sector Performance Tracker, IPO Readiness Checklist, Stock Market Analyst, Excel Data Insights Generator, Survey Results Analyzer, Consumer Segmentation Tool, Brand Health Tracker, Data Quality Scorecard, Grant & Funding Tracker) already carry `"Intermediate"` or `"Advanced"` and need no change.

- [ ] **Step 35: Sanity-check the file still parses (TypeScript syntax check)**

Run: `cd frontend && npx tsc --noEmit -p . 2>&1 | grep -i PromptLibrary || echo "no errors"`
Expected: `no errors` (or only pre-existing unrelated errors, not new syntax errors in PromptLibrary.tsx)

- [ ] **Step 36: Commit**

```bash
git add frontend/src/pages/PromptLibrary.tsx
git commit -m "feat: upgrade Analysts/Data & Analysis prompts to multi-agent enterprise quality, add sampleFile to all remaining prompts"
```

---

## Task 10: Create sample CSV files for all 43 non-Council prompts

**Files:**
- Create: `frontend/public/samples/<category-slug>/<title-slug>.csv` (43 files)

### general

- [ ] **Step 1: Create frontend/public/samples/general/deep-research-assistant.csv**

```csv
id,topic,source_title,source_url,source_type,credibility_score,key_finding,published_date,citation_count
1,Quantum Computing Adoption,IBM Quantum Roadmap 2026,https://ibm.com/quantum/roadmap,industry_report,92,"1000+ qubit systems now commercially available",2026-01-15,340
2,Quantum Computing Adoption,Nature: Error Correction Breakthroughs,https://nature.com/articles/qc-2026,academic_paper,97,"Surface code error rates below 0.1% achieved",2026-02-20,512
3,Renewable Energy Storage,IEA Battery Storage Outlook,https://iea.org/reports/battery-2026,government_report,95,"Grid storage capacity up 68% YoY",2026-03-01,210
4,Renewable Energy Storage,MIT Solid-State Battery Study,https://mit.edu/news/solid-state-2026,academic_paper,94,"Solid-state batteries reach 500 Wh/kg density",2026-01-28,178
5,AI Regulation Trends,EU AI Act Implementation Report,https://ec.europa.eu/ai-act-2026,government_report,90,"High-risk AI systems require conformity assessment",2026-02-10,89
6,AI Regulation Trends,Brookings Policy Brief,https://brookings.edu/ai-policy-2026,think_tank,85,"US states adopting patchwork AI liability laws",2026-01-05,64
7,Semiconductor Supply Chain,TSMC Investor Call Transcript,https://tsmc.com/investors/q1-2026,corporate_filing,88,"3nm capacity expansion in Arizona on schedule",2026-01-22,45
8,Semiconductor Supply Chain,McKinsey Chip Shortage Analysis,https://mckinsey.com/semiconductors-2026,industry_report,91,"Lead times normalized to pre-2021 levels",2026-02-14,132
9,Climate Tech Funding,PitchBook VC Report Q1 2026,https://pitchbook.com/climate-tech-q1,industry_report,87,"$18.4B invested in climate startups in Q1",2026-04-02,76
10,Climate Tech Funding,Bloomberg NEF Trends,https://bloombergnef.com/climate-2026,industry_report,93,"Carbon capture deals doubled since 2025",2026-03-18,98
```

- [ ] **Step 2: Create frontend/public/samples/general/project-manager.csv**

```csv
id,task_name,owner,status,priority,start_date,due_date,percent_complete,project,blocker
1,Design system audit,Priya Nair,In Progress,High,2026-06-01,2026-07-20,65,Website Relaunch,None
2,API integration testing,Marcus Webb,Blocked,Critical,2026-06-15,2026-07-18,40,Payments Platform,Waiting on vendor sandbox access
3,User research interviews,Elena Vasquez,Completed,Medium,2026-05-20,2026-06-30,100,Mobile App v2,None
4,Content migration,James Okoye,In Progress,Medium,2026-06-10,2026-07-25,55,Website Relaunch,None
5,Security penetration test,Sofia Lindqvist,Not Started,Critical,2026-07-22,2026-08-05,0,Payments Platform,None
6,Beta release rollout,Tom Reynolds,In Progress,High,2026-07-01,2026-07-30,30,Mobile App v2,Awaiting App Store review
7,Stakeholder demo prep,Aisha Rahman,In Progress,High,2026-07-10,2026-07-19,80,Payments Platform,None
8,Performance load testing,David Kim,Not Started,Medium,2026-07-25,2026-08-10,0,Website Relaunch,None
9,Accessibility compliance review,Nina Petrov,In Progress,High,2026-07-05,2026-07-24,45,Mobile App v2,None
10,Data migration validation,Carlos Mendoza,Completed,High,2026-06-01,2026-07-01,100,Payments Platform,None
```

- [ ] **Step 3: Create frontend/public/samples/general/voice-ai-receptionist.csv**

```csv
id,call_id,caller_name,phone_number,call_time,duration_sec,intent,department_routed,resolution,sentiment
1,C-10234,Rachel Simmons,+1-555-0142,2026-07-14 09:12:00,145,Schedule appointment,Front Desk,Resolved,Positive
2,C-10235,Anonymous,+1-555-0198,2026-07-14 09:20:00,62,Billing inquiry,Billing,Transferred,Neutral
3,C-10236,Derek Foster,+1-555-0177,2026-07-14 09:35:00,210,Reschedule appointment,Front Desk,Resolved,Positive
4,C-10237,Linda Chao,+1-555-0155,2026-07-14 10:01:00,88,Prescription refill,Pharmacy,Resolved,Positive
5,C-10238,Anonymous,+1-555-0163,2026-07-14 10:15:00,300,Emergency triage,Urgent Care,Escalated to human,Negative
6,C-10239,Omar Haddad,+1-555-0121,2026-07-14 10:40:00,55,Hours inquiry,Front Desk,Resolved,Positive
7,C-10240,Grace Muthoni,+1-555-0189,2026-07-14 11:05:00,175,Insurance verification,Billing,Resolved,Neutral
8,C-10241,Anonymous,+1-555-0110,2026-07-14 11:22:00,40,Wrong number,None,Closed,Neutral
9,C-10242,Peter Novak,+1-555-0134,2026-07-14 11:48:00,190,Test results inquiry,Nurse Line,Transferred,Neutral
10,C-10243,Yuki Tanaka,+1-555-0176,2026-07-14 12:10:00,120,Schedule appointment,Front Desk,Resolved,Positive
```

- [ ] **Step 4: Create frontend/public/samples/general/career-advisor-chatbot.csv**

```csv
id,user_name,current_role,years_experience,target_role,skill_gap,recommended_course,session_date,satisfaction_score
1,Megan Price,Junior Data Analyst,2,Senior Data Scientist,"Machine Learning,Python OOP",Advanced ML Specialization,2026-07-01,4.5
2,Tyrell Banks,QA Engineer,4,SDET Lead,"Test Automation Architecture,CI/CD",Test Automation Mastery,2026-07-03,4.2
3,Sofia Marin,Marketing Coordinator,1,Growth Marketing Manager,"SQL,A/B Testing",Growth Analytics Bootcamp,2026-07-05,4.8
4,Ahmed Youssef,Backend Developer,5,Engineering Manager,"People Management,Budgeting",Tech Leadership Program,2026-07-06,4.0
5,Claire Dubois,UX Designer,3,Head of Design,"Design Systems,Stakeholder Comms",Design Leadership Track,2026-07-08,4.6
6,Ben Okafor,Sales Rep,2,Account Executive,"Negotiation,Enterprise Selling",Enterprise Sales Certification,2026-07-09,4.3
7,Priya Menon,Data Engineer,3,ML Engineer,"Deep Learning,MLOps",MLOps Foundations,2026-07-10,4.7
8,Jason Wu,Product Analyst,2,Product Manager,"Roadmapping,User Interviews",PM Fundamentals,2026-07-11,4.4
9,Lena Fischer,HR Generalist,4,HR Business Partner,"Org Design,Data-Driven HR",People Analytics Course,2026-07-12,4.1
10,Marco Rossi,DevOps Engineer,3,Platform Architect,"Kubernetes,System Design",Cloud Architecture Path,2026-07-13,4.9
```

- [ ] **Step 5: Create frontend/public/samples/general/knowledge-base-qa-bot.csv**

```csv
id,question,article_title,category,confidence_score,answered_correctly,response_time_ms,escalated,date_asked
1,How do I reset my password?,Password Reset Guide,Account,98,Yes,320,No,2026-07-10
2,What is the refund policy?,Refunds & Returns Policy,Billing,95,Yes,410,No,2026-07-10
3,How do I integrate the API with Salesforce?,Salesforce Integration Guide,Integrations,72,Partial,890,Yes,2026-07-11
4,Why is my invoice incorrect?,Billing Discrepancy FAQ,Billing,60,No,1200,Yes,2026-07-11
5,How do I upgrade my subscription plan?,Plan Upgrade Walkthrough,Account,97,Yes,280,No,2026-07-12
6,What are the SSO requirements?,Single Sign-On Setup,Security,88,Yes,540,No,2026-07-12
7,Can I export data as CSV?,Data Export Guide,Features,99,Yes,210,No,2026-07-13
8,Why did my webhook fail?,Webhook Troubleshooting,Integrations,55,No,1450,Yes,2026-07-13
9,How do I add team members?,Team Management Guide,Account,96,Yes,300,No,2026-07-14
10,What is the uptime SLA?,Service Level Agreement,Legal,93,Yes,360,No,2026-07-14
```

### marketing

- [ ] **Step 6: Create frontend/public/samples/marketing/content-marketing-team.csv**

```csv
id,content_title,content_type,channel,author,status,publish_date,target_persona,word_count,engagement_score
1,"The Future of Composable Commerce",Blog Post,Website,Hannah Reyes,Published,2026-06-20,E-commerce Directors,1850,8.4
2,"5 Ways AI Is Changing B2B Sales",LinkedIn Article,LinkedIn,Marcus Lee,Published,2026-06-25,Sales Leaders,900,9.1
3,"Q3 Product Launch Video Script",Video Script,YouTube,Priya Chandra,In Review,2026-07-15,Existing Customers,600,0
4,"Customer Success Story: Nordic Retail",Case Study,Website,Hannah Reyes,Published,2026-07-01,Enterprise Buyers,1200,7.6
5,"Email Nurture Series - Week 3",Email,Email,Diego Alvarez,Scheduled,2026-07-18,Trial Users,450,0
6,"Webinar: Scaling Support with AI",Webinar,Zoom,Marcus Lee,Draft,2026-07-30,IT Decision Makers,0,0
7,"SEO Pillar: Data Privacy Guide",Blog Post,Website,Priya Chandra,Published,2026-06-10,Compliance Officers,3200,6.9
8,"Twitter Thread: Product Launch Teaser",Social Post,X/Twitter,Diego Alvarez,Published,2026-07-12,Prospects,180,9.5
9,"Whitepaper: ROI of Automation",Whitepaper,Website,Hannah Reyes,In Review,2026-07-22,Finance Executives,4500,0
10,"Instagram Reel: Behind the Scenes",Video,Instagram,Marcus Lee,Published,2026-07-05,General Audience,60,8.8
```

- [ ] **Step 7: Create frontend/public/samples/marketing/competitor-analysis-agent.csv**

```csv
id,competitor_name,category,pricing_tier,monthly_price_usd,key_feature,market_share_pct,funding_stage,last_update,threat_level
1,Rivalio,CRM Platform,Enterprise,299,AI lead scoring,18.5,Series D,2026-07-01,High
2,SwiftCRM,CRM Platform,Mid-market,99,Native SMS automation,12.2,Series B,2026-06-28,Medium
3,NexaSuite,CRM Platform,Enterprise,349,Custom workflow builder,22.1,Public,2026-07-05,High
4,LeadPilot,Lead Gen Tool,SMB,49,Chrome extension scraping,6.4,Series A,2026-06-15,Low
5,FlowStack,Marketing Automation,Mid-market,199,Multi-channel journeys,9.8,Series C,2026-07-08,Medium
6,PulseCRM,CRM Platform,SMB,39,Freemium tier,5.1,Bootstrapped,2026-06-20,Low
7,OrbitSales,Sales Enablement,Enterprise,279,Revenue intelligence,14.7,Series D,2026-07-10,High
8,ClearPath Analytics,BI Add-on,Mid-market,149,Predictive forecasting,7.9,Series B,2026-06-30,Medium
9,Vantage CRM,CRM Platform,Enterprise,399,Industry-specific templates,10.3,Public,2026-07-12,High
10,Momentum360,Customer Success,Mid-market,179,Health score automation,8.6,Series C,2026-07-03,Medium
```

- [ ] **Step 8: Create frontend/public/samples/marketing/seo-content-optimizer.csv**

```csv
id,page_url,target_keyword,current_rank,search_volume,keyword_difficulty,word_count,readability_score,backlinks,recommended_action
1,/blog/composable-commerce-guide,composable commerce,4,2400,58,1850,72,34,Add FAQ schema
2,/blog/ai-sales-automation,ai sales automation,12,3600,64,900,68,12,Expand to 1500+ words
3,/case-studies/nordic-retail,retail crm case study,7,590,32,1200,75,8,Add internal links
4,/whitepapers/automation-roi,automation roi calculator,2,1800,45,4500,70,52,Update stats for 2026
5,/blog/data-privacy-compliance,data privacy compliance guide,15,4100,71,3200,66,19,Improve meta description
6,/product/lead-scoring,ai lead scoring software,6,1500,55,1100,73,27,Add comparison table
7,/blog/customer-success-playbook,customer success playbook,9,980,40,2200,77,15,Add video embed
8,/pricing,crm pricing comparison,3,2900,60,850,80,41,Add schema markup
9,/blog/webinar-scaling-support,ai customer support,20,5200,68,600,64,6,Rewrite intro paragraph
10,/integrations/salesforce,salesforce crm integration,5,1300,50,1400,74,22,Add customer quote
```

- [ ] **Step 9: Create frontend/public/samples/marketing/newsletter-intelligence-hub.csv**

```csv
id,newsletter_name,issue_number,send_date,subscriber_count,open_rate_pct,click_rate_pct,top_link_clicked,unsubscribe_rate_pct,topic_theme
1,The Growth Signal,142,2026-07-01,48200,38.2,6.4,Q3 Product Roadmap,0.21,Product Updates
2,The Growth Signal,143,2026-07-08,48450,41.5,7.1,Customer Story: Nordic Retail,0.18,Case Study
3,AI Weekly Digest,88,2026-07-02,31200,45.6,9.8,GPT-5 Enterprise Use Cases,0.15,Industry Trends
4,AI Weekly Digest,89,2026-07-09,31600,43.2,8.5,New Regulation Roundup,0.19,Policy
5,Sales Leaders Brief,55,2026-07-03,19800,36.7,5.9,Negotiation Playbook Download,0.24,Sales Enablement
6,Sales Leaders Brief,56,2026-07-10,20100,39.4,6.7,Pipeline Forecasting Tips,0.20,Sales Enablement
7,The Growth Signal,144,2026-07-15,48900,40.1,6.9,Webinar Replay Link,0.17,Event Recap
8,AI Weekly Digest,90,2026-07-16,32000,44.8,10.2,Agentic AI Explainer,0.14,Education
9,Product Digest Monthly,22,2026-07-05,15400,52.3,12.1,Feature Release Notes,0.11,Product Updates
10,Product Digest Monthly,23,2026-07-14,15600,50.9,11.4,Integration Announcement,0.13,Product Updates
```

- [ ] **Step 10: Create frontend/public/samples/marketing/social-media-manager.csv**

```csv
id,post_id,platform,post_date,content_summary,post_type,impressions,engagement_rate_pct,clicks,status
1,SM-2201,LinkedIn,2026-07-10,"Announcing our Q3 product roadmap",Image Post,42500,6.8,890,Published
2,SM-2202,X/Twitter,2026-07-10,"Thread on AI adoption trends",Thread,18200,9.2,410,Published
3,SM-2203,Instagram,2026-07-11,"Behind-the-scenes office culture reel",Reel,67800,11.4,1230,Published
4,SM-2204,LinkedIn,2026-07-12,"Customer testimonial video",Video,29400,7.5,560,Published
5,SM-2205,Facebook,2026-07-12,"Webinar registration reminder",Link Post,15600,3.9,340,Published
6,SM-2206,X/Twitter,2026-07-13,"Live-tweeting industry conference",Text Post,22100,8.1,280,Published
7,SM-2207,Instagram,2026-07-14,"Product feature carousel",Carousel,38900,10.2,700,Published
8,SM-2208,LinkedIn,2026-07-15,"Hiring announcement - 20 open roles",Image Post,31200,5.4,610,Scheduled
9,SM-2209,TikTok,2026-07-16,"Day in the life of our engineers",Short Video,89500,14.7,1980,Scheduled
10,SM-2210,X/Twitter,2026-07-16,"Poll: What feature do you want next?",Poll,12800,16.3,150,Scheduled
```

### sales

- [ ] **Step 11: Create frontend/public/samples/sales/sales-outreach-specialist.csv**

```csv
id,prospect_name,company,title,email,outreach_stage,last_contact_date,response_status,deal_value_usd,next_action
1,Rebecca Holt,Ferris Manufacturing,VP Operations,r.holt@ferrismfg.com,Initial Outreach,2026-07-05,No Response,45000,Send follow-up #2
2,Anthony Diaz,BrightPath Health,IT Director,a.diaz@brightpathhealth.com,Follow-up 2,2026-07-08,Opened Email,68000,Call scheduled
3,Wendy Zhou,Orion Logistics,COO,w.zhou@orionlogistics.com,Meeting Scheduled,2026-07-10,Replied Positive,120000,Prep demo deck
4,Karl Bennett,Summit Financial,CFO,k.bennett@summitfin.com,Negotiation,2026-06-28,Replied Positive,210000,Send revised proposal
5,Natalie Cruz,GreenLeaf Retail,Marketing Director,n.cruz@greenleafretail.com,Initial Outreach,2026-07-12,No Response,32000,Send follow-up #1
6,Samuel Okonkwo,Pinnacle Insurance,VP Sales,s.okonkwo@pinnacleins.com,Closed Won,2026-06-15,Replied Positive,155000,Kickoff call
7,Michelle Tran,Vector Aerospace,Procurement Lead,m.tran@vectoraero.com,Follow-up 1,2026-07-14,Opened Email,89000,Send case study
8,Ravi Deshmukh,Quantum Retailers,CTO,r.deshmukh@quantumretail.com,Closed Lost,2026-06-20,Replied Negative,0,Archive
9,Julia Fontaine,NorthStar Energy,VP Procurement,j.fontaine@northstarenergy.com,Meeting Scheduled,2026-07-13,Replied Positive,175000,Prep demo deck
10,Owen Marshall,Delta Freight,Operations Manager,o.marshall@deltafreight.com,Initial Outreach,2026-07-16,No Response,54000,Send follow-up #1
```

- [ ] **Step 12: Create frontend/public/samples/sales/crm-data-manager.csv**

```csv
id,contact_name,company,email,lifecycle_stage,owner,last_activity_date,deal_stage,deal_value_usd,data_quality_flag
1,Elena Marquez,Titan Steel Corp,e.marquez@titansteel.com,Customer,Jordan Blake,2026-07-14,Closed Won,95000,Clean
2,Frank Osei,BlueWave Media,f.osei@bluewavemedia.com,Opportunity,Jordan Blake,2026-07-10,Proposal,42000,Missing phone
3,Grace Lindholm,Cedar Point Retail,g.lindholm@cedarpoint.com,Lead,Amara Bello,2026-07-01,N/A,0,Duplicate entry
4,Hassan Malik,Redwood Analytics,h.malik@redwoodanalytics.com,Customer,Amara Bello,2026-07-12,Closed Won,68000,Clean
5,Ingrid Sorensen,Falcon Robotics,i.sorensen@falconrobotics.com,Opportunity,Jordan Blake,2026-07-09,Negotiation,180000,Clean
6,Jerome Baptiste,Coastal Foods Inc,j.baptiste@coastalfoods.com,Lead,Amara Bello,2026-06-30,N/A,0,Missing company field
7,Keiko Yamada,Zenith Pharma,k.yamada@zenithpharma.com,Customer,Jordan Blake,2026-07-08,Closed Won,225000,Clean
8,Liam O'Rourke,Sturdy Builders,l.orourke@sturdybuilders.com,Opportunity,Amara Bello,2026-07-11,Proposal,55000,Outdated title
9,Mariana Cortez,Vista Telecom,m.cortez@vistatelecom.com,Lead,Jordan Blake,2026-07-15,N/A,0,Clean
10,Nikolai Petrenko,Anchor Shipping,n.petrenko@anchorshipping.com,Customer,Amara Bello,2026-07-05,Closed Won,142000,Clean
```

- [ ] **Step 13: Create frontend/public/samples/sales/product-recommendation-agent.csv**

```csv
id,customer_name,segment,browsing_history,recommended_product,recommendation_reason,confidence_score,predicted_conversion_pct,recommended_date,converted
1,Alicia Ferreira,SMB,"CRM Basic,Email Automation",CRM Pro Bundle,Frequent email automation usage,88,42,2026-07-01,Yes
2,Ben Sturgis,Enterprise,"API Access,Custom Reports",Enterprise Analytics Suite,High API call volume,93,55,2026-07-02,Yes
3,Chiara Bianchi,Mid-Market,"Mobile App,Integrations",Integration Hub Add-on,Multiple integration searches,79,35,2026-07-03,No
4,Deshawn Lewis,SMB,"Free Tier,Support Chat",Starter Plan Upgrade,High support engagement,71,28,2026-07-04,No
5,Emma Sorenson,Enterprise,"Security Settings,SSO",SSO + Advanced Security Pack,SSO configuration attempted,95,60,2026-07-05,Yes
6,Farid Amiri,Mid-Market,"Dashboard,Custom Reports",Advanced Reporting Module,Repeated dashboard customization,84,45,2026-07-06,Yes
7,Gabriela Nunez,SMB,"Templates,Automation",Automation Pro Plan,Template library heavy use,76,33,2026-07-07,No
8,Hiroshi Sato,Enterprise,"Multi-user Admin,API",Team Management Suite,Admin panel repeated visits,90,50,2026-07-08,Yes
9,Isabel Duarte,Mid-Market,"Mobile App,Push Notifications",Mobile Pro Add-on,High mobile session frequency,82,40,2026-07-09,No
10,Jamal Whitfield,SMB,"Billing,Invoicing",Invoicing Automation Pack,Manual invoicing pattern detected,73,30,2026-07-10,Yes
```

- [ ] **Step 14: Create frontend/public/samples/sales/lead-scoring-qualification.csv**

```csv
id,lead_name,company,source,lead_score,company_size,industry,budget_confirmed,qualification_status,assigned_rep
1,Trevor Aldana,Meridian Logistics,Webinar,88,500-1000,Logistics,Yes,Qualified,Sarah Kim
2,Bianca Ferreira,PulseTech Health,Content Download,45,50-200,Healthcare,No,Nurture,Sarah Kim
3,Connor Blaise,Ironclad Manufacturing,Trade Show,92,1000-5000,Manufacturing,Yes,Qualified,Devon Marsh
4,Priyanka Shah,Nimbus Cloud Services,Referral,76,200-500,SaaS,Yes,Qualified,Devon Marsh
5,Aleksander Nowak,GreenGrid Energy,Cold Outreach,32,10-50,Energy,No,Disqualified,Sarah Kim
6,Fatima Zahra,Coral Reef Retail,Webinar,68,50-200,Retail,No,Nurture,Devon Marsh
7,Diego Salinas,Vertex Financial,Content Download,81,500-1000,Finance,Yes,Qualified,Sarah Kim
8,Oksana Kravets,Harbor Freight Co,Trade Show,54,200-500,Logistics,No,Nurture,Devon Marsh
9,Ravi Chandran,BrightLine Media,Referral,90,1000-5000,Media,Yes,Qualified,Sarah Kim
10,Charlotte Beaumont,Aster Biotech,Cold Outreach,38,50-200,Biotech,No,Disqualified,Devon Marsh
```

- [ ] **Step 15: Create frontend/public/samples/sales/proposal-quote-generator.csv**

```csv
id,quote_number,client_name,company,product_bundle,quantity,unit_price_usd,discount_pct,total_value_usd,quote_status,expiry_date
1,Q-3301,Rachel Osgood,Beacon Financial,Enterprise CRM Suite,50,120,10,5400,Sent,2026-08-01
2,Q-3302,Tomas Berger,Ironwood Construction,Standard CRM Plan,25,80,5,1900,Accepted,2026-07-25
3,Q-3303,Sana Farooq,Lumen Healthcare,Enterprise CRM Suite + Analytics,100,150,15,12750,Under Review,2026-08-10
4,Q-3304,Miguel Cabrera,Delta Freight Systems,Automation Add-on,30,60,0,1800,Sent,2026-07-30
5,Q-3305,Erin McAllister,Solstice Retail Group,Standard CRM Plan,40,80,8,2944,Accepted,2026-07-22
6,Q-3306,Nikolaus Braun,ForgeWorks Manufacturing,Enterprise CRM Suite,75,120,12,7920,Rejected,2026-07-20
7,Q-3307,Adaeze Nwosu,BrightPath Consulting,Team Starter Plan,15,45,0,675,Sent,2026-08-05
8,Q-3308,Lucas Ferreira,Vantage Logistics,Enterprise CRM Suite + SSO,60,140,10,7560,Accepted,2026-07-28
9,Q-3309,Hana Kobayashi,Zenith Media Group,Automation Add-on,20,60,5,1140,Under Review,2026-08-08
10,Q-3310,Peter Van Dijk,Coastal Energy Partners,Standard CRM Plan,35,80,0,2800,Sent,2026-08-03
```

### legal

- [ ] **Step 16: Create frontend/public/samples/legal/contract-review-assistant.csv**

```csv
id,contract_title,counterparty,contract_type,value_usd,risk_level,flagged_clause,expiration_date,reviewer,status
1,Master Services Agreement - Vendor A,Apex Cloud Solutions,MSA,450000,Medium,Auto-renewal without 90-day notice,2027-03-01,Jennifer Lowe,Under Review
2,NDA - Acquisition Target,Silverline Robotics,NDA,0,Low,Standard mutual confidentiality,2028-01-15,Marcus Delgado,Approved
3,Software License Agreement,DataForge Analytics,License,180000,High,Unlimited liability clause,2026-12-31,Jennifer Lowe,Flagged
4,Employment Contract - Executive,Internal,Employment,0,Medium,Non-compete overly broad (5 years),N/A,Priya Ramesh,Under Review
5,Real Estate Lease - HQ,Harbor Point Properties,Lease,2400000,Low,Standard commercial terms,2031-06-30,Marcus Delgado,Approved
6,Vendor Supply Agreement,Titan Components Ltd,Supply,320000,High,No force majeure clause,2027-09-01,Priya Ramesh,Flagged
7,Consulting Agreement,Bright Horizon Advisors,Consulting,75000,Low,IP assignment standard,2026-11-30,Jennifer Lowe,Approved
8,Joint Venture Agreement,NovaGrid Energy,JV,5200000,High,Ambiguous profit-sharing formula,2029-01-01,Marcus Delgado,Under Review
9,Distribution Agreement,Meridian Trade Partners,Distribution,890000,Medium,Termination notice too short,2027-05-15,Priya Ramesh,Flagged
10,SaaS Subscription Agreement,CloudNest Systems,Subscription,64000,Low,Standard data processing terms,2027-02-28,Jennifer Lowe,Approved
```

- [ ] **Step 17: Create frontend/public/samples/legal/compliance-monitor.csv**

```csv
id,regulation,jurisdiction,category,compliance_status,last_audit_date,risk_score,owner,remediation_deadline,notes
1,GDPR Article 30 Records,EU,Data Privacy,Compliant,2026-06-01,15,Sofia Bergstrom,N/A,Records up to date
2,CCPA Consumer Rights,California-US,Data Privacy,Partial,2026-06-15,55,Derek Munoz,2026-08-01,Opt-out mechanism needs update
3,SOX Section 404,US,Financial Reporting,Compliant,2026-05-20,20,Angela Weiss,N/A,Controls tested quarterly
4,HIPAA Security Rule,US,Healthcare,Non-Compliant,2026-06-10,82,Derek Munoz,2026-07-25,Encryption gap on legacy servers
5,PCI DSS 4.0,Global,Payments,Compliant,2026-06-05,25,Angela Weiss,N/A,Passed Q2 scan
6,EU AI Act - High Risk Systems,EU,AI Governance,Partial,2026-06-20,60,Sofia Bergstrom,2026-09-01,Conformity assessment in progress
7,SEC Cybersecurity Disclosure,US,Financial Reporting,Compliant,2026-06-12,18,Angela Weiss,N/A,Incident reporting tested
8,ISO 27001 Recertification,Global,Information Security,Partial,2026-05-30,48,Derek Munoz,2026-08-15,Access review overdue
9,NY DFS Cybersecurity Reg,New York-US,Financial Services,Compliant,2026-06-08,22,Sofia Bergstrom,N/A,Annual cert filed
10,Anti-Money Laundering (AML),Global,Financial Crime,Non-Compliant,2026-06-18,78,Angela Weiss,2026-07-30,KYC backlog of 200+ cases
```

- [ ] **Step 18: Create frontend/public/samples/legal/nda-workflow-manager.csv**

```csv
id,nda_id,counterparty,nda_type,requested_by,sent_date,signed_date,status,expiration_date,department
1,NDA-5501,Cascade Ventures,Mutual,Tom Reilly,2026-06-20,2026-06-25,Fully Executed,2028-06-25,Business Development
2,NDA-5502,Horizon Data Labs,One-Way (Disclosing),Karen Ibrahim,2026-07-01,N/A,Pending Signature,N/A,Product
3,NDA-5503,Steele Manufacturing,Mutual,Tom Reilly,2026-06-15,2026-06-18,Fully Executed,2028-06-18,Sales
4,NDA-5504,Redwood Consulting Group,One-Way (Receiving),Anita Kapoor,2026-07-05,N/A,Draft,N/A,HR
5,NDA-5505,Blue Harbor Capital,Mutual,Karen Ibrahim,2026-06-28,2026-07-02,Fully Executed,2027-07-02,Finance
6,NDA-5506,Fenwick Robotics,Mutual,Tom Reilly,2026-07-08,N/A,Pending Signature,N/A,Business Development
7,NDA-5507,Nova Analytics Inc,One-Way (Disclosing),Anita Kapoor,2026-06-10,2026-06-14,Fully Executed,2028-06-14,Product
8,NDA-5508,Coastal Insurance Group,Mutual,Karen Ibrahim,2026-07-10,N/A,Draft,N/A,Sales
9,NDA-5509,Pinehurst Logistics,Mutual,Tom Reilly,2026-06-22,2026-06-30,Fully Executed,2027-06-30,Operations
10,NDA-5510,Zenith Pharmaceuticals,One-Way (Receiving),Anita Kapoor,2026-07-12,N/A,Pending Signature,N/A,R&D
```

- [ ] **Step 19: Create frontend/public/samples/legal/policy-document-analyzer.csv**

```csv
id,policy_title,version,department,last_reviewed,compliance_gap,severity,recommended_change,reviewer,status
1,Data Retention Policy,v3.2,IT Security,2026-05-10,No mention of AI-generated data,Medium,Add AI data retention clause,Fiona Marsh,Needs Update
2,Remote Work Policy,v2.0,HR,2026-04-15,Missing international remote work tax guidance,High,Add cross-border remote work section,Gerald Osei,Needs Update
3,Code of Conduct,v4.1,Legal,2026-06-01,None found,Low,None,Fiona Marsh,Approved
4,Vendor Risk Management Policy,v1.5,Procurement,2026-05-20,No AI vendor risk criteria,High,Add AI vendor assessment checklist,Gerald Osei,Needs Update
5,Data Privacy Policy,v5.0,Legal,2026-06-10,Outdated CCPA references,Medium,Update to reflect 2026 CCPA amendments,Fiona Marsh,Needs Update
6,Whistleblower Policy,v2.3,Legal,2026-03-30,None found,Low,None,Gerald Osei,Approved
7,Expense Reimbursement Policy,v3.0,Finance,2026-05-05,Outdated per-diem rates,Low,Update rates for 2026,Fiona Marsh,Needs Update
8,Information Security Policy,v6.2,IT Security,2026-06-15,Missing incident response SLA,High,Define 24-hour breach notification SLA,Gerald Osei,Needs Update
9,Anti-Harassment Policy,v3.1,HR,2026-04-01,None found,Low,None,Fiona Marsh,Approved
10,Third-Party AI Usage Policy,v1.0,Legal,2026-06-20,New policy - needs stakeholder review,Medium,Circulate for department sign-off,Gerald Osei,Draft
```

- [ ] **Step 20: Create frontend/public/samples/legal/ip-trademark-watcher.csv**

```csv
id,mark_name,applicant,jurisdiction,filing_date,class,similarity_score,status,conflict_risk,action_recommended
1,NOVACORE,Nova Technologies Inc,USPTO,2026-06-01,Class 9 (Software),88,Published for Opposition,High,File opposition
2,BRIGHTFLOW,BrightFlow Analytics LLC,USPTO,2026-05-15,Class 42 (SaaS),35,Registered,Low,Monitor only
3,PULSEWORKS,Pulseworks Media,EUIPO,2026-06-10,Class 35 (Advertising),62,Published,Medium,Send cease and desist inquiry
4,ORBITAL AI,Orbital Systems Corp,USPTO,2026-06-20,Class 9 (AI Software),91,Published for Opposition,High,File opposition
5,CLEARPATH,ClearPath Logistics,USPTO,2026-04-28,Class 39 (Transport),20,Registered,Low,Monitor only
6,VERTEX CLOUD,Vertex Cloud Solutions,WIPO,2026-06-05,Class 42 (Cloud Computing),75,Published,Medium,Send cease and desist inquiry
7,SIGNALWAVE,Signalwave Communications,USPTO,2026-05-30,Class 38 (Telecom),28,Registered,Low,Monitor only
8,DATAFORGE PRO,DataForge Pro Inc,USPTO,2026-06-18,Class 9 (Data Software),95,Published for Opposition,High,File opposition
9,GREENLOOP,GreenLoop Recycling,EUIPO,2026-05-01,Class 40 (Waste Treatment),18,Registered,Low,Monitor only
10,NIMBUS AI,Nimbus Intelligence Ltd,USPTO,2026-06-25,Class 9 (AI Software),84,Published,High,File opposition
```

### hr

- [ ] **Step 21: Create frontend/public/samples/hr/ai-recruiter.csv**

```csv
id,name,email,role,department,stage,match_score,applied_date,skills,status
1,Sarah Chen,s.chen@email.com,Senior Frontend Engineer,Engineering,Interview,92,2026-07-01,"React,TypeScript,GraphQL",active
2,David Okonkwo,d.okonkwo@email.com,Backend Engineer,Engineering,Screening,78,2026-07-02,"Python,Django,PostgreSQL",active
3,Marie Lefevre,m.lefevre@email.com,Product Marketing Manager,Marketing,Offer,95,2026-06-28,"GTM Strategy,Positioning",active
4,Ahmed Siddiqui,a.siddiqui@email.com,Data Scientist,Data,Interview,88,2026-07-03,"Python,ML,SQL",active
5,Kayla Robinson,k.robinson@email.com,UX Designer,Design,Screening,71,2026-07-04,"Figma,User Research",active
6,Tobias Lindgren,t.lindgren@email.com,DevOps Engineer,Engineering,Rejected,55,2026-06-25,"Kubernetes,Terraform",closed
7,Amara Nwosu,a.nwosu@email.com,Sales Development Rep,Sales,Interview,80,2026-07-05,"Outbound Prospecting,CRM",active
8,Felix Grunwald,f.grunwald@email.com,Engineering Manager,Engineering,Offer,97,2026-06-30,"Team Leadership,System Design",active
9,Priyanka Iyer,p.iyer@email.com,HR Business Partner,HR,Screening,74,2026-07-06,"Org Design,Employee Relations",active
10,Connor Blaise,c.blaise@email.com,Financial Analyst,Finance,Interview,83,2026-07-07,"Excel,Financial Modeling",active
```

- [ ] **Step 22: Create frontend/public/samples/hr/employee-onboarding-buddy.csv**

```csv
id,employee_name,start_date,department,manager,onboarding_stage,percent_complete,buddy_assigned,laptop_provisioned,first_week_check_in
1,Nathan Wills,2026-07-06,Engineering,Felix Grunwald,Week 2,60,Sarah Chen,Yes,Completed
2,Isabela Rocha,2026-07-13,Marketing,Marie Lefevre,Week 1,25,David Okonkwo,Yes,Scheduled
3,Owen Kavanagh,2026-06-29,Sales,Amara Nwosu,Week 3,85,Kayla Robinson,Yes,Completed
4,Yasmin Haddad,2026-07-13,Data,Ahmed Siddiqui,Week 1,20,Tobias Lindgren,No,Scheduled
5,Marcus Thibodeaux,2026-06-22,Finance,Connor Blaise,Week 4,100,Priyanka Iyer,Yes,Completed
6,Chiara Esposito,2026-07-06,Design,Kayla Robinson,Week 2,55,Nathan Wills,Yes,Completed
7,Femi Adebayo,2026-07-13,Engineering,Felix Grunwald,Week 1,30,Isabela Rocha,Yes,Scheduled
8,Greta Lindqvist,2026-06-29,HR,Priyanka Iyer,Week 3,90,Owen Kavanagh,Yes,Completed
9,Diego Nunes,2026-07-13,Product,Marie Lefevre,Week 1,15,Yasmin Haddad,No,Scheduled
10,Aaliyah Foster,2026-07-06,Support,Amara Nwosu,Week 2,65,Marcus Thibodeaux,Yes,Completed
```

- [ ] **Step 23: Create frontend/public/samples/hr/resume-parser-standardizer.csv**

```csv
id,candidate_name,source_file,years_experience,top_skills,education,previous_company,standardized_title,parse_confidence,flagged_for_review
1,Julian Marsh,julian_marsh_resume.pdf,6,"Java,Spring Boot,AWS",BS Computer Science,Fintech Solutions Inc,Senior Backend Engineer,96,No
2,Renata Alves,renata_alves_cv.docx,3,"SEO,Content Strategy,Analytics",MA Marketing,BrightWave Media,Marketing Specialist,91,No
3,Kwame Asante,kwame_asante_resume.pdf,9,"Product Strategy,Roadmapping,Agile",MBA,Nimbus Cloud Corp,Senior Product Manager,94,No
4,Petra Svobodova,petra_s_cv.pdf,2,"Figma,Sketch,User Testing",BFA Design,Freelance,UX Designer,82,Yes
5,Marcos Villalobos,marcos_v_resume.pdf,12,"Financial Modeling,M&A,Valuation",MBA Finance,Sterling Capital Partners,Finance Director,97,No
6,Ingrid Haugen,ingrid_h_resume.docx,5,"Python,Data Pipelines,Airflow",MS Data Science,Vector Analytics,Data Engineer,93,No
7,Samuel Ortega,samuel_ortega_cv.pdf,1,"Sales Outreach,Cold Calling",BA Business,Recent Graduate,Sales Development Rep,68,Yes
8,Yuna Park,yuna_park_resume.pdf,7,"Kubernetes,Terraform,CI/CD",BS Computer Engineering,CloudForge Systems,DevOps Engineer,95,No
9,Beatrice Nardone,beatrice_n_cv.pdf,4,"Employee Relations,HRIS,Compliance",BA Human Resources,Meridian Group,HR Generalist,89,No
10,Tunde Bakare,tunde_bakare_resume.docx,15,"Executive Leadership,P&L Management",MBA,Continental Holdings,VP Operations,98,No
```

- [ ] **Step 24: Create frontend/public/samples/hr/employee-engagement-pulse.csv**

```csv
id,employee_id,department,survey_date,engagement_score,enps_score,workload_rating,manager_support_rating,flight_risk,comment_theme
1,E-1042,Engineering,2026-07-01,7.8,42,6.5,8.2,Low,Positive on team culture
2,E-1088,Sales,2026-07-01,6.2,15,7.9,6.0,Medium,Concerns about quota pressure
3,E-1113,Marketing,2026-07-01,8.4,55,5.8,9.1,Low,Values creative freedom
4,E-1067,Support,2026-07-01,5.5,-10,8.5,5.2,High,Burnout from ticket volume
5,E-1199,Finance,2026-07-01,7.1,30,6.0,7.5,Low,Wants clearer career path
6,E-1204,Engineering,2026-07-01,8.0,48,5.5,8.0,Low,Positive on remote flexibility
7,E-1156,HR,2026-07-01,7.6,38,6.2,8.6,Low,Appreciates leadership transparency
8,E-1231,Data,2026-07-01,6.8,20,7.2,6.8,Medium,Wants more mentorship
9,E-1078,Sales,2026-07-01,5.9,5,8.1,5.5,High,Compensation concerns
10,E-1145,Design,2026-07-01,8.6,60,5.0,9.0,Low,Loves current project scope
```

- [ ] **Step 25: Create frontend/public/samples/hr/performance-review-assistant.csv**

```csv
id,employee_name,department,review_period,manager,overall_rating,goal_completion_pct,strengths,growth_area,promotion_ready
1,Hannah Ostrowski,Engineering,H1 2026,Felix Grunwald,4.5,92,"Technical depth,Mentoring juniors",Public speaking,Yes
2,Marco Bellini,Sales,H1 2026,Amara Nwosu,3.8,78,"Client relationships",Pipeline forecasting accuracy,No
3,Aditi Krishnan,Product,H1 2026,Marie Lefevre,4.2,85,"Stakeholder communication",Prioritization under pressure,No
4,Liam Fitzgerald,Data,H1 2026,Ahmed Siddiqui,4.7,95,"Model accuracy,Documentation",Cross-team collaboration,Yes
5,Sofia Karlsson,Design,H1 2026,Kayla Robinson,3.9,80,"Visual craft",Design systems thinking,No
6,Emeka Chukwu,Engineering,H1 2026,Felix Grunwald,3.5,70,"Debugging speed",Code review thoroughness,No
7,Valeria Torres,Marketing,H1 2026,Marie Lefevre,4.4,88,"Campaign creativity",Data-driven decision making,Yes
8,Ravi Subramanian,Finance,H1 2026,Connor Blaise,4.0,82,"Attention to detail",Presenting to executives,No
9,Chloe Bergeron,Support,H1 2026,Amara Nwosu,3.6,74,"Customer empathy",Technical troubleshooting depth,No
10,Damian Wozniak,Engineering,H1 2026,Felix Grunwald,4.8,97,"System design,Ownership",Delegation,Yes
```

### support

- [ ] **Step 26: Create frontend/public/samples/support/omni-channel-support.csv**

```csv
id,ticket_id,customer_name,channel,issue_category,priority,assigned_agent,status,response_time_min,csat_score
1,T-8801,Melissa Grant,Email,Billing,Medium,Oscar Reyes,Resolved,45,5
2,T-8802,Anonymous,Chat,Login Issue,High,Priya Nair,Resolved,8,4
3,T-8803,Dominic Wray,Phone,Feature Request,Low,Oscar Reyes,Open,120,0
4,T-8804,Carmen Silva,Twitter,Bug Report,High,Priya Nair,In Progress,15,0
5,T-8805,Thabo Mokoena,Email,Account Access,Medium,Oscar Reyes,Resolved,60,4
6,T-8806,Whitney Park,Chat,Billing,High,Priya Nair,Escalated,5,2
7,T-8807,Aiden Fitzgerald,WhatsApp,Shipping Delay,Medium,Oscar Reyes,Resolved,30,4
8,T-8808,Anonymous,Phone,Bug Report,Critical,Priya Nair,In Progress,3,0
9,T-8809,Larissa Novaes,Email,Feature Request,Low,Oscar Reyes,Resolved,90,5
10,T-8810,Kofi Boateng,Chat,Login Issue,High,Priya Nair,Resolved,10,5
```

- [ ] **Step 27: Create frontend/public/samples/support/user-onboarding-guide.csv**

```csv
id,user_name,signup_date,onboarding_step,step_status,time_spent_min,drop_off_risk,plan_type,last_active_date
1,Brianna Cole,2026-07-01,Account Setup,Completed,4,Low,Free Trial,2026-07-14
2,Rohan Malhotra,2026-07-02,Connect Integration,Stuck,15,High,Free Trial,2026-07-03
3,Sienna Marsh,2026-07-03,Invite Team,Completed,6,Low,Pro,2026-07-15
4,Bruno Castellano,2026-07-04,Import Data,In Progress,20,Medium,Free Trial,2026-07-10
5,Nadia Rahman,2026-07-05,First Project Created,Completed,10,Low,Pro,2026-07-16
6,Ethan Marchetti,2026-07-06,Account Setup,Completed,3,Low,Free Trial,2026-07-07
7,Zara Hussain,2026-07-07,Connect Integration,Completed,12,Low,Pro,2026-07-15
8,Cormac Doyle,2026-07-08,Import Data,Stuck,25,High,Free Trial,2026-07-09
9,Ines Beltran,2026-07-09,Invite Team,In Progress,8,Medium,Free Trial,2026-07-13
10,Takumi Ito,2026-07-10,First Project Created,Completed,9,Low,Pro,2026-07-16
```

- [ ] **Step 28: Create frontend/public/samples/support/voice-customer-support.csv**

```csv
id,call_id,customer_name,call_time,duration_sec,issue_type,ai_handled,transferred_to_human,resolution_status,sentiment_score
1,V-4401,Harriet Solano,2026-07-15 08:12:00,180,Password Reset,Yes,No,Resolved,0.85
2,V-4402,Anonymous,2026-07-15 08:30:00,420,Billing Dispute,Partial,Yes,Escalated,0.35
3,V-4403,Theo Bergstrom,2026-07-15 09:05:00,95,Order Status,Yes,No,Resolved,0.90
4,V-4404,Priscilla Duarte,2026-07-15 09:22:00,260,Technical Issue,Partial,Yes,Resolved,0.60
5,V-4405,Emeka Nwachukwu,2026-07-15 09:45:00,140,Cancellation Request,Yes,No,Resolved,0.55
6,V-4406,Anonymous,2026-07-15 10:10:00,510,Fraud Report,No,Yes,Escalated,0.20
7,V-4407,Wren Kowalski,2026-07-15 10:35:00,110,Account Update,Yes,No,Resolved,0.88
8,V-4408,Salma Idrissi,2026-07-15 11:00:00,300,Refund Request,Partial,Yes,Resolved,0.65
9,V-4409,Julius Okafor,2026-07-15 11:20:00,75,Order Status,Yes,No,Resolved,0.92
10,V-4410,Anonymous,2026-07-15 11:45:00,200,Technical Issue,Yes,No,Resolved,0.78
```

- [ ] **Step 29: Create frontend/public/samples/support/ticket-triage-routing.csv**

```csv
id,ticket_id,subject,customer_tier,category,severity,auto_assigned_team,sla_deadline,routing_confidence,status
1,TR-9001,"Cannot access dashboard after update",Enterprise,Technical,Critical,Platform Engineering,2026-07-16 14:00,96,Routed
2,TR-9002,"Invoice shows duplicate charge",Pro,Billing,High,Billing Ops,2026-07-17 09:00,92,Routed
3,TR-9003,"Feature suggestion: dark mode",Free,Feature Request,Low,Product Team,2026-07-25 17:00,88,Routed
4,TR-9004,"API returning 500 errors intermittently",Enterprise,Technical,Critical,Platform Engineering,2026-07-16 12:00,94,Routed
5,TR-9005,"Question about data export format",Pro,General Inquiry,Medium,Support Tier 1,2026-07-18 12:00,80,Routed
6,TR-9006,"Security vulnerability disclosure",Enterprise,Security,Critical,Security Team,2026-07-16 10:00,98,Routed
7,TR-9007,"Unable to reset password",Free,Account,Medium,Support Tier 1,2026-07-17 15:00,90,Routed
8,TR-9008,"Contract renewal terms question",Enterprise,Billing,Medium,Account Management,2026-07-19 12:00,85,Routed
9,TR-9009,"App crashes on iOS 19",Pro,Technical,High,Mobile Engineering,2026-07-17 09:00,91,Routed
10,TR-9010,"Request for additional user seats",Pro,Account,Low,Support Tier 1,2026-07-20 17:00,87,Routed
```

- [ ] **Step 30: Create frontend/public/samples/support/self-serve-faq-builder.csv**

```csv
id,faq_question,category,view_count,helpful_votes,unhelpful_votes,last_updated,source_ticket_count,auto_generated
1,How do I change my billing cycle?,Billing,4820,410,25,2026-06-20,38,Yes
2,What browsers are supported?,Technical,3100,290,10,2026-06-15,12,Yes
3,How do I export my data as CSV?,Features,5600,520,15,2026-06-25,45,Yes
4,Why was my account suspended?,Account,2900,180,60,2026-06-10,52,No
5,How do I add team members?,Account,4100,380,20,2026-06-22,29,Yes
6,What is the API rate limit?,Technical,2200,195,8,2026-06-18,18,Yes
7,Can I downgrade my plan mid-cycle?,Billing,3400,250,40,2026-06-12,33,No
8,How do I enable two-factor authentication?,Security,3900,360,12,2026-06-28,21,Yes
9,Why is my dashboard loading slowly?,Technical,2700,140,70,2026-06-08,47,No
10,How do I cancel my subscription?,Billing,6100,410,90,2026-06-30,61,No
```

### productivity

- [ ] **Step 31: Create frontend/public/samples/productivity/executive-meeting-assistant.csv**

```csv
id,meeting_title,date,attendees,duration_min,key_decision,action_item,owner,due_date,follow_up_status
1,Q3 Strategy Review,2026-07-10,"CEO,CFO,VP Product",90,Approve Q3 budget increase,Finalize hiring plan,Angela Ruiz,2026-07-20,In Progress
2,Product Roadmap Sync,2026-07-11,"VP Product,Eng Leads",60,Delay feature X to Q4,Update roadmap doc,Devon Park,2026-07-15,Completed
3,Board Prep Meeting,2026-07-12,"CEO,CFO,General Counsel",120,Finalize board deck narrative,Send deck for review,Marcus Webb,2026-07-14,Completed
4,Sales Pipeline Review,2026-07-13,"VP Sales,CRO",45,Reallocate reps to enterprise segment,Draft territory plan,Nina Petrov,2026-07-18,In Progress
5,M&A Diligence Check-in,2026-07-14,"CEO,CFO,External Counsel",75,Proceed to next diligence phase,Schedule data room access,Angela Ruiz,2026-07-17,Not Started
6,Crisis Comms Briefing,2026-07-14,"CEO,Head of Comms,Legal",30,Approve public statement draft,Publish statement,Marcus Webb,2026-07-15,Completed
7,All-Hands Prep,2026-07-15,"CEO,HR Head,Comms",40,Confirm agenda for all-hands,Send calendar invite,Devon Park,2026-07-16,Completed
8,Vendor Contract Negotiation Review,2026-07-15,"CFO,Procurement Lead",50,Push back on 3-year lock-in,Draft counter-proposal,Nina Petrov,2026-07-22,In Progress
9,Annual Planning Kickoff,2026-07-16,"CEO,CFO,VP Product,VP Sales",100,Set FY27 planning timeline,Distribute planning template,Angela Ruiz,2026-07-25,Not Started
10,Investor Update Call,2026-07-16,"CEO,CFO,IR Lead",60,Finalize Q2 investor letter,Send letter to investors,Marcus Webb,2026-07-19,In Progress
```

- [ ] **Step 32: Create frontend/public/samples/productivity/email-triage-drafter.csv**

```csv
id,email_id,sender,subject,received_date,category,priority,ai_draft_status,sentiment,action_required
1,EM-6601,client@ferrismfg.com,"Question on invoice #4521",2026-07-15 08:20,Billing,Medium,Draft Ready,Neutral,Reply with clarification
2,EM-6602,partner@brightwave.com,"Partnership renewal terms",2026-07-15 09:05,Partnership,High,Draft Ready,Positive,Schedule call
3,EM-6603,angry.customer@example.com,"Extremely disappointed with service",2026-07-15 09:30,Complaint,Critical,Needs Human Review,Negative,Escalate to manager
4,EM-6604,vendor@titansteel.com,"Updated pricing sheet attached",2026-07-15 10:00,Vendor,Low,Draft Ready,Neutral,File for reference
5,EM-6605,recruiter@example.com,"Candidate interview availability",2026-07-15 10:15,Scheduling,Medium,Draft Ready,Neutral,Confirm time slot
6,EM-6606,press@techdaily.com,"Interview request for CEO",2026-07-15 10:40,Media,High,Needs Human Review,Positive,Forward to comms team
7,EM-6607,support@internaltool.com,"Scheduled maintenance notice",2026-07-15 11:00,Notification,Low,Archived,Neutral,None
8,EM-6608,legal@counterparty.com,"Redlined contract attached",2026-07-15 11:20,Legal,High,Needs Human Review,Neutral,Forward to legal team
9,EM-6609,newsletter@industry.com,"Weekly industry digest",2026-07-15 11:45,Newsletter,Low,Archived,Neutral,None
10,EM-6610,investor@venturefund.com,"Follow-up on Q2 metrics",2026-07-15 12:10,Investor Relations,High,Draft Ready,Positive,Reply with metrics deck
```

- [ ] **Step 33: Create frontend/public/samples/productivity/team-calendar-coordinator.csv**

```csv
id,event_title,team,requested_by,proposed_date,proposed_time,duration_min,attendee_count,conflict_detected,status
1,Sprint Planning,Engineering,Felix Grunwald,2026-07-20,09:00,60,8,No,Confirmed
2,Design Critique,Design,Kayla Robinson,2026-07-20,11:00,45,5,Yes,Rescheduling
3,All-Hands Meeting,Company-wide,Angela Ruiz,2026-07-22,10:00,60,150,No,Confirmed
4,Sales Pipeline Review,Sales,Amara Nwosu,2026-07-21,14:00,30,6,No,Confirmed
5,1:1 - Manager Sync,Engineering,Felix Grunwald,2026-07-20,15:00,30,2,Yes,Rescheduling
6,Product Roadmap Review,Product,Marie Lefevre,2026-07-23,13:00,90,10,No,Confirmed
7,Onboarding Orientation,HR,Priyanka Iyer,2026-07-24,09:30,120,4,No,Confirmed
8,Budget Review Meeting,Finance,Connor Blaise,2026-07-21,11:00,60,5,Yes,Rescheduling
9,Customer Advisory Board Call,Customer Success,Oscar Reyes,2026-07-25,16:00,60,12,No,Confirmed
10,Engineering All-Hands,Engineering,Felix Grunwald,2026-07-26,10:00,45,45,No,Confirmed
```

- [ ] **Step 34: Create frontend/public/samples/productivity/morning-briefing-agent.csv**

```csv
id,briefing_date,category,headline,priority,source,action_needed,time_sensitive,summary_length_words
1,2026-07-16,Calendar,"3 meetings scheduled today, 1 conflict at 2pm",High,Calendar Sync,Resolve 2pm conflict,Yes,25
2,2026-07-16,Email,"12 unread emails, 2 flagged urgent",Medium,Inbox Scan,Review flagged emails,Yes,20
3,2026-07-16,News,"Fed announces rate hold, markets steady",Low,Financial News Feed,None,No,40
4,2026-07-16,Weather,"Sunny, 78F, no travel delays expected",Low,Weather API,None,No,15
5,2026-07-16,Tasks,"5 overdue tasks in project tracker",High,Task Manager,Reassign or close overdue tasks,Yes,22
6,2026-07-16,Industry News,"Competitor launches new AI feature",Medium,Industry News Feed,Review competitive brief,No,35
7,2026-07-16,Team Updates,"2 team members out sick today",Medium,HR System,Redistribute workload,Yes,18
8,2026-07-16,Metrics,"Daily active users up 4% overnight",Low,Analytics Dashboard,None,No,20
9,2026-07-16,Reminders,"Board deck due end of day",High,Task Manager,Finalize board deck,Yes,15
10,2026-07-16,Travel,"Flight to NYC tomorrow at 7am confirmed",Medium,Travel System,Pack and confirm car service,No,20
```

- [ ] **Step 35: Create frontend/public/samples/productivity/notion-workspace-automator.csv**

```csv
id,page_title,workspace_area,automation_type,trigger_event,last_run_date,run_status,records_updated,linked_database,owner
1,Weekly Task Digest,Project Tracker,Auto-summary,Every Monday 8am,2026-07-13,Success,42,Tasks DB,Devon Park
2,New Hire Checklist,HR Onboarding,Template duplication,New employee added,2026-07-13,Success,1,Employees DB,Priyanka Iyer
3,Sprint Retro Notes,Engineering,Auto-populate from Jira,Sprint closed,2026-07-14,Success,18,Sprints DB,Felix Grunwald
4,Content Calendar Sync,Marketing,Cross-database sync,Content status change,2026-07-15,Failed,0,Content DB,Marie Lefevre
5,Expense Report Rollup,Finance,Auto-summary,End of month,2026-06-30,Success,64,Expenses DB,Connor Blaise
6,Meeting Notes Archive,Executive,Auto-tagging,Meeting note created,2026-07-15,Success,9,Meetings DB,Angela Ruiz
7,Bug Triage Board Refresh,Engineering,Status auto-update,GitHub issue closed,2026-07-16,Success,27,Bugs DB,Felix Grunwald
8,Customer Feedback Tagger,Product,AI categorization,New feedback submitted,2026-07-16,Success,15,Feedback DB,Marie Lefevre
9,OKR Progress Tracker,Company-wide,Auto-calculation,Weekly cron,2026-07-13,Success,36,OKR DB,Angela Ruiz
10,Vendor Contract Reminders,Legal,Deadline alerting,90 days before expiry,2026-07-14,Success,6,Contracts DB,Jennifer Lowe
```

### development

- [ ] **Step 36: Create frontend/public/samples/development/automated-code-reviewer.csv**

```csv
id,pr_number,repo,author,files_changed,lines_added,lines_removed,issue_type,severity,ai_comment,review_status
1,PR-2201,payments-service,Liu Chen,4,120,15,Missing null check,Medium,"Add null check before accessing user.email",Requested Changes
2,PR-2202,frontend-app,Rosa Delgado,8,340,90,Unused import,Low,"Remove unused lodash import",Approved with comments
3,PR-2203,auth-service,Kwesi Amoah,2,60,10,Hardcoded secret,Critical,"API key appears hardcoded - move to env var",Blocked
4,PR-2204,data-pipeline,Wei Zhang,6,210,45,N+1 query,High,"Loop triggers N+1 DB query - use batch fetch",Requested Changes
5,PR-2205,notification-service,Priya Rao,3,85,20,Missing test coverage,Medium,"New function lacks unit tests",Requested Changes
6,PR-2206,frontend-app,Tobias Kern,5,150,30,Accessibility issue,Medium,"Button missing aria-label",Requested Changes
7,PR-2207,payments-service,Liu Chen,1,25,5,None found,None,"Clean, well-tested change",Approved
8,PR-2208,auth-service,Kwesi Amoah,7,280,60,SQL injection risk,Critical,"Use parameterized query instead of string concat",Blocked
9,PR-2209,data-pipeline,Wei Zhang,3,95,12,Deprecated API usage,Low,"pandas.append() deprecated, use pd.concat()",Approved with comments
10,PR-2210,notification-service,Priya Rao,4,110,25,None found,None,"Good test coverage and documentation",Approved
```

- [ ] **Step 37: Create frontend/public/samples/development/documentation-generator.csv**

```csv
id,module_name,repo,doc_type,coverage_pct,last_generated,functions_documented,functions_total,outdated_sections,status
1,auth/token_manager.py,auth-service,Docstring,88,2026-07-14,22,25,1,Needs Update
2,payments/stripe_client.py,payments-service,API Reference,95,2026-07-15,40,42,0,Up to Date
3,frontend/components/Dashboard.tsx,frontend-app,Component Doc,70,2026-07-10,14,20,3,Needs Update
4,data/etl_pipeline.py,data-pipeline,Docstring,60,2026-07-08,18,30,5,Needs Update
5,notifications/email_sender.py,notification-service,API Reference,100,2026-07-16,15,15,0,Up to Date
6,auth/oauth_flow.py,auth-service,Sequence Diagram,80,2026-07-12,10,12,1,Up to Date
7,frontend/hooks/useAuth.ts,frontend-app,Component Doc,90,2026-07-13,9,10,0,Up to Date
8,payments/refund_handler.py,payments-service,Docstring,55,2026-07-05,8,15,4,Needs Update
9,data/schema_validator.py,data-pipeline,API Reference,75,2026-07-11,12,16,2,Needs Update
10,notifications/sms_gateway.py,notification-service,Docstring,92,2026-07-14,11,12,0,Up to Date
```

- [ ] **Step 38: Create frontend/public/samples/development/api-documentation-assistant.csv**

```csv
id,endpoint,method,repo,version,description_status,example_status,auth_required,deprecated,last_reviewed
1,/api/v2/users,GET,auth-service,v2.1,Complete,Complete,Yes,No,2026-07-14
2,/api/v2/payments/charge,POST,payments-service,v2.1,Complete,Missing Example,Yes,No,2026-07-12
3,/api/v1/users,GET,auth-service,v1.0,Complete,Complete,Yes,Yes,2026-06-01
4,/api/v2/notifications/send,POST,notification-service,v2.0,Incomplete,Missing Example,Yes,No,2026-07-10
5,/api/v2/data/export,GET,data-pipeline,v2.0,Complete,Complete,Yes,No,2026-07-15
6,/api/v2/payments/refund,POST,payments-service,v2.1,Complete,Complete,Yes,No,2026-07-13
7,/api/v2/auth/token,POST,auth-service,v2.1,Complete,Complete,No,No,2026-07-14
8,/api/v1/notifications/send,POST,notification-service,v1.2,Incomplete,Missing Example,Yes,Yes,2026-05-20
9,/api/v2/data/schema,GET,data-pipeline,v2.0,Complete,Missing Example,Yes,No,2026-07-11
10,/api/v2/users/preferences,PATCH,auth-service,v2.1,Incomplete,Missing Example,Yes,No,2026-07-09
```

- [ ] **Step 39: Create frontend/public/samples/development/bug-triage-agent.csv**

```csv
id,bug_id,title,repo,severity,reporter,ai_classification,duplicate_of,assigned_team,status
1,BUG-3301,"Checkout button unresponsive on Safari",frontend-app,High,Customer Support,UI Bug,None,Frontend Team,Triaged
2,BUG-3302,"Payment webhook timing out intermittently",payments-service,Critical,Monitoring Alert,Infrastructure,None,Platform Team,In Progress
3,BUG-3303,"Duplicate charge appears on invoice",payments-service,Critical,Customer Support,Data Integrity,None,Payments Team,Triaged
4,BUG-3304,"Login button unresponsive on Safari",frontend-app,High,Customer Support,UI Bug,BUG-3301,Frontend Team,Marked Duplicate
5,BUG-3305,"Email notifications delayed by 10+ minutes",notification-service,Medium,Internal QA,Performance,None,Notifications Team,Triaged
6,BUG-3306,"Data export produces malformed CSV",data-pipeline,Medium,Customer Support,Data Formatting,None,Data Team,In Progress
7,BUG-3307,"Password reset email not sending",auth-service,High,Customer Support,Infrastructure,None,Auth Team,Triaged
8,BUG-3308,"Dashboard chart fails to render on mobile",frontend-app,Low,Internal QA,UI Bug,None,Frontend Team,Triaged
9,BUG-3309,"Refund process fails for partial refunds",payments-service,High,Customer Support,Logic Error,None,Payments Team,In Progress
10,BUG-3310,"API rate limit incorrectly enforced",auth-service,Medium,Internal QA,Logic Error,None,Auth Team,Triaged
```

- [ ] **Step 40: Create frontend/public/samples/development/release-notes-generator.csv**

```csv
id,version,release_date,change_type,component,description,pr_reference,customer_facing,author
1,v4.12.0,2026-07-16,Feature,Payments,"Added support for Apple Pay checkout",PR-2201,Yes,Liu Chen
2,v4.12.0,2026-07-16,Fix,Auth,"Fixed token refresh race condition",PR-2203,No,Kwesi Amoah
3,v4.12.0,2026-07-16,Improvement,Dashboard,"Faster chart rendering for large datasets",PR-2204,Yes,Wei Zhang
4,v4.11.2,2026-07-09,Fix,Notifications,"Fixed duplicate email notifications",PR-2205,Yes,Priya Rao
5,v4.11.2,2026-07-09,Security,Auth,"Patched dependency with known CVE",PR-2208,No,Kwesi Amoah
6,v4.11.1,2026-07-02,Fix,Frontend,"Fixed layout shift on mobile checkout",PR-2206,Yes,Tobias Kern
7,v4.11.0,2026-06-25,Feature,Data Pipeline,"Added scheduled export to S3",PR-2209,Yes,Wei Zhang
8,v4.11.0,2026-06-25,Improvement,API,"Reduced average API latency by 18%",PR-2207,No,Liu Chen
9,v4.10.3,2026-06-18,Fix,Payments,"Fixed refund calculation rounding error",PR-2210,Yes,Priya Rao
10,v4.10.2,2026-06-11,Deprecation,Auth,"Deprecated v1 authentication endpoints",PR-2202,Yes,Kwesi Amoah
```

### analysts

- [ ] **Step 41: Create frontend/public/samples/analysts/vendor-comparison-scorecard.csv**

```csv
id,vendor_name,category,pricing_score,feature_score,support_score,security_score,total_score,recommendation,contract_value_usd
1,Apex Cloud Solutions,Cloud Infrastructure,7.5,9.0,8.0,9.2,8.4,Recommended,450000
2,DataForge Analytics,Analytics Platform,6.8,8.5,7.2,8.0,7.6,Recommended,180000
3,Silverline Robotics,Automation Tools,8.2,7.0,6.5,7.8,7.4,Consider Alternatives,220000
4,Titan Components Ltd,Hardware Supply,7.0,6.5,7.8,8.5,7.5,Recommended,320000
5,Bright Horizon Advisors,Consulting Services,6.0,8.8,9.0,7.5,7.8,Recommended,75000
6,NovaGrid Energy Systems,Energy Solutions,5.5,7.5,6.8,8.0,6.9,Consider Alternatives,5200000
7,Meridian Trade Partners,Distribution,7.8,7.2,7.0,7.0,7.3,Recommended,890000
8,CloudNest Systems,SaaS Subscription,8.5,8.0,8.5,9.0,8.5,Recommended,64000
9,Ironclad Manufacturing Supply,Manufacturing,6.5,6.0,5.8,7.2,6.4,Not Recommended,1500000
10,Vertex Cloud Solutions,Cloud Infrastructure,7.2,8.8,7.5,8.8,8.1,Recommended,380000
```

- [ ] **Step 42: Create frontend/public/samples/analysts/market-sizing-calculator.csv**

```csv
id,segment,region,tam_usd_millions,sam_usd_millions,som_usd_millions,growth_rate_pct,year,confidence_level,data_source
1,Enterprise AI Software,North America,48000,12000,600,28.5,2026,High,Gartner
2,Enterprise AI Software,Europe,31000,8500,320,24.2,2026,High,IDC
3,Cloud Security Solutions,North America,22000,6800,410,19.8,2026,Medium,Forrester
4,Cloud Security Solutions,Asia-Pacific,18500,4200,180,31.4,2026,Medium,IDC
5,Fintech Payments,Global,95000,21000,850,22.1,2026,High,McKinsey
6,Healthcare AI Diagnostics,North America,15200,3900,210,35.6,2026,Medium,Gartner
7,Supply Chain Analytics,Global,27000,7100,290,18.9,2026,Medium,Forrester
8,Customer Data Platforms,North America,9800,2600,140,26.7,2026,High,IDC
9,Low-Code Development Platforms,Global,42000,9500,480,25.3,2026,High,Gartner
10,Cybersecurity Mesh Architecture,Global,19700,5300,225,29.8,2026,Medium,McKinsey
```

- [ ] **Step 43: Create frontend/public/samples/analysts/technology-hype-cycle-builder.csv**

```csv
id,technology_name,category,hype_stage,years_to_mainstream,current_year_mentions,previous_year_mentions,momentum_trend,analyst_confidence,source
1,Agentic AI Systems,AI,Peak of Inflated Expectations,2,18400,6200,Rising,High,Gartner
2,Quantum Machine Learning,AI,Innovation Trigger,8,890,320,Rising,Medium,IDC
3,Composable Commerce,E-commerce,Slope of Enlightenment,1,4200,4800,Stable,High,Forrester
4,Digital Twins,IoT,Trough of Disillusionment,3,3100,5400,Falling,Medium,Gartner
5,Web3 Identity,Blockchain,Trough of Disillusionment,5,1200,2900,Falling,Low,Gartner
6,Synthetic Data Generation,AI,Peak of Inflated Expectations,2,7800,3100,Rising,High,IDC
7,Neuromorphic Computing,Hardware,Innovation Trigger,10,420,180,Rising,Low,McKinsey
8,Edge AI Inference,AI,Slope of Enlightenment,1,9600,8200,Stable,High,Forrester
9,Autonomous Robotic Process Automation,Automation,Plateau of Productivity,0,12500,11800,Stable,High,Gartner
10,Post-Quantum Cryptography,Security,Innovation Trigger,6,1650,540,Rising,Medium,IDC
```

- [ ] **Step 44: Create frontend/public/samples/analysts/comparable-company-analyzer.csv**

```csv
id,company_name,ticker,sector,market_cap_usd_millions,ev_ebitda,pe_ratio,revenue_growth_pct,gross_margin_pct,comparable_to
1,NexaSuite Inc,NXSA,Enterprise Software,18500,14.2,32.5,22.4,78.5,Target Co
2,Vantage CRM Holdings,VNTG,Enterprise Software,12800,12.8,28.0,19.1,74.2,Target Co
3,OrbitSales Corp,ORBT,Sales Technology,9400,15.5,35.8,26.7,80.1,Target Co
4,FlowStack Technologies,FLWS,Marketing Automation,6200,11.4,24.2,15.8,71.5,Target Co
5,Momentum360 Inc,MOM3,Customer Success SaaS,4800,13.9,30.1,20.5,76.8,Target Co
6,ClearPath Analytics Group,CLRP,Business Intelligence,7500,16.2,38.4,29.2,82.3,Target Co
7,Rivalio Systems,RVLO,Enterprise Software,22100,17.8,42.6,31.5,79.9,Target Co
8,SwiftCRM Holdings,SWFT,CRM Platform,3100,9.8,22.5,12.3,68.4,Target Co
9,PulseCRM Inc,PLSC,CRM Platform,1800,8.5,19.8,9.6,65.2,Target Co
10,LeadPilot Technologies,LDPT,Lead Generation,950,10.1,21.0,17.4,70.8,Target Co
```

- [ ] **Step 45: Create frontend/public/samples/analysts/dcf-model-builder.csv**

```csv
id,year,revenue_usd_millions,ebitda_usd_millions,capex_usd_millions,free_cash_flow_usd_millions,discount_rate_pct,terminal_growth_pct,present_value_usd_millions,scenario
1,2026,420,105,32,58,10.5,2.5,58,Base Case
2,2027,485,124,36,68,10.5,2.5,61.5,Base Case
3,2028,552,142,40,77,10.5,2.5,63.0,Base Case
4,2029,618,159,44,85,10.5,2.5,63.0,Base Case
5,2030,682,175,47,92,10.5,2.5,61.8,Base Case
6,2026,395,92,32,48,10.5,2.5,48,Bear Case
7,2027,435,102,35,53,10.5,2.5,48.0,Bear Case
8,2028,470,110,38,57,10.5,2.5,46.7,Bear Case
9,2026,455,120,32,70,10.5,2.5,70.0,Bull Case
10,2027,545,148,38,88,10.5,2.5,79.6,Bull Case
```

- [ ] **Step 46: Create frontend/public/samples/analysts/roi-business-case-calculator.csv**

```csv
id,initiative_name,department,upfront_cost_usd,annual_savings_usd,annual_revenue_lift_usd,payback_period_months,three_year_roi_pct,risk_level,approval_status
1,AI Customer Support Deployment,Support,280000,410000,0,8.2,340,Low,Approved
2,Marketing Automation Platform,Marketing,150000,85000,220000,6.0,510,Low,Approved
3,Sales Forecasting AI Tool,Sales,190000,60000,350000,5.5,548,Medium,Approved
4,Legacy System Modernization,Engineering,850000,320000,0,26.5,13,High,Under Review
5,Employee Engagement Platform,HR,95000,40000,0,28.5,26,Low,Approved
6,Supply Chain Optimization AI,Operations,420000,580000,0,8.7,314,Medium,Approved
7,Fraud Detection Upgrade,Finance,310000,650000,0,5.7,529,Low,Approved
8,Data Warehouse Migration,Engineering,600000,180000,0,40.0,-10,High,Rejected
9,Personalization Engine,Product,275000,0,480000,6.9,423,Medium,Approved
10,RPA for Invoice Processing,Finance,120000,220000,0,6.5,450,Low,Approved
```

- [ ] **Step 47: Create frontend/public/samples/analysts/vendor-briefing-note-taker.csv**

```csv
id,vendor_name,briefing_date,attendees,key_topic,product_update,pricing_change,follow_up_needed,analyst,sentiment
1,Apex Cloud Solutions,2026-07-10,"Angela Ruiz,Marcus Webb",New AI compute tier launch,"Added GPU-optimized instances",5% price increase on legacy tier,Yes,Nina Petrov,Positive
2,DataForge Analytics,2026-07-11,"Nina Petrov",Roadmap for real-time analytics,"Streaming dashboards in beta",No change,Yes,Nina Petrov,Neutral
3,Silverline Robotics,2026-07-12,"Devon Park",Warehouse automation expansion,"New picking robot model released",No change,No,Devon Park,Positive
4,Titan Components Ltd,2026-07-12,"Connor Blaise",Supply chain resilience update,"Diversified sourcing to 3 new regions",No change,No,Connor Blaise,Positive
5,Bright Horizon Advisors,2026-07-13,"Angela Ruiz",Engagement scope expansion,"Proposed expanded advisory retainer",10% rate increase,Yes,Nina Petrov,Neutral
6,NovaGrid Energy Systems,2026-07-13,"Devon Park,Connor Blaise",Renewable capacity buildout,"New solar farm commissioning Q4",No change,Yes,Devon Park,Positive
7,Meridian Trade Partners,2026-07-14,"Nina Petrov",Distribution network update,"Added 2 new regional hubs",No change,No,Nina Petrov,Positive
8,CloudNest Systems,2026-07-14,"Marcus Webb",SaaS platform roadmap review,"New compliance certifications achieved",No change,No,Marcus Webb,Positive
9,Ironclad Manufacturing Supply,2026-07-15,"Connor Blaise",Cost pressures discussion,"Raw material costs up 8%",Passing through 6% increase,Yes,Connor Blaise,Negative
10,Vertex Cloud Solutions,2026-07-16,"Angela Ruiz,Nina Petrov",Multi-region expansion,"New data centers in APAC",No change,No,Nina Petrov,Positive
```

- [ ] **Step 48: Create frontend/public/samples/analysts/inquiry-tracker-trend-spotter.csv**

```csv
id,inquiry_id,client_name,topic,inquiry_date,analyst_assigned,category,trend_flag,volume_this_month,volume_last_month
1,INQ-7701,Beacon Financial,AI vendor selection criteria,2026-07-01,Nina Petrov,Technology Strategy,Rising,42,28
2,INQ-7702,Ironwood Construction,Supply chain risk mitigation,2026-07-02,Devon Park,Operations,Stable,18,17
3,INQ-7703,Lumen Healthcare,Healthcare AI compliance,2026-07-03,Connor Blaise,Regulatory,Rising,35,20
4,INQ-7704,Delta Freight Systems,Fleet electrification ROI,2026-07-04,Devon Park,Sustainability,Rising,29,15
5,INQ-7705,Solstice Retail Group,Personalization technology stack,2026-07-05,Marcus Webb,Customer Experience,Stable,22,24
6,INQ-7706,ForgeWorks Manufacturing,Robotics ROI benchmarks,2026-07-06,Devon Park,Automation,Rising,31,19
7,INQ-7707,BrightPath Consulting,Talent retention strategy,2026-07-07,Angela Ruiz,Workforce,Falling,12,20
8,INQ-7708,Vantage Logistics,Warehouse automation vendors,2026-07-08,Devon Park,Automation,Rising,27,14
9,INQ-7709,Zenith Media Group,Streaming platform monetization,2026-07-09,Marcus Webb,Media,Stable,16,15
10,INQ-7710,Coastal Energy Partners,Grid storage technology comparison,2026-07-10,Connor Blaise,Energy,Rising,38,22
```

- [ ] **Step 49: Create frontend/public/samples/analysts/earnings-season-dashboard.csv**

```csv
id,company_name,ticker,report_date,eps_actual,eps_estimate,revenue_actual_millions,revenue_estimate_millions,surprise_pct,stock_reaction_pct,sector
1,NexaSuite Inc,NXSA,2026-07-14,1.42,1.30,610,585,9.2,4.5,Enterprise Software
2,Vantage CRM Holdings,VNTG,2026-07-14,0.98,1.05,420,435,-6.7,-3.2,Enterprise Software
3,OrbitSales Corp,ORBT,2026-07-15,2.10,1.95,340,320,7.7,6.1,Sales Technology
4,FlowStack Technologies,FLWS,2026-07-15,0.55,0.60,180,190,-8.3,-4.8,Marketing Automation
5,Momentum360 Inc,MOM3,2026-07-16,0.78,0.75,150,148,4.0,2.1,Customer Success SaaS
6,ClearPath Analytics Group,CLRP,2026-07-16,1.65,1.50,225,210,10.0,7.8,Business Intelligence
7,Rivalio Systems,RVLO,2026-07-17,3.20,3.00,780,750,6.7,3.9,Enterprise Software
8,SwiftCRM Holdings,SWFT,2026-07-17,0.35,0.40,95,100,-12.5,-6.5,CRM Platform
9,PulseCRM Inc,PLSC,2026-07-18,0.20,0.18,55,52,11.1,5.5,CRM Platform
10,LeadPilot Technologies,LDPT,2026-07-18,0.42,0.38,42,40,10.5,4.2,Lead Generation
```

- [ ] **Step 50: Create frontend/public/samples/analysts/sector-performance-tracker.csv**

```csv
id,sector,index_ytd_return_pct,quarter_return_pct,top_performer,top_performer_return_pct,worst_performer,worst_performer_return_pct,volatility_index,outlook
1,Enterprise Software,24.5,8.2,Rivalio Systems,42.1,SwiftCRM Holdings,-15.2,18.4,Positive
2,Semiconductors,31.2,11.5,NovaChip Corp,58.3,Legacy Silicon Inc,-8.9,26.7,Positive
3,Renewable Energy,15.8,4.1,NovaGrid Energy,29.4,Solaris Power Co,-12.1,22.3,Neutral
4,Healthcare AI,38.9,14.2,Lumen Diagnostics,65.0,MedTech Legacy,-5.5,29.8,Positive
5,Traditional Retail,-4.2,-1.8,GreenLeaf Retail,8.5,Coastal Foods Inc,-22.4,15.6,Negative
6,Fintech,19.6,6.8,Vertex Financial,35.7,Stagnant Pay Corp,-10.3,20.1,Positive
7,Cybersecurity,27.3,9.5,ShieldNet Security,48.2,OldGuard Defense,-3.1,19.9,Positive
8,Logistics,8.4,2.9,Meridian Logistics,18.6,Delta Freight Systems,-6.8,16.2,Neutral
9,Biotech,22.1,7.3,Aster Biotech,55.9,PharmaLegacy Inc,-18.7,33.5,Neutral
10,Consumer Electronics,5.9,1.2,Nimbus Devices,12.3,Legacy Gadgets Co,-9.4,17.8,Neutral
```

- [ ] **Step 51: Create frontend/public/samples/analysts/ipo-readiness-checklist.csv**

```csv
id,company_name,category,readiness_criterion,status,owner,target_completion_date,risk_flag,notes
1,Nimbus Cloud Corp,Financial,Three years audited financials,Complete,Angela Ruiz,N/A,None,Big 4 auditor engaged
2,Nimbus Cloud Corp,Governance,Independent board members appointed,In Progress,Marcus Webb,2026-08-15,Medium,2 of 4 seats filled
3,Nimbus Cloud Corp,Legal,IP portfolio due diligence,Complete,Jennifer Lowe,N/A,None,No outstanding disputes
4,Nimbus Cloud Corp,Financial,SOX 404 controls implemented,In Progress,Connor Blaise,2026-09-01,High,Material weakness identified
5,Nimbus Cloud Corp,Operational,Revenue recognition policy documented,Complete,Angela Ruiz,N/A,None,ASC 606 compliant
6,Nimbus Cloud Corp,Governance,Audit committee charter drafted,Complete,Marcus Webb,N/A,None,Approved by board
7,Nimbus Cloud Corp,Market,Roadshow materials drafted,Not Started,Nina Petrov,2026-10-01,Medium,Pending underwriter selection
8,Nimbus Cloud Corp,Legal,S-1 registration statement drafted,In Progress,Jennifer Lowe,2026-09-15,High,Awaiting financial finalization
9,Nimbus Cloud Corp,Financial,Underwriter selection finalized,In Progress,Angela Ruiz,2026-08-01,Medium,Down to 2 finalists
10,Nimbus Cloud Corp,Operational,Investor relations team hired,Not Started,Marcus Webb,2026-09-30,Low,Job postings live
```

### data-analysis

- [ ] **Step 52: Create frontend/public/samples/data-analysis/stock-market-analyst.csv**

```csv
id,ticker,company_name,date,open,high,low,close,volume,pe_ratio
1,NXSA,NexaSuite Inc,2026-07-14,142.50,148.20,141.80,147.90,3200000,32.5
2,VNTG,Vantage CRM Holdings,2026-07-14,88.10,89.50,85.20,85.90,1800000,28.0
3,ORBT,OrbitSales Corp,2026-07-15,205.30,212.80,204.00,211.50,2100000,35.8
4,FLWS,FlowStack Technologies,2026-07-15,42.60,43.10,40.50,41.00,950000,24.2
5,MOM3,Momentum360 Inc,2026-07-16,67.80,69.20,67.10,68.90,780000,30.1
6,CLRP,ClearPath Analytics Group,2026-07-16,118.40,125.60,117.90,124.80,1450000,38.4
7,RVLO,Rivalio Systems,2026-07-17,285.00,295.50,283.20,292.60,2800000,42.6
8,SWFT,SwiftCRM Holdings,2026-07-17,19.80,20.10,18.50,18.90,620000,22.5
9,PLSC,PulseCRM Inc,2026-07-18,9.40,9.85,9.30,9.75,410000,19.8
10,LDPT,LeadPilot Technologies,2026-07-18,15.20,15.90,15.00,15.75,290000,21.0
```

- [ ] **Step 53: Create frontend/public/samples/data-analysis/text-to-sql-explorer.csv**

```csv
id,natural_language_query,generated_sql,table_referenced,rows_returned,execution_time_ms,accuracy_flag,run_date
1,"Show total revenue by region last quarter","SELECT region, SUM(revenue) FROM sales WHERE quarter='Q2-2026' GROUP BY region",sales,6,45,Correct,2026-07-14
2,"List top 10 customers by order value","SELECT customer_name, SUM(order_value) AS total FROM orders GROUP BY customer_name ORDER BY total DESC LIMIT 10",orders,10,62,Correct,2026-07-14
3,"How many support tickets were opened this week","SELECT COUNT(*) FROM tickets WHERE created_at >= DATE('now','-7 days')",tickets,1,28,Correct,2026-07-15
4,"Average order value by product category","SELECT category, AVG(order_value) FROM orders JOIN products USING(product_id) GROUP BY category",orders,8,80,Correct,2026-07-15
5,"Employees hired in the last 6 months","SELECT name, hire_date FROM employees WHERE hire_date >= DATE('now','-6 months')",employees,34,35,Correct,2026-07-15
6,"Revenue trend by month for 2026","SELECT month, SUM(revenue) FROM sales WHERE year=2026 GROUP BY month ORDER BY month",sales,7,50,Correct,2026-07-16
7,"Which products have negative inventory","SELECT product_name, inventory_count FROM inventory WHERE inventory_count < 0",inventory,3,22,Needs Review,2026-07-16
8,"Customer churn rate by cohort","SELECT cohort, churn_rate FROM customer_cohorts ORDER BY cohort",customer_cohorts,12,55,Correct,2026-07-16
9,"Support tickets resolved by agent this month","SELECT agent_name, COUNT(*) FROM tickets WHERE status='Resolved' GROUP BY agent_name",tickets,9,48,Correct,2026-07-16
10,"Top 5 marketing channels by conversion rate","SELECT channel, conversion_rate FROM marketing_channels ORDER BY conversion_rate DESC LIMIT 5",marketing_channels,5,40,Correct,2026-07-16
```

- [ ] **Step 54: Create frontend/public/samples/data-analysis/excel-data-insights-generator.csv**

```csv
id,sheet_name,metric_name,current_value,previous_value,pct_change,anomaly_detected,insight_summary,confidence_score
1,Q2_Sales,Total Revenue,4200000,3850000,9.1,No,"Steady growth driven by enterprise segment",92
2,Q2_Sales,Customer Churn Rate,4.2,5.8,-27.6,No,"Churn improved after new onboarding flow",88
3,Q2_Marketing,Cost Per Lead,42.50,38.20,11.3,Yes,"CPL spike correlates with paid social pullback",81
4,Q2_Finance,Operating Margin,18.5,16.2,14.2,No,"Margin improved via cost discipline",90
5,Q2_HR,Employee Turnover,8.1,11.4,-28.9,No,"Retention initiatives showing results",85
6,Q2_Sales,Average Deal Size,52000,45000,15.6,No,"Larger deals from enterprise push",93
7,Q2_Support,Average Resolution Time,4.2,6.8,-38.2,No,"AI triage reduced resolution time",89
8,Q2_Marketing,Email Open Rate,38.4,42.1,-8.8,Yes,"Deliverability issue detected mid-quarter",76
9,Q2_Finance,Cash Runway (months),18,14,28.6,No,"Runway extended after Series C close",95
10,Q2_Product,Feature Adoption Rate,62.3,54.1,15.2,No,"New dashboard drove adoption increase",87
```

- [ ] **Step 55: Create frontend/public/samples/data-analysis/business-intelligence-agent.csv**

```csv
id,kpi_name,department,current_value,target_value,unit,trend,period,status,owner
1,Monthly Recurring Revenue,Finance,4200000,4500000,USD,Up,2026-07,On Track,Connor Blaise
2,Customer Acquisition Cost,Marketing,285,250,USD,Down,2026-07,Needs Attention,Marie Lefevre
3,Net Promoter Score,Customer Success,62,65,Score,Up,2026-07,On Track,Oscar Reyes
4,Sales Pipeline Coverage,Sales,3.2,3.0,Ratio,Up,2026-07,On Track,Amara Nwosu
5,Engineering Velocity,Engineering,142,150,Story Points,Down,2026-07,Needs Attention,Felix Grunwald
6,Support Ticket Backlog,Support,85,50,Tickets,Up,2026-07,At Risk,Priya Nair
7,Employee Engagement Score,HR,7.4,8.0,Score,Flat,2026-07,Needs Attention,Priyanka Iyer
8,Gross Margin,Finance,74.2,75.0,Percent,Up,2026-07,On Track,Connor Blaise
9,Website Conversion Rate,Marketing,3.8,4.5,Percent,Down,2026-07,Needs Attention,Marie Lefevre
10,Feature Adoption Rate,Product,58.6,65.0,Percent,Up,2026-07,On Track,Devon Park
```

- [ ] **Step 56: Create frontend/public/samples/data-analysis/customer-analytics-agent.csv**

```csv
id,customer_id,customer_name,segment,ltv_usd,churn_risk_score,last_purchase_date,total_purchases,nps_score,engagement_tier
1,C-9001,Beacon Financial,Enterprise,285000,12,2026-07-10,18,72,High
2,C-9002,Ironwood Construction,Mid-Market,95000,45,2026-06-28,9,55,Medium
3,C-9003,Lumen Healthcare,Enterprise,410000,8,2026-07-14,25,80,High
4,C-9004,Delta Freight Systems,Mid-Market,72000,60,2026-06-15,6,42,Low
5,C-9005,Solstice Retail Group,SMB,28000,35,2026-07-01,4,58,Medium
6,C-9006,ForgeWorks Manufacturing,Enterprise,320000,20,2026-07-08,15,68,High
7,C-9007,BrightPath Consulting,SMB,18500,72,2026-05-20,3,35,Low
8,C-9008,Vantage Logistics,Mid-Market,110000,25,2026-07-12,11,64,Medium
9,C-9009,Zenith Media Group,SMB,32000,50,2026-06-25,5,48,Medium
10,C-9010,Coastal Energy Partners,Enterprise,255000,15,2026-07-15,14,75,High
```

- [ ] **Step 57: Create frontend/public/samples/data-analysis/kpi-dashboard-builder.csv**

```csv
id,kpi_name,category,current_value,target_value,unit,period,variance_pct,rag_status,frequency
1,Revenue Growth Rate,Financial,18.5,20.0,Percent,Q2 2026,-7.5,Amber,Quarterly
2,Customer Retention Rate,Customer,91.2,90.0,Percent,Q2 2026,1.3,Green,Monthly
3,Average Response Time,Operations,3.2,4.0,Hours,July 2026,20.0,Green,Weekly
4,Employee Satisfaction,HR,7.8,8.0,Score,Q2 2026,-2.5,Amber,Quarterly
5,Cost of Goods Sold,Financial,42.1,40.0,Percent of Revenue,Q2 2026,-5.3,Red,Monthly
6,New Customer Signups,Sales,320,300,Count,July 2026,6.7,Green,Monthly
7,Website Uptime,Operations,99.95,99.9,Percent,July 2026,0.05,Green,Daily
8,Product Return Rate,Operations,3.4,2.5,Percent,Q2 2026,-36.0,Red,Monthly
9,Marketing Qualified Leads,Marketing,850,900,Count,July 2026,-5.6,Amber,Monthly
10,Employee Turnover Rate,HR,9.2,8.0,Percent,Q2 2026,-15.0,Amber,Quarterly
```

- [ ] **Step 58: Create frontend/public/samples/data-analysis/survey-results-analyzer.csv**

```csv
id,respondent_id,survey_name,question,response_value,sentiment,segment,submitted_date,follow_up_flag
1,R-2201,Product Satisfaction Q2,How satisfied are you overall?,9,Positive,Enterprise,2026-07-01,No
2,R-2202,Product Satisfaction Q2,How satisfied are you overall?,4,Negative,SMB,2026-07-01,Yes
3,R-2203,Product Satisfaction Q2,How likely are you to recommend us?,8,Positive,Mid-Market,2026-07-02,No
4,R-2204,Product Satisfaction Q2,What feature is missing most?,"Better reporting tools",Neutral,Enterprise,2026-07-02,No
5,R-2205,Product Satisfaction Q2,How satisfied are you overall?,3,Negative,SMB,2026-07-03,Yes
6,R-2206,Employee Engagement Q2,Do you feel valued at work?,7,Positive,Internal,2026-07-03,No
7,R-2207,Employee Engagement Q2,Do you feel valued at work?,2,Negative,Internal,2026-07-04,Yes
8,R-2208,Product Satisfaction Q2,How likely are you to recommend us?,9,Positive,Enterprise,2026-07-04,No
9,R-2209,Employee Engagement Q2,Rate your work-life balance,6,Neutral,Internal,2026-07-05,No
10,R-2210,Product Satisfaction Q2,How satisfied are you overall?,10,Positive,Mid-Market,2026-07-05,No
```

- [ ] **Step 59: Create frontend/public/samples/data-analysis/competitive-landscape-mapper.csv**

```csv
id,competitor_name,market_position,pricing_strategy,differentiator,funding_total_usd_millions,employee_count,geo_focus,threat_score
1,Rivalio Systems,Leader,Premium,AI-native architecture,320,1200,Global,9.2
2,SwiftCRM Holdings,Challenger,Value,Ease of use,45,180,North America,6.5
3,NexaSuite Inc,Leader,Premium,Enterprise integrations,410,2100,Global,8.8
4,LeadPilot Technologies,Niche,Freemium,Chrome extension simplicity,12,45,North America,4.2
5,FlowStack Technologies,Challenger,Mid-tier,Multi-channel journeys,85,320,Europe,6.8
6,PulseCRM Inc,Niche,Freemium,SMB-first design,8,60,North America,3.9
7,OrbitSales Corp,Leader,Premium,Revenue intelligence,190,850,Global,8.5
8,ClearPath Analytics Group,Challenger,Mid-tier,Predictive forecasting,60,240,North America,7.1
9,Vantage CRM Holdings,Leader,Premium,Industry templates,150,680,Global,7.9
10,Momentum360 Inc,Challenger,Mid-tier,Health score automation,55,190,Europe,6.3
```

- [ ] **Step 60: Create frontend/public/samples/data-analysis/consumer-segmentation-tool.csv**

```csv
id,segment_name,size_pct,avg_age,avg_income_usd,primary_channel,purchase_frequency,brand_affinity_score,key_motivator,recommended_campaign
1,Tech-Forward Professionals,22,34,95000,Digital,High,8.2,Innovation & convenience,Early access product drops
2,Value-Conscious Families,28,41,62000,In-Store,Medium,6.5,Price & reliability,Bundle discount campaign
3,Luxury Seekers,12,45,180000,Direct/Concierge,Low,9.0,Exclusivity & status,VIP loyalty program
4,Eco-Conscious Millennials,18,29,58000,Digital,Medium,7.8,Sustainability,Green packaging campaign
5,Budget Students,10,21,22000,Mobile App,High,5.2,Discounts & promos,Student discount push
6,Loyal Repeat Buyers,15,52,75000,Omnichannel,High,8.9,Trust & consistency,Anniversary reward program
7,Digital Natives Gen Z,14,19,30000,Social Commerce,High,7.0,Trend-driven,Influencer collaboration
8,Suburban Homeowners,20,44,88000,In-Store,Medium,6.9,Convenience & family,Family bundle promotion
9,Urban Professionals,25,31,105000,Digital,High,7.6,Time-saving,Subscription service launch
10,Retiree Value Shoppers,9,66,52000,In-Store,Low,7.2,Reliability & service,Senior loyalty discount
```

- [ ] **Step 61: Create frontend/public/samples/data-analysis/brand-health-tracker.csv**

```csv
id,brand_metric,current_score,previous_score,pct_change,benchmark_score,region,survey_period,sentiment_trend
1,Brand Awareness,68,64,6.3,70,North America,Q2 2026,Improving
2,Brand Consideration,45,42,7.1,50,North America,Q2 2026,Improving
3,Net Promoter Score,58,55,5.5,60,Global,Q2 2026,Improving
4,Brand Trust Index,72,75,-4.0,78,Europe,Q2 2026,Declining
5,Purchase Intent,38,35,8.6,42,North America,Q2 2026,Improving
6,Social Sentiment Score,64,68,-5.9,70,Global,Q2 2026,Declining
7,Ad Recall Rate,52,48,8.3,55,Asia-Pacific,Q2 2026,Improving
8,Brand Loyalty Score,70,71,-1.4,75,Global,Q2 2026,Flat
9,Competitive Preference,41,38,7.9,45,North America,Q2 2026,Improving
10,Employee Brand Advocacy,66,60,10.0,68,Global,Q2 2026,Improving
```

- [ ] **Step 62: Create frontend/public/samples/data-analysis/pricing-research-analyzer.csv**

```csv
id,product_name,current_price_usd,competitor_avg_price_usd,willingness_to_pay_usd,price_elasticity,recommended_price_usd,revenue_impact_pct,segment,confidence_level
1,Starter Plan,29,32,35,-1.2,32,8.5,SMB,High
2,Pro Plan,99,110,105,-0.9,105,6.2,Mid-Market,High
3,Enterprise Plan,499,520,540,-0.6,530,4.8,Enterprise,Medium
4,Add-on: Analytics Module,49,45,52,-1.5,50,10.2,All Segments,Medium
5,Add-on: SSO Package,79,85,80,-0.8,80,1.3,Enterprise,High
6,Annual Discount Tier,890,950,920,-1.0,910,3.5,Mid-Market,Medium
7,API Usage Overage,0.02,0.025,0.022,-1.8,0.022,9.0,Enterprise,Medium
8,Freemium Upgrade Trigger,0,15,12,-2.1,12,15.0,SMB,High
9,Team Seat Add-on,15,18,17,-1.1,17,7.4,Mid-Market,High
10,White-Label License,2500,2800,2650,-0.5,2700,5.5,Enterprise,Low
```

- [ ] **Step 63: Create frontend/public/samples/data-analysis/data-quality-scorecard.csv**

```csv
id,dataset_name,table_name,completeness_pct,accuracy_pct,consistency_pct,duplicate_rate_pct,overall_quality_score,last_scanned,critical_issues
1,Customer Master,customers,94.5,97.2,92.0,3.1,93.9,2026-07-14,2
2,Sales Transactions,orders,98.1,96.5,95.8,1.2,96.6,2026-07-14,0
3,Product Catalog,products,88.2,90.1,85.5,5.4,87.8,2026-07-13,4
4,Employee Records,employees,99.5,98.8,97.2,0.5,98.6,2026-07-15,0
5,Marketing Leads,leads,76.3,82.5,79.1,12.8,79.5,2026-07-12,6
6,Support Tickets,tickets,91.8,93.4,90.2,2.5,91.8,2026-07-15,1
7,Vendor Contracts,contracts,85.0,88.9,84.2,3.8,85.7,2026-07-11,3
8,Inventory Levels,inventory,79.5,85.2,81.0,7.9,82.4,2026-07-13,5
9,Financial Ledger,gl_entries,99.9,99.5,99.1,0.1,99.5,2026-07-16,0
10,Web Analytics Events,events,68.4,75.0,70.5,15.2,72.0,2026-07-10,8
```

- [ ] **Step 64: Create frontend/public/samples/data-analysis/ab-test-calculator-reporter.csv**

```csv
id,test_name,variant,visitors,conversions,conversion_rate_pct,uplift_pct,statistical_significance_pct,winner,test_duration_days
1,Checkout CTA Color,Control (Blue),12500,875,7.0,0.0,N/A,No,14
2,Checkout CTA Color,Variant (Green),12480,1035,8.3,18.6,96.2,Yes,14
3,Pricing Page Layout,Control (3-tier),9800,392,4.0,0.0,N/A,No,21
4,Pricing Page Layout,Variant (4-tier),9750,441,4.5,12.5,88.4,No,21
5,Onboarding Flow,Control (5-step),15200,3040,20.0,0.0,N/A,No,10
6,Onboarding Flow,Variant (3-step),15100,3776,25.0,25.0,99.1,Yes,10
7,Email Subject Line,Control (Generic),42000,5040,12.0,0.0,N/A,No,7
8,Email Subject Line,Variant (Personalized),41800,6270,15.0,25.0,97.8,Yes,7
9,Homepage Hero Image,Control (Product Shot),18500,1665,9.0,0.0,N/A,No,14
10,Homepage Hero Image,Variant (Customer Photo),18600,1674,9.0,0.0,52.3,No,14
```

- [ ] **Step 65: Create frontend/public/samples/data-analysis/sql-query-result-visualiser.csv**

```csv
id,query_name,dimension,metric_name,metric_value,chart_type,date_range,row_count,execution_time_ms
1,Monthly Revenue by Region,North America,Revenue,1850000,Bar Chart,2026-06-01 to 2026-06-30,1,42
2,Monthly Revenue by Region,Europe,Revenue,1240000,Bar Chart,2026-06-01 to 2026-06-30,1,42
3,Monthly Revenue by Region,Asia-Pacific,Revenue,980000,Bar Chart,2026-06-01 to 2026-06-30,1,42
4,Daily Active Users Trend,2026-07-10,DAU,42500,Line Chart,2026-07-01 to 2026-07-16,1,28
5,Daily Active Users Trend,2026-07-11,DAU,43100,Line Chart,2026-07-01 to 2026-07-16,1,28
6,Support Tickets by Category,Billing,Ticket Count,320,Pie Chart,2026-07-01 to 2026-07-16,1,35
7,Support Tickets by Category,Technical,Ticket Count,480,Pie Chart,2026-07-01 to 2026-07-16,1,35
8,Support Tickets by Category,Account,Ticket Count,210,Pie Chart,2026-07-01 to 2026-07-16,1,35
9,Sales Funnel Conversion,Lead to MQL,Conversion Rate,38.5,Funnel Chart,Q2 2026,1,55
10,Sales Funnel Conversion,MQL to Opportunity,Conversion Rate,22.1,Funnel Chart,Q2 2026,1,55
```

- [ ] **Step 66: Create frontend/public/samples/data-analysis/stakeholder-report-generator.csv**

```csv
id,report_section,metric_name,value,unit,period,narrative_summary,audience,status
1,Executive Summary,Total Revenue,4200000,USD,Q2 2026,"Revenue grew 9% QoQ driven by enterprise expansion",Board,Final
2,Financial Performance,Gross Margin,74.2,Percent,Q2 2026,"Margin improved via infrastructure cost optimization",Board,Final
3,Customer Metrics,Net Retention Rate,112,Percent,Q2 2026,"Upsells offset churn for net positive retention",Investors,Final
4,Product Update,Feature Adoption,58.6,Percent,Q2 2026,"New dashboard drove strong early adoption",Board,Final
5,Risk Section,Customer Concentration,18,Percent,Q2 2026,"Top 5 customers represent 18% of revenue",Board,Draft
6,Operational Metrics,Employee Headcount,412,Count,Q2 2026,"Headcount grew 12% to support scaling",Investors,Final
7,Market Outlook,TAM Estimate,48000,USD Millions,2026,"Market continues to expand with AI adoption",Investors,Draft
8,Financial Performance,Cash Runway,18,Months,Q2 2026,"Runway extended following Series C close",Board,Final
9,Customer Metrics,Churn Rate,4.2,Percent,Q2 2026,"Churn improved after onboarding redesign",Investors,Final
10,Executive Summary,ARR,50400000,USD,Q2 2026,"ARR crossed $50M milestone this quarter",Board,Final
```

- [ ] **Step 67: Create frontend/public/samples/data-analysis/policy-impact-calculator.csv**

```csv
id,policy_name,jurisdiction,affected_population,estimated_cost_usd_millions,estimated_benefit_usd_millions,net_impact_usd_millions,implementation_year,confidence_level,sector
1,Minimum Wage Increase to $18/hr,California,2400000,850,1200,350,2027,Medium,Labor
2,EV Tax Credit Expansion,Federal,5000000,2100,3400,1300,2027,High,Transportation
3,Carbon Tax on Industrial Emissions,Federal,12000000,4500,6800,2300,2028,Medium,Environment
4,Universal Pre-K Funding,New York,180000,620,980,360,2027,High,Education
5,Small Business Tax Relief,Texas,340000,410,560,150,2027,Medium,Economic Development
6,Renewable Energy Mandate 50%,Federal,50000000,8900,12400,3500,2030,Low,Energy
7,Broadband Access Expansion,Federal,8000000,1200,2100,900,2028,High,Infrastructure
8,Prescription Drug Price Cap,Federal,25000000,3200,5100,1900,2027,Medium,Healthcare
9,Affordable Housing Tax Credits,Federal,1500000,1800,2600,800,2028,Medium,Housing
10,Paid Family Leave Mandate,New York,900000,540,780,240,2027,High,Labor
```

- [ ] **Step 68: Create frontend/public/samples/data-analysis/demographic-trend-explorer.csv**

```csv
id,region,age_group,population_2026,population_2020,pct_change,median_income_usd,urbanization_pct,key_trend
1,Northeast US,18-34,4200000,4450000,-5.6,58000,82,Youth outmigration to Sun Belt
2,Sun Belt US,18-34,6800000,5900000,15.3,52000,68,Rapid in-migration and job growth
3,Midwest US,65+,3100000,2850000,8.8,45000,55,Aging population, rural decline
4,West Coast US,35-54,5400000,5300000,1.9,89000,90,Housing affordability pressure
5,Southeast Asia,18-34,180000000,168000000,7.1,8500,52,Rising middle class expansion
6,Western Europe,65+,42000000,38500000,9.1,38000,78,Pension system strain
7,Sub-Saharan Africa,0-17,410000000,370000000,10.8,2100,45,Youth bulge driving labor supply
8,East Asia,18-34,220000000,235000000,-6.4,15200,85,Working-age population decline
9,Latin America,35-54,95000000,88000000,8.0,9800,80,Growing urban middle class
10,South Asia,18-34,410000000,385000000,6.5,4200,38,Massive labor force entry
```

- [ ] **Step 69: Create frontend/public/samples/data-analysis/grant-funding-tracker.csv**

```csv
id,grant_name,funder,category,award_amount_usd,application_deadline,status,project_lead,region,renewal_likely
1,Clean Energy Innovation Grant,Department of Energy,Energy,850000,2026-08-15,Awarded,Devon Park,National,Yes
2,Rural Broadband Expansion Fund,FCC,Infrastructure,1200000,2026-09-01,Submitted,Nina Petrov,Rural Midwest,N/A
3,STEM Education Access Grant,National Science Foundation,Education,320000,2026-07-30,Awarded,Angela Ruiz,National,Yes
4,Community Health Equity Grant,HHS,Healthcare,540000,2026-08-20,Under Review,Connor Blaise,Urban Southeast,N/A
5,Small Business Innovation Research,SBA,Economic Development,175000,2026-07-25,Awarded,Marcus Webb,National,No
6,Water Infrastructure Modernization,EPA,Infrastructure,2100000,2026-09-15,Draft,Devon Park,National,N/A
7,Workforce Reskilling Initiative,Department of Labor,Labor,680000,2026-08-05,Submitted,Priyanka Iyer,National,N/A
8,Affordable Housing Development Fund,HUD,Housing,3200000,2026-10-01,Draft,Nina Petrov,Urban Northeast,N/A
9,Agricultural Sustainability Grant,USDA,Agriculture,410000,2026-08-12,Awarded,Connor Blaise,Rural Midwest,Yes
10,Disaster Resilience Planning Grant,FEMA,Emergency Management,290000,2026-07-28,Under Review,Angela Ruiz,Coastal Southeast,N/A
```

- [ ] **Step 70: Create frontend/public/samples/data-analysis/regulatory-compliance-checker.csv**

```csv
id,regulation_name,jurisdiction,industry,compliance_status,risk_score,last_assessed,penalty_exposure_usd,remediation_owner,deadline
1,GDPR Data Processing,EU,Technology,Compliant,15,2026-06-15,0,Sofia Bergstrom,N/A
2,CCPA Consumer Rights,California,Retail,Partial,55,2026-06-20,750000,Derek Munoz,2026-08-01
3,HIPAA Privacy Rule,Federal,Healthcare,Non-Compliant,82,2026-06-10,1500000,Connor Blaise,2026-07-25
4,Dodd-Frank Compliance,Federal,Financial Services,Compliant,20,2026-06-05,0,Angela Weiss,N/A
5,OSHA Workplace Safety,Federal,Manufacturing,Partial,48,2026-05-30,320000,Devon Park,2026-08-15
6,Basel III Capital Requirements,Global,Banking,Compliant,18,2026-06-12,0,Angela Weiss,N/A
7,EU AI Act Conformity,EU,Technology,Partial,60,2026-06-20,900000,Sofia Bergstrom,2026-09-01
8,FDA Drug Approval Standards,Federal,Pharmaceutical,Compliant,22,2026-06-18,0,Connor Blaise,N/A
9,SEC Reporting Requirements,Federal,Financial Services,Compliant,25,2026-06-08,0,Angela Weiss,N/A
10,EPA Emissions Standards,Federal,Manufacturing,Non-Compliant,78,2026-06-14,2100000,Devon Park,2026-07-30
```

- [ ] **Step 71: Create frontend/public/samples/data-analysis/public-comment-analyzer.csv**

```csv
id,comment_id,policy_topic,submitter_type,comment_summary,sentiment,theme,submitted_date,flagged_for_review
1,PC-4401,Renewable Energy Mandate,Individual,"Supports mandate but concerned about cost pass-through to consumers",Mixed,Cost Concerns,2026-07-01,No
2,PC-4402,Renewable Energy Mandate,Industry Group,"Opposes timeline as too aggressive for grid capacity",Negative,Implementation Timeline,2026-07-02,Yes
3,PC-4403,Data Privacy Regulation,Advocacy Organization,"Strongly supports stronger consumer protections",Positive,Consumer Rights,2026-07-03,No
4,PC-4404,Data Privacy Regulation,Individual,"Worried about compliance burden on small businesses",Negative,Small Business Impact,2026-07-04,No
5,PC-4405,Minimum Wage Increase,Labor Union,"Strongly supports increase to $18/hr",Positive,Worker Welfare,2026-07-05,No
6,PC-4406,Minimum Wage Increase,Small Business Owner,"Concerned about ability to maintain staffing levels",Negative,Business Impact,2026-07-06,Yes
7,PC-4407,Zoning Reform Proposal,Individual,"Supports increased housing density near transit",Positive,Housing Access,2026-07-07,No
8,PC-4408,Zoning Reform Proposal,Neighborhood Association,"Opposes density increase citing traffic concerns",Negative,Community Impact,2026-07-08,No
9,PC-4409,Broadband Expansion Plan,Rural Resident,"Strongly supports expansion to underserved areas",Positive,Access Equity,2026-07-09,No
10,PC-4410,Broadband Expansion Plan,Telecom Industry,"Requests longer implementation timeline",Mixed,Implementation Timeline,2026-07-10,Yes
```

- [ ] **Step 72: Create frontend/public/samples/data-analysis/swot-strategy-framework-builder.csv**

```csv
id,category,item_description,impact_level,likelihood,strategic_priority,related_department,quarter,status
1,Strength,Market-leading AI product capabilities,High,High,Leverage in enterprise sales,Product,Q3 2026,Active
2,Strength,Strong brand recognition in North America,Medium,High,Expand marketing spend,Marketing,Q3 2026,Active
3,Weakness,Limited presence in APAC markets,High,High,Prioritize regional expansion,Sales,Q4 2026,Planned
4,Weakness,High customer support ticket backlog,Medium,High,Invest in AI-assisted support,Support,Q3 2026,Active
5,Opportunity,Growing demand for AI compliance tooling,High,High,Launch compliance product line,Product,Q4 2026,Planned
6,Opportunity,Partnership potential with cloud providers,Medium,Medium,Pursue co-sell agreements,Business Development,Q3 2026,Active
7,Threat,New well-funded competitor entering market,High,Medium,Accelerate differentiation roadmap,Product,Q3 2026,Active
8,Threat,Potential AI regulation increasing compliance cost,Medium,High,Build compliance-by-design features,Legal,Q4 2026,Planned
9,Strength,High customer retention and NPS,High,High,Use in sales enablement materials,Customer Success,Q3 2026,Active
10,Weakness,Dependency on single cloud infrastructure vendor,Medium,Medium,Evaluate multi-cloud strategy,Engineering,Q4 2026,Planned
```

- [ ] **Step 73: Commit**

```bash
git add frontend/public/samples/
git commit -m "feat: add 43 realistic sample CSV files for enhanced prompts"
```

---
