# Architect Dynamic ZIP Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RAG Scaffold and Custom Code ZIP downloads dynamic — matching the sandbox preview, fixing API field mismatches, and generating plan-specific UIs for non-RAG apps.

**Architecture:** All changes are in one file — `frontend/src/pages/Architect.tsx`. Four targeted edits: (1) a RAG-detection helper + conditional button, (2) three bug fixes inside `buildRagScaffoldZip`, (3) full rewrite of `sandbox.html` template to match the 5-page React layout, (4) a new `buildDynamicAppTsx()` function used by `buildSourceZip` for non-RAG plans.

**Tech Stack:** TypeScript, React, JSZip, Tailwind CDN (in generated sandbox.html), FastAPI (in generated backend files)

---

## File Map

| File | Change |
|---|---|
| `frontend/src/pages/Architect.tsx` | All 4 fixes — isRagPlan helper, RAG ZIP bugs, sandbox.html rewrite, buildDynamicAppTsx |

---

### Task 1: Add `isRagPlan()` helper + conditional RAG Scaffold button

**Files:**
- Modify: `frontend/src/pages/Architect.tsx` — add helper near `extractAppTitle`, update button JSX at ~line 2770

- [ ] **Step 1: Add `isRagPlan` helper after `extractAppTitle`**

Find the line:
```typescript
// ─── RAG Scaffold ZIP — proven RAGChatbot pattern, app name injected ──────────
```

Insert this function immediately BEFORE that comment block:

```typescript
// ─── Detect whether a plan is RAG/document-based ─────────────────────────────

function isRagPlan(plan: Plan): boolean {
  const haystack = [
    plan.summary,
    plan.tech_stack?.ai ?? "",
    plan.tech_stack?.backend ?? "",
    ...(plan.features ?? []),
    ...(plan.agents?.map(a => a.role + " " + a.tools.join(" ")) ?? []),
  ].join(" ").toLowerCase();
  return /\b(rag|faiss|embedding|vector store|knowledge base|document|retrieval|pgvector|chroma|pinecone|weaviate|semantic search|kb)\b/.test(haystack);
}
```

- [ ] **Step 2: Conditionally render RAG Scaffold button**

Find in JSX (~line 2770):
```tsx
          {/* RAG Scaffold download — instant, proven pattern */}
          <button
            onClick={downloadRagScaffold}
```

Replace with:
```tsx
          {/* RAG Scaffold download — only shown for RAG/doc-based plans */}
          {isRagPlan(plan) && (
          <button
            onClick={downloadRagScaffold}
            disabled={downloadingRag || downloadingCustom}
            title="Instant download — proven RAGChatbot scaffold with app name injected"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {downloadingRag ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            {downloadingRag ? "Packaging…" : "⬇ RAG Scaffold"}
          </button>
          )}
```

- [ ] **Step 3: Verify — open AgentForge at localhost:5175/architect, generate a plan for a non-RAG idea (e.g. "Build a hospital appointment system"). The RAG Scaffold button should NOT appear. Generate a RAG plan ("Build a support chatbot with documents") — button should appear.**

---

### Task 2: Fix three bugs in `buildRagScaffoldZip`

**Files:**
- Modify: `frontend/src/pages/Architect.tsx` — inside `buildRagScaffoldZip` function

**Bug A — `chat.py` uses `message` field but React sends `question`**

- [ ] **Step 1: Find and replace the `chat.py` template string**

Find (~line 1342):
```typescript
  zip.file("backend/app/api/chat.py", `from fastapi import APIRouter
from pydantic import BaseModel
from app import rag

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    session_id: str = ""

@router.post("/chat")
async def chat(req: ChatRequest):
    result = rag.answer(req.message)
    return result
`);
```

Replace with:
```typescript
  zip.file("backend/app/api/chat.py", `from fastapi import APIRouter
from pydantic import BaseModel
from app import rag

router = APIRouter()

class ChatRequest(BaseModel):
    question: str = ""
    message: str = ""   # legacy alias
    workspace_id: int = 1
    session_id: str = ""

@router.post("/chat")
async def chat(req: ChatRequest):
    text = req.question or req.message
    if not text:
        return {"answer": "Please provide a question.", "source": "N/A", "confidence": 0}
    result = rag.answer(text)
    return result
`);
```

**Bug B — vite proxy points to wrong port (8001 instead of 8000)**

- [ ] **Step 2: Fix the vite.config.ts template**

