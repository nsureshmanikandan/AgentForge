import json
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from openai import AzureOpenAI
from app.config import settings

router = APIRouter()

SYSTEM_PROMPT = """You are Planning Architect — an expert AI solutions architect embedded inside AgentForge, an enterprise AI agent platform.

Your job is to help users plan, design, and architect AI-powered applications and agent systems. You are collaborative, precise, and ask smart clarifying questions before diving into a plan.

## Rules

**Phase 1 — Clarification (FIRST response ONLY — NEVER repeat this phase):**
When a user FIRST describes what they want to build (and there are NO prior questions in the conversation history), respond with a JSON object asking AT MOST 3 quick questions:
{
  "type": "questions",
  "message": "Great — [1-2 sentence summary of what you understood]. Just 2-3 quick questions before I generate your plan:",
  "questions": [
    { "id": "q1", "text": "Question here?", "options": ["Option A", "Option B", "Option C"] },
    { "id": "q2", "text": "Question here?", "options": ["Option A", "Option B", "Option C"] }
  ]
}
STRICT RULES for Phase 1:
- Ask AT MOST 3 questions, ideally just 2.
- ONLY ask this ONE time per conversation. If you already asked questions in this conversation, you are FORBIDDEN from asking questions again.
- If the conversation history already contains a message of type "questions" from you, SKIP Phase 1 entirely and go directly to Phase 2.

**Phase 2 — Plan Generation (after user answers questions OR if user gave enough detail upfront):**
IMMEDIATELY after the user responds to your clarifying questions (or if their initial prompt is detailed enough), generate a comprehensive plan. DO NOT ask more questions. Generate the plan NOW:
{
  "type": "plan",
  "message": "Drafted the full plan — here is your architecture. Let me know what to refine.",
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
    "api_endpoints": ["POST /api/endpoint — description", "GET /api/endpoint — description"],
    "database_schema": "Tables and their key fields as a text description",
    "deployment": "Deployment strategy and infrastructure notes",
    "phases": [
      { "phase": 1, "name": "Phase name", "tasks": ["Task 1", "Task 2", "Task 3"] }
    ]
  }
}

**Phase 3 — Refinement:**
If the user asks follow-up questions or requests changes, respond with:
{
  "type": "message",
  "message": "Your helpful response here. If you update the plan, include the full updated plan object under 'plan' key."
}

## Critical Rules
- ALWAYS respond with valid JSON. No markdown fences, no extra text outside JSON.
- Default frontend: React + TypeScript + Vite. Default backend: Python FastAPI. Only change if user explicitly asks.
- Make agent names, features, and endpoints SPECIFIC to the user's actual use case — never generic.
- If user says "like Lyzr" or "like AgentForge" — describe a similar platform tailored to their domain.
- **MOST IMPORTANT**: You may ONLY ask questions ONCE per conversation. The moment the user has answered your questions (i.e., you see a user message after your "questions" response), you MUST generate the full plan immediately. NEVER ask another round of questions. NEVER say "a couple more questions". Generate the plan.
- If the conversation already has a {"type":"questions"} response from you, treat the next user message as final answers and output {"type":"plan",...} immediately.
"""


