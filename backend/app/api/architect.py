import io
import json
import zipfile
import xml.etree.ElementTree as ET
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from openai import AzureOpenAI
from app.config import settings

router = APIRouter()

SYSTEM_PROMPT = """You are Planning Architect -- an expert AI solutions architect embedded inside AgentForge, an enterprise AI agent platform.

Your job is to help users plan, design, and architect AI-powered applications and agent systems. You are collaborative, precise, and ask smart clarifying questions before diving into a plan.

## Rules

**Phase 1 -- Clarification (FIRST response ONLY -- NEVER repeat this phase):**
When a user FIRST describes what they want to build (and there are NO prior questions in the conversation history), respond with a JSON object asking AT MOST 3 quick questions:
{
  "type": "questions",
  "message": "Great -- [1-2 sentence summary of what you understood]. Just 2-3 quick questions before I generate your plan:",
  "questions": [
    { "id": "q1", "text": "Question here?", "options": ["Option A", "Option B", "Option C"] },
    { "id": "q2", "text": "Question here?", "options": ["Option A", "Option B", "Option C"] }
  ]
}
STRICT RULES for Phase 1:
- Ask AT MOST 3 questions, ideally just 2.
- ONLY ask this ONE time per conversation. If you already asked questions in this conversation, you are FORBIDDEN from asking questions again.
- If the conversation history already contains a message of type "questions" from you, SKIP Phase 1 entirely and go directly to Phase 2.

**Phase 2 -- Plan Generation (after user answers questions OR if user gave enough detail upfront):**
IMMEDIATELY after the user responds to your clarifying questions (or if their initial prompt is detailed enough), generate a comprehensive plan. DO NOT ask more questions. Generate the plan NOW:
{
  "type": "plan",
  "message": "Drafted the full plan -- here is your architecture. Let me know what to refine.",
  "plan": {
    "summary": "One paragraph describing the overall system",
    "architecture": "2-3 paragraphs describing the technical architecture approach",
    "tech_stack": {
      "frontend": "React + TypeScript + Vite (default unless user specified otherwise)",
      "backend": "Python FastAPI (default unless user specified otherwise)",
      "database": "PostgreSQL with SQLAlchemy",
      "ai": "Azure OpenAI GPT-4o",
      "other": []
    },
    "agents": [
      { "name": "AgentName", "role": "What this agent does", "tools": ["tool1", "tool2"], "model": "gpt-4o" }
    ],
    "features": ["Feature 1 description", "Feature 2 description"],
    "api_endpoints": ["POST /api/endpoint -- description", "GET /api/endpoint -- description"],
    "database_schema": "Tables and their key fields as a text description",
    "deployment": "Deployment strategy and infrastructure notes",
    "phases": [
      { "phase": 1, "name": "Phase name", "tasks": ["Task 1", "Task 2", "Task 3"] }
    ]
  }
}

**Phase 3 -- Refinement:**
If the user asks follow-up questions or requests changes, respond with:
{
  "type": "message",
  "message": "Your helpful response here. If you update the plan, include the full updated plan object under 'plan' key."
}

## Critical Rules
- ALWAYS respond with valid JSON. No markdown fences, no extra text outside JSON.
- Default frontend: React + TypeScript + Vite. Default backend: Python FastAPI. Only change if user explicitly asks.
- Make agent names, features, and endpoints SPECIFIC to the user's actual use case -- never generic.
- If user says "like Lyzr" or "like AgentForge" -- describe a similar platform tailored to their domain.
- **MOST IMPORTANT**: You may ONLY ask questions ONCE per conversation. The moment the user has answered your questions (i.e., you see a user message after your "questions" response), you MUST generate the full plan immediately. NEVER ask another round of questions. NEVER say "a couple more questions". Generate the plan.
- If the conversation already has a {"type":"questions"} response from you, treat the next user message as final answers and output {"type":"plan",...} immediately.
"""


