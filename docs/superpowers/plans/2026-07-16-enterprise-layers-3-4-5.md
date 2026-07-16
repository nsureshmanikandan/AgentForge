# AgentForge Enterprise Layers 3, 4, and 5

**Date:** 2026-07-16
**Author:** n.sureshmanikandan

---

## Goal

Extend AgentForge's ZIP-download output from a bare React+FastAPI scaffold into a production-ready artifact by adding:

- **Layer 3** — Domain-appropriate PostgreSQL schema (`db/init.sql`) + idempotent migration runner (`backend/run_migrations.py`) injected into every generated ZIP, triggered by `npm run db:init`.
- **Layer 4** — OpenTelemetry instrumentation both in the AgentForge backend (wrapping all three LLM call sites in named spans) and in every generated ZIP (Jaeger docker-compose, telemetry module, `.env.example`).
- **Layer 5** — AI Reinforcement Loop: a `POST /feedback` endpoint that stores user thumbs-up/down ratings, a `POST /score` AI self-scorer, few-shot injection of top-rated plans into the UI-generation prompt, and a feedback widget in the Plan tab of `Architect.tsx`.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  AgentForge Backend  (backend/app/api/architect.py)          │
│                                                              │
│  generate_project                                            │
│    ├── [NEW] detect domain from req.summary                  │
│    ├── [NEW] pick SQL schema for domain                      │
│    ├── [NEW] inject db/init.sql + backend/run_migrations.py  │
│    ├── [NEW] inject backend/telemetry.py (copy of core)      │
│    ├── [NEW] inject docker-compose.jaeger.yml                │
│    └── [NEW] inject .env.example                             │
│                                                              │
│  generate_ui                                                 │
│    ├── [NEW] OTel span: llm.kb_extraction (Pass 1)           │
│    ├── [NEW] OTel span: llm.generate_ui   (Pass 2)           │
│    └── [NEW] few-shot injection from _feedback_store         │
│                                                              │
│  [NEW] POST /api/architect/feedback  → _feedback_store       │
│  [NEW] GET  /api/architect/feedback/top → top 5 positive     │
│  [NEW] POST /api/architect/score     → GPT-4o self-scorer    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  AgentForge Frontend  (frontend/src/pages/Architect.tsx)     │
│                                                              │
│  PlanTab                                                     │
│    └── [NEW] Feedback widget (thumbs up/down + comment)      │
│              calls POST /api/architect/feedback              │
└──────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Concern | Choice |
|---|---|
| Backend language | Python 3.11, FastAPI |
| LLM client | `openai.AzureOpenAI` (already wired) |
| Observability | `opentelemetry-sdk`, `opentelemetry-exporter-otlp-proto-http` |
| DB migration | `psycopg2` (standard; already assumed in generated backend) |
| Frontend | React 18 + TypeScript, Tailwind CSS |
| Jaeger | `jaegertracing/all-in-one:1.56` via docker-compose |

---

## Files Changed / Created

| File | Action |
|---|---|
| `backend/app/api/architect.py` | Edit — domain detection helper, ZIP injection, OTel spans, feedback/score endpoints |
| `frontend/src/pages/Architect.tsx` | Edit — feedback widget in PlanTab |

No new source files are needed; all new code lives in the two files above plus the injected-into-ZIP strings.

---

## Task 1 — Domain Detection Helper for Layer 3

**File:** `C:\Users\n.sureshmanikandan\Repo1\AgentForge\backend\app\api\architect.py`

### Steps

- [ ] 1.1 — After the existing `_enforce_agentic_structure` function definition (around line 2306), add the `_detect_domain` helper and the `_SQL_SCHEMAS` dict.

