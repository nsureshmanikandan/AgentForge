"""AgentForge V12 Presentation Builder"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
import copy

# ── Brand colours ──────────────────────────────────────────────────────────
C_NAVY   = RGBColor(0x0F, 0x17, 0x2A)   # slide background (dark)
C_INDIGO = RGBColor(0x63, 0x66, 0xF1)   # primary accent
C_TEAL   = RGBColor(0x0D, 0x94, 0x88)   # secondary accent
C_VIOLET = RGBColor(0x7C, 0x3A, 0xED)   # voice / new feature
C_WHITE  = RGBColor(0xFF, 0xFF, 0xFF)
C_LGRAY  = RGBColor(0xE2, 0xE8, 0xF0)   # body text on dark
C_GOLD   = RGBColor(0xF5, 0x9E, 0x0B)   # highlight / KPI
C_GREEN  = RGBColor(0x10, 0xB9, 0x81)   # positive metric
C_DKGRAY = RGBColor(0x1E, 0x29, 0x3B)   # card background
C_MID    = RGBColor(0x33, 0x41, 0x55)   # section divider bg
C_EXEC   = RGBColor(0x06, 0x0A, 0x1A)   # exec section dark

W = Inches(13.33)
H = Inches(7.5)

prs = Presentation()
prs.slide_width  = W
prs.slide_height = H

BLANK = prs.slide_layouts[6]   # truly blank

# ── Helpers ────────────────────────────────────────────────────────────────
def add_rect(slide, x, y, w, h, fill, alpha=None):
    s = slide.shapes.add_shape(1, Inches(x), Inches(y), Inches(w), Inches(h))
    s.line.fill.background()
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    return s

def add_text(slide, text, x, y, w, h, size, bold=False, color=C_WHITE,
             align=PP_ALIGN.LEFT, italic=False, wrap=True):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.word_wrap = wrap
    tf = tb.text_frame
    tf.word_wrap = wrap
    p  = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size    = Pt(size)
    run.font.bold    = bold
    run.font.italic  = italic
    run.font.color.rgb = color
    return tb

def bg(slide, color=C_NAVY):
    add_rect(slide, 0, 0, 13.33, 7.5, color)

def label_chip(slide, text, x, y, color=C_INDIGO):
    add_rect(slide, x, y, len(text)*0.10+0.25, 0.28, color)
    add_text(slide, text, x+0.08, y+0.02, len(text)*0.10+0.1, 0.25,
             8, bold=True, color=C_WHITE)

def section_badge(slide, section_label):
    add_rect(slide, 0.4, 0.18, 2.6, 0.28, C_INDIGO)
    add_text(slide, section_label, 0.48, 0.19, 2.5, 0.26,
             8, bold=True, color=C_WHITE)

def divider_slide(label, sub=""):
    s = prs.slides.add_slide(BLANK)
    bg(s, C_EXEC)
    add_rect(s, 0, 3.1, 13.33, 1.3, C_INDIGO)
    add_text(s, label, 1.0, 3.15, 11.33, 1.0, 36, bold=True,
             color=C_WHITE, align=PP_ALIGN.CENTER)
    if sub:
        add_text(s, sub, 1.0, 4.6, 11.33, 0.6, 16, color=C_LGRAY,
                 align=PP_ALIGN.CENTER)
    return s

def bullet_card(slide, title, bullets, x, y, w, h,
                bg_color=C_DKGRAY, title_color=C_TEAL, bullet_size=11):
    add_rect(slide, x, y, w, h, bg_color)
    add_text(slide, title, x+0.15, y+0.12, w-0.3, 0.32,
             13, bold=True, color=title_color)
    body = "\n".join(f"• {b}" for b in bullets)
    add_text(slide, body, x+0.15, y+0.48, w-0.3, h-0.6,
             bullet_size, color=C_LGRAY, wrap=True)

def kpi_box(slide, value, label, x, y, val_color=C_GOLD):
    add_rect(slide, x, y, 2.8, 1.5, C_DKGRAY)
    add_text(slide, value, x+0.1, y+0.15, 2.6, 0.75, 30,
             bold=True, color=val_color, align=PP_ALIGN.CENTER)
    add_text(slide, label, x+0.1, y+0.9, 2.6, 0.5, 11,
             color=C_LGRAY, align=PP_ALIGN.CENTER)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — COVER
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s, C_EXEC)
add_rect(s, 0, 0, 0.12, 7.5, C_INDIGO)          # left stripe
add_rect(s, 0, 5.8, 13.33, 0.06, C_INDIGO)       # bottom rule

add_text(s, "⚡  AgentForge", 0.5, 1.2, 12.0, 1.4, 54,
         bold=True, color=C_WHITE)
add_text(s, "Enterprise AI Agent Platform", 0.5, 2.7, 10.0, 0.7, 26,
         color=C_INDIGO)
add_text(s, "Version 12  ·  July 2026", 0.5, 3.5, 8.0, 0.5, 16,
         color=C_LGRAY)
add_text(s, "Build · Deploy · Govern AI Agents at Enterprise Scale",
         0.5, 4.3, 11.0, 0.6, 18, italic=True, color=C_TEAL)
add_text(s, "CONFIDENTIAL — For Internal Use Only",
         0.5, 6.6, 12.0, 0.5, 10, color=C_MID, align=PP_ALIGN.CENTER)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — EXECUTIVE SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 1  ·  EXECUTIVE & ROI")
add_text(s, "Executive Summary", 0.5, 0.55, 12.0, 0.7, 32, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

bullets_l = [
    "AgentForge is a full-stack enterprise AI agent platform that lets teams build, deploy, and govern AI agents — without writing infrastructure from scratch.",
    "Agent Studio: create agents in minutes with multi-LLM support (GPT-4o, Gemini, Local).",
    "AI Architect: prompt → production-ready downloadable React + FastAPI codebase.",
    "Voice Agents: conversational AI with Azure Speech TTS/STT, persona & call recording.",
    "Marketplace: 21+ enterprise templates — HR, Finance, IT, Legal, Healthcare and more.",
]
bullets_r = [
    "Knowledge Bases: RAG + Graph KB with LLM entity extraction & interactive explorer.",
    "Visual Workflow Builder: drag-and-drop multi-agent pipelines with human-in-the-loop.",
    "Manager / Orchestrator Agents: route tasks across specialist sub-agents automatically.",
    "Safety & Guardrails: multi-layer content filtering, audit logs, traceability.",
    "Control Plane: real-time KPIs, version history, deployment gates.",
]
for i, b in enumerate(bullets_l):
    add_rect(s, 0.5, 1.5+i*1.0, 5.9, 0.85, C_DKGRAY)
    add_text(s, b, 0.65, 1.55+i*1.0, 5.65, 0.75, 10.5, color=C_LGRAY, wrap=True)
for i, b in enumerate(bullets_r):
    add_rect(s, 6.9, 1.5+i*1.0, 5.9, 0.85, C_DKGRAY)
    add_text(s, b, 7.05, 1.55+i*1.0, 5.65, 0.75, 10.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — THE PROBLEM
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 1  ·  EXECUTIVE & ROI")
add_text(s, "The Problem We Solve", 0.5, 0.55, 12.0, 0.7, 32, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

problems = [
    ("Fragmented Tooling", "Teams use 5+ disconnected tools: prompt IDEs, vector DBs, CI/CD, monitoring, voice APIs — none talk to each other."),
    ("Months to Production", "Building an AI agent from scratch takes 3–6 months of infra setup before any business logic is written."),
    ("No Governance", "Enterprises cannot audit what agents said, which model version ran, or why a decision was made — a compliance risk."),
    ("Skill Gap", "Most teams lack the ML + DevOps + cloud expertise needed to run agents reliably in production."),
    ("Cost Spiral", "Ad-hoc LLM usage has no cost visibility, no token budgeting, and no multi-model fallback strategy."),
    ("Voice Gap", "Building a production voice agent requires TTS, STT, endpointing, persona, and infra — weeks of effort."),
]
cols = [(0.5, 1.55), (4.65, 1.55), (8.8, 1.55),
        (0.5, 4.0),  (4.65, 4.0),  (8.8, 4.0)]
for i, (title, desc) in enumerate(problems):
    x, y = cols[i]
    add_rect(s, x, y, 3.85, 2.1, C_DKGRAY)
    add_rect(s, x, y, 3.85, 0.36, C_INDIGO)
    add_text(s, title, x+0.12, y+0.04, 3.6, 0.3, 12, bold=True, color=C_WHITE)
    add_text(s, desc, x+0.12, y+0.44, 3.6, 1.55, 10.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — PLATFORM AT A GLANCE
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 1  ·  EXECUTIVE & ROI")
add_text(s, "Platform at a Glance — 12 Capability Pillars",
         0.5, 0.55, 12.0, 0.7, 30, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

pillars = [
    ("🤖", "Agent Studio",     C_INDIGO),
    ("🎙️", "Voice Agents",     C_VIOLET),
    ("🏗️", "AI Architect",     C_TEAL),
    ("🛒", "Marketplace",      C_GREEN),
    ("📚", "Knowledge Bases",  C_GOLD),
    ("🔀", "Workflow Builder",  C_INDIGO),
    ("🧠", "Manager Agents",   C_VIOLET),
    ("🔬", "Evaluations",      C_TEAL),
    ("🛡️", "Safety Engine",    RGBColor(0xEF,0x44,0x44)),
    ("📊", "Control Plane",    C_GOLD),
    ("📝", "Prompt Library",   C_GREEN),
    ("👁️", "Observability",    C_INDIGO),
]
positions = [(0.4+i%4*3.2, 1.55+i//4*1.85) for i in range(12)]
for i, (icon, name, col) in enumerate(pillars):
    x, y = positions[i]
    add_rect(s, x, y, 2.85, 1.5, C_DKGRAY)
    add_rect(s, x, y, 2.85, 0.38, col)
    add_text(s, icon+" "+name, x+0.12, y+0.04, 2.6, 0.32, 13, bold=True, color=C_WHITE)
    add_text(s, "✓ Fully implemented", x+0.12, y+0.5, 2.6, 0.3, 9.5, color=C_GREEN)
    add_text(s, "✓ Production-ready", x+0.12, y+0.85, 2.6, 0.3, 9.5, color=C_LGRAY)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — C-SUITE ROI DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 1  ·  EXECUTIVE & ROI")
add_text(s, "C-Suite ROI Dashboard", 0.5, 0.55, 12.0, 0.7, 32, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_GOLD)

kpis = [
    ("80%", "Reduction in agent\nbuild time"),
    ("6×",  "Faster prototype\nto production"),
    ("$2M+","Estimated annual\ninfra savings"),
    ("100%","Audit trail on every\nagent interaction"),
]
for i, (val, lbl) in enumerate(kpis):
    kpi_box(s, val, lbl, 0.4+i*3.2, 1.6)

rows = [
    ("Agent Studio + Playground",    "3–6 months → 1–2 days",   "~$150K/agent saved",  "HIGH"),
    ("AI Architect Code Generator",  "8 weeks → 1 hour",         "~$80K per app",       "HIGH"),
    ("Voice Agents",                 "4 weeks → 30 min setup",   "~$50K per voice flow","HIGH"),
    ("Marketplace Templates",        "Instant reuse of 21 apps", "~$30K per template",  "MED"),
    ("Graph Knowledge Bases",        "Days of ETL → minutes",    "~$20K per KB",        "MED"),
    ("Safety & Audit Logs",          "Manual review → automated","Compliance risk ↓85%","HIGH"),
    ("Multi-LLM Flexibility",        "Vendor lock-in eliminated", "Cost optimised 30–60%","HIGH"),
    ("Manager/Orchestrator Agents",  "Sequential → parallel work","2–4× throughput",    "HIGH"),
]
headers = ["Feature / Capability", "Time-to-Value", "Estimated Saving", "Impact"]
col_x = [0.4, 4.2, 7.8, 11.2]
col_w = [3.6, 3.4, 3.2, 1.8]
add_rect(s, 0.4, 3.35, 12.5, 0.4, C_INDIGO)
for j, h in enumerate(headers):
    add_text(s, h, col_x[j]+0.1, 3.38, col_w[j], 0.34,
             10, bold=True, color=C_WHITE)
for i, row in enumerate(rows):
    bg_c = C_DKGRAY if i % 2 == 0 else C_MID
    add_rect(s, 0.4, 3.78+i*0.42, 12.5, 0.4, bg_c)
    for j, cell in enumerate(row):
        col = C_GOLD if j == 3 and cell == "HIGH" else C_LGRAY
        add_text(s, cell, col_x[j]+0.1, 3.8+i*0.42, col_w[j], 0.38,
                 9.5, color=col)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — BUSINESS VALUE & ROI NARRATIVE
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 1  ·  EXECUTIVE & ROI")
add_text(s, "Business Value & ROI Narrative", 0.5, 0.55, 12.0, 0.7, 32, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

cards = [
    ("💰 Cost Avoidance",
     ["Replaces 5+ point solutions (vector DB, TTS API, observability, CI/CD)", "Single platform licence vs. per-tool spend", "Self-hosted on Azure — no SaaS per-seat cost", "Estimated $500K–$2M avoided spend per year at enterprise scale"]),
    ("⚡ Speed to Market",
     ["Agent Studio: working agent in < 10 minutes", "AI Architect: full downloadable app in < 2 hours", "Marketplace: reuse 21 pre-built enterprise apps instantly", "Voice Agent: from zero to live call in 30 minutes"]),
    ("🛡️ Risk Reduction",
     ["Full audit trail: who ran what agent, which model, which output", "Safety guardrails block harmful / off-topic responses", "Version history + rollback on every agent", "RBAC: team roles control who can edit/deploy agents"]),
    ("📈 Revenue Enablement",
     ["Voice Agents unlock 24/7 customer engagement at near-zero marginal cost", "Knowledge Graph KB surfaces cross-domain insights impossible manually", "Manager Agents parallelize analyst work → faster business decisions", "Published Projects share AI apps with clients/partners"]),
]
for i, (title, pts) in enumerate(cards):
    x = 0.4 + (i % 2) * 6.4
    y = 1.6  + (i // 2) * 2.8
    add_rect(s, x, y, 6.1, 2.55, C_DKGRAY)
    add_rect(s, x, y, 6.1, 0.42, C_TEAL if i % 2 == 0 else C_INDIGO)
    add_text(s, title, x+0.15, y+0.05, 5.8, 0.34, 13, bold=True, color=C_WHITE)
    body = "\n".join(f"• {p}" for p in pts)
    add_text(s, body, x+0.15, y+0.52, 5.8, 1.9, 10.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 7 — COMPETITIVE POSITIONING
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 1  ·  EXECUTIVE & ROI")
add_text(s, "Competitive Positioning", 0.5, 0.55, 12.0, 0.7, 32, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

features = ["Agent Builder","Voice Agents","Code Generator","Graph KB",
            "Marketplace","Workflow Builder","Safety Engine","Local LLM","Audit Logs","Self-Hosted"]
competitors = ["AgentForge", "Lyzr", "LangChain", "AutoGen", "Flowise"]
col_colors = [C_INDIGO, C_MID, C_MID, C_MID, C_MID]

col_xs = [0.4, 4.2, 6.4, 8.3, 10.2, 11.8]
col_ws = [3.6, 2.0, 1.8, 1.8, 1.5, 1.35]

add_rect(s, 0.4, 1.55, 12.9, 0.4, RGBColor(0x1A, 0x25, 0x40))
for j, comp in enumerate(competitors):
    col = C_INDIGO if j == 0 else C_LGRAY
    add_text(s, comp, col_xs[j+1]+0.05, 1.58, col_ws[j+1], 0.34,
             11, bold=True, color=col, align=PP_ALIGN.CENTER)

matrix = [
    ["✅","⚠️","✅","✅","⚠️"],
    ["✅","❌","❌","❌","❌"],
    ["✅","❌","❌","❌","❌"],
    ["✅","❌","❌","❌","❌"],
    ["✅","❌","❌","❌","❌"],
    ["✅","⚠️","⚠️","❌","✅"],
    ["✅","⚠️","❌","❌","⚠️"],
    ["✅","❌","⚠️","✅","❌"],
    ["✅","❌","❌","❌","❌"],
    ["✅","❌","❌","❌","✅"],
]
for i, feat in enumerate(features):
    bg_c = C_DKGRAY if i % 2 == 0 else C_MID
    add_rect(s, 0.4, 1.98+i*0.48, 12.9, 0.46, bg_c)
    add_text(s, feat, 0.55, 2.01+i*0.48, 3.4, 0.42, 10.5, color=C_LGRAY)
    for j, mark in enumerate(matrix[i]):
        col = C_GREEN if mark == "✅" else (C_GOLD if mark == "⚠️" else RGBColor(0xEF,0x44,0x44))
        add_text(s, mark, col_xs[j+1]+0.05, 2.01+i*0.48, col_ws[j+1], 0.42,
                 13, color=col, align=PP_ALIGN.CENTER)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 8 — KPIs & SUCCESS METRICS
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 1  ·  EXECUTIVE & ROI")
add_text(s, "KPIs & Success Metrics", 0.5, 0.55, 12.0, 0.7, 32, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

metrics = [
    ("Agents Created",          "6+",     "Active in Studio",      C_INDIGO),
    ("Voice Agents Live",       "1",      "Azure TTS/STT wired",   C_VIOLET),
    ("Marketplace Templates",   "21+",    "Across 8 domains",      C_GREEN),
    ("API Modules",             "16",     "FastAPI routers",       C_TEAL),
    ("Frontend Pages",          "27",     "React SPA",             C_GOLD),
    ("KB Types Supported",      "2",      "Basic + Graph",         C_INDIGO),
    ("LLM Providers",           "3+",     "GPT, Gemini, Local",    C_TEAL),
    ("Workflow Steps",          "∞",      "Visual builder",        C_GREEN),
]
for i, (label, val, sub, col) in enumerate(metrics):
    x = 0.4 + (i % 4) * 3.2
    y = 1.6  + (i // 4) * 2.5
    add_rect(s, x, y, 3.0, 2.1, C_DKGRAY)
    add_rect(s, x, y+1.2, 3.0, 0.06, col)
    add_text(s, val,   x+0.15, y+0.15, 2.7, 0.9, 38, bold=True, color=col,    align=PP_ALIGN.CENTER)
    add_text(s, label, x+0.15, y+1.1,  2.7, 0.45, 11, bold=True, color=C_WHITE, align=PP_ALIGN.CENTER)
    add_text(s, sub,   x+0.15, y+1.55, 2.7, 0.4,  9.5, color=C_LGRAY, align=PP_ALIGN.CENTER)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 9 — PRODUCT ROADMAP
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 1  ·  EXECUTIVE & ROI")
add_text(s, "Product Roadmap", 0.5, 0.55, 12.0, 0.7, 32, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

phases = [
    ("✅ Delivered", "Jul 2026",
     ["Agent Studio + Playground","AI Architect Code Generator","Voice Agents (TTS/STT)","Marketplace 21+ templates","Graph Knowledge Bases","Manager/Orchestrator Agents","Visual Workflow Builder","Safety & Guardrails","Control Plane + Audit","Multi-LLM (GPT/Gemini/Local)"],
     C_GREEN),
    ("🔄 In Progress", "Aug 2026",
     ["Real-time voice WebSocket streaming","Hotel + Expense agent flows (Lyzr demo)","Architect V4 UI parity hardening","Graph KB edge-weight UI","Workflow conditional branching UI","Evaluation benchmark suites"],
     C_GOLD),
    ("🗓 Planned", "Q3–Q4 2026",
     ["Multi-tenant SaaS packaging","SSO (Azure AD / Okta)","Agent marketplace publishing","Fine-tuning pipeline integration","On-prem deployment guide","Mobile SDK for voice agents"],
     C_INDIGO),
    ("💡 Vision", "2027",
     ["Autonomous agent self-improvement","Cross-org agent collaboration","Regulated-industry compliance packs","Edge deployment (IoT/mobile)","Agent monetisation marketplace","Federated KB across orgs"],
     C_VIOLET),
]
for i, (phase, date, items, col) in enumerate(phases):
    x = 0.35 + i * 3.25
    add_rect(s, x, 1.55, 3.05, 5.6, C_DKGRAY)
    add_rect(s, x, 1.55, 3.05, 0.55, col)
    add_text(s, phase, x+0.12, 1.58, 2.8, 0.3, 12, bold=True, color=C_WHITE)
    add_text(s, date,  x+0.12, 1.88, 2.8, 0.25, 9.5, color=C_LGRAY)
    body = "\n".join(f"• {it}" for it in items)
    add_text(s, body, x+0.12, 2.2, 2.8, 4.8, 9.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 10 — LEADERSHIP NARRATIVE
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s, C_EXEC)
add_rect(s, 0, 0, 0.12, 7.5, C_GOLD)
add_text(s, '"', 0.6, 0.5, 1.0, 1.5, 72, color=C_INDIGO, bold=True)
add_text(s,
    "AgentForge is not another LLM wrapper.\n\n"
    "It is the operating system for enterprise AI — the layer that turns "
    "raw model capability into governed, auditable, production-grade business logic.\n\n"
    "Every agent built here is traceable, version-controlled, safe by default, "
    "and deployable in hours, not months.",
    1.3, 1.0, 10.5, 4.0, 18, color=C_WHITE, italic=True, wrap=True)
add_text(s, "— Why AgentForge Matters to the Enterprise",
         1.3, 5.3, 10.5, 0.5, 13, color=C_GOLD, italic=True)
add_rect(s, 0.5, 6.1, 12.0, 0.04, C_INDIGO)
add_text(s, "Build once · Govern always · Scale confidently",
         0.5, 6.25, 12.33, 0.5, 14, color=C_TEAL,
         align=PP_ALIGN.CENTER)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION DIVIDER — FEATURES
# ══════════════════════════════════════════════════════════════════════════════
divider_slide("SECTION 2  ·  PLATFORM FEATURES",
              "Agent Studio · Voice Agents · AI Architect · Marketplace · Knowledge Bases · Workflows · Safety")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 12 — AGENT STUDIO
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
add_text(s, "Agent Studio — Create, Configure & Deploy",
         0.5, 0.55, 12.0, 0.7, 30, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

bullet_card(s, "What It Does",
    ["Create AI agents in < 10 minutes with a guided form",
     "Name, persona, system prompt, LLM model selection",
     "Attach tools, knowledge bases, and sub-agents",
     "Version history — roll back any agent to any prior state",
     "Test in Playground before deploying to production"],
    0.4, 1.5, 4.1, 5.6, title_color=C_INDIGO)

bullet_card(s, "Filter & Discover",
    ["All / Agent / Managerial / Superflow / Voice Agents tabs",
     "Voice badge on agent cards — instant visual identification",
     "Start Call button on Voice Agents",
     "Quick Generate: describe an agent → auto-fill form",
     "Visual Builder: drag-and-drop configuration"],
    4.65, 1.5, 4.1, 5.6, title_color=C_TEAL)

bullet_card(s, "Agent Types",
    ["Agent — standard single-purpose (default)",
     "Managerial — orchestrates sub-agents",
     "Superflow — chained multi-step pipeline",
     "Voice Agent — real-time TTS/STT conversation",
     "Multi-LLM: GPT-4o · Gemini · Local (LM Studio)"],
    8.9, 1.5, 4.0, 5.6, title_color=C_VIOLET)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 13 — VOICE AGENTS (NEW)
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
label_chip(s, "NEW FEATURE", 10.8, 0.18, C_VIOLET)
add_text(s, "Voice Agents — Conversational AI with Azure Speech",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_VIOLET)

features_v = [
    ("🎤 Who Speaks First", "Choose whether the agent greets first or waits for the user to open the conversation."),
    ("⚙️ Engine Mode", "Real-time (live voice streaming) or Turn-based (send/receive text-to-speech)."),
    ("🗣️ Voice Picker", "22 Azure neural voices — male/female, multiple accents, emotion styles."),
    ("🌍 STT Language", "Speech-to-text language selection (English, Spanish, French, Hindi, and more)."),
    ("👤 Persona", "System prompt for the voice agent's personality — formal, friendly, expert, etc."),
    ("📹 Call Recording", "Toggle to record conversation sessions with full transcript."),
]
for i, (title, desc) in enumerate(features_v):
    x = 0.4  + (i % 3) * 4.3
    y = 1.55 + (i // 3) * 2.0
    add_rect(s, x, y, 4.0, 1.75, C_DKGRAY)
    add_rect(s, x, y, 4.0, 0.36, C_VIOLET)
    add_text(s, title, x+0.12, y+0.03, 3.76, 0.3, 12, bold=True, color=C_WHITE)
    add_text(s, desc,  x+0.12, y+0.44, 3.76, 1.2, 10.5, color=C_LGRAY, wrap=True)

add_rect(s, 0.4, 5.6, 12.5, 1.55, C_DKGRAY)
add_text(s, "Architecture: Azure Speech REST TTS → httpx POST → MP3 blob → browser Audio API",
         0.6, 5.68, 12.1, 0.4, 11, bold=True, color=C_TEAL)
add_text(s,
    "Custom-domain Azure endpoints use REST POST to /tts/cognitiveservices/v1 (SDK WebSocket path returns 404 on custom domains). "
    "Frontend play() error handling surfaces autoplay-blocked, session-expired, and Azure-key-missing errors with actionable messages. "
    "Play button disabled during audio playback to prevent overlapping TTS calls.",
    0.6, 6.1, 12.1, 0.9, 9.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 14 — AI ARCHITECT
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
add_text(s, "AI Architect — Prompt to Production Codebase",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

steps = [
    ("1  Describe", "Tell Architect what to build in plain English — app name, features, domain, tech stack."),
    ("2  Sandbox Preview", "Architect generates a live interactive HTML sandbox you can interact with immediately."),
    ("3  Iterate", "Chat with Architect to refine, add features, change the data model, or swap tech choices."),
    ("4  Download", "Download a fully-structured React + FastAPI project zip — deployable in < 5 minutes."),
    ("5  Review Pass", "V3 Reviewer checks: pipeline completeness, DB init, observability, Docker, model wiring."),
    ("6  Plan Completeness", "Verifies every declared agent method is wired; every pipeline stage actually runs."),
]
for i, (step, desc) in enumerate(steps):
    x = 0.4  + (i % 3) * 4.3
    y = 1.55 + (i // 3) * 2.3
    add_rect(s, x, y, 4.0, 2.0, C_DKGRAY)
    add_rect(s, x, y, 0.9, 2.0, C_TEAL)
    add_text(s, step, x+0.1, y+0.7, 0.75, 0.7, 11, bold=True, color=C_WHITE,
             align=PP_ALIGN.CENTER)
    add_text(s, desc, x+1.05, y+0.3, 2.85, 1.5, 10.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 15 — MARKETPLACE
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
add_text(s, "Marketplace — 21+ Enterprise App Templates",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_GREEN)

domains = [
    ("HR & People",     ["HR Policy Assistant","Onboarding Bot","Leave Manager"]),
    ("Finance",         ["Expense Analyzer","Budget Forecaster","Invoice Assistant"]),
    ("IT & DevTools",   ["IT Helpdesk","Code Reviewer","Incident Responder"]),
    ("Legal",           ["Contract Analyzer","Compliance Checker","NDA Assistant"]),
    ("Healthcare",      ["Patient FAQ","Triage Assistant","Drug Lookup"]),
    ("Analytics",       ["Data Insight Bot","KPI Narrator","Report Summarizer"]),
    ("Customer Ops",    ["Support Chatbot","CSAT Analyzer","Escalation Router"]),
    ("Research",        ["STORM Research Engine","Literature Summarizer","Hypothesis Generator"]),
]
for i, (domain, templates) in enumerate(domains):
    x = 0.35 + (i % 4) * 3.25
    y = 1.55 + (i // 4) * 2.8
    add_rect(s, x, y, 3.05, 2.5, C_DKGRAY)
    add_rect(s, x, y, 3.05, 0.38, C_GREEN)
    add_text(s, domain, x+0.12, y+0.04, 2.8, 0.3, 12, bold=True, color=C_WHITE)
    body = "\n".join(f"→ {t}" for t in templates)
    add_text(s, body, x+0.12, y+0.5, 2.8, 1.85, 10, color=C_LGRAY, wrap=True)

add_text(s, "Filters: Use Cases · Integrations · LLM Model · Free test-data handoff included",
         0.4, 7.15, 12.5, 0.3, 10, color=C_TEAL, italic=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 16 — KNOWLEDGE BASES
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
label_chip(s, "NEW: GRAPH KB", 10.1, 0.18, C_GOLD)
add_text(s, "Knowledge Bases — Basic RAG + Graph KB",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_GOLD)

bullet_card(s, "Basic RAG Knowledge Base",
    ["Upload PDF, DOCX, TXT, CSV — auto-chunked & embedded",
     "pgvector similarity search with relevance scoring",
     "Suggested questions generated from KB content",
     "Attach to any agent for grounded responses",
     "Supports multiple files per KB"],
    0.4, 1.55, 5.9, 5.55, title_color=C_GOLD)

bullet_card(s, "Graph Knowledge Base  (NEW)",
    ["LLM-powered entity & relationship extraction at ingest",
     "Nodes = entities, Edges = semantic relationships",
     "Interactive force-directed graph explorer in UI",
     "Cross-document knowledge synthesis",
     "Ideal for: org charts, legal precedents, research papers, product catalogs"],
    6.8, 1.55, 5.9, 5.55, title_color=C_GOLD)

add_rect(s, 0.4, 7.15, 12.5, 0.3, C_DKGRAY)
add_text(s, "Backend: pgvector (cosine) + NetworkX graph  ·  Frontend: D3 force layout",
         0.6, 7.17, 12.1, 0.26, 10, color=C_TEAL)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 17 — PROMPT LIBRARY + ORCHESTRATION PIPELINES
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
label_chip(s, "UPDATED", 10.8, 0.18, C_TEAL)
add_text(s, "Prompt Library + Orchestration Pipelines",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

bullet_card(s, "Prompt Library",
    ["Curated library of reusable system prompts",
     "Organised by domain: HR, Finance, Legal, IT, Research",
     "One-click apply to any agent in Agent Studio",
     "Import / export prompts across teams",
     "Tag, search, and version-control prompts"],
    0.4, 1.55, 5.9, 3.2, title_color=C_TEAL, bullet_size=11)

bullet_card(s, "Orchestration Pipelines  (ex-Blueprints)",
    ["Define multi-step agent pipelines declaratively",
     "STORM Research Engine: deep-research multi-agent flow",
     "Batch CSV upload: run pipeline over hundreds of inputs at once",
     "Chain: Research → Draft → Review → Publish in one click",
     "Visualise pipeline execution in Workflow Observability"],
    0.4, 4.95, 5.9, 2.6, title_color=C_TEAL, bullet_size=11)

bullet_card(s, "STORM Research Engine",
    ["Multi-agent deep research pipeline",
     "Perspective generation → expert interviews → synthesis",
     "Outputs: structured report + citations + knowledge graph",
     "Batch mode: upload CSV of topics → run overnight",
     "Used for: competitive analysis, due diligence, literature review"],
    6.8, 1.55, 5.9, 5.6, title_color=C_GOLD, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 18 — VISUAL WORKFLOW BUILDER
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
add_text(s, "Visual Workflow Builder — Multi-Agent Pipelines",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

bullet_card(s, "Drag-and-Drop Builder",
    ["Add nodes: Agent · Input · Output · Condition · Integration",
     "Connect nodes with directed edges (data flows)",
     "Conditional routing: if/else branching by LLM output",
     "Human-in-the-Loop: approval gates pause pipeline for review",
     "Load existing workflows from saved library"],
    0.4, 1.55, 3.9, 5.55, title_color=C_INDIGO, bullet_size=11)

bullet_card(s, "Execution & Monitoring",
    ["Run workflows with real input from the UI",
     "Step-by-step trace: see each agent's input/output",
     "Workflow Observability: full execution history + logs",
     "Error surfacing: failed steps highlighted with reason",
     "Re-run from any failed step"],
    4.55, 1.55, 3.9, 5.55, title_color=C_TEAL, bullet_size=11)

bullet_card(s, "Enterprise Integration Nodes",
    ["HTTP/REST: call any external API from a workflow",
     "Slack: post agent output to a channel",
     "Email: send structured reports automatically",
     "Database: read/write workflow state",
     "Custom: plug in any Python function as a node"],
    8.7, 1.55, 3.9, 5.55, title_color=C_VIOLET, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 19 — MANAGER / ORCHESTRATOR AGENTS
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
add_text(s, "Manager / Orchestrator Agents",
         0.5, 0.55, 12.0, 0.7, 30, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_VIOLET)

bullet_card(s, "What Is a Manager Agent?",
    ["A top-level agent that receives a high-level goal",
     "Decomposes it into sub-tasks and routes each to a specialist sub-agent",
     "Collects sub-agent outputs and synthesises a final answer",
     "Supports parallel execution of independent sub-tasks",
     "Full audit trail: manager + all sub-agent calls logged"],
    0.4, 1.55, 5.9, 3.5, title_color=C_VIOLET, bullet_size=11)

bullet_card(s, "Use Cases",
    ["Customer query → route to HR / Finance / IT agent automatically",
     "Research brief → parallel research agents per topic area",
     "Code review → security agent + style agent + test agent in parallel",
     "Travel booking → flight agent + hotel agent + expense agent",
     "Legal contract → clause extractor + risk scorer + summary agent"],
    6.8, 1.55, 5.9, 3.5, title_color=C_VIOLET, bullet_size=11)

bullet_card(s, "ROI Impact",
    ["2–4× throughput vs sequential single-agent flows",
     "Specialisation: each sub-agent prompt-tuned for its domain",
     "Zero orchestration code: configured in UI, no glue code needed",
     "Managerial agent type visible in Agent Studio filter tab"],
    0.4, 5.25, 12.3, 1.85, title_color=C_GOLD, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 20 — SAFETY & GUARDRAILS
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
add_text(s, "Safety Engine & Enterprise Guardrails",
         0.5, 0.55, 12.0, 0.7, 30, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, RGBColor(0xEF,0x44,0x44))

layers = [
    ("Layer 1 — Input Filtering",
     ["Blocks harmful, off-topic, or policy-violating inputs before LLM call",
      "Configurable keyword blocklists per agent",
      "PII detection and redaction mode"]),
    ("Layer 2 — Output Guardrails",
     ["Post-LLM content safety check on every response",
      "Hallucination risk scoring (grounding check vs KB)",
      "Confidence threshold gates — escalate when uncertain"]),
    ("Layer 3 — Audit & Traceability",
     ["Every agent call logged: user, agent, model, input, output, latency",
      "Control Plane audit log with timestamp and token count",
      "Immutable log — no delete, only append"]),
    ("Layer 4 — Access Control",
     ["JWT authentication on all API endpoints",
      "Role-based: Admin · Member · Viewer",
      "Team management: invite, role-change, remove members"]),
]
for i, (title, pts) in enumerate(layers):
    x = 0.4 + (i % 2) * 6.4
    y = 1.55 + (i // 2) * 2.75
    add_rect(s, x, y, 6.1, 2.5, C_DKGRAY)
    add_rect(s, x, y, 6.1, 0.38, RGBColor(0xEF,0x44,0x44))
    add_text(s, title, x+0.12, y+0.04, 5.85, 0.3, 12, bold=True, color=C_WHITE)
    body = "\n".join(f"• {p}" for p in pts)
    add_text(s, body, x+0.12, y+0.5, 5.85, 1.85, 10.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 21 — CONTROL PLANE & OBSERVABILITY
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
add_text(s, "Control Plane, Audit Logs & Workflow Observability",
         0.5, 0.55, 12.0, 0.7, 26, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_GOLD)

bullet_card(s, "Control Plane Dashboard",
    ["Real-time KPIs: agents created, runs today, avg latency, token spend",
     "Per-agent version history with one-click rollback",
     "Deployment gates: approve before promoting to production",
     "Organisation-wide usage across all team members",
     "Export audit log as CSV for compliance teams"],
    0.4, 1.55, 5.9, 5.55, title_color=C_GOLD, bullet_size=11)

bullet_card(s, "Workflow Observability",
    ["Full execution trace for every workflow run",
     "Step-level timing: see which node took longest",
     "Input/output captured at every node for debugging",
     "Filter by agent, date range, success/failure, user",
     "Link from Workflow Builder → live trace in one click"],
    6.8, 1.55, 5.9, 5.55, title_color=C_GOLD, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 22 — MULTI-LLM SUPPORT
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
add_text(s, "Multi-LLM Support — GPT · Gemini · Local",
         0.5, 0.55, 12.0, 0.7, 30, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

providers = [
    ("OpenAI GPT",
     ["GPT-4o, GPT-4o-mini, GPT-3.5-turbo",
      "Azure OpenAI endpoint support",
      "Function calling for tool-use agents",
      "Streaming responses in Playground"]),
    ("Google Gemini",
     ["gemini-2.5-flash-lite via AI Studio API",
      "Vertex AI blocked by Accenture IAM — AI Studio key used",
      "Flash-Lite: fast, cost-effective for high-volume agents",
      "Gemini 2.5 Pro available via model config"]),
    ("Local LLM (LM Studio)",
     ["Any GGUF model via LM Studio local server",
      "Offline operation — no internet required",
      "OpenAI-compatible API on localhost:1234",
      "Privacy-first: no data leaves the machine"]),
    ("Model Flexibility",
     ["Per-agent model selection in Agent Studio",
      "Per-feature model override (architect vs. agents)",
      "Active model indicator in UI header",
      "Fallback chain: Primary → Secondary → Local"]),
]
for i, (title, pts) in enumerate(providers):
    x = 0.4 + (i % 2) * 6.4
    y = 1.55 + (i // 2) * 2.8
    add_rect(s, x, y, 6.1, 2.55, C_DKGRAY)
    add_rect(s, x, y, 6.1, 0.38, C_TEAL)
    add_text(s, title, x+0.12, y+0.04, 5.85, 0.3, 13, bold=True, color=C_WHITE)
    body = "\n".join(f"• {p}" for p in pts)
    add_text(s, body, x+0.12, y+0.5, 5.85, 1.9, 10.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 23 — EVALUATIONS & SIMULATION
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 2  ·  FEATURES")
add_text(s, "Evaluations & Agent Simulation",
         0.5, 0.55, 12.0, 0.7, 30, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

bullet_card(s, "Agent Evaluations",
    ["Define test cases: input + expected output criteria",
     "Run batch evaluation across all test cases automatically",
     "Score: accuracy, relevance, safety, hallucination rate",
     "Compare scores across agent versions",
     "Export evaluation report for quality assurance"],
    0.4, 1.55, 5.9, 5.55, title_color=C_TEAL, bullet_size=11)

bullet_card(s, "Simulation Runner",
    ["Simulate multi-turn conversations end-to-end",
     "Inject test personas: skeptical customer, irate user, expert",
     "Stress-test edge cases before production deployment",
     "Latency benchmarking per model/prompt combination",
     "Results feed into Control Plane quality dashboard"],
    6.8, 1.55, 5.9, 5.55, title_color=C_TEAL, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION DIVIDER — ARCHITECTURE
# ══════════════════════════════════════════════════════════════════════════════
divider_slide("SECTION 3  ·  TECHNICAL ARCHITECTURE",
              "Tech Stack · Database · API Map · Frontend · Voice · Security · Setup")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 25 — PLATFORM ARCHITECTURE OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 3  ·  ARCHITECTURE")
add_text(s, "Platform Architecture Overview",
         0.5, 0.55, 12.0, 0.7, 30, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

# Three-tier diagram
layers_arch = [
    ("Frontend — React 18 SPA  (Vite + TypeScript + Tailwind)",
     "27 pages  ·  Axios API client  ·  React Router  ·  Recharts  ·  D3 Graph Explorer",
     C_INDIGO),
    ("Backend — FastAPI  (Python 3.11)",
     "16 API routers  ·  SQLAlchemy ORM  ·  Pydantic v2 schemas  ·  JWT auth  ·  httpx  ·  Azure SDK",
     C_TEAL),
    ("Data Layer — PostgreSQL 16 + pgvector",
     "Agents · Voice configs · KB documents · Vectors · Projects · Audit logs · Workflow runs",
     C_GOLD),
    ("AI / External Services",
     "Azure OpenAI (GPT-4o)  ·  Google AI Studio (Gemini)  ·  Azure Speech (TTS/STT)  ·  LM Studio (Local)  ·  Azure FLUX (Images)",
     C_VIOLET),
]
for i, (title, sub, col) in enumerate(layers_arch):
    y = 1.55 + i * 1.35
    add_rect(s, 0.4, y, 12.5, 1.15, C_DKGRAY)
    add_rect(s, 0.4, y, 0.18, 1.15, col)
    add_text(s, title, 0.7, y+0.1, 11.9, 0.38, 13, bold=True, color=col)
    add_text(s, sub, 0.7, y+0.52, 11.9, 0.55, 10.5, color=C_LGRAY, wrap=True)
    if i < 3:
        add_text(s, "▼", 6.3, y+1.18, 0.7, 0.25, 14, color=C_MID,
                 align=PP_ALIGN.CENTER)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 26 — TECHNOLOGY STACK
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 3  ·  ARCHITECTURE")
add_text(s, "Technology Stack", 0.5, 0.55, 12.0, 0.7, 32, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

categories = [
    ("Frontend",        ["React 18", "TypeScript", "Vite", "Tailwind CSS", "React Router v6", "Axios", "Recharts", "D3.js"]),
    ("Backend",         ["Python 3.11", "FastAPI", "SQLAlchemy 2.x", "Pydantic v2", "Alembic", "Uvicorn", "httpx", "python-pptx"]),
    ("Database",        ["PostgreSQL 16", "pgvector", "pg8000", "psycopg2"]),
    ("AI / LLM",        ["Azure OpenAI GPT-4o", "Google Gemini Flash", "LM Studio GGUF", "Azure FLUX.2-pro"]),
    ("Voice",           ["Azure Speech TTS", "Azure Speech STT", "REST API (httpx)", "MP3 streaming"]),
    ("Auth / Security", ["JWT (python-jose)", "Passlib bcrypt", "RBAC roles", "CORS middleware"]),
    ("DevOps",          ["Docker (planned)", "Vite proxy", "Uvicorn auto-reload", "Git worktrees"]),
    ("Testing",         ["pytest", "pytest-asyncio", "httpx test client", "Simulation runner"]),
]
for i, (cat, techs) in enumerate(categories):
    x = 0.35 + (i % 4) * 3.25
    y = 1.55 + (i // 4) * 2.8
    add_rect(s, x, y, 3.05, 2.5, C_DKGRAY)
    add_rect(s, x, y, 3.05, 0.38, C_TEAL)
    add_text(s, cat, x+0.12, y+0.04, 2.8, 0.3, 12, bold=True, color=C_WHITE)
    body = "\n".join(f"• {t}" for t in techs)
    add_text(s, body, x+0.12, y+0.5, 2.8, 1.85, 9.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 27 — DATABASE SCHEMA
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 3  ·  ARCHITECTURE")
add_text(s, "Database Schema — PostgreSQL 16 + pgvector",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_GOLD)

tables = [
    ("users",           ["id (PK)", "email UNIQUE", "hashed_password", "full_name", "role", "org_id", "created_at"]),
    ("agents",          ["id (PK)", "name", "description", "system_prompt", "model", "agent_type", "is_voice_agent", "voice_config JSONB", "tools JSONB", "version", "owner_id (FK)", "created_at"]),
    ("voice_configs",   ["id (PK)", "agent_id (FK)", "tts_voice", "stt_language", "engine_mode", "who_speaks_first", "persona", "call_recording", "speaking_rate", "pitch"]),
    ("knowledge_bases", ["id (PK)", "name", "description", "kb_type (basic|graph)", "owner_id (FK)", "created_at"]),
    ("kb_documents",    ["id (PK)", "kb_id (FK)", "filename", "content", "embedding VECTOR(1536)", "metadata JSONB"]),
    ("projects",        ["id (PK)", "title", "description", "visibility", "owner_id (FK)", "files JSONB", "shared_with JSONB", "created_at"]),
    ("audit_logs",      ["id (PK)", "user_id (FK)", "agent_id (FK)", "action", "input", "output", "model", "tokens", "latency_ms", "created_at"]),
    ("workflow_runs",   ["id (PK)", "workflow_id", "user_id (FK)", "steps JSONB", "status", "started_at", "finished_at"]),
]
for i, (table, cols) in enumerate(tables):
    x = 0.35 + (i % 4) * 3.25
    y = 1.55 + (i // 4) * 2.8
    add_rect(s, x, y, 3.05, 2.5, C_DKGRAY)
    add_rect(s, x, y, 3.05, 0.38, C_GOLD)
    add_text(s, table, x+0.12, y+0.04, 2.8, 0.3, 12, bold=True, color=C_NAVY)
    body = "\n".join(f"  {c}" for c in cols[:6])
    add_text(s, body, x+0.12, y+0.5, 2.8, 1.85, 8.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 28 — API MODULE MAP
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 3  ·  ARCHITECTURE")
add_text(s, "API Module Map — 16 FastAPI Routers",
         0.5, 0.55, 12.0, 0.7, 30, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

routers = [
    ("/api/auth",         "Login, register, JWT refresh, change password, /me"),
    ("/api/agents",       "CRUD, run, generate-from-prompt, suggest-input, active-model"),
    ("/api/voice",        "Agents list, status, voices, STT langs, synthesize, chat-text, configs, logs, traces"),
    ("/api/rag",          "KB CRUD, file upload, query, suggested-questions, graph data"),
    ("/api/architect",    "Chat, generate-project, extract-doc-text, sandbox-to-apptsx, generate-UI, version"),
    ("/api/projects",     "CRUD, visibility, trash, restore, permanent-delete, shared"),
    ("/api/control-plane","Stats, audit-logs, agent versions"),
    ("/api/simulation",   "Run batch test cases against an agent"),
    ("/api/evaluations",  "Create/run evals, score results, history"),
    ("/api/safety",       "Guardrail config, content filter rules"),
    ("/api/tools",        "Tool registry — list, register, test"),
    ("/api/builder",      "Visual workflow save/load/run"),
    ("/api/team",         "List, invite, role-update, remove"),
    ("/api/api-keys",     "List, create, delete API keys"),
    ("/api/prompt-library","List, create, update, delete prompts"),
    ("/api/marketplace",  "Template list, filter, handoff test data"),
]
for i, (route, desc) in enumerate(routers):
    y = 1.55 + i * 0.365
    bg_c = C_DKGRAY if i % 2 == 0 else C_MID
    add_rect(s, 0.4, y, 12.5, 0.345, bg_c)
    add_text(s, route, 0.55, y+0.03, 2.8, 0.3, 9.5, bold=True, color=C_TEAL)
    add_text(s, desc,  3.55, y+0.03, 9.2, 0.3, 9.5, color=C_LGRAY)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 29 — FRONTEND PAGE MAP
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 3  ·  ARCHITECTURE")
add_text(s, "Frontend Page Map — 27 Pages  ·  React SPA",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

sections_fe = [
    ("Core",          ["/studio (Agent Studio)", "/studio/create (Create Agent)", "/playground/:id", "/voice (Voice Agents)"]),
    ("AI Generation", ["/architect (Architect)", "/architect/home", "/builder (Visual Builder)", "/marketplace"]),
    ("Knowledge",     ["/knowledge-bases", "/prompts (Prompt Library)", "/what-to-build", "/evaluations"]),
    ("Projects",      ["/projects (My Projects)", "/published", "/shared", "/projects/:id"]),
    ("Governance",    ["/dashboard (Control Plane)", "/usage (Traceability)", "/workflow-runs (Observability)", "/safety"]),
    ("Admin",         ["/team (Team Members)", "/api-keys", "/settings", "/profile"]),
    ("Auth",          ["/login", "/approval (HITL Approval)"]),
]
for i, (sec, pages) in enumerate(sections_fe):
    x = 0.4  + (i % 4) * 3.25
    y = 1.55 + (i // 4) * 2.85
    add_rect(s, x, y, 3.05, 2.55, C_DKGRAY)
    add_rect(s, x, y, 3.05, 0.38, C_INDIGO)
    add_text(s, sec, x+0.12, y+0.04, 2.8, 0.3, 12, bold=True, color=C_WHITE)
    body = "\n".join(f"• {p}" for p in pages)
    add_text(s, body, x+0.12, y+0.5, 2.8, 1.9, 9.5, color=C_LGRAY, wrap=True)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 30 — VOICE ARCHITECTURE
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 3  ·  ARCHITECTURE")
add_text(s, "Voice Agent Architecture — Azure Speech Integration",
         0.5, 0.55, 12.0, 0.7, 26, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_VIOLET)

flow = [
    ("User Types", "Text input in Voice Chat UI"),
    ("POST /voice/chat-text", "Agent runs LLM call → text response"),
    ("POST /voice/synthesize", "Backend calls Azure TTS REST API via httpx"),
    ("Azure Speech", "Returns MP3 audio bytes"),
    ("Blob URL", "Frontend creates object URL from MP3 blob"),
    ("Audio API", "Browser plays audio  ·  play button disabled"),
]
for i, (step, desc) in enumerate(flow):
    x = 0.5 + i * 2.08
    add_rect(s, x, 1.6, 1.85, 2.2, C_DKGRAY)
    add_rect(s, x, 1.6, 1.85, 0.38, C_VIOLET)
    add_text(s, str(i+1), x+0.08, 1.63, 0.3, 0.3, 11, bold=True, color=C_WHITE)
    add_text(s, step, x+0.12, 1.63, 1.7, 0.3, 10, bold=True, color=C_WHITE)
    add_text(s, desc, x+0.12, 2.06, 1.7, 1.65, 9.5, color=C_LGRAY, wrap=True)
    if i < 5:
        add_text(s, "→", x+1.9, 2.55, 0.2, 0.3, 14, color=C_VIOLET, align=PP_ALIGN.CENTER)

bullet_card(s, "Error Handling",
    ["NotAllowedError: browser autoplay blocked → show message pointing to ▶ replay button",
     "503: Azure Speech key not configured → actionable message to add to .env",
     "401: session expired → redirect to login",
     "Play button disabled during playback → re-enabled on audio.onended"],
    0.4, 3.95, 5.9, 2.7, title_color=C_VIOLET, bullet_size=11)

bullet_card(s, "Custom Domain Note",
    ["Standard Azure regions: Speech SDK WebSocket works normally",
     "Custom-domain Cognitive Services (e.g. agentforgeai-resource.cognitiveservices.azure.com):",
     "  SDK converts https:// → wss:// → 404 on WebSocket path",
     "  Fix: httpx REST POST to /tts/cognitiveservices/v1 directly",
     "AZURE_SPEECH_ENDPOINT env var triggers REST path; absent = SDK path"],
    6.8, 3.95, 5.9, 2.7, title_color=C_GOLD, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 31 — DEVELOPER SETUP PART 1
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 3  ·  ARCHITECTURE")
add_text(s, "Developer Setup Guide — Part 1: Backend",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

# Prerequisites
add_rect(s, 0.4, 1.55, 12.5, 0.38, C_INDIGO)
add_text(s, "Prerequisites", 0.55, 1.58, 12.0, 0.3, 12, bold=True, color=C_WHITE)
prereqs = "Python 3.11+   ·   Node 18+   ·   PostgreSQL 16 + pgvector   ·   Git   ·   Azure account (for Speech + OpenAI)"
add_text(s, prereqs, 0.55, 2.0, 12.0, 0.38, 10.5, color=C_LGRAY)

steps_b = [
    ("1. Clone repo",         "git clone <repo>  &&  cd AgentForge"),
    ("2. Create venv",         "cd backend  &&  python -m venv venv  &&  venv\\Scripts\\activate"),
    ("3. Install deps",        "pip install -r requirements.txt"),
    ("4. Configure .env",      "Copy .env.example → .env  ·  Set OPENAI_API_KEY / GEMINI_API_KEY / AZURE_SPEECH_KEY / AZURE_SPEECH_ENDPOINT / DATABASE_URL"),
    ("5. Init database",       "alembic upgrade head   (runs all migrations including pgvector extension)"),
    ("6. Start backend",       "python start.ps1   OR   uvicorn app.main:app --reload --port 8000"),
    ("7. Verify",              "curl http://localhost:8000/api/architect/version  →  {\"version\":\"...\"}"),
]
for i, (step, cmd) in enumerate(steps_b):
    y = 2.5 + i * 0.62
    bg_c = C_DKGRAY if i % 2 == 0 else C_MID
    add_rect(s, 0.4, y, 12.5, 0.57, bg_c)
    add_text(s, step, 0.55, y+0.06, 2.6, 0.45, 10.5, bold=True, color=C_TEAL)
    add_text(s, cmd,  3.3,  y+0.06, 9.4, 0.45, 10,   color=C_LGRAY)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 32 — DEVELOPER SETUP PART 2
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 3  ·  ARCHITECTURE")
add_text(s, "Developer Setup Guide — Part 2: Frontend & Env Vars",
         0.5, 0.55, 12.0, 0.7, 26, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

steps_f = [
    ("1. Install deps",  "cd frontend  &&  npm install"),
    ("2. Start dev",     "npm run dev  →  http://localhost:5173  (proxied to :8000)"),
    ("3. Build prod",    "npm run build  →  dist/  (serve with nginx or Vite preview)"),
    ("4. Register",      "Open http://localhost:5173/login  →  Register first admin account"),
]
for i, (step, cmd) in enumerate(steps_f):
    y = 1.55 + i * 0.62
    bg_c = C_DKGRAY if i % 2 == 0 else C_MID
    add_rect(s, 0.4, y, 12.5, 0.55, bg_c)
    add_text(s, step, 0.55, y+0.06, 2.5, 0.42, 10.5, bold=True, color=C_TEAL)
    add_text(s, cmd,  3.2,  y+0.06, 9.5, 0.42, 10.5, color=C_LGRAY)

add_rect(s, 0.4, 4.1, 12.5, 0.38, C_INDIGO)
add_text(s, "Key Environment Variables (.env)", 0.55, 4.13, 12.0, 0.3, 12, bold=True, color=C_WHITE)
env_vars = [
    ("OPENAI_API_KEY",          "Azure OpenAI key",             C_LGRAY),
    ("OPENAI_API_BASE",         "Azure OpenAI endpoint URL",     C_LGRAY),
    ("GEMINI_API_KEY",          "Google AI Studio key",          C_LGRAY),
    ("AZURE_SPEECH_KEY",        "Azure Speech cognitive key",    C_LGRAY),
    ("AZURE_SPEECH_ENDPOINT",   "Custom domain endpoint (optional)", C_GOLD),
    ("AZURE_SPEECH_REGION",     "Region (e.g. eastus) — used if no endpoint", C_LGRAY),
    ("DATABASE_URL",            "postgresql://user:pass@host:5432/agentforge", C_LGRAY),
    ("SECRET_KEY",              "JWT signing secret — change in production",  RGBColor(0xEF,0x44,0x44)),
]
for i, (var, desc, col) in enumerate(env_vars):
    y = 4.56 + i * 0.36
    bg_c = C_DKGRAY if i % 2 == 0 else C_MID
    add_rect(s, 0.4, y, 12.5, 0.34, bg_c)
    add_text(s, var,  0.55, y+0.03, 3.6, 0.28, 9.5, bold=True, color=C_TEAL)
    add_text(s, desc, 4.3,  y+0.03, 8.5, 0.28, 9.5, color=col)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION DIVIDER — HOW TO USE
# ══════════════════════════════════════════════════════════════════════════════
divider_slide("SECTION 4  ·  HOW TO USE",
              "Step-by-step guides for all major features")

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 34 — HOW TO USE: AGENT STUDIO & VOICE AGENTS
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 4  ·  HOW TO USE")
add_text(s, "How To Use: Agent Studio & Voice Agents",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

bullet_card(s, "Create a Regular Agent",
    ["1. Go to Agent Studio → New Agent",
     "2. Enter Agent Name (e.g. 'HR Policy Bot')",
     "3. Write a system prompt describing the agent's role",
     "4. Select LLM model (GPT-4o / Gemini / Local)",
     "5. Click Save → agent appears in Studio grid",
     "6. Click Test → opens Playground with your agent"],
    0.4, 1.55, 5.9, 3.5, title_color=C_INDIGO, bullet_size=11)

bullet_card(s, "Create a Voice Agent",
    ["1. New Agent → enable 'Voice Agent' toggle",
     "2. Configure: Who Speaks First, Engine Mode",
     "3. Pick a voice from the 22 Azure neural voices",
     "4. Set STT language and write a persona prompt",
     "5. Toggle Call Recording if needed",
     "6. Save → appears with 🎙 Voice badge in Studio"],
    6.8, 1.55, 5.9, 3.5, title_color=C_VIOLET, bullet_size=11)

bullet_card(s, "Test Your Voice Agent",
    ["1. Agent Studio → Voice Agents tab → Start Call",
     "2. OR: navigate to Voice Agents page from sidebar",
     "3. Select your agent from the dropdown",
     "4. Type a message and press Send",
     "5. Click ▶ on any agent message to hear it (first interaction unblocks autoplay)",
     "6. Check Voice Chat logs for full call transcript"],
    0.4, 5.25, 12.3, 1.85, title_color=C_TEAL, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 35 — HOW TO USE: ARCHITECT & MARKETPLACE
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 4  ·  HOW TO USE")
add_text(s, "How To Use: AI Architect & Marketplace",
         0.5, 0.55, 12.0, 0.7, 28, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_TEAL)

bullet_card(s, "Build an App with Architect",
    ["1. Click Architect in sidebar → New session",
     "2. Describe your app: 'Build a legal contract analyzer with RAG and a dashboard'",
     "3. Architect generates a live interactive sandbox — click elements to test",
     "4. Chat to iterate: 'Add a PDF upload panel' / 'Change the sidebar to dark mode'",
     "5. Click Download → get a full React + FastAPI zip",
     "6. Reviewer V3 checks run automatically on download — fixes applied"],
    0.4, 1.55, 5.9, 3.8, title_color=C_TEAL, bullet_size=11)

bullet_card(s, "Use the Marketplace",
    ["1. Navigate to Marketplace in sidebar",
     "2. Filter by: Use Case (HR / Finance / IT) · Integration · LLM Model",
     "3. Click a template → see description, agent config, test data",
     "4. Click 'Use Template' → creates agent in Agent Studio",
     "5. Edit the agent persona and system prompt for your org",
     "6. Click Test → runs with included test data automatically"],
    6.8, 1.55, 5.9, 3.8, title_color=C_GREEN, bullet_size=11)

bullet_card(s, "Publish & Share a Project",
    ["1. Architect → Save to Projects after building",
     "2. My Projects → select project → Set Visibility → Published / Shared",
     "3. Add team members' emails for shared access",
     "4. Published Projects page: all org-wide published apps visible to team"],
    0.4, 5.55, 12.3, 1.6, title_color=C_INDIGO, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 36 — HOW TO USE: KNOWLEDGE BASES & WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 4  ·  HOW TO USE")
add_text(s, "How To Use: Knowledge Bases & Workflow Builder",
         0.5, 0.55, 12.0, 0.7, 26, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_GOLD)

bullet_card(s, "Create a Basic RAG KB",
    ["1. Knowledge Bases → New Knowledge Base → type: Basic",
     "2. Click Upload → add PDF / DOCX / TXT / CSV",
     "3. Files are chunked, embedded, stored in pgvector",
     "4. Test with Suggested Questions auto-generated from content",
     "5. Attach KB to an agent in Agent Studio → agent now cites KB"],
    0.4, 1.55, 5.9, 3.5, title_color=C_GOLD, bullet_size=11)

bullet_card(s, "Create a Graph KB (NEW)",
    ["1. Knowledge Bases → New Knowledge Base → type: Graph",
     "2. Upload documents — LLM extracts entities + relationships",
     "3. Open Graph Explorer → interactive D3 force diagram",
     "4. Click nodes to see entity details and related documents",
     "5. Attach to agent for cross-document knowledge synthesis"],
    6.8, 1.55, 5.9, 3.5, title_color=C_GOLD, bullet_size=11)

bullet_card(s, "Build a Workflow",
    ["1. Visual Builder → New Workflow",
     "2. Drag: Input node → Agent node(s) → Condition node → Output node",
     "3. Connect nodes with edges (drag from output port to input port)",
     "4. Add Human-in-the-Loop gate: Approval node pauses for review",
     "5. Click Run with test input → trace execution in Workflow Observability"],
    0.4, 5.25, 12.3, 1.85, title_color=C_INDIGO, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 37 — HOW TO USE: CONTROL PLANE & PLAYGROUND
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s)
section_badge(s, "SECTION 4  ·  HOW TO USE")
add_text(s, "How To Use: Playground, Control Plane & Prompt Library",
         0.5, 0.55, 12.0, 0.7, 25, bold=True, color=C_WHITE)
add_rect(s, 0.5, 1.35, 1.5, 0.04, C_INDIGO)

bullet_card(s, "Test in Playground",
    ["1. Agent Studio → select agent → Test button",
     "2. Playground opens with agent system prompt visible",
     "3. Type a message → see LLM response + latency",
     "4. Suggest Input: click to auto-generate a realistic test query",
     "5. Check Traceability → Usage page for full call log"],
    0.4, 1.55, 3.9, 5.55, title_color=C_INDIGO, bullet_size=11)

bullet_card(s, "Control Plane",
    ["1. Control Plane in sidebar → Dashboard tab",
     "2. View: total agents, runs today, avg latency, errors",
     "3. Audit Logs: filter by user/agent/date/status",
     "4. Versions: click any agent → see full version history",
     "5. Export: download CSV audit log for compliance"],
    4.55, 1.55, 3.9, 5.55, title_color=C_GOLD, bullet_size=11)

bullet_card(s, "Prompt Library & Pipelines",
    ["1. Prompt Library in sidebar",
     "2. Browse by domain or search",
     "3. Click 'Apply' to load into Agent Studio system prompt",
     "4. Orchestration Pipelines tab → pre-built multi-agent flows",
     "5. STORM Engine: enter topic → runs deep research pipeline",
     "6. Batch CSV: upload topics → runs overnight, downloads report"],
    8.7, 1.55, 3.9, 5.55, title_color=C_TEAL, bullet_size=11)

# ══════════════════════════════════════════════════════════════════════════════
# CLOSING SLIDE
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
bg(s, C_EXEC)
add_rect(s, 0, 0, 0.12, 7.5, C_INDIGO)
add_rect(s, 0, 7.4, 13.33, 0.1, C_INDIGO)

add_text(s, "⚡  AgentForge",    0.5, 1.5, 12.0, 1.0, 48, bold=True, color=C_WHITE)
add_text(s, "Build · Deploy · Govern AI Agents at Enterprise Scale",
         0.5, 2.65, 12.0, 0.6, 20, color=C_INDIGO)
add_text(s, "Version 12  ·  July 2026",
         0.5, 3.4, 12.0, 0.45, 14, color=C_LGRAY)

add_rect(s, 0.5, 4.1, 12.0, 0.04, C_MID)

add_text(s, "Questions?  Let's build.", 0.5, 4.4, 12.0, 0.65, 24,
         italic=True, color=C_TEAL, align=PP_ALIGN.CENTER)
add_text(s, "CONFIDENTIAL — For Internal Use Only",
         0.5, 6.9, 12.33, 0.4, 10, color=C_MID, align=PP_ALIGN.CENTER)

# ══════════════════════════════════════════════════════════════════════════════
# SAVE
# ══════════════════════════════════════════════════════════════════════════════
out = r"docs\AgentForge-PresentationV12.pptx"
prs.save(out)
print(f"Saved: {out}  ({len(prs.slides)} slides)")