UI_GEN_PROMPT = """You are a world-class React engineer and enterprise UX designer. Generate a COMPLETE, self-contained, production-quality HTML application using React 18 + Tailwind CSS that perfectly matches the user's requirements.

MANDATORY CDN (always include all 4):
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>

==================================================
PHASE 1 -- UNDERSTAND THE REQUIREMENT
==================================================
Read the user's full prompt. Identify:
1. COMPANY: the organization name (e.g. "Loblaw", "Accenture", "TD Bank")
2. APP TYPE: what kind of application best serves this requirement

Choose the APP TYPE that best fits:
  CHATBOT     -> customer support, FAQ assistant, helpdesk, virtual agent, RAG chatbot
  DASHBOARD   -> analytics, metrics, KPIs, monitoring, reporting, charts
  DATA TABLE  -> CRUD listings, search + filter, inventory, employee records, manage
  WIZARD      -> multi-step onboarding, application form, intake process, step-by-step
  SCHEDULER   -> booking system, appointment manager, calendar, slots
  SEARCH APP  -> knowledge base search, document finder, product catalogue
  FORM APP    -> data entry form with validation, survey, feedback collector
  PORTAL      -> employee self-service, client portal, project dashboard

==================================================
PHASE 2 -- DESIGN SYSTEM (apply to ALL app types)
==================================================
Use these design tokens consistently:
  Primary:      #4f46e5  -- buttons, active states, links
  Primary Dark: #3730a3  -- hover states, header bg
  Surface:      #ffffff  -- cards, panels
  Background:   #f8fafc  -- page background
  Border:       #e2e8f0  -- card borders, dividers
  Text Primary: #0f172a  -- headings
  Text Body:    #334155  -- body text
  Text Muted:   #94a3b8  -- labels, metadata
  Success:      #10b981  -- green badges
  Warning:      #f59e0b  -- amber alerts
  Danger:       #ef4444  -- red errors

Typography: font-family: 'Inter', 'Segoe UI', system-ui, sans-serif
Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48px
Border radius: 8px cards, 6px inputs, 999px badges/pills
Shadows: 0 1px 3px rgba(0,0,0,0.1) cards, 0 4px 16px rgba(0,0,0,0.12) modals

==================================================
PHASE 3 -- BUILD THE APP (by type)
==================================================

--- IF APP TYPE = CHATBOT ---
Build a 3-panel enterprise support chatbot.

DATA STRUCTURES (ALL content derived 100% from user prompt and uploaded documents -- ZERO hardcoding):
const APP_CONFIG = {
  company: "",        // extracted company name from prompt
  appName: "",        // e.g. "Loblaw IT Support Centre" -- reflect actual domain
  primaryColor: "#4f46e5",
  welcomeMessage: "", // 2-3 sentence greeting specific to this company and domain
  agentName: "Support Agent",
  documents: [],      // ONLY list documents that were actually uploaded (real filenames, real sizes)
  topics: ["","","",""],  // 4 topic labels derived ONLY from the uploaded document content -- never hardcode
};

CRITICAL -- FAQ_DATA RULES (EXACTLY 10 ITEMS, ALL FULLY POPULATED from documents/domain):
  !! EVERY question MUST come from the uploaded document content or the real domain -- NO generic examples !!
  !! Cover all 4 topics (at least 2 questions per topic, 10 total) !!
  !! Each topic value in each item MUST exactly match one of the 4 APP_CONFIG.topics strings !!
  !! Each answer = 1-sentence direct reply + 4-6 step-by-step resolution steps from document content !!
  WRONG: NEVER write questions about AI, RAG, FAISS, embeddings, or technology internals
  WRONG: topic:"Topic1" is placeholder -- replace with the actual topic name string

const FAQ_DATA = [
  { id:1, question:"",  answer:"", steps:["","","",""], source:"", confidence:94, topic:"", related:["",""] },
  { id:2, question:"",  answer:"", steps:["","","",""], source:"", confidence:91, topic:"", related:["",""] },
  { id:3, question:"",  answer:"", steps:["","","",""], source:"", confidence:96, topic:"", related:["",""] },
  { id:4, question:"",  answer:"", steps:["","","",""], source:"", confidence:88, topic:"", related:["",""] },
  { id:5, question:"",  answer:"", steps:["","","",""], source:"", confidence:93, topic:"", related:["",""] },
  { id:6, question:"",  answer:"", steps:["","","",""], source:"", confidence:97, topic:"", related:["",""] },
  { id:7, question:"",  answer:"", steps:["","","",""], source:"", confidence:90, topic:"", related:["",""] },
  { id:8, question:"",  answer:"", steps:["","","",""], source:"", confidence:95, topic:"", related:["",""] },
  { id:9, question:"",  answer:"", steps:["","","",""], source:"", confidence:87, topic:"", related:["",""] },
  { id:10, question:"", answer:"", steps:["","","",""], source:"", confidence:92, topic:"", related:["",""] },
  // Fill every field above with real content from the uploaded documents
];

CRITICAL -- TOPIC_QUESTIONS RULES (MANDATORY -- enables Filter by Topic to work):
  For EACH of the 4 topics in APP_CONFIG.topics, write EXACTLY 10 questions from the actual document content.
  These are the questions that appear in the LEFT SIDEBAR when that topic filter button is clicked.
  Every question must come from the corresponding document section. Every question MUST be non-empty.

const TOPIC_QUESTIONS = {
  // Replace keys with actual topic names matching APP_CONFIG.topics exactly
  "Topic1": [
    { id:"t1_1", question:"", source:"" },
    { id:"t1_2", question:"", source:"" },
    { id:"t1_3", question:"", source:"" },
    { id:"t1_4", question:"", source:"" },
    { id:"t1_5", question:"", source:"" },
    { id:"t1_6", question:"", source:"" },
    { id:"t1_7", question:"", source:"" },
    { id:"t1_8", question:"", source:"" },
    { id:"t1_9", question:"", source:"" },
    { id:"t1_10", question:"", source:"" },
  ],
  "Topic2": [ /* 10 questions */ ],
  "Topic3": [ /* 10 questions */ ],
  "Topic4": [ /* 10 questions */ ],
  // Use the real topic name strings, not "Topic1","Topic2" etc.
};

DOC_SECTIONS array (MANDATORY when documents are provided -- populate from actual document content):
  Extract the key Q&A sections from the uploaded documents. Each entry is a heading + its body text.
  This enables the chatbot to answer questions directly from document content, not just canned FAQs.

const DOC_SECTIONS = [
  // !! MANDATORY: Read EVERY uploaded document provided in the UPLOADED DOCUMENTS block above.
  // For each major topic/question/heading you find, create one entry:
  //   { heading: "<the exact heading or question from the document>", body: "<the full answer text from that section>", source: "<the exact uploaded filename>" }
  // Use ONLY the filenames from the UPLOADED DOCUMENTS block as the source value — never invent filenames.
  // Aim for 15-30 entries covering all uploaded documents proportionally.
];

KEYWORD ENGINE (mandatory -- searches BOTH FAQ_DATA and DOC_SECTIONS with source-accurate matching):
function findAnswer(userInput, history = []) {
  // Normalize: lowercase, replace curly/smart apostrophes with straight, strip punctuation
  const norm = s => s.toLowerCase().replace(/[‘’‚‛′]/g,"’").replace(/[^a-z0-9\\s’]/g," ").replace(/\\s+/g," ").trim();
  // Expand short follow-up queries using context from last bot answer topic
  const lastBotMsg = [...history].reverse().find(m => m.role === "bot");
  const contextHint = lastBotMsg ? norm(lastBotMsg.source || "") + " " + norm(lastBotMsg.answer ? lastBotMsg.answer.slice(0,80) : "") : "";
  const rawNorm = norm(userInput);
  // If query is very short (<=3 words) and we have context, blend context keywords in
  const queryNorm = (rawNorm.split(" ").length <= 3 && contextHint.trim()) ? rawNorm + " " + contextHint : rawNorm;

  // PASS 1 -- near-exact heading match: query matches a DOC_SECTIONS heading from the uploaded documents
  // Returns immediately with the exact section from whichever document contains that heading
  for (const sec of DOC_SECTIONS) {
    const hNorm = norm(sec.heading);
    if (hNorm === queryNorm || hNorm.includes(queryNorm) || queryNorm.includes(hNorm)) {
      const lines = sec.body.replace(/[•–—]/g," ").split(/\\n|(?<=[.!?])\\s+/).map(l=>l.trim()).filter(l=>l.length>8);
      return {
        answer: lines[0] || sec.body.slice(0,200),
        steps: lines.slice(1,6).map((l,i)=>"Step "+(i+1)+": "+l),
        source: sec.source, confidence: 98,
        related: FAQ_DATA.slice(0,2).map(f=>f.question)
      };
    }
  }

  // Stop words: ONLY common grammatical/filler English words -- NEVER remove domain-specific terms
  const STOP = new Set(["what","when","where","which","who","how","why","can","does","will","did","the","and","for","are","was","not","you","your","have","has","had","from","with","this","that","these","those","been","being","should","would","could","please","tell","show","give","make","just","also","more","some","about","after","before","into","onto"]);
  // Accept >= 2 chars so short acronyms match
  const words = queryNorm.split(/\\s+/).filter(w => w.length >= 2 && !STOP.has(w));

  if (words.length === 0) {
    return {
      answer: "Please describe your issue using specific keywords.",
      steps: ["Step 1: Type specific keywords from your question.","Step 2: Click any of the Top 10 Questions in the left panel.","Step 3: Use the Filter by Topic buttons on the right to browse by category."],
      source: APP_CONFIG.documents[0]?.name, confidence: 0, related: APP_CONFIG.topics.slice(0,2)
    };
  }

  // PASS 2 -- score FAQ items
  const faqScored = FAQ_DATA.map(item => {
    const hay = norm(item.question + " " + item.answer + " " + item.steps.join(" ") + " " + item.topic);
    const score = words.reduce((a,w) => a + (hay.includes(w) ? 1 : 0), 0);
    return { type:"faq", item, score };
  });

  // PASS 2 -- score DOC_SECTIONS
  // Heading match weight = 5x body match (heading match means the section IS about this topic)
  const docScored = DOC_SECTIONS.map(sec => {
    const hNorm = norm(sec.heading);
    const bNorm = norm(sec.body);
    // Count distinct words matched in heading (5x) vs body (1x)
    const headScore = words.reduce((a,w) => a + (hNorm.includes(w) ? 5 : 0), 0);
    const bodyScore = words.reduce((a,w) => a + (bNorm.includes(w) ? 1 : 0), 0);
    return { type:"doc", sec, score: headScore + bodyScore };
  });

  const allScored = [...faqScored, ...docScored].sort((a,b) => b.score - a.score);

  if (allScored[0].score >= 1) {
    const best = allScored[0];
    if (best.type === "faq") return best.item;
    const sec = best.sec;
    const lines = sec.body.replace(/[•–—]/g," ").split(/\\n|(?<=[.!?])\\s+/).map(l=>l.trim()).filter(l=>l.length>8);
    return {
      answer: lines[0] || sec.body.slice(0,200),
      steps: lines.slice(1,6).map((l,i)=>"Step "+(i+1)+": "+l),
      source: sec.source,
      confidence: Math.min(68 + best.score * 4, 97),
      related: FAQ_DATA.filter(f=>f.topic===best.sec.heading.split(" ").slice(-1)[0]).slice(0,2).map(f=>f.question).concat(FAQ_DATA.slice(0,2).map(f=>f.question)).slice(0,2)
    };
  }

  return {
    answer: "I could not find a match in the knowledge base. Please try more specific keywords.",
    steps: [
      "Step 1: Use specific terms from your issue — try the exact keywords from the document topics.",
      "Step 2: Click a Top 10 Question in the left panel that is closest to your issue.",
      "Step 3: Use the Filter by Topic buttons on the right to browse all topics.",
      "Step 4: Contact " + APP_CONFIG.company + " support directly for urgent issues."
    ],
    source: APP_CONFIG.documents[0]?.name, confidence: 0, related: APP_CONFIG.topics.slice(0,2).map(t=>"Help with: "+t)
  };
}

3-PANEL LAYOUT (height:100vh, display:flex, overflow:hidden, position:"relative"):
!! ALL three panels must be direct flex children — LEFT SIDEBAR + MAIN AREA + RIGHT PANEL side by side !!
LEFT SIDEBAR (width:280px, minWidth:280px, background:#1e293b, color:#ffffff, display:flex, flexDirection:column, overflow:hidden):
  Top branding area (padding:20px 16px 16px, borderBottom:"1px solid rgba(255,255,255,0.1)"):
    Row: colored circle (40px, background:#4f46e5, borderRadius:50%, display:flex, alignItems:center, justifyContent:center, color:white, fontWeight:700, fontSize:16) + company initial
    App name: (fontSize:15, fontWeight:700, color:"#ffffff", marginLeft:10)
    Subtitle: (fontSize:11, color:"#94a3b8", marginLeft:10, marginTop:2)

  Scrollable question list (flex:1, overflowY:auto, padding:12px 10px):
    -- Active topic banner (shown only when a topic filter is active):
    IF activeTopic:
      <div style={{background:"rgba(79,70,229,0.2)", borderRadius:8, padding:"6px 10px", marginBottom:8, fontSize:11, color:"#a5b4fc", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <span>Showing: {activeTopic}</span>
        <button onClick={()=>setActiveTopic(null)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:11,fontWeight:700}}>Clear</button>
      </div>
    -- Section label:
    <div style={{fontSize:10, fontWeight:700, letterSpacing:"0.12em", color:"#64748b", textTransform:"uppercase", padding:"0 6px", marginBottom:8}}>
      {activeTopic ? activeTopic + " Questions" : "Top 10 Questions"}
    </div>

    !! CRITICAL: Iterate sidebarQuestions (NOT FAQ_DATA) so topic filter works !!
    sidebarQuestions.map((item, idx) => (
    <button
      key={item.id}
      onClick={() => handleSend(item.question)}
      style={{
        display:"flex", alignItems:"flex-start", gap:"10px", width:"100%",
        padding:"10px 10px", marginBottom:"4px", borderRadius:"8px",
        border:"none", cursor:"pointer", textAlign:"left",
        background: activeQuestion === item.question ? "rgba(79,70,229,0.9)" : "rgba(255,255,255,0.05)",
        transition:"background 0.15s ease"
      }}
    >
      <span style={{
        minWidth:"24px", height:"24px", borderRadius:"50%",
        background: activeQuestion === item.question ? "#ffffff" : "#4f46e5",
        color: activeQuestion === item.question ? "#4f46e5" : "#ffffff",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:"11px", fontWeight:"700", flexShrink:0, marginTop:"1px"
      }}>{idx + 1}</span>
      <span style={{
        fontSize:"13px", lineHeight:"1.5", color:"#ffffff",
        wordBreak:"break-word", whiteSpace:"normal", flex:1
      }}>{item.question}</span>
    </button>
    ))

MAIN AREA (flex:1, display:flex, flexDirection:column, minWidth:0, minHeight:0, overflow:hidden, background:#f8fafc):
  Header bar (background:#ffffff, borderBottom:"1px solid #e2e8f0", padding:"14px 20px", display:flex, alignItems:center, gap:12, boxShadow:"0 1px 3px rgba(0,0,0,0.06)"):
    App name (fontSize:17, fontWeight:700, color:#0f172a, flex:1)
    Green pill: (background:#dcfce7, color:#16a34a, fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:999) "● AI Active"
    Blue pill: (background:#dbeafe, color:#2563eb, fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:999) "● KB Connected"
    Avatar circle (36px, background:#4f46e5, borderRadius:50%, color:white, fontSize:13, fontWeight:700) showing initials

  Messages area (flex:1, overflowY:auto, padding:"20px", display:flex, flexDirection:column, gap:12):
    Welcome card (background:#ffffff, border:"1px solid #e2e8f0", borderRadius:12, padding:16, display:flex, gap:12):
      Bot avatar (40px circle, background:#4f46e5, color:white, fontSize:18, flexShrink:0) "🤖"
      Text: welcomeMessage (fontSize:14, color:#334155, lineHeight:1.6)

    USER message (alignSelf:flex-end, maxWidth:"72%"):
      Bubble (background:#4f46e5, color:#ffffff, borderRadius:"18px 18px 4px 18px", padding:"12px 16px", fontSize:14, lineHeight:1.5)
      Timestamp (fontSize:10, color:#94a3b8, textAlign:right, marginTop:4)

    BOT message (alignSelf:flex-start, maxWidth:"80%"):
      Card (background:#ffffff, border:"1px solid #e2e8f0", borderRadius:"4px 18px 18px 18px", padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.06)"):
        Answer text (fontSize:14, color:#1e293b, lineHeight:1.6, marginBottom:12, fontWeight:500)
        IF steps exist and steps.length > 0:
          Steps heading (fontSize:11, fontWeight:700, color:#475569, textTransform:uppercase, letterSpacing:"0.05em", marginBottom:8) "📋 Step-by-Step Resolution"
          Ordered list (margin:"0 0 12px 0", padding:"0 0 0 4px", listStyle:none):
            Each step: (display:flex, gap:8, marginBottom:6)
              Step number badge (20px circle, background:#f1f5f9, color:#475569, fontSize:10, fontWeight:700, flexShrink:0)
              Step text (fontSize:13, color:#334155, lineHeight:1.5)
        Meta bar (borderTop:"1px solid #f1f5f9", paddingTop:10, marginTop:4, display:flex, gap:16, flexWrap:wrap):
          Source text (fontSize:11, color:#94a3b8) "📎 {source}"
          Confidence (fontSize:11, color:#10b981, fontWeight:600) "✓ {confidence}%"
        IF related and related.length > 0:
          Related row (display:flex, gap:6, flexWrap:wrap, marginTop:8):
            Label (fontSize:11, color:#64748b) "💡 Related:"
            Each related: <button onClick={()=>handleSend(r)} style={{fontSize:11, background:#ede9fe, color:#4f46e5, border:"none", borderRadius:999, padding:"3px 10px", cursor:pointer}}>{r}</button>
      Timestamp (fontSize:10, color:#94a3b8, marginTop:4)

    Typing indicator (alignSelf:flex-start):
      Card (background:#ffffff, border:"1px solid #e2e8f0", borderRadius:"4px 18px 18px 18px", padding:"14px 18px"):
        3 dots: <span className="dot"></span><span className="dot"></span><span className="dot"></span>

  Footer (background:#ffffff, borderTop:"1px solid #e2e8f0", padding:"12px 16px", flexShrink:0):
    Input row (display:flex, gap:10, alignItems:flex-end, width:"100%", overflow:"visible"):
      textarea (flex:1, minWidth:0, resize:none, border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 14px", fontSize:14, color:#334155, outline:none, fontFamily:inherit, rows:2, placeholder:"Type your message...", onKeyDown: Enter without Shift = handleSend)
      MANDATORY SEND BUTTON — use this EXACT JSX, no substitutions:
      <button onClick={handleSend} style={{background:"#4f46e5",color:"#ffffff",border:"none",borderRadius:"10px",padding:"10px 20px",fontSize:"14px",fontWeight:600,cursor:"pointer",height:"44px",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:"6px",flexShrink:0,minWidth:"80px"}}>Send &#x27A4;</button>
      !! NEVER replace this with a microphone icon, SVG icon, or any icon-only button. The text "Send" with the arrow MUST always be fully visible on screen. !!
      !! textarea must have minWidth:0 so it shrinks and leaves room for the Send button !!
    Caption (fontSize:11, color:#94a3b8, textAlign:center, marginTop:8) "Powered by " + APP_CONFIG.company + " Knowledge Base · AI-Assisted Support"

RIGHT PANEL (width:260px, minWidth:260px, background:#ffffff, borderLeft:"1px solid #e2e8f0", display:flex, flexDirection:column, overflowY:auto):
  Section padding:16px
  "Knowledge Base" (fontSize:14, fontWeight:700, color:#0f172a, marginBottom:12) + badge (background:#4f46e5, color:white, borderRadius:999, fontSize:11, padding:"2px 8px") showing count

  Document list (display:flex, flexDirection:column, gap:8, marginBottom:20):
    Each doc card (background:#f8fafc, border:"1px solid #e2e8f0", borderRadius:8, padding:"10px 12px"):
      Row: type badge (PDF=background:#fee2e2,color:#dc2626 / DOCX=background:#dbeafe,color:#2563eb / TXT=background:#f3f4f6,color:#6b7280, fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:4)
      Filename (fontSize:12, fontWeight:500, color:#334155, marginTop:4, wordBreak:break-all)
      Row (display:flex, justifyContent:space-between, marginTop:4):
        Size (fontSize:11, color:#94a3b8)
        Indexed badge (fontSize:10, color:#16a34a, fontWeight:600) "✓ Indexed"

  Divider (borderTop:"1px solid #f1f5f9", margin:"4px 0 12px")
  "Session" heading (fontSize:12, fontWeight:700, color:#0f172a, marginBottom:8)
  Stats rows (fontSize:12, color:#64748b, display:flex, justifyContent:space-between, marginBottom:4):
    "Messages" : {msgCount}
    "Last Query" : {lastQueryTime or "--"}

  Divider (borderTop:"1px solid #f1f5f9", margin:"12px 0")
  "Filter by Topic" heading row (display:flex, justifyContent:space-between, alignItems:center, marginBottom:8):
    Label (fontSize:12, fontWeight:700, color:#0f172a) "Filter by Topic"
    IF activeTopic: <button onClick={()=>setActiveTopic(null)} style={{fontSize:10, color:#ef4444, background:"none", border:"none", cursor:"pointer", fontWeight:600}}>Clear x</button>
  APP_CONFIG.topics.map(topic =>
    // CLICKING a topic FILTERS the left sidebar to show TOPIC_QUESTIONS[topic]
    // It does NOT send a chat message -- it sets activeTopic state
    <button onClick={()=>setActiveTopic(activeTopic===topic ? null : topic)} style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      width:"100%", textAlign:"left", padding:"9px 12px", marginBottom:6,
      borderRadius:8, cursor:"pointer", fontWeight:500, fontSize:12, transition:"all 0.15s",
      border: activeTopic===topic ? "1px solid #4f46e5" : "1px solid #e2e8f0",
      background: activeTopic===topic ? "#ede9fe" : "#f8fafc",
      color: activeTopic===topic ? "#4f46e5" : "#334155"
    }}>
      <span>{topic}</span>
      <span style={{fontSize:10, background: activeTopic===topic?"#4f46e5":"#e2e8f0", color: activeTopic===topic?"#fff":"#64748b", borderRadius:999, padding:"1px 7px", fontWeight:700}}>
        {TOPIC_QUESTIONS[topic]?.length || 0}
      </span>
    </button>
  )

STATE:
const [messages, setMessages] = React.useState([{role:"bot", answer:APP_CONFIG.welcomeMessage, steps:[], source:"", confidence:null, related:[]}]);
const [input, setInput] = React.useState("");
const [isTyping, setIsTyping] = React.useState(false);
const [activeQuestion, setActiveQuestion] = React.useState(null);
const [activeTopic, setActiveTopic] = React.useState(null);
const [msgCount, setMsgCount] = React.useState(0);
const [lastQueryTime, setLastQueryTime] = React.useState(null);
// Keep last 6 messages as memory context for follow-up resolution
const conversationRef = React.useRef([]);
const messagesEndRef = React.useRef(null);

// Derived: which questions to show in the left sidebar
// If a topic filter is active -> show TOPIC_QUESTIONS[activeTopic] (10 topic-specific Qs)
// Otherwise -> show the default FAQ_DATA top-10
const sidebarQuestions = activeTopic && TOPIC_QUESTIONS[activeTopic]
  ? TOPIC_QUESTIONS[activeTopic]
  : FAQ_DATA;

function handleSend(text) {
  const q=(typeof text==="string"?text:input).trim(); if(!q||isTyping) return;
  setInput(""); setActiveQuestion(q); setLastQueryTime(new Date().toLocaleTimeString());
  const userMsg = {role:"user",text:q,ts:new Date().toLocaleTimeString()};
  setMessages(p=>[...p,userMsg]);
  // Maintain rolling 6-message memory window for context-aware follow-ups
  conversationRef.current = [...conversationRef.current, userMsg].slice(-6);
  setIsTyping(true);
  setTimeout(()=>{
    const r=findAnswer(q, conversationRef.current);
    const botMsg = {role:"bot",...r,ts:new Date().toLocaleTimeString()};
    setMessages(p=>[...p,botMsg]);
    conversationRef.current = [...conversationRef.current, botMsg].slice(-6);
    setIsTyping(false); setMsgCount(c=>c+1);
  }, 1200);
}
React.useEffect(()=>{ messagesEndRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,isTyping]);

CSS in <head> <style>:
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Inter',sans-serif; }
::-webkit-scrollbar { width:4px; }
::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }
@keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
.dot { width:8px;height:8px;background:#94a3b8;border-radius:50%;display:inline-block;margin:0 3px;animation:bounce 1.4s infinite; }
.dot:nth-child(2){animation-delay:.2s} .dot:nth-child(3){animation-delay:.4s}

--- IF APP TYPE = DASHBOARD ---
Build an analytics dashboard with:
- Top navbar: logo + company name + user avatar + notifications bell
- Left sidebar navigation (4-6 domain-specific nav items with icons)
- Main area: 4 KPI cards (domain-relevant metrics, large number + trend arrow up/down + sparkline) + 2 inline SVG charts (bar + line) + 1 data table
- KPI cards: white, border-left 4px colored accent, large number, trend indicator
- Charts: fully inline SVG, realistic data for domain, labeled axes
- Data table: 5-7 domain-relevant columns, 8-10 sample rows, striped, sortable headers
- Sidebar #1e293b, header white, cards white with shadow

--- IF APP TYPE = DATA TABLE ---
Build a full CRUD data management view:
- Search bar + multi-column filter dropdowns + Add New button
- Table: striped rows, sortable columns, checkbox multi-select, View/Edit/Delete per row
- Status badges as color-coded pills
- Pagination: prev/next + page numbers + X of Y results
- Modal for record detail/edit (React state toggled)
- All columns and data domain-relevant

--- IF APP TYPE = WIZARD ---
Build a multi-step form wizard:
- Progress bar showing step N of N with step names
- Each step: heading + description + 3-5 domain-specific form fields with labels
- Validation: required fields highlighted red on Next
- Back / Next / Submit buttons
- Final confirmation screen summarising all entered data

--- IF APP TYPE = SCHEDULER ---
Build an appointment/booking interface:
- Calendar grid (current month) with clickable dates
- Available time slots shown when date selected
- Booking form: name, contact, service type, notes
- Booked appointments list (5-6 sample entries) with status badges
- Confirmation dialog after booking

--- IF APP TYPE = SEARCH APP ---
Build a knowledge base search UI:
- Large hero search bar
- Search results as cards: title, snippet, source doc, relevance %, tags
- Left filter panel: category, date range, document type checkboxes
- Result cards expandable on click
- "No results" empty state with suggestions

--- IF APP TYPE = FORM APP ---
Build a data entry form:
- Logical field grouping with section headers
- Inline validation with error messages near fields
- Character counters for textareas
- Green/red border feedback as user types
- Submit button disables + shows spinner during submission
- Success confirmation screen

--- IF APP TYPE = PORTAL ---
Build a self-service portal:
- Personalized greeting header
- Quick-action tile grid (6-8 tiles, domain-specific actions)
- Sidebar navigation with nested menu
- Recent activity feed
- Notification badge in header

==================================================
PHASE 4 -- ENTERPRISE QUALITY STANDARDS
==================================================
ALL generated apps must have:
- Hover/active states on all interactive elements (transition:all 0.15s ease)
- Loading/disabled states on buttons during async simulation
- Empty states with helpful messages when lists are empty
- Realistic domain-specific data -- zero Lorem ipsum, zero "Item 1", zero generic placeholders
- Company branding in header (name + colored icon)
- Inter font loaded from Google Fonts

==================================================
FINAL OUTPUT RULES
==================================================
- Return ONLY raw HTML starting with <!DOCTYPE html>
- NO markdown fences, NO text before or after the HTML
- ALL content derived from the user's prompt -- zero generic placeholders
- Use inline styles + Tailwind classes -- fully self-contained, no external CSS
- The app must work on first render -- all state initialized, no undefined errors
"""