```python
# ── Domain detection + SQL schema selection ─────────────────────────────────

_SQL_SCHEMAS: dict[str, str] = {
    "HR_APP": """\
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT,
  department TEXT,
  start_date DATE,
  status TEXT DEFAULT 'active',
  manager_id INTEGER REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  task_name TEXT NOT NULL,
  due_date DATE,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "SALES_APP": """\
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  score INTEGER DEFAULT 0,
  stage TEXT DEFAULT 'new',
  assigned_to TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS deals (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  title TEXT,
  value NUMERIC(12,2),
  stage TEXT DEFAULT 'prospecting',
  close_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "LEGAL_APP": """\
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  party TEXT,
  contract_value NUMERIC(15,2),
  risk_level TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'under_review',
  file_path TEXT,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS clauses (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER REFERENCES contracts(id),
  clause_type TEXT,
  content TEXT,
  risk_flag BOOLEAN DEFAULT false,
  redline_suggestion TEXT
);""",

    "SUPPORT_APP": """\
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  category TEXT,
  priority TEXT DEFAULT 'P3',
  sentiment TEXT,
  status TEXT DEFAULT 'open',
  assignee TEXT,
  customer_email TEXT,
  csat_score INTEGER,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "MARKETING_APP": """\
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT,
  budget NUMERIC(12,2),
  status TEXT DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id),
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  spend NUMERIC(12,2) DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "PRODUCTIVITY_APP": """\
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assignee TEXT,
  due_date DATE,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  project_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT,
  deadline DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "DEV_TOOL": """\
CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  language TEXT,
  last_scanned TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS scan_results (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER REFERENCES repositories(id),
  severity TEXT,
  finding TEXT,
  line_number INTEGER,
  file_path TEXT,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "FINANCE_APP": """\
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  type TEXT,
  category TEXT,
  description TEXT,
  account_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  balance NUMERIC(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "ANALYST_APP": """\
CREATE TABLE IF NOT EXISTS data_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  connection_string TEXT,
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  query TEXT,
  result_json JSONB,
  source_id INTEGER REFERENCES data_sources(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "DATA_APP": """\
CREATE TABLE IF NOT EXISTS datasets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  row_count INTEGER,
  schema_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pipelines (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  steps_json JSONB,
  status TEXT DEFAULT 'idle',
  last_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "CHATBOT": """\
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message TEXT,
  bot_response TEXT,
  intent TEXT,
  confidence NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT,
  indexed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",

    "CUSTOM": """\
CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES items(id),
  event_type TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);""",
}


def _detect_domain(summary: str) -> str:
    """Return one of the _SQL_SCHEMAS keys based on keywords in summary."""
    s = summary.lower()
    if any(k in s for k in ["employee", "hr ", "human resource", "onboard", "payroll", "talent", "workforce"]):
        return "HR_APP"
    if any(k in s for k in ["sales", "lead", "crm", "deal", "pipeline", "prospect", "revenue", "quota"]):
        return "SALES_APP"
    if any(k in s for k in ["legal", "contract", "clause", "compliance", "nda", "redline", "regulatory"]):
        return "LEGAL_APP"
    if any(k in s for k in ["support", "ticket", "helpdesk", "service desk", "customer service", "csat", "triage"]):
        return "SUPPORT_APP"
    if any(k in s for k in ["marketing", "campaign", "brand", "ad spend", "impression", "conversion"]):
        return "MARKETING_APP"
    if any(k in s for k in ["productivity", "task", "project manage", "kanban", "sprint", "backlog", "todo"]):
        return "PRODUCTIVITY_APP"
    if any(k in s for k in ["devtool", "dev tool", "code review", "repository", "github", "scan", "ci/cd"]):
        return "DEV_TOOL"
    if any(k in s for k in ["finance", "account", "invoice", "expense", "budget", "transaction", "bookkeep"]):
        return "FINANCE_APP"
    if any(k in s for k in ["analyst", "insight", "bi ", "business intelligence", "kpi", "report"]):
        return "ANALYST_APP"
    if any(k in s for k in ["data pipeline", "etl", "dataset", "data process", "data platform"]):
        return "DATA_APP"
    if any(k in s for k in ["chatbot", "rag", "knowledge base", "faq", "conversational"]):
        return "CHATBOT"
    return "CUSTOM"
```

- [ ] 1.2 — Commit checkpoint: `git add backend/app/api/architect.py && git commit -m "feat: add _detect_domain helper and _SQL_SCHEMAS dict for Layer 3"`

---

## Task 2 — Inject DB Files into Generated ZIP (Layer 3)

**File:** `C:\Users\n.sureshmanikandan\Repo1\AgentForge\backend\app\api\architect.py`

### Steps

- [ ] 2.1 — Locate the `generate_project` endpoint's post-process section. The final block before `return` is (around line 2773–2780):

```python
        # ── Post-process ────────────────────────────────────────────────────
        all_files = {path: _fix_python_file(path, content) for path, content in all_files.items()}
        all_files = _enforce_agentic_structure(all_files, req.app_name, req.summary)

        if "README.md" not in all_files:
            all_files["README.md"] = f"# {req.app_name}\n\n..."

        span.set_attribute("total.file_count", len(all_files))
        return {"files": all_files, "file_count": len(all_files)}
```