Find (~line 1274):
```typescript
  zip.file("frontend/vite.config.ts", `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()], server: { proxy: { "/api": { target: "http://localhost:8001", changeOrigin: true } } } });\n`);
```

Replace with:
```typescript
  zip.file("frontend/vite.config.ts", `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()], server: { proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } } } });\n`);
```

**Bug C — README says port 8000 but should match vite proxy**

- [ ] **Step 3: Verify README already says 8000**

Find (~line 1427):
```
uvicorn main:app --reload --port 8000
```
This is already correct — no change needed.

- [ ] **Step 4: Smoke test — download RAG Scaffold ZIP for a Loblaw chatbot plan, unzip, check `frontend/vite.config.ts` shows `8000`, check `backend/app/api/chat.py` has `question` field.**

---

### Task 3: Rewrite `sandbox.html` in RAG ZIP to match 5-page React layout

**Files:**
- Modify: `frontend/src/pages/Architect.tsx` — replace the entire `zip.file("sandbox.html", ...)` block inside `buildRagScaffoldZip`

The current sandbox.html is the OLD 3-panel layout (w-52 sidebar, Documents list, Suggested, Topic chips). Replace it with the 5-page layout matching `ragAppTsx` exactly.

- [ ] **Step 1: Replace the sandbox.html template**

Find from:
```typescript
  // ── sandbox.html — rich 3-panel chat UI, calls http://localhost:8000 ────────
  zip.file("sandbox.html", `<!doctype html>
```
...all the way to the closing:
```typescript
</html>`);
```

Replace the entire block with:

```typescript
  // ── sandbox.html — 5-page layout matching React App.tsx exactly ─────────────
  zip.file("sandbox.html", `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${appTitle}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  *{box-sizing:border-box}body{margin:0;font-family:'Inter','Segoe UI',sans-serif}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#94a3b8;animation:bounce 1.2s infinite ease-in-out}
  .dot:nth-child(2){animation-delay:.14s}.dot:nth-child(3){animation-delay:.28s}
  @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
  .page{display:none}.page.active{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
  #chat-messages{display:flex;flex-direction:column;gap:12px}
</style>
</head>
<body class="flex h-screen overflow-hidden bg-gray-100">

<!-- LEFT SIDEBAR -->
<aside class="w-64 bg-slate-800 text-white flex flex-col flex-shrink-0">
  <div class="p-4 border-b border-white/10">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-base" id="avatar-letter">A</div>
      <div class="min-w-0"><p class="text-sm font-bold leading-tight truncate" id="app-title-sidebar">${appTitle}</p><p class="text-xs text-slate-400 leading-tight">Document-aware support</p></div>
    </div>
  </div>
  <nav class="p-3 border-b border-white/10 space-y-0.5" id="nav-links"></nav>
  <div class="flex-1 overflow-y-auto p-3">
    <p class="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 px-1">Top 10 Questions</p>
    <div id="top-questions"></div>
  </div>
</aside>

<!-- MAIN CONTENT -->
<div class="flex-1 flex flex-col min-w-0 overflow-hidden" id="main-area">

  <!-- CHAT PAGE -->
  <div class="page active" id="page-chat">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">💬</span><p class="flex-1 text-base font-bold text-slate-900">Support Chat</p>
      <span class="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">● AI Active</span>
      <span class="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">● KB Connected</span>
      <span class="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">FAISS RAG · Azure OpenAI</span>
    </header>
    <div class="flex-1 overflow-y-auto p-5 bg-slate-50" id="chat-scroll">
      <div id="chat-messages">
        <div class="flex justify-start">
          <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-xl">
            <p class="text-sm text-slate-800 leading-relaxed">Hello! I'm your AI assistant for <strong>${appTitle}</strong>. Upload documents and ask me anything.</p>
            <p class="text-[10px] text-slate-400 mt-1">System</p>
          </div>
        </div>
      </div>
    </div>
    <div id="typing-ind" class="hidden px-5 pb-1"><div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 inline-flex gap-1.5 shadow-sm"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div>
    <div class="bg-white border-t border-slate-200 p-3.5 flex-shrink-0">
      <div class="flex gap-2.5 items-end mb-2">
        <textarea id="msg-input" rows="2" placeholder="Ask a question…" class="flex-1 resize-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"></textarea>
        <button id="send-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-sm font-semibold h-[44px] transition-colors">Send ➤</button>
      </div>
      <div id="quick-suggestions" class="flex flex-wrap gap-1.5 mb-2"></div>
      <p class="text-xs text-slate-400 text-center">Powered by Knowledge Base · FAISS RAG · Azure OpenAI</p>
    </div>
  </div>

  <!-- SUGGESTED QUESTIONS PAGE -->
  <div class="page" id="page-questions">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">💡</span><p class="flex-1 text-base font-bold text-slate-900">Suggested Questions</p>
      <span class="text-xs text-slate-500" id="q-doc-count">0 documents indexed</span>
    </header>
    <div class="flex-1 overflow-y-auto p-5" id="questions-content">
      <div class="text-center py-20 text-slate-400"><p class="text-4xl mb-3">💡</p><p class="font-semibold">No documents uploaded yet</p></div>
    </div>
  </div>

  <!-- ADMIN UPLOADS PAGE -->
  <div class="page" id="page-uploads">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">📁</span><p class="flex-1 text-base font-bold text-slate-900">Admin Uploads</p>
      <button id="upload-btn-header" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg">📎 Upload Documents</button>
      <input id="file-input" type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" class="hidden"/>
    </header>
    <div class="flex-1 overflow-y-auto p-5">
      <div id="drop-zone" class="border-2 border-dashed border-indigo-300 rounded-xl p-10 text-center mb-6 cursor-pointer hover:bg-indigo-50">
        <p class="text-4xl mb-2">📎</p><p class="text-sm font-semibold text-slate-700">Click to upload documents</p>
        <p class="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, MD, CSV — multiple files</p>
      </div>
      <div id="uploads-grid" class="grid grid-cols-2 gap-3"></div>
    </div>
  </div>

  <!-- ANALYTICS PAGE -->
  <div class="page" id="page-analytics">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">📊</span><p class="flex-1 text-base font-bold text-slate-900">Conversation Analytics</p>
    </header>
    <div class="flex-1 overflow-y-auto p-5">
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center"><p class="text-xs text-slate-400 mb-1">Messages</p><p class="text-2xl font-bold text-slate-900" id="stat-msgs">0</p></div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center"><p class="text-xs text-slate-400 mb-1">Documents</p><p class="text-2xl font-bold text-indigo-600" id="stat-docs">0</p></div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center"><p class="text-xs text-slate-400 mb-1">Session</p><p class="text-2xl font-bold text-emerald-600">Live</p></div>
      </div>
      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-4">
        <p class="text-sm font-bold text-slate-700 mb-4">Message Volume</p>
        <div id="msg-bars" class="h-32 flex items-end gap-1"><div class="flex-1 flex items-center justify-center text-slate-400 text-sm h-full">No messages yet</div></div>
      </div>
      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p class="text-sm font-bold text-slate-700 mb-3">Session Log</p>
        <p class="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2" id="session-log">No queries yet in this session.</p>
      </div>
    </div>
  </div>

  <!-- TICKET HANDOFF PAGE -->
  <div class="page" id="page-handoff">
    <header class="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
      <span class="text-lg">📞</span><p class="flex-1 text-base font-bold text-slate-900">Ticket Handoff</p>
    </header>
    <div class="flex-1 overflow-y-auto p-5">
      <div class="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-sm" id="ticket-form-wrap">
        <p class="text-sm font-bold text-slate-700 mb-4">Log a Support Ticket</p>
        <div class="space-y-4">
          <div><label class="text-xs font-semibold text-slate-600 block mb-1">Issue Category</label>
            <select id="t-issue" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">Select category…</option><option>General Query</option><option>Technical Issue</option><option>Account Support</option><option>Billing</option><option>Other</option>
            </select></div>
          <div><label class="text-xs font-semibold text-slate-600 block mb-1">Your Name</label>
            <input id="t-name" placeholder="Enter your name" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
          <div><label class="text-xs font-semibold text-slate-600 block mb-1">Priority</label>
            <div class="flex gap-2" id="priority-btns">
              <button onclick="setPriority(this,'Low')" data-p="Low" class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">Low</button>
              <button onclick="setPriority(this,'Medium')" data-p="Medium" class="flex-1 py-1.5 text-xs font-semibold rounded-lg border bg-yellow-400 text-white border-yellow-400">Medium</button>
              <button onclick="setPriority(this,'High')" data-p="High" class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">High</button>
              <button onclick="setPriority(this,'Critical')" data-p="Critical" class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">Critical</button>
            </div></div>
          <div><label class="text-xs font-semibold text-slate-600 block mb-1">Details</label>
            <textarea id="t-details" rows="4" placeholder="Describe the issue…" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"></textarea></div>
          <button onclick="submitTicket()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-lg">Submit Ticket</button>
        </div>
      </div>
      <div class="hidden max-w-md mx-auto text-center py-20" id="ticket-success">
        <p class="text-5xl mb-4">✅</p><p class="text-lg font-bold text-slate-800">Ticket Submitted</p>
        <p class="text-sm text-slate-500 mt-2">Support will follow up shortly.</p>
        <button onclick="resetTicket()" class="mt-6 bg-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg">Submit Another</button>
      </div>
    </div>
  </div>
</div>

<!-- RIGHT PANEL -->
<aside class="w-64 border-l bg-white flex flex-col flex-shrink-0">
  <div class="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
    <p class="text-sm font-bold text-slate-800">Knowledge Base</p>
    <span class="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center" id="kb-badge">0</span>
  </div>
  <div class="flex-1 overflow-y-auto p-3" id="kb-doc-cards"><p class="text-xs text-slate-400 italic p-2">No documents yet.</p></div>
  <div class="border-t border-slate-200 p-4">
    <p class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Session</p>
    <div class="space-y-2 text-xs text-slate-600">
      <div class="flex justify-between"><span>Messages</span><span class="font-bold text-slate-800" id="sess-msgs">0</span></div>
      <div class="flex justify-between"><span>Documents</span><span class="font-bold text-slate-800" id="sess-docs">0</span></div>
      <div class="flex justify-between"><span>Last Query</span><span class="font-bold text-slate-800 truncate ml-2 max-w-[100px]" id="sess-last">--</span></div>
    </div>
  </div>
</aside>

<script>
(function(){
  const API = "http://localhost:8000";
  let docs = [], msgCount = 0, currentPage = "chat", currentPriority = "Medium";

  // ── Navigation ──
  const NAV = [
    {id:"chat",    icon:"💬", label:"Support Chat"},
    {id:"questions",icon:"💡",label:"Suggested Questions"},
    {id:"uploads", icon:"📁", label:"Admin Uploads"},
    {id:"analytics",icon:"📊",label:"Conversation Analytics"},
    {id:"handoff", icon:"📞", label:"Ticket Handoff"},
  ];

  function buildNav(){
    const nav = document.getElementById("nav-links");
    nav.innerHTML = NAV.map(n => \`<button onclick="switchPage('\${n.id}')" id="nav-\${n.id}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left \${n.id===currentPage?"bg-indigo-600 text-white":"text-slate-300 hover:bg-white/10"}">\${n.icon} \${n.label}</button>\`).join("");
  }

  window.switchPage = function(id){
    currentPage = id;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-"+id)?.classList.add("active");
    buildNav();
    if(id==="questions") renderQuestionsPage();
    if(id==="uploads") renderUploadsGrid();
    if(id==="analytics") renderAnalytics();
  };

  // ── Helpers ──
  function escHtml(s){ const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }
  function getExt(fn){ return (fn.split(".").pop()||"DOC").toUpperCase(); }

  function buildTopQuestions(){
    const el = document.getElementById("top-questions");
    const qs = docs.length === 0
      ? ["What issue is being reported?","How do I troubleshoot this?","Who do I contact for support?"]
      : docs.flatMap(d=>{ const n=(d.filename||d.name||"Doc").replace(/\\.[^.]+$/,""); return [\`What issue is being reported with \${n}?\`,\`How do I resolve a \${n} error?\`,\`Who do I contact for \${n} support?\`]; }).slice(0,10);
    el.innerHTML = qs.map((q,i) => \`<button onclick="sendMsg(\${JSON.stringify(q)})" class="w-full flex items-start gap-2.5 text-left text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-lg px-2 py-2 transition-colors mb-1"><span class="w-5 h-5 rounded-full bg-indigo-600/60 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">\${i+1}</span><span class="leading-snug">\${escHtml(q)}</span></button>\`).join("");
  }

  function buildQuickSuggestions(){
    const el = document.getElementById("quick-suggestions");
    const qs = docs.length === 0
      ? ["What can you help me with?","Summarise the uploaded documents","What are the key topics?"]
      : docs.flatMap(d=>{ const n=(d.filename||d.name||"Doc").replace(/\\.[^.]+$/,""); return [\`What does \${n} cover?\`,\`Summarise \${n}\`]; }).slice(0,4);
    el.innerHTML = qs.map(q => \`<button onclick="sendMsg(\${JSON.stringify(q)})" class="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-2.5 py-0.5 hover:bg-indigo-50 hover:text-indigo-600">\${escHtml(q)}</button>\`).join("");
  }

  function renderKbCards(){
    const el = document.getElementById("kb-doc-cards");
    document.getElementById("kb-badge").textContent = docs.length;
    document.getElementById("sess-docs").textContent = docs.length;
    document.getElementById("stat-docs").textContent = docs.length;
    if(!docs.length){ el.innerHTML='<p class="text-xs text-slate-400 italic p-2">No documents yet.</p>'; return; }
    el.innerHTML = docs.map(d=>{ const fn=d.filename||d.name||"File"; return \`<div onclick="sendMsg('Summarise '+\${JSON.stringify(fn)})" class="border border-slate-200 rounded-xl p-3 mb-2 cursor-pointer hover:border-indigo-300"><span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">\${escHtml(getExt(fn))}</span><p class="text-sm font-semibold text-slate-800 mt-1.5 truncate">\${escHtml(fn)}</p><div class="flex items-center justify-between mt-1.5"><span class="text-[11px] \${d.indexed?"text-emerald-600":"text-amber-500"} font-semibold">\${d.indexed?"✓ Indexed":"⏳ Pending"}</span></div></div>\`; }).join("");
  }

  function renderQuestionsPage(){
    const el = document.getElementById("questions-content");
    document.getElementById("q-doc-count").textContent = docs.length + " document" + (docs.length!==1?"s":"") + " indexed";
    if(!docs.length){ el.innerHTML='<div class="text-center py-20 text-slate-400"><p class="text-4xl mb-3">💡</p><p class="font-semibold">No documents uploaded yet</p></div>'; return; }
    el.innerHTML = docs.map(d=>{ const fn=(d.filename||d.name||"Document").replace(/\\.[^.]+$/,""); const ext=getExt(d.filename||d.name||"DOC"); const qs=[\`What does \${fn} cover?\`,\`Summarise \${fn}\`,\`What are common issues in \${fn}?\`,\`How do I resolve a \${fn} error?\`,\`Who do I contact for \${fn} support?\`]; return \`<div class="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden"><div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2"><span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">\${ext}</span><p class="text-sm font-bold text-slate-800 truncate">\${escHtml(d.filename||d.name)}</p><span class="ml-auto text-[11px] text-emerald-600 font-semibold">✓ Indexed</span></div><div class="divide-y divide-slate-100">\${qs.map((q,i)=>\`<button onclick="sendMsg(\${JSON.stringify(q)})" class="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"><span class="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">\${i+1}</span>\${escHtml(q)}<span class="ml-auto text-slate-300 text-xs">→</span></button>\`).join("")}</div></div>\`; }).join("");
  }

  function renderUploadsGrid(){
    const el = document.getElementById("uploads-grid");
    if(!docs.length){ el.innerHTML=''; return; }
    el.innerHTML = docs.map(d=>{ const fn=d.filename||d.name||"File"; return \`<div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"><div class="flex items-start gap-3"><div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0"><span class="text-[10px] font-bold text-blue-700">\${escHtml(getExt(fn))}</span></div><div class="min-w-0"><p class="text-sm font-semibold text-slate-800 truncate">\${escHtml(fn)}</p><p class="text-[11px] font-semibold mt-0.5 \${d.indexed?"text-emerald-600":"text-amber-500"}">\${d.indexed?"✓ Indexed":"⏳ Pending"}</p></div></div></div>\`; }).join("");
  }

  function renderAnalytics(){
    document.getElementById("stat-msgs").textContent = msgCount;
    const bars = document.getElementById("msg-bars");
    if(msgCount===0){ bars.innerHTML='<div class="flex-1 flex items-center justify-center text-slate-400 text-sm h-full">No messages yet</div>'; return; }
    bars.innerHTML = Array.from({length:msgCount},(_, i)=>\`<div class="flex-1 bg-indigo-400 rounded-t" style="height:\${Math.min(100,30+i*8)}%"></div>\`).join("");
  }

  // ── Chat ──
  function addMsg(role, text, ts){
    const wrap = document.createElement("div");
    wrap.className = "flex " + (role==="user"?"justify-end":"justify-start");
    const t = ts || new Date().toLocaleTimeString();
    if(role==="user"){
      wrap.innerHTML = \`<div><div class="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-md leading-relaxed">\${escHtml(text)}</div><p class="text-[10px] text-slate-400 text-right mt-1">\${t}</p></div>\`;
    } else {
      wrap.innerHTML = \`<div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-xl"><p class="text-sm text-slate-800 leading-relaxed">\${escHtml(text)}</p><div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100"><span class="text-[10px] text-slate-400">\${t}</span><div class="ml-auto flex gap-1.5"><button onclick="this.style.color='#16a34a'" class="text-slate-400 hover:text-green-600 text-sm">👍</button><button onclick="this.style.color='#dc2626'" class="text-slate-400 hover:text-red-500 text-sm">👎</button></div></div></div>\`;
    }
    document.getElementById("chat-messages").appendChild(wrap);
    document.getElementById("chat-scroll").scrollTop = 99999;
  }

  window.sendMsg = async function(text){
    if(!text || !text.trim()) return;
    if(currentPage !== "chat") switchPage("chat");
    addMsg("user", text);
    msgCount++;
    document.getElementById("sess-msgs").textContent = msgCount;
    document.getElementById("stat-msgs").textContent = msgCount;
    document.getElementById("sess-last").textContent = text.slice(0,15)+(text.length>15?"…":"");
    const ind = document.getElementById("typing-ind");
    ind.classList.remove("hidden");
    try {
      const r = await fetch(API+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:text,workspace_id:1})});
      ind.classList.add("hidden");
      if(!r.ok) throw new Error("HTTP "+r.status);
      const d = await r.json();
      addMsg("bot", d.answer || JSON.stringify(d));
    } catch(e){
      ind.classList.add("hidden");
      addMsg("bot","⚠️ Backend not reachable. Ensure FastAPI is running on port 8000.");
    }
  };

  // ── Upload ──
  async function doUpload(files){
    document.getElementById("upload-btn-header").textContent="⏳ Indexing…";
    for(const f of Array.from(files)){
      const fd=new FormData(); fd.append("file",f);
      try{ await fetch(API+"/api/documents/upload",{method:"POST",body:fd}); }catch(e){}
    }
    document.getElementById("upload-btn-header").textContent="📎 Upload Documents";
    await loadDocs();
    if(currentPage==="uploads") renderUploadsGrid();
    if(currentPage==="questions") renderQuestionsPage();
  }

  async function loadDocs(){
    try{
      const r=await fetch(API+"/api/documents");
      if(!r.ok) return;
      docs=await r.json();
    }catch(e){ return; }
    renderKbCards();
    buildTopQuestions();
    buildQuickSuggestions();
  }

  // ── Ticket ──
  window.setPriority = function(btn, p){
    currentPriority = p;
    document.querySelectorAll("#priority-btns button").forEach(b=>{
      const bp = b.dataset.p;
      if(bp===p){
        const cls = p==="Critical"?"bg-red-600 text-white border-red-600":p==="High"?"bg-amber-500 text-white border-amber-500":p==="Medium"?"bg-yellow-400 text-white border-yellow-400":"bg-green-500 text-white border-green-500";
        b.className=\`flex-1 py-1.5 text-xs font-semibold rounded-lg border \${cls}\`;
      } else {
        b.className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50";
      }
    });
  };
  window.submitTicket = function(){
    const issue=document.getElementById("t-issue").value;
    const name=document.getElementById("t-name").value;
    if(!issue||!name){ alert("Please fill in Issue Category and Name."); return; }
    document.getElementById("ticket-form-wrap").classList.add("hidden");
    document.getElementById("ticket-success").classList.remove("hidden");
  };
  window.resetTicket = function(){
    document.getElementById("t-issue").value="";
    document.getElementById("t-name").value="";
    document.getElementById("t-details").value="";
    document.getElementById("ticket-form-wrap").classList.remove("hidden");
    document.getElementById("ticket-success").classList.add("hidden");
  };

  // ── Wire events ──
  document.getElementById("send-btn").addEventListener("click",()=>{ const t=document.getElementById("msg-input").value.trim(); if(t){ document.getElementById("msg-input").value=""; sendMsg(t); } });
  document.getElementById("msg-input").addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); document.getElementById("send-btn").click(); } });
  document.getElementById("upload-btn-header").addEventListener("click",()=>document.getElementById("file-input").click());
  document.getElementById("drop-zone").addEventListener("click",()=>document.getElementById("file-input").click());
  document.getElementById("file-input").addEventListener("change",e=>{ if(e.target.files?.length) doUpload(e.target.files); e.target.value=""; });

  // ── Init ──
  document.getElementById("avatar-letter").textContent = "${appTitle}".charAt(0).toUpperCase();
  buildNav();
  buildTopQuestions();
  buildQuickSuggestions();
  loadDocs();
  setInterval(loadDocs, 15000);
})();
</script>
</body>
</html>`);
```

- [ ] **Step 2: Verify — download RAG Scaffold ZIP for the Loblaw chatbot plan. Open `sandbox.html` in browser. Confirm: slate-800 left sidebar, purple avatar with first letter, 5 nav items, Top 10 Questions, right panel with KB badge + doc cards + session stats. All 5 pages should switch correctly. Chat should send `question` field to API.**

---

### Task 4: Add `buildDynamicAppTsx()` for non-RAG Custom Code plans

**Files:**
- Modify: `frontend/src/pages/Architect.tsx` — add helper before `buildSourceZip`, update `buildSourceZip` to call it

- [ ] **Step 1: Add `buildDynamicAppTsx` helper before `buildSourceZip`**

Find:
```typescript
// ─── Source ZIP builder — calls GPT-4o via /api/architect/generate-project ───
```

Insert this function immediately BEFORE that comment:

```typescript
// ─── Dynamic App.tsx generator for non-RAG plans ─────────────────────────────

function buildDynamicAppTsx(plan: Plan, appTitle: string, backendPort: number): string {
  // Map plan features into page definitions
  const rawFeatures = (plan.features ?? []).slice(0, 7);
  const ICON_MAP: Record<string, string> = {
    chat: "💬", message: "💬", conversation: "💬", support: "💬",
    dashboard: "📊", analytic: "📊", report: "📊", monitor: "📊",
    user: "👤", customer: "👤", profile: "👤", account: "👤",
    upload: "📁", document: "📁", file: "📁", storage: "📁",
    ticket: "📞", handoff: "📞", escalat: "📞",
    schedule: "📅", appointment: "📅", booking: "📅", calendar: "📅",
    order: "🛒", product: "🛒", inventory: "🛒", cart: "🛒",
    payment: "💳", billing: "💳", invoice: "💳",
    setting: "⚙️", config: "⚙️", admin: "⚙️",
  };

  interface PageDef { id: string; icon: string; label: string; feature: string; }
  const pages: PageDef[] = rawFeatures.map((f, i) => {
    const lower = f.toLowerCase();
    const icon = Object.entries(ICON_MAP).find(([k]) => lower.includes(k))?.[1] ?? "📋";
    const id = "page" + i;
    const label = f.length > 30 ? f.slice(0, 28) + "…" : f;
    return { id, icon, label, feature: f };
  });
  if (pages.length === 0) pages.push({ id: "page0", icon: "📋", label: "Overview", feature: "Overview" });

  // Map plan.api_endpoints into fetch helpers
  const endpoints = (plan.api_endpoints ?? []).slice(0, 8);
  const apiFns = endpoints.map(ep => {
    const parts = ep.split(/\s+/);
    const method = (parts[0] || "GET").toUpperCase();
    const path = parts[1] || "/api/data";
    const fnName = "api" + path.replace(/^\/api\/?/, "").replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("") || "Data";
    if (method === "GET") {
      return `async function ${fnName}(): Promise<any> {\n  const r = await fetch("${path}").catch(() => null);\n  return r && r.ok ? r.json() : null;\n}`;
    }
    return `async function ${fnName}(body: any): Promise<any> {\n  const r = await fetch("${path}", { method: "${method}", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);\n  return r && r.ok ? r.json() : null;\n}`;
  }).join("\n\n");

  const aiBadge = (plan.tech_stack?.ai || "Azure OpenAI").slice(0, 30);
  const dbBadge = (plan.tech_stack?.database || "PostgreSQL").slice(0, 20);
  const firstPageId = pages[0].id;

  return `import React, { useState, useEffect } from "react";

// Generated by AgentForge · ${new Date().toLocaleDateString()}
// App: ${appTitle}
// Stack: ${plan.tech_stack?.frontend || "React"} + ${plan.tech_stack?.backend || "FastAPI"} + ${dbBadge}

type PageId = ${pages.map(p => `"${p.id}"`).join(" | ")};

${apiFns}

export default function App() {
  const [page, setPage] = useState<PageId>("${firstPageId}");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"ok" | "error" | "checking">("checking");

  useEffect(() => {
    fetch("/api/health").then(r => setStatus(r.ok ? "ok" : "error")).catch(() => setStatus("error"));
  }, []);

  const navItems: { id: PageId; icon: string; label: string }[] = [
${pages.map(p => `    { id: "${p.id}", icon: "${p.icon}", label: ${JSON.stringify(p.label)} },`).join("\n")}
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100" style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-base">${appTitle.charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate">${appTitle}</p>
              <p className="text-xs text-slate-400 leading-tight">{aiBadge}</p>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-0.5">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)}
              className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left \${page === item.id ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-white/10"}\`}>
              <span className="text-base">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto p-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <span className={\`w-2 h-2 rounded-full \${status === "ok" ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-amber-400"}\`} />
            <span className="text-xs text-slate-400">{status === "ok" ? "Backend connected" : status === "error" ? "Backend offline (port ${backendPort})" : "Connecting…"}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center gap-3 shadow-sm flex-shrink-0">
          <p className="flex-1 text-base font-bold text-slate-900">{navItems.find(n => n.id === page)?.icon} {navItems.find(n => n.id === page)?.label}</p>
          <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">{aiBadge}</span>
          <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{dbBadge}</span>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
${pages.map(p => `          {page === "${p.id}" && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-800">${p.icon} ${p.label}</h2>
                <p className="text-sm text-slate-500 mt-1">${p.feature}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <p className="text-sm text-slate-500 text-center py-8">
                  Connect your backend at <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">http://localhost:${backendPort}</code> to populate this view.
                </p>
              </div>
            </div>
          )}`).join("\n")}
        </div>
      </div>
    </div>
  );
}
`;
}
```

- [ ] **Step 2: Update `buildSourceZip` to use `buildDynamicAppTsx` for non-RAG plans**

Find in `buildSourceZip` (~line 1485):
```typescript
  // ── Step 4: Always inject the hardcoded 3-panel App.tsx (overrides any GPT frontend) ────
  // GPT-4o generates backend files well but produces inconsistent React UIs.
  // Our template exactly matches the CC sandbox HTML layout.

  // ── src/App.tsx — matches CC sandbox HTML layout exactly ─────────────────────
  const appTsx = `import React...
```
...all the way to:
```typescript
  zip.file("src/App.tsx", appTsx);
```

Replace just the `const appTsx = ...` declaration and the `zip.file` call with:

```typescript
  // ── Step 4: Inject React UI — plan-aware template for non-RAG, proven chatbot for RAG ──
  const finalAppTsx = isRagPlan(plan)
    ? appTsx   // appTsx is the hardcoded RAG chatbot template defined above
    : buildDynamicAppTsx(plan, appTitle, 8002);

  zip.file("src/App.tsx", finalAppTsx);
```

Note: keep the `const appTsx = \`...\`` string in place — it's still used for RAG plans. Only the `zip.file("src/App.tsx", appTsx)` line gets replaced.

- [ ] **Step 3: Verify — generate a non-RAG plan (e.g. "Build a hospital appointment booking system"). Download Custom Code ZIP. Open `src/App.tsx` — should show pages like "Patient Registration", "Appointment Scheduling", "Doctor Availability" — NOT "Support Chat / Ticket Handoff". Generate a RAG plan — Custom Code ZIP should still show the 5-page chatbot template.**

---

### Task 5: End-to-End Test

- [ ] **Step 1: Start the full stack**

```powershell
# Backend (in one terminal)
cd C:\Users\n.sureshmanikandan\Repo1\AgentForge\backend
.\start.ps1

# Frontend (in another terminal)
cd C:\Users\n.sureshmanikandan\Repo1\AgentForge\frontend
npm run dev
```

- [ ] **Step 2: RAG plan smoke test**

1. Open http://localhost:5175/architect
2. Type: "Build a customer support chatbot for Loblaw using RAG with FAISS embeddings"
3. Answer clarifying questions → Generate Plan
4. Go to App tab — confirm RAG Scaffold button IS visible, Custom Code button IS visible
5. Click RAG Scaffold → download ZIP
6. Unzip and check:
   - `sandbox.html` — open in browser, should show 5-page layout with slate-800 sidebar
   - `frontend/vite.config.ts` — proxy target should be `http://localhost:8000`
   - `backend/app/api/chat.py` — should have `question: str = ""` field

- [ ] **Step 3: Non-RAG plan smoke test**

1. Type: "Build a hospital appointment booking system with patient management and doctor scheduling"
2. Generate Plan → App tab
3. Confirm RAG Scaffold button is NOT visible (plan has no RAG/FAISS signal)
4. Click Custom Code → download ZIP
5. Open `src/App.tsx` — pages should reflect hospital features, NOT "Support Chat / Ticket Handoff"

- [ ] **Step 4: Mixed signal plan test**

1. Type: "Build an e-commerce product catalog with semantic search using embeddings"
2. Generate Plan → confirm RAG Scaffold button IS visible (has "embedding" signal)