UI_GEN_PROMPT = """You are a senior React developer. Generate a COMPLETE, self-contained single-file HTML chatbot application.

MANDATORY TECH STACK (all via CDN):
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>

════════════════════════════════════════════════
STEP 1 — READ THE USER PROMPT CAREFULLY
════════════════════════════════════════════════
Everything below MUST be derived 100% from the user's prompt.
- Company name, domain, features, document types, topic categories — ALL from the prompt.
- Do NOT use generic placeholder text. Every string in the app must reflect the actual domain.

════════════════════════════════════════════════
STEP 2 — BUILD THIS DATA STRUCTURE FIRST (inside <script type="text/babel">)
════════════════════════════════════════════════

const APP_CONFIG = {
  company: "",          // extracted from prompt
  appName: "",          // extracted from prompt
  primaryColor: "#4f46e5",
  welcomeMessage: "",   // 2-3 sentences specific to the domain
  documents: [          // 4-5 realistic document filenames for this domain
    { name: "...", type: "DOCX", size: "2.3 MB", indexed: true },
  ],
  topics: ["Topic1", "Topic2", "Topic3", "Topic4"],  // domain-specific filter categories
};

const FAQ_DATA = [      // EXACTLY 10 items — ALL specific to the domain from the prompt
  {
    id: 1,
    question: "...",    // real question a user of THIS app would ask
    answer: "...",      // 1-sentence direct answer
    steps: [            // 4-6 numbered step-by-step resolution steps
      "Step 1: ...",
      "Step 2: ...",
    ],
    source: "...",      // realistic document name from APP_CONFIG.documents
    confidence: 94,     // number between 85-98
    topic: "Topic1",    // matches one of APP_CONFIG.topics
    related: ["...", "..."],  // 2 related question strings
  },
  // ... repeat for all 10
];

════════════════════════════════════════════════
STEP 3 — DYNAMIC RESPONSE ENGINE (critical — no hardcoded if/else per question)
════════════════════════════════════════════════

function findAnswer(userInput) {
  const input = userInput.toLowerCase();
  // Score each FAQ item by counting keyword matches against question + steps text
  const scored = FAQ_DATA.map(item => {
    const text = (item.question + " " + item.steps.join(" ") + " " + item.topic).toLowerCase();
    const words = input.split(/\\s+/).filter(w => w.length > 3);
    const score = words.reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
    return { item, score };
  }).sort((a, b) => b.score - a.score);

  if (scored[0].score > 0) return scored[0].item;

  // Fallback: return a helpful "not found" response using APP_CONFIG context
  return {
    answer: "I couldn't find a specific answer in the " + APP_CONFIG.company + " knowledge base for that query.",
    steps: [
      "Step 1: Try rephrasing your question using keywords from the topic.",
      "Step 2: Use the Top Questions panel on the left for common topics.",
      "Step 3: Contact " + APP_CONFIG.company + " support directly if the issue persists.",
    ],
    source: APP_CONFIG.documents[0]?.name ?? "Knowledge Base",
    confidence: 62,
    related: APP_CONFIG.topics.slice(0, 2),
  };
}

════════════════════════════════════════════════
STEP 4 — THREE-PANEL LAYOUT
════════════════════════════════════════════════

LEFT PANEL (w-64, bg-slate-900, text-white):
- Logo icon + APP_CONFIG.appName
- "Top 10 Questions" section header
- Map over FAQ_DATA to render 10 buttons — each with number badge + item.question text
- On click: set input value = item.question AND call handleSend(item.question)
- Active question highlighted in indigo

MAIN PANEL (flex-1):
- Header: APP_CONFIG.appName + "● RAG Active" + "● Knowledge Base Connected" badges
- Scrollable message thread
- Welcome message using APP_CONFIG.welcomeMessage
- Bot message format (render this for EVERY bot reply):
    <div class="bot-message">
      <p>{answer}</p>
      <div class="steps">📋 Step-by-Step Resolution:
        {steps.map((s,i) => <p>{i+1}. {s}</p>)}
      </div>
      <div class="meta">
        📎 Source: {source} &nbsp;|&nbsp; ✓ Confidence: {confidence}%
      </div>
      {related.length > 0 && <div>💡 Related: {related.map(r => <button onClick={() => handleSend(r)}>{r}</button>)}</div>}
    </div>
- Typing indicator (3 animated dots, shown for 1200ms)
- Sticky input bar: textarea + Send button + "Powered by RAG · {APP_CONFIG.company} Knowledge Base"

RIGHT PANEL (w-64, bg-gray-50, border-l):
- "Knowledge Base" heading + document count badge
- List of APP_CONFIG.documents with filename, type badge (color-coded), size, "✓ Indexed"
- "Session" section: live message count, last query time
- "Filter by Topic" section: APP_CONFIG.topics as clickable filter buttons
  → clicking a topic filter calls handleSend("Show me information about " + topic)

════════════════════════════════════════════════
STEP 5 — REACT STATE & LOGIC
════════════════════════════════════════════════
const [messages, setMessages] = React.useState([welcomeMsg]);
const [input, setInput] = React.useState("");
const [isTyping, setIsTyping] = React.useState(false);
const [activeQuestion, setActiveQuestion] = React.useState(null);
const [msgCount, setMsgCount] = React.useState(0);
const messagesEndRef = React.useRef(null);

function handleSend(text) {
  const q = (text || input).trim();
  if (!q || isTyping) return;
  setInput("");
  setActiveQuestion(q);
  setMessages(prev => [...prev, { role: "user", text: q, ts: new Date().toLocaleTimeString() }]);
  setIsTyping(true);
  setTimeout(() => {
    const result = findAnswer(q);
    setMessages(prev => [...prev, { role: "bot", ...result, ts: new Date().toLocaleTimeString() }]);
    setIsTyping(false);
    setMsgCount(c => c + 1);
  }, 1200);
}

React.useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

════════════════════════════════════════════════
FINAL RULES
════════════════════════════════════════════════
- Return ONLY raw HTML starting with <!DOCTYPE html>
- NO markdown fences, NO explanations outside the HTML
- Every piece of text content must come from the prompt's domain — zero generic placeholders
- The keyword matching engine is MANDATORY — do not use hardcoded if/else per question ID
"""