- [ ] 2.2 — Replace the README assignment and return block with the following (keep the existing README f-string but extend it, then add the DB files):

```python
        # ── Post-process ────────────────────────────────────────────────────
        all_files = {path: _fix_python_file(path, content) for path, content in all_files.items()}
        all_files = _enforce_agentic_structure(all_files, req.app_name, req.summary)

        # ── Layer 3: DB Auto-Setup ───────────────────────────────────────────
        domain_key = _detect_domain(req.summary)
        sql_schema = _SQL_SCHEMAS.get(domain_key, _SQL_SCHEMAS["CUSTOM"])
        all_files["db/init.sql"] = sql_schema

        all_files["backend/run_migrations.py"] = (
            'import os, psycopg2\n'
            'from pathlib import Path\n\n'
            'DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/app")\n\n'
            'def run():\n'
            '    sql = (Path(__file__).parent / "../db/init.sql").read_text()\n'
            '    conn = psycopg2.connect(DB_URL)\n'
            '    try:\n'
            '        with conn.cursor() as cur:\n'
            '            cur.execute(sql)\n'
            '        conn.commit()\n'
            '        print("Migrations complete.")\n'
            '    finally:\n'
            '        conn.close()\n\n'
            'if __name__ == "__main__":\n'
            '    run()\n'
        )

        # Patch package.json scripts to add db:init
        _pkg_path = next((p for p in all_files if p.endswith("package.json") and "frontend" in p), None)
        if _pkg_path:
            import re as _re2
            _pkg = all_files[_pkg_path]
            # Insert "db:init" after the opening "scripts": { line
            _pkg = _re2.sub(
                r'("scripts"\s*:\s*\{)',
                r'\1\n    "db:init": "python backend/run_migrations.py",',
                _pkg,
                count=1,
            )
            all_files[_pkg_path] = _pkg

        # ── README ──────────────────────────────────────────────────────────
        if "README.md" not in all_files:
            all_files["README.md"] = (
                f"# {req.app_name}\n\n"
                f"> Generated by **AgentForge Architect** · {__import__('datetime').date.today()}\n\n"
                f"## Stack\n"
                f"- Frontend: {stack.get('frontend', 'React + TypeScript + Vite')}\n"
                f"- Backend: {stack.get('backend', 'Python FastAPI')}\n"
                f"- Database: {stack.get('database', 'PostgreSQL')}\n"
                f"- AI: {stack.get('ai', settings.azure_openai_deployment_gpt4o)}\n\n"
                f"## Features\n"
                + "\n".join(f"- {f}" for f in req.features)
                + "\n\n## Setup\n"
                "```bash\n"
                "# 1. Copy environment config\n"
                "cp .env.example .env\n\n"
                "# 2. Start Jaeger (optional, for tracing)\n"
                "docker-compose -f docker-compose.jaeger.yml up -d\n"
                "# View traces at http://localhost:16686\n\n"
                "# 3. Run database migrations\n"
                "npm run db:init\n\n"
                "# 4. Start the app\n"
                "docker-compose up --build\n"
                "```\n"
            )
        else:
            # Prepend DB setup instructions to existing README
            _setup_note = (
                "\n\n## Setup\n"
                "```bash\n"
                "cp .env.example .env\n"
                "docker-compose -f docker-compose.jaeger.yml up -d  # optional Jaeger\n"
                "npm run db:init  # run before first start\n"
                "docker-compose up --build\n"
                "```\n"
            )
            all_files["README.md"] = all_files["README.md"] + _setup_note

        span.set_attribute("total.file_count", len(all_files))
        return {"files": all_files, "file_count": len(all_files)}
```

- [ ] 2.3 — Commit: `git add backend/app/api/architect.py && git commit -m "feat(layer3): inject db/init.sql and run_migrations.py into generated ZIPs"`

---

## Task 3 — OpenTelemetry Spans on LLM Calls (Layer 4 Part A)

**File:** `C:\Users\n.sureshmanikandan\Repo1\AgentForge\backend\app\api\architect.py`

### Steps

- [ ] 3.1 — **KB Extraction span (Pass 1, line ~1738–1745).** The current code is:

```python
        try:
            kb_response = client.chat.completions.create(
                model=settings.azure_openai_deployment_gpt4o,
                messages=[{"role": "user", "content": kb_extraction_prompt}],
                temperature=0.1,
                max_completion_tokens=12000,
                response_format={"type": "json_object"},
            )
