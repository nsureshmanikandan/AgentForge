# AIArchitect

Enterprise AI Agent Builder Platform — a Lyzr Architect-like platform built with React, FastAPI, and Azure OpenAI.

## Features

- **Visual Agent Builder** — drag-drop ReactFlow canvas to compose multi-agent workflows
- **Prompt-to-Agent** — describe an agent in plain English, GPT-4o generates the full config
- **Multi-Agent Orchestration** — manager/worker pattern for complex workflows
- **RAG Pipeline** — upload documents, query knowledge bases
- **Guardrails** — PII redaction (Presidio) + hallucination detection on every response
- **Simulation Engine** — batch test agents with pass/fail scoring before production
- **Control Plane** — audit logs, agent versioning, platform stats
- **Tool Registry** — email, Slack, GitHub, Jira, web search, calculator

## Tech Stack

- **Frontend:** React 18, Vite, TypeScript, TailwindCSS, ReactFlow, Zustand
- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async), PostgreSQL + pgvector
- **AI:** Azure OpenAI GPT-4o / GPT-4.5
- **Guardrails:** Microsoft Presidio, spaCy

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Azure OpenAI resource with GPT-4o and GPT-4.5 deployments

### Setup

```bash
cp .env.example .env
# Edit .env and fill in your Azure OpenAI keys
```

### Run

```bash
docker-compose up --build
```

- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Development (without Docker)

### Backend
```bash
cd backend
pip install -r requirements.txt
python -m spacy download en_core_web_lg
set JWT_SECRET=dev-secret
set DATABASE_URL=postgresql+asyncpg://architect:architect@localhost:5432/aiarchitect
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Tests
```bash
cd backend
set JWT_SECRET=test-secret
set DATABASE_URL=postgresql+asyncpg://architect:architect@localhost:5432/aiarchitect
python -m pytest app/tests/ -v
```

## Project Structure

```
AIArchitect/
├── frontend/          # React + Vite + TypeScript
├── backend/           # FastAPI + SQLAlchemy
│   └── app/
│       ├── api/       # REST endpoints
│       ├── core/      # Business logic (orchestrator, guardrails, RAG)
│       ├── models/    # SQLAlchemy ORM models
│       └── schemas/   # Pydantic schemas
└── docker-compose.yml
```