class DocContent(BaseModel):
    name: str
    text: str  # extracted plain text from the uploaded file


class GenerateUIRequest(BaseModel):
    app_name: str
    summary: str
    features: List[str]
    frontend: str = "React + TypeScript"
    app_type: str = "chatbot"
    domain: Optional[str] = None
    company: Optional[str] = None
    doc_types: Optional[List[str]] = None
    documents: Optional[List[DocContent]] = None  # actual uploaded doc content
    user_feedback: Optional[str] = None           # refinement instructions from follow-up chat


class ChatMessage(BaseModel):
    role: str
    content: str


class ArchitectChatRequest(BaseModel):
    messages: List[ChatMessage]
    tech_stack_override: Optional[dict] = None


def _extract_docx_text(raw: bytes) -> str:
    """Extract plain text from a .docx (ZIP of XML) without needing python-docx at import time."""
    try:
        ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            with z.open("word/document.xml") as f:
                tree = ET.parse(f)
        root = tree.getroot()
        paragraphs = []
        for para in root.iter(f"{ns}p"):
            texts = [node.text or "" for node in para.iter(f"{ns}t")]
            line = "".join(texts).strip()
            if line:
                paragraphs.append(line)
        return "\n".join(paragraphs)
    except Exception:
        return ""


def _extract_pdf_text(raw: bytes) -> str:
    """Extract plain text from PDF bytes using pypdf (if installed) or pdfplumber fallback."""
    try:
        import pypdf  # type: ignore
        reader = pypdf.PdfReader(io.BytesIO(raw))
        pages = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                pages.append(t.strip())
        return "\n\n".join(pages)
    except ImportError:
        pass
    try:
        import pdfplumber  # type: ignore
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
        return "\n\n".join(p for p in pages if p.strip())
    except ImportError:
        pass
    # Last resort: return empty rather than binary garbage
    return ""