```

Replace the `try:` block opening and the `client.chat.completions.create` call with a span wrapper. The replacement is:

```python
        try:
            with _tracer.start_as_current_span("llm.kb_extraction", attributes={
                "app.detected_type": detected_type,
                "app.session_id": getattr(req, "session_id", ""),
                "llm.model": settings.azure_openai_deployment_gpt4o,
                "llm.max_tokens": 12000,
            }) as _kb_span:
                try:
                    kb_response = client.chat.completions.create(
                        model=settings.azure_openai_deployment_gpt4o,
                        messages=[{"role": "user", "content": kb_extraction_prompt}],
                        temperature=0.1,
                        max_completion_tokens=12000,
                        response_format={"type": "json_object"},
                    )
                    _kb_span.set_status(trace_status("OK"))
                except Exception as _e_kb:
                    _kb_span.record_exception(_e_kb)
                    _kb_span.set_status(trace_status("ERROR", str(_e_kb)))
                    raise
```

Note: the outer `try:` is the existing exception handler that sets `prefilled_kb_block = ""` on failure — leave that outer try/except intact; the new `with _tracer...` block nests inside it.

- [ ] 3.2 — **Main UI generation span (Pass 2, line ~1997–2004).** The current code is:

```python
    response = client.chat.completions.create(
        model=settings.azure_openai_deployment_gpt4o,
        messages=messages_payload,
        temperature=0.2,
        max_completion_tokens=8000 if detected_type == "CUSTOM" else 16000,
    )

    html = response.choices[0].message.content or ""
```

Wrap it:

```python
    _max_tokens_ui = 8000 if detected_type == "CUSTOM" else 16000
    with _tracer.start_as_current_span("llm.generate_ui", attributes={
        "app.detected_type": detected_type,
        "app.session_id": getattr(req, "session_id", ""),
        "llm.model": settings.azure_openai_deployment_gpt4o,
        "llm.max_tokens": _max_tokens_ui,
    }) as _ui_span:
        try:
            response = client.chat.completions.create(
                model=settings.azure_openai_deployment_gpt4o,
                messages=messages_payload,
                temperature=0.2,
                max_completion_tokens=_max_tokens_ui,
            )
            _ui_span.set_status(trace_status("OK"))
        except Exception as _e_ui:
            _ui_span.record_exception(_e_ui)
            _ui_span.set_status(trace_status("ERROR", str(_e_ui)))
            raise

    html = response.choices[0].message.content or ""
```

- [ ] 3.3 — **generate_project LLM calls** — both the frontend pass (line ~2732) and backend pass (line ~2757) are already wrapped in `_tracer.start_as_current_span("architect.generate_frontend")` and `"architect.generate_backend"` spans respectively. Add `llm.model` and `llm.max_tokens` attributes to those existing spans:

In the `architect.generate_frontend` span block, after `fe_span = ` add:
```python
            fe_span.set_attribute("llm.model", settings.azure_openai_deployment_gpt4o)
            fe_span.set_attribute("llm.max_tokens", 14000)
```

In the `architect.generate_backend` span block, after `be_span = ` add:
```python
            be_span.set_attribute("llm.model", settings.azure_openai_deployment_gpt4o)
            be_span.set_attribute("llm.max_tokens", 14000)
```

- [ ] 3.4 — Commit: `git add backend/app/api/architect.py && git commit -m "feat(layer4a): wrap LLM calls in OTel spans in generate_ui and generate_project"`

---

## Task 4 — OTel Files in Generated ZIP (Layer 4 Part B)

**File:** `C:\Users\n.sureshmanikandan\Repo1\AgentForge\backend\app\api\architect.py`

### Steps

- [ ] 4.1 — Read `backend/app/core/telemetry.py` at runtime to copy it verbatim into each ZIP. In the `generate_project` function, inside the `with _tracer.start_as_current_span("architect.generate_project")` block, after the Layer 3 block (after `all_files["backend/run_migrations.py"] = ...`), add:

```python
        # ── Layer 4B: OTel files ─────────────────────────────────────────────
        import pathlib as _pl
        _telem_src = (_pl.Path(__file__).parent.parent / "core" / "telemetry.py").read_text(encoding="utf-8")
        all_files["backend/telemetry.py"] = _telem_src

        all_files["docker-compose.jaeger.yml"] = (
            'version: "3.8"\n'
            'services:\n'
            '  jaeger:\n'
            '    image: jaegertracing/all-in-one:1.56\n'
            '    ports:\n'
            '      - "16686:16686"   # Jaeger UI\n'
            '      - "4318:4318"     # OTLP HTTP\n'
            '    environment:\n'
            '      COLLECTOR_OTLP_ENABLED: "true"\n'
        )

        # Derive a URL-safe slug from the app name for OTEL_SERVICE_NAME
        import re as _re3
        _service_slug = _re3.sub(r"[^a-z0-9]+", "-", req.app_name.lower()).strip("-")

        all_files[".env.example"] = (
            f"DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app\n"
            f"OTEL_EXPORTER=jaeger\n"
            f"OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318\n"
            f"OTEL_SERVICE_NAME={_service_slug}\n"
            f"AZURE_OPENAI_API_KEY=your-key-here\n"
            f"AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com\n"
        )
