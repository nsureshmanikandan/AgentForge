# AgentForge — Enterprise AI Agent Platform

> Build, orchestrate, test, and govern production-grade AI agents — visually.
> Powered by **Azure OpenAI GPT-4o & GPT-4.5** · Self-hosted · No vendor lock-in.

---

## Table of Contents

- [What is AgentForge?](#what-is-agentforge)
- [Core Features](#core-features)
- [Observability & Tracing](#observability--tracing)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Run Without Docker (Local Dev)](#run-without-docker-local-dev)
- [Run With Docker](#run-with-docker)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [Roadmap](#roadmap)

---

## What is AgentForge?

AgentForge is a full-stack enterprise AI agent platform that lets teams:

- **Design** multi-agent workflows on a visual drag-drop canvas (no code)
- **Generate** agents from a plain-English description via GPT-4o
- **Protect** every output with built-in PII redaction and hallucination detection
- **Test** agents in a simulation engine before promoting to production
- **Observe** every run through a control plane with full audit logs
- **Trace** every agent call end-to-end with OpenTelemetry — export to Jaeger, Azure Monitor, GCP, AWS, or Datadog
- **Govern** access with JWT-based RBAC (Admin / Developer / Viewer)

---

## Core Features

### 1. Visual Agent Builder (ReactFlow Canvas)
- Drag-drop canvas powered by **ReactFlow v12** with dark mode and animated edges
- Add, connect, and remove agent nodes with no code
- "+ Add Agent" button inserts new nodes at runtime

### 2. Prompt-to-Agent Generation
- Describe your agent in plain English → **GPT-4o** generates:
  - Agent name and description
  - System prompt
  - Model selection (GPT-4o / GPT-4.5)
  - Tool list and guardrail config

### 3. Multi-Agent Orchestration
- **Manager/worker pattern**: manager agent decides worker execution order via a JSON list
- Workers run sequentially; each worker passes output as context to the next
- Every worker runs its own independent guardrails pass

### 4. RAG Knowledge Pipeline
- Upload **PDF** and **TXT** files via the API
- **LangChain** `RecursiveCharacterTextSplitter` chunks content into 500-token segments (50-token overlap)
- Stored in **PostgreSQL + pgvector** for similarity lookup
- Top-3 most relevant chunks injected into GPT-4o context on every query
- Responses include source attribution (filename + chunk index)

### 5. Enterprise Guardrails Engine
- **PII Redaction** — Microsoft Presidio `AnalyzerEngine` + `AnonymizerEngine`
  - Entities: `EMAIL_ADDRESS`, `PHONE_NUMBER`, `PERSON`, `CREDIT_CARD`, `US_SSN`
- **Hallucination Detection** — phrase-pattern engine flags uncertain language
- Both checks run on **every agent output** before the response is returned
- Guardrail triggers are logged to the audit table and counted in the dashboard

### 6. Simulation / Test Engine
- Define test cases: `{ input, expected_contains }`
- Batch-run against any agent config
- Returns: `{ total, passed, failed, pass_rate, results[] }`
- Use as a CI/CD gate — only promote agents with acceptable pass rates

### 7. Native Tool Integrations (7 tools)
| Tool | Description |
|------|-------------|
| `web_search` | Live internet queries |
| `calculator` | Safe math eval via Python `math` module |
| `email` | Send email via SMTP credentials |
| `slack` | Post to channels or DMs |
| `github` | Read repos, open issues, create PRs |
| `jira` | Create, update, query Jira tickets |
| `google_drive` | Read, write, search Drive files |

### 8. Control Plane & Audit Logs
- `GET /api/control-plane/stats` — total agents, runs, guardrail triggers, avg latency
- `GET /api/control-plane/audit-logs` — paginated full run history
- `GET /api/control-plane/agents/{id}/versions` — version snapshot list

### 9. Agent Versioning
- Every `PUT /api/agents/{id}` save creates an immutable `AgentVersion` snapshot
- Full config stored: name, system prompt, model, tools, guardrails
- Roll back to any prior version from the control plane

### 10. RBAC + JWT Authentication
| Role | Permissions |
|------|-------------|
| `ADMIN` | Full access — create, edit, delete, view all logs |
| `DEVELOPER` | Create and run agents, upload docs, run simulations |
| `VIEWER` | Read-only access to agents and audit logs |

### 11. Azure OpenAI Integration
- Routes `gpt-4-5` model tag to **GPT-4.5 deployment**
- All other models route to **GPT-4o deployment**
- Supports both standard `chat()` and streaming `stream_chat()` modes

### 12. Docker Compose Stack
- `postgres` service with `pgvector` extension and `pg_isready` healthcheck
- Backend `depends_on: postgres: condition: service_healthy` — no race condition
- Frontend served via Vite dev server on port `5173`

---

## Observability & Tracing

AgentForge ships full **end-to-end OpenTelemetry (OTEL) distributed tracing** — instrument once, route to any backend by changing a single env var.

### Trace architecture

Every agent run produces a nested span tree:

```
HTTP request  (FastAPI OTEL middleware — auto)
└── agent.run
      ├── llm.chat              ← Azure OpenAI call (model, tokens, latency)
      ├── guardrails.check      ← PII scan + hallucination detection
      ├── rag.query             ← knowledge base retrieval (if used)
      └── agent.worker ×N       ← each worker in multi-agent runs
```

Each span carries structured attributes. The `trace_id` is written to `AuditLog` so every database record links back to its full distributed trace.

### Span attributes

| Span | Key attributes |
|------|---------------|
| `agent.run` | `agent.name`, `agent.model`, `agent.guardrail_triggered`, `agent.latency_ms` |
| `llm.chat` | `llm.model`, `llm.provider`, `llm.temperature`, `llm.max_tokens`, `llm.response_length` |
| `guardrails.check` | `guardrails.pii_enabled`, `guardrails.pii_triggered`, `guardrails.hallucination_triggered` |
| `rag.ingest` | `rag.filename`, `rag.chunk_count` |
| `rag.query` | `rag.question_length`, `rag.sources_found` |
| `multi_agent.run` | `agent.worker_count` |
| `agent.worker` | `agent.worker_name` |

### Supported backends — switch with one env var

Set `OTEL_EXPORTER` in `.env` to choose your backend:

| Value | Backend | Notes |
|-------|---------|-------|
| `jaeger` | **Self-hosted Jaeger** *(default)* | Included in `docker-compose.yml`. UI at `http://localhost:16686` |
| `azure` | **Azure Monitor / Application Insights** | Set `AZURE_MONITOR_CONNECTION_STRING`. Install `pip install azure-monitor-opentelemetry-exporter` |
| `gcp` | **Google Cloud Trace** | Set `GCP_PROJECT_ID`. Install `pip install opentelemetry-exporter-gcp-trace` |
| `aws` | **AWS X-Ray via ADOT** | Point `OTEL_EXPORTER_OTLP_ENDPOINT` at your AWS ADOT collector sidecar |
| `datadog` | **Datadog APM** | Point `OTEL_EXPORTER_OTLP_ENDPOINT` at Datadog Agent port `4318` |
| `console` | **stdout** | Dev/debug — prints spans to terminal |
| `none` | **Disabled** | Zero overhead, no spans emitted |

`azure` and `gcp` fall back to `console` gracefully if their SDK is not installed — startup never crashes.

### Jaeger (default — with Docker)

```bash
docker-compose up --build

# Jaeger UI:  http://localhost:16686
# Search service: agentforge
# Every agent run shows the full span waterfall
```

### Azure Monitor / Application Insights

```bash
pip install azure-monitor-opentelemetry-exporter
```

```env
OTEL_EXPORTER=azure
AZURE_MONITOR_CONNECTION_STRING=InstrumentationKey=your-key;IngestionEndpoint=...
```

### Google Cloud Trace

```bash
pip install opentelemetry-exporter-gcp-trace
```

```env
OTEL_EXPORTER=gcp
GCP_PROJECT_ID=your-gcp-project-id
```

### AWS X-Ray (via ADOT collector)

Deploy the [AWS Distro for OpenTelemetry (ADOT)](https://aws-otel.github.io/) collector as a sidecar, then:

```env
OTEL_EXPORTER=aws
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Datadog APM

Run the Datadog Agent with OTLP ingestion enabled, then:

```env
OTEL_EXPORTER=datadog
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Key files

| File | Purpose |
|------|---------|
| `backend/app/core/telemetry.py` | Exporter factory, `setup_telemetry()`, `get_tracer()`, `current_trace_id()` |
| `backend/app/core/azure_openai.py` | `llm.chat` spans |
| `backend/app/core/orchestrator.py` | `agent.run` + `multi_agent.run` + `agent.worker` spans |
| `backend/app/core/guardrails.py` | `guardrails.check` spans |
| `backend/app/core/rag_engine.py` | `rag.ingest` + `rag.query` spans |
| `backend/app/models/audit.py` | `trace_id` column links DB records to traces |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite, TypeScript, ReactFlow v12, Zustand, Axios, TailwindCSS, React Router DOM v6 |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 async, asyncpg, Alembic, Pydantic v2 |
| **AI / LLM** | Azure OpenAI GPT-4o, Azure OpenAI GPT-4.5, LangChain, python-jose |
| **Guardrails** | Microsoft Presidio, spaCy `en_core_web_lg` |
| **Database** | PostgreSQL 16 + pgvector extension |
| **Auth** | JWT (python-jose), bcrypt==4.0.1 (passlib) |
| **Testing** | pytest, pytest-asyncio (`asyncio_mode = auto`) |
| **Observability** | OpenTelemetry SDK, OTLP exporter, FastAPI/SQLAlchemy/httpx auto-instrumentation |
| **Tracing backends** | Jaeger (default), Azure Monitor, Google Cloud Trace, AWS X-Ray (ADOT), Datadog |
| **Infra** | Docker, Docker Compose, pgvector/pgvector:pg16 image, Jaeger all-in-one |

---

## Prerequisites

### Without Docker
- **Python 3.12+** — [python.org](https://www.python.org/downloads/)
- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **PostgreSQL 16** with **pgvector** extension installed
- **Git**

### With Docker
- **Docker Desktop** — [docs.docker.com/get-docker](https://docs.docker.com/get-docker/)
- **Docker Compose v2+**

---

## Run Without Docker (Local Dev)

### Step 1 — Clone and configure

```bash
git clone https://github.com/your-org/agentforge.git
cd AgentForge

cp .env.example .env
# Open .env and fill in your Azure OpenAI keys and database URL
```

### Step 2 — Set up PostgreSQL with pgvector

Install PostgreSQL 16 locally, then open `psql` as a superuser and run:

```sql
CREATE USER architect WITH PASSWORD 'architect';
CREATE DATABASE agentforge OWNER architect;
\c agentforge
CREATE EXTENSION IF NOT EXISTS vector;
```

Update `DATABASE_URL` in `.env`:
```
DATABASE_URL=postgresql+asyncpg://architect:architect@localhost:5432/agentforge
```

### Step 3 — Set up Python backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate — Windows
venv\Scripts\activate

# Activate — macOS / Linux
source venv/bin/activate

# Install all dependencies
pip install -r requirements.txt

# Download spaCy language model (required for Presidio PII detection)
python -m spacy download en_core_web_lg
```

### Step 4 — Run database migrations

```bash
# Inside backend/ with venv active
alembic upgrade head
```

> **First time only** — if no `alembic.ini` exists:
> ```bash
> alembic init alembic
> # Set sqlalchemy.url in alembic.ini to your DATABASE_URL value
> alembic revision --autogenerate -m "initial"
> alembic upgrade head
> ```

### Step 5 — Start the backend API server

```bash
# Inside backend/ with venv active
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Step 6 — Set up and start the frontend

Open a **new terminal**:

```bash
cd frontend

# Install Node dependencies
npm install

# Start Vite dev server
npm run dev
```

Frontend: `http://localhost:5173`

### Step 7 — Create your first admin user

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin1234!","role":"ADMIN"}'
```

Then open `http://localhost:5173` and log in.

---

## Run With Docker

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — add your Azure OpenAI keys

# 2. Build and start all services (postgres + backend + frontend)
docker-compose up --build

# 3. Open the app
#    Frontend:  http://localhost:5173
#    API:       http://localhost:8000
#    API Docs:  http://localhost:8000/docs
```

Stop all services:
```bash
docker-compose down
```

Wipe the database volume:
```bash
docker-compose down -v
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource URL | `https://myresource.openai.azure.com/` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | `sk-...` |
| `AZURE_OPENAI_DEPLOYMENT_GPT4O` | GPT-4o deployment name | `gpt-4o` |
| `AZURE_OPENAI_DEPLOYMENT_GPT45` | GPT-4.5 deployment name | `gpt-4-5` |
| `AZURE_OPENAI_API_VERSION` | API version | `2024-12-01-preview` |
| `DATABASE_URL` | Async PostgreSQL connection string | `postgresql+asyncpg://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret key for signing JWT tokens | Any long random string |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `JWT_EXPIRE_MINUTES` | Token expiry in minutes | `480` |
| `AZURE_SEARCH_ENDPOINT` | Azure AI Search URL (optional) | `https://mysearch.search.windows.net` |
| `AZURE_SEARCH_KEY` | Azure AI Search key (optional) | `...` |
| `AZURE_SEARCH_INDEX` | Azure AI Search index name (optional) | `agentforge-index` |
| **Observability** | | |
| `OTEL_EXPORTER` | Tracing backend: `jaeger` \| `azure` \| `gcp` \| `aws` \| `datadog` \| `console` \| `none` | `jaeger` |
| `OTEL_SERVICE_NAME` | Service name shown in trace UI | `agentforge` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP collector endpoint | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_ENDPOINT_GRPC` | OTLP gRPC collector endpoint | `http://localhost:4317` |
| `AZURE_MONITOR_CONNECTION_STRING` | Application Insights connection string (when `OTEL_EXPORTER=azure`) | `InstrumentationKey=...` |
| `GCP_PROJECT_ID` | GCP project for Cloud Trace (when `OTEL_EXPORTER=gcp`) | `my-project-id` |

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login, returns JWT token |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/agents/generate` | NL prompt → agent config (GPT-4o) |
| `POST` | `/api/agents/` | Create a new agent |
| `GET` | `/api/agents/` | List all agents |
| `GET` | `/api/agents/{id}` | Get agent by ID |
| `PUT` | `/api/agents/{id}` | Update agent (creates version snapshot) |
| `DELETE` | `/api/agents/{id}` | Delete agent |
| `POST` | `/api/agents/{id}/run` | Run agent with guardrails |

### RAG / Knowledge Base
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rag/knowledge-bases` | Create a knowledge base |
| `POST` | `/api/rag/knowledge-bases/{id}/ingest` | Upload and chunk a document |
| `POST` | `/api/rag/knowledge-bases/{id}/query` | Query knowledge base |

### Tools
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tools/` | List all available tools |
| `POST` | `/api/tools/{name}/execute` | Execute a specific tool |

### Simulation
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/simulation/run` | Run batch simulation test |

### Control Plane
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/control-plane/stats` | Dashboard metrics |
| `GET` | `/api/control-plane/audit-logs` | Paginated audit log |
| `GET` | `/api/control-plane/agents/{id}/versions` | Agent version history |

---

## Project Structure

```
AgentForge/
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI route modules
│   │   │   ├── agents.py
│   │   │   ├── auth.py
│   │   │   ├── control_plane.py
│   │   │   ├── rag.py
│   │   │   ├── simulation.py
│   │   │   └── tools.py
│   │   ├── core/           # Business logic
│   │   │   ├── azure_openai.py    # LLM client — llm.chat spans
│   │   │   ├── guardrails.py      # PII + hallucination — guardrails.check spans
│   │   │   ├── orchestrator.py    # agent.run + multi_agent spans
│   │   │   ├── prompt_to_agent.py
│   │   │   ├── rag_engine.py      # rag.ingest + rag.query spans
│   │   │   ├── simulation.py
│   │   │   ├── telemetry.py       # OTEL setup — exporter factory + helpers
│   │   │   └── tool_registry.py
│   │   ├── models/         # SQLAlchemy ORM models
│   │   │   ├── agent.py
│   │   │   ├── audit.py
│   │   │   ├── rag.py
│   │   │   └── user.py
│   │   ├── schemas/        # Pydantic request/response schemas
│   │   ├── tests/          # pytest test suite (32 tests)
│   │   ├── config.py       # pydantic-settings configuration
│   │   ├── database.py     # SQLAlchemy async engine + session
│   │   └── main.py         # FastAPI app + router mounts
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/            # Axios API client modules
│   │   ├── components/
│   │   │   ├── agents/     # AgentConfigPanel
│   │   │   └── canvas/     # AgentCanvas (ReactFlow)
│   │   ├── pages/          # Dashboard, WorkflowBuilder, Login
│   │   ├── store/          # Zustand auth store
│   │   └── App.tsx         # Router + protected routes
│   ├── package.json
│   └── Dockerfile
├── docs/
│   ├── AgentForge-Presentation.pptx
│   └── plans/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## Running Tests

```bash
cd backend

# Activate virtual environment
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS / Linux

# Run all 32 tests
pytest app/tests/ -v

# Run with short traceback
pytest app/tests/ -v --tb=short
```

Expected output: **32 passed**

---

## Roadmap

| Priority | Feature |
|----------|---------|
| High | Azure AI Search — replace in-memory RAG with full vector search |
| High | WebSocket streaming — real-time token-by-token agent responses |
| High | Live tool credentials UI — connect real Slack, GitHub, email |
| Medium | In-browser agent chat — test agents directly in the builder |
| Medium | Multi-tenant workspaces — isolated agents, RAG, logs per team |
| Medium | OTEL metrics — token usage counters, guardrail trigger rates, error rates via OTLP metrics pipeline |
| Low | GPT-4.5 fine-tuning — train on domain-specific knowledge base data |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built with Azure OpenAI · FastAPI · React · LangChain · Microsoft Presidio · OpenTelemetry