# File extensions that are valid RAG knowledge-base documents
_RAG_EXTENSIONS = {".docx", ".pdf", ".txt", ".md", ".csv", ".json"}
# Image / media extensions that must never be used as RAG source
_SKIP_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg",
                    ".mp4", ".mp3", ".wav", ".zip", ".exe"}


@router.post("/extract-doc-text")
async def extract_doc_text(file: UploadFile = File(...)):
    """Extract plain text from a document file for RAG.
    Images and other non-document files return an empty string so they are
    silently excluded from the knowledge base.
    """
    raw = await file.read()
    fname = (file.filename or "").lower()
    ext = "." + fname.rsplit(".", 1)[-1] if "." in fname else ""

    # Reject non-document files — return empty so the frontend can filter them out
    if ext in _SKIP_EXTENSIONS or ext not in _RAG_EXTENSIONS:
        return {"filename": file.filename, "text": "", "skipped": True,
                "reason": f"{ext or 'unknown'} files are not used as RAG documents"}

    if ext == ".docx":
        text = _extract_docx_text(raw)
    elif ext == ".pdf":
        text = _extract_pdf_text(raw)
    else:
        # .txt / .md / .csv / .json — plain UTF-8
        text = raw.decode("utf-8", errors="ignore")

    # Keep up to 12 000 chars per doc (≈ 3 000 tokens) — enough for thorough Q&A extraction
    return {"filename": file.filename, "text": text[:12000], "skipped": False}