```

- [ ] 4.2 — Commit: `git add backend/app/api/architect.py && git commit -m "feat(layer4b): inject telemetry.py, Jaeger compose, .env.example into generated ZIPs"`

---

## Task 5 — Feedback Storage and AI Scorer Endpoints (Layer 5 Part A & B)

**File:** `C:\Users\n.sureshmanikandan\Repo1\AgentForge\backend\app\api\architect.py`

### Steps

- [ ] 5.1 — After the existing imports at the top of the file (after `from typing import List, Optional` on line 7), confirm `Optional` is already imported (it is). No new imports are needed.

- [ ] 5.2 — Add the in-memory store and the `FeedbackRequest` model near the top of the file, right after the `trace_status` helper definition (after line 17):

```python
# ── Layer 5: Feedback store ───────────────────────────────────────────────────
from typing import Optional as _Opt  # already imported as Optional; alias avoids shadowing

_feedback_store: list[dict] = []


class FeedbackRequest(BaseModel):
    session_id: str
    plan_id: str
    rating: int          # 1 = thumbs-up, -1 = thumbs-down
    comment: Optional[str] = None
    prompt_text: str
    plan_summary: str
    detected_type: str


class ScorerRequest(BaseModel):
    prompt_text: str
    plan_summary: str
    detected_type: str
```

Note: `Optional` is already imported from `typing` on line 7, so no duplicate import is needed. The `_Opt` alias line above should be omitted in the actual edit — just define the classes using the existing `Optional`.

- [ ] 5.3 — Add the three new endpoints. Place them immediately before the `@router.post("/generate-project")` decorator (around line 2697), so they are grouped with the other architect endpoints:

```python
# ── Layer 5: Feedback endpoints ───────────────────────────────────────────────

@router.post("/api/architect/feedback")
async def save_feedback(req: FeedbackRequest):
    _feedback_store.append(req.dict())
    return {"ok": True, "total": len(_feedback_store)}


@router.get("/api/architect/feedback/top")
async def get_top_feedback():
    """Return up to 5 positively-rated prompt+plan pairs for few-shot injection."""
    positive = [f for f in _feedback_store if f["rating"] == 1]
    positive.sort(key=lambda x: x.get("rating", 0), reverse=True)
    return positive[:5]


@router.post("/api/architect/score")
async def score_plan(req: ScorerRequest):
    scoring_prompt = (
        f"Rate this AI app plan on a scale of 1-10 for each dimension.\n"
        f"Prompt: {req.prompt_text[:500]}\n"
        f"Plan Summary: {req.plan_summary[:500]}\n"
        f"Detected Type: {req.detected_type}\n\n"
        "Score on:\n"
        "1. Multi-agent depth (named agents with distinct roles): /10\n"
        "2. UI completeness (pages, charts, export): /10\n"
        "3. Domain accuracy (correct terminology, realistic features): /10\n"
        "4. Enterprise readiness (DB, error handling, auth): /10\n"
        "5. Agentic approach (agents coordinate, not just one LLM call): /10\n\n"
        'Return JSON only: {"multi_agent": N, "ui_completeness": N, "domain_accuracy": N, '
        '"enterprise_readiness": N, "agentic_approach": N, "overall": N, "suggestions": ["...", "..."]}'
    )
    _score_client = AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
        timeout=60.0,
    )
    with _tracer.start_as_current_span("llm.score_plan", attributes={
        "llm.model": settings.azure_openai_deployment_gpt4o,
        "llm.max_tokens": 500,
    }) as _score_span:
        try:
            _score_resp = _score_client.chat.completions.create(
                model=settings.azure_openai_deployment_gpt4o,
                messages=[{"role": "user", "content": scoring_prompt}],
                max_completion_tokens=500,
                temperature=0.3,
            )
            _score_span.set_status(trace_status("OK"))
        except Exception as _e_score:
            _score_span.record_exception(_e_score)
            _score_span.set_status(trace_status("ERROR", str(_e_score)))
            raise
    import json as _json2
    try:
        return _json2.loads(_score_resp.choices[0].message.content or "{}")
    except Exception:
        return {"overall": 5, "suggestions": ["Could not parse score"]}