class GenerateUIRequest(BaseModel):
    app_name: str
    summary: str
    features: List[str]
    frontend: str = "React + TypeScript"
    app_type: str = "chatbot"
    domain: Optional[str] = None        # e.g. "retail customer support", "HR onboarding"
    company: Optional[str] = None       # e.g. "Loblaw", "Accenture"
    doc_types: Optional[List[str]] = None  # e.g. ["DOCX", "PDF", "TXT"]


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ArchitectChatRequest(BaseModel):
    messages: List[ChatMessage]
    tech_stack_override: Optional[dict] = None


@router.post("/generate-ui", response_model=None)
async def generate_ui(req: GenerateUIRequest):
    client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
        timeout=120.0,
    )

    company = req.company or req.app_name.split()[0]
    domain = req.domain or req.summary[:80]
    doc_types = req.doc_types or ["DOCX", "PDF"]
    features_text = "\n".join(f"- {f}" for f in req.features[:10])

    user_prompt = f"""USER PROMPT CONTEXT — derive ALL app content from this:

Original user request: "{req.app_name}"
Company: {company}
Domain: {domain}
Summary: {req.summary}
Document types: {', '.join(doc_types)}

Key features requested:
{features_text}

════ WHAT TO BUILD ════
Follow the system prompt instructions exactly.

APP_CONFIG must use:
- company = "{company}"
- appName = derived from "{req.app_name}"
- welcomeMessage = a 2-3 sentence greeting specific to {company} and {domain}
- documents = 4-5 realistic filenames for {company} {domain} (e.g. "{company}_Support_Policy_2024.docx")
- topics = 4 topic categories specific to {domain} (NOT generic like "Topic1")

FAQ_DATA must contain 10 questions that:
- A real {company} customer/employee would actually ask about {domain}
- Cover different aspects from the features list above
- Have detailed step-by-step answers (4-6 steps each)
- Reference the document filenames you defined in APP_CONFIG.documents
- Use realistic confidence scores (85–98%)

The keyword matching engine in findAnswer() must work for any typed query — no hardcoded IDs.

Generate the complete HTML now."""

    response = client.chat.completions.create(
        model=settings.azure_openai_deployment_gpt4o,
        messages=[
            {"role": "system", "content": UI_GEN_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=4000,
    )

    html = response.choices[0].message.content or ""
    html = html.strip()

    # Strip markdown fences: ```html ... ``` or ``` ... ```
    if html.startswith("```"):
        parts = html.split("```")
        # parts[0] = "" (before first ```), parts[1] = "html\n<content>", parts[2] = "" (after last ```)
        # We want parts[1], then strip the language tag (e.g. "html\n")
        if len(parts) >= 3:
            html = parts[1]
        else:
            html = parts[-1]
        # Remove optional language specifier on first line (e.g. "html\n")
        first_newline = html.find("\n")
        if first_newline != -1:
            lang_tag = html[:first_newline].strip()
            if lang_tag.isalpha():  # pure word like "html" or "markup"
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