@router.post("/generate-ui", response_model=None)
async def generate_ui(req: GenerateUIRequest):
    client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
        timeout=180.0,
    )

    company = req.company or req.app_name.split()[0]
    domain = req.domain or req.summary[:80]
    doc_types = req.doc_types or ["DOCX", "PDF"]
    features_text = "\n".join(f"- {f}" for f in req.features[:10])

    # Detect app type from prompt keywords — CHATBOT checked FIRST to prevent false matches
    prompt_lower = (req.summary + " " + req.app_name).lower()
    if any(k in prompt_lower for k in ["chatbot", "chat bot", "support bot", "virtual agent", "rag", "faq",
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
    else:
        detected_type = "CHATBOT"

    # Build document section — use real extracted content when available
    if req.documents:
        # Only include real text documents — skip images and anything with no extracted text
        rag_docs = [d for d in req.documents if d.text and d.text.strip()]
        doc_names = [d.name for d in rag_docs]
        doc_content_block = "\n\n".join(
            f"=== {d.name} ===\n{d.text[:8000]}" for d in rag_docs
        )
        doc_instruction = f"""
UPLOADED DOCUMENTS (use these as the ONLY source for ALL content):
Document filenames (show EXACTLY these in APP_CONFIG.documents): {doc_names}

{doc_content_block}

CRITICAL RULES when documents are provided:
- APP_CONFIG.documents MUST list EXACTLY these files: {doc_names}
- FAQ_DATA: every question/answer MUST be derived from the document content above — no invented or generic questions
- DOC_SECTIONS: MANDATORY — read every section of EVERY document above and extract one entry per major heading/topic.
  Each entry format: {{ heading: "<exact heading from document>", body: "<full answer from that section>", source: "<exact filename from {doc_names}>" }}
  Use ONLY the filenames listed in {doc_names} as the source value — never invent or substitute filenames.
  Aim for 15-30 entries spread proportionally across all uploaded documents.
- Topics must reflect what the uploaded documents actually cover — derive them from the document content
- NEVER use placeholder, generic, or hardcoded content — 100% of all FAQ/DOC_SECTIONS/TOPIC_QUESTIONS data must come from the documents above
"""
    else:
        doc_instruction = f"""
If building a CHATBOT:
  - FAQ questions = what a REAL {company} end user/agent asks about their product/service/policy
  - NEVER write questions about AI technology, RAG, FAISS, embeddings, or how the app works
  - Topics = practical support categories relevant to the domain
  - DOC_SECTIONS = [] (empty array, no documents provided)
"""

    user_prompt = f"""Build a production-quality enterprise {detected_type} application for this requirement:

REQUIREMENT
-----------
Title: {req.app_name}
Company: {company}
Domain: {domain}
Summary: {req.summary}
Document types: {', '.join(doc_types)}
App type: {detected_type}

Key features to include:
{features_text}

CONTENT RULES
-------------
- Every label, heading, and data value must reflect {company} and the {domain} domain
- Company name "{company}" must appear in the header/branding
- All sample data, questions, field names = realistic for {domain}
{doc_instruction}

If building a DASHBOARD:
  - KPIs and charts must use {domain}-relevant metrics with realistic numbers
  - Table data must be domain-specific records with real-looking names and values

If building a WIZARD or FORM:
  - Field labels, options, and validation messages must be domain-specific
  - Confirmation screen summarises actual entered data

Generate the complete working HTML now.
Return ONLY raw HTML starting with <!DOCTYPE html> -- no markdown fences, no explanation."""

    # If the user sent feedback/refinement comments after the initial generation,
    # inject them as an additional instruction so the new sandbox incorporates the changes.
    feedback_block = ""
    if req.user_feedback and req.user_feedback.strip():
        feedback_block = f"""

USER REFINEMENT REQUEST (apply these changes to this generation):
{req.user_feedback.strip()}

Incorporate ALL of the above changes while keeping everything else from the original specification intact.
"""

    messages_payload = [
        {"role": "system", "content": UI_GEN_PROMPT},
        {"role": "user", "content": user_prompt + feedback_block},
    ]

    response = client.chat.completions.create(
        model=settings.azure_openai_deployment_gpt4o,
        messages=messages_payload,
        temperature=0.7,
        max_tokens=8000,
    )

    html = response.choices[0].message.content or ""
    html = html.strip()

    if html.startswith("```"):
        parts = html.split("```")
        if len(parts) >= 3:
            html = parts[1]
        else:
            html = parts[-1]
        first_newline = html.find("\n")
        if first_newline != -1:
            lang_tag = html[:first_newline].strip()
            if lang_tag.isalpha():
                html = html[first_newline + 1:]

    html = html.strip()
    return {"html": html}


@router.post("/chat")
async def architect_chat(req: ArchitectChatRequest):
    client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
    )

    conversation = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in req.messages:
        conversation.append({"role": m.role, "content": m.content})

    response = client.chat.completions.create(
        model=settings.azure_openai_deployment_gpt4o,
        messages=conversation,
        temperature=0.7,
        max_tokens=3000,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"type": "message", "message": raw}

    return parsed