```

**Important routing note:** AgentForge uses `router = APIRouter()` with prefix `/api/architect` mounted in `main.py`. The route paths above (`/api/architect/feedback`, etc.) use the full path intentionally because we don't know the exact prefix. Check `main.py` to confirm the router is included with `prefix="/api/architect"`:

```bash
grep -n "architect" C:/Users/n.sureshmanikandan/Repo1/AgentForge/backend/app/main.py
```

If the prefix is `/api/architect`, change the decorator paths to just `/feedback`, `/feedback/top`, and `/score` respectively to avoid double-prefixing.

- [ ] 5.4 — Commit: `git add backend/app/api/architect.py && git commit -m "feat(layer5ab): add feedback storage and AI scorer endpoints"`

---

## Task 6 — Few-Shot Injection into generate_ui (Layer 5 Part C)

**File:** `C:\Users\n.sureshmanikandan\Repo1\AgentForge\backend\app\api\architect.py`

### Steps

- [ ] 6.1 — Locate the section in `generate_ui` where `user_prompt` and `feedback_block` are composed, just before `messages_payload` is built (around line 1992). The current code is:

```python
    else:
        messages_payload = [
            {"role": "system", "content": UI_GEN_PROMPT},
            {"role": "user", "content": user_prompt + feedback_block},
        ]
```

- [ ] 6.2 — Replace with:

```python
    else:
        # ── Layer 5C: few-shot injection from top-rated plans ───────────────
        few_shot_block = ""
        if len(_feedback_store) >= 3:
            _top_shots = sorted(
                [f for f in _feedback_store if f["rating"] == 1],
                key=lambda x: x["rating"],
                reverse=True,
            )[:3]
            if _top_shots:
                _examples = "\n\n".join([
                    f"--- HIGH-QUALITY EXAMPLE {i + 1} ---\n"
                    f"Prompt: {ex['prompt_text'][:200]}\n"
                    f"Type: {ex['detected_type']}\n"
                    f"Summary: {ex['plan_summary'][:200]}"
                    for i, ex in enumerate(_top_shots)
                ])
                few_shot_block = (
                    "\n\nHIGH-QUALITY REFERENCE EXAMPLES (follow their quality and structure):\n"
                    + _examples
                    + "\n"
                )

        messages_payload = [
            {"role": "system", "content": UI_GEN_PROMPT},
            {"role": "user", "content": user_prompt + few_shot_block + feedback_block},
        ]
```

- [ ] 6.3 — Commit: `git add backend/app/api/architect.py && git commit -m "feat(layer5c): inject few-shot examples from top-rated feedback into generate_ui prompt"`

---

## Task 7 — Feedback Widget in PlanTab (Layer 5 Part D)

**File:** `C:\Users\n.sureshmanikandan\Repo1\AgentForge\frontend\src\pages\Architect.tsx`

### Steps

- [ ] 7.1 — Add three state variables inside the `PlanTab` function. The function signature is at line 521. The function's first line after the early-return is `return (`. Add the state declarations right after the function opening brace and before the early-return:

Find this exact block:
```tsx
function PlanTab({ plan, promptHistory, messages, loading, qAnswers, qLocked, pickAnswer, submitAnswers, hasAnswers }: { plan?: Plan; promptHistory?: PromptVersion[]; messages: Message[]; loading: boolean; qAnswers?: Record<string, string>; qLocked?: boolean; pickAnswer?: (qId: string, opt: string) => void; submitAnswers?: () => void; hasAnswers?: boolean }) {
  if (!plan) return <PlanProgressState messages={messages} loading={loading} qAnswers={qAnswers} qLocked={qLocked} pickAnswer={pickAnswer} submitAnswers={submitAnswers} hasAnswers={hasAnswers} />;
  return (
```

Replace with:
```tsx
function PlanTab({ plan, promptHistory, messages, loading, qAnswers, qLocked, pickAnswer, submitAnswers, hasAnswers }: { plan?: Plan; promptHistory?: PromptVersion[]; messages: Message[]; loading: boolean; qAnswers?: Record<string, string>; qLocked?: boolean; pickAnswer?: (qId: string, opt: string) => void; submitAnswers?: () => void; hasAnswers?: boolean }) {
  const [feedback, setFeedback] = useState<1 | -1 | null>(null);
  const [feedbackComment, setFeedbackComment] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const submitFeedback = async (rating: 1 | -1) => {
    if (!plan) return;
    setFeedback(rating);
    if (rating === -1) {
      setFeedbackComment("");  // show comment input on thumbs-down
      return;
    }
    await _sendFeedback(rating, plan, null);
  };

  const saveFeedbackComment = async () => {
    if (!plan) return;
    await _sendFeedback(feedback ?? -1, plan, feedbackComment);
  };

  const _sendFeedback = async (rating: 1 | -1, p: Plan, comment: string | null) => {
    try {
      await fetch("/api/architect/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "",
          plan_id: p.summary.slice(0, 40),
          rating,
          comment: comment ?? undefined,
          prompt_text: p.summary,
          plan_summary: p.summary,
          detected_type: "CUSTOM",
        }),
      });
      setFeedbackSent(true);
    } catch {
      // fail silently — feedback is best-effort
    }
  };

  if (!plan) return <PlanProgressState messages={messages} loading={loading} qAnswers={qAnswers} qLocked={qLocked} pickAnswer={pickAnswer} submitAnswers={submitAnswers} hasAnswers={hasAnswers} />;
  return (
```

- [ ] 7.2 — Add the feedback widget at the bottom of the PlanTab return, just before the closing `</div>` of the root `<div className="p-6 space-y-6 overflow-y-auto h-full">`. Find the closing tags:

```tsx
    </div>
  );
}
```

That closing `</div>` on line 597 closes the root div. Insert the widget before it:

```tsx
      {/* Layer 5: Feedback widget */}
      <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-500 font-medium">Was this plan helpful?</span>
        <button
          onClick={() => submitFeedback(1)}
          className={`p-1.5 rounded-md text-sm ${feedback === 1 ? "bg-green-100 text-green-700" : "hover:bg-slate-200 text-slate-500"}`}
        >👍</button>
        <button
          onClick={() => submitFeedback(-1)}
          className={`p-1.5 rounded-md text-sm ${feedback === -1 ? "bg-red-100 text-red-700" : "hover:bg-slate-200 text-slate-500"}`}
        >👎</button>
        {feedbackComment !== null && (
          <input
            className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 min-w-0"
            placeholder="Optional comment... (press Enter to send)"
            value={feedbackComment}
            onChange={(e) => setFeedbackComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveFeedbackComment()}
          />
        )}
        {feedbackSent && <span className="text-xs text-green-600 font-medium">Thanks!</span>}
      </div>
```

The full closing of the return block then becomes:
```tsx
      {/* Layer 5: Feedback widget */}
      <div className="...">...</div>
    </div>
  );
}
```

- [ ] 7.3 — Verify `useState` is already imported at the top of `Architect.tsx` (line 1: `import { useState, useRef, useEffect } from "react";`) — it is, so no import change needed.

- [ ] 7.4 — Commit: `git add frontend/src/pages/Architect.tsx && git commit -m "feat(layer5d): add feedback widget in PlanTab"`

---

## Task 8 — Verify Route Prefix (Pre-flight Check)

Before running any integration test, verify that the `architect` router is mounted with the correct prefix so the `/feedback` endpoints are reachable.

- [ ] 8.1 — Run:
  ```bash
  grep -n "architect" C:/Users/n.sureshmanikandan/Repo1/AgentForge/backend/app/main.py
  ```
  Expected output should show something like:
  ```
  from app.api.architect import router as architect_router
  app.include_router(architect_router, prefix="/api/architect")
  ```
  If the prefix is `/api/architect`, the routes should be decorated as `/feedback`, `/feedback/top`, `/score` (not `/api/architect/feedback`). Adjust Task 5.3 routes accordingly.

- [ ] 8.2 — Confirm the Vite proxy in `frontend/vite.config.ts` forwards `/api` to the backend (already present per `PROJECT_FRONTEND_PROMPT` rule: `proxy: { '/api': { target: 'http://localhost:8002', changeOrigin: true } }`). The feedback fetch in the widget uses `/api/architect/feedback` which is the correct full path from the browser's perspective.

---

## Task 9 — End-to-End Smoke Test

- [ ] 9.1 — Start the AgentForge backend:
  ```bash
  cd C:/Users/n.sureshmanikandan/Repo1/AgentForge/backend
  uvicorn app.main:app --reload --port 8002
  ```

- [ ] 9.2 — **Layer 3 test:** POST to `/api/architect/generate-project` with a summary containing "employee onboarding HR". Unzip the returned files and confirm `db/init.sql` exists and contains `CREATE TABLE IF NOT EXISTS employees`. Confirm `backend/run_migrations.py` exists.

- [ ] 9.3 — **Layer 4 test:** With `OTEL_EXPORTER=console` in env, POST to `/api/architect/generate-ui` and observe console output — you should see span events for `llm.kb_extraction` (if documents provided) and `llm.generate_ui`. Confirm generated ZIP contains `backend/telemetry.py`, `docker-compose.jaeger.yml`, `.env.example`.

- [ ] 9.4 — **Layer 5 test:**
  1. POST `{"session_id":"s1","plan_id":"p1","rating":1,"prompt_text":"HR app","plan_summary":"...","detected_type":"HR_APP"}` to `/api/architect/feedback` — expect `{"ok": true, "total": 1}`.
  2. GET `/api/architect/feedback/top` — expect array with 1 entry.
  3. POST `/api/architect/score` with a sample prompt — expect JSON with `overall` key.
  4. In the browser, open the Plan tab after generating a plan and verify the 👍/👎 widget appears at the bottom. Click 👍 and verify the "Thanks!" label appears.

- [ ] 9.5 — Final commit if all checks pass:
  ```bash
  git add .
  git commit -m "feat: AgentForge enterprise layers 3+4+5 — DB auto-setup, OTel spans, AI reinforcement loop"
  ```

---

## Reference: Exact Edit Locations

| Task | File | Anchor text to find | What to do |
|---|---|---|---|
| 1 | architect.py | After `_enforce_agentic_structure` function (~line 2306) | Insert `_SQL_SCHEMAS` dict + `_detect_domain` function |
| 2 | architect.py | `all_files = _enforce_agentic_structure(...)` (~line 2774) | Replace subsequent README + return block with extended version |
| 3.1 | architect.py | `try:\n            kb_response = client.chat.completions.create(` (~line 1738) | Wrap call in `_tracer.start_as_current_span("llm.kb_extraction")` |
| 3.2 | architect.py | `response = client.chat.completions.create(` (~line 1997, outside CHATBOT branch) | Wrap in `_tracer.start_as_current_span("llm.generate_ui")` |
| 3.3 | architect.py | `with _tracer.start_as_current_span("architect.generate_frontend") as fe_span:` (~line 2723) | Add `fe_span.set_attribute("llm.model", ...)` after the `with` opens |
| 4 | architect.py | After Layer 3 block inside `generate_project` | Insert Layer 4B OTel file injection block |
| 5.2 | architect.py | After `trace_status` helper (~line 17) | Insert `_feedback_store`, `FeedbackRequest`, `ScorerRequest` |
| 5.3 | architect.py | Before `@router.post("/generate-project")` (~line 2697) | Insert three new endpoint functions |
| 6 | architect.py | `messages_payload = [{"role": "system", "content": UI_GEN_PROMPT},` in `else:` branch (~line 1992) | Replace with few-shot injection + messages_payload build |
| 7.1 | Architect.tsx | `function PlanTab(` opening, line 521 | Add three useState + submitFeedback helpers before early-return |
| 7.2 | Architect.tsx | Closing `</div>` of root div in PlanTab return, line ~597 | Insert feedback widget div before closing tag |

---

## Notes

- `_feedback_store` is in-memory only. In production, replace with a `feedback` PostgreSQL table (use the `ANALYST_APP` schema as a starting point, or add a new table). This is explicitly out of scope for this plan.
- The few-shot injection in Task 6 only fires when `len(_feedback_store) >= 3` to avoid degrading quality with a single noisy example.
- Layer 4B copies `telemetry.py` by reading the actual file at request time via `pathlib.Path(__file__)` — this keeps the generated copy always in sync with AgentForge's own telemetry module without maintaining a separate string constant.
- The feedback widget's `plan_id` is derived from `plan.summary.slice(0, 40)` as a cheap identifier. If sessions ever have a stable UUID exposed on the `Plan` object in the future, swap that in.
