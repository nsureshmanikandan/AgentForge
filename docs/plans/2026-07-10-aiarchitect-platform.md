# AIArchitect Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Lyzr Architect-like enterprise AI agent builder platform with visual drag-drop workflow canvas, multi-agent orchestration, RAG pipelines, built-in guardrails, and a control plane — powered by Azure OpenAI GPT-4o/GPT-4.5.

**Architecture:** React (Vite + TypeScript) SPA frontend communicates with a Python FastAPI backend via REST + WebSocket. The backend orchestrates agents using a manager/worker pattern, stores agent configs and audit logs in PostgreSQL, and uses Azure AI Search + pgvector for RAG. Guardrails run as middleware on every agent response before it reaches the user.

**Tech Stack:** React 18, Vite, TypeScript, TailwindCSS, ReactFlow (canvas), Zustand, FastAPI, SQLAlchemy, PostgreSQL, pgvector, Azure OpenAI GPT-4o / GPT-4.5, Azure AI Search, LangChain, Presidio (PII), Docker Compose.

---

## Project Structure

```
AIArchitect/
├── frontend/                          # React + Vite + TypeScript
│   ├── src/
│   │   ├── api/                       # Axios API client + types
│   │   ├── components/
│   │   │   ├── canvas/                # ReactFlow drag-drop agent canvas
│   │   │   ├── agents/                # Agent config panels + forms
│   │   │   ├── rag/                   # RAG pipeline UI
│   │   │   ├── control-plane/         # Live monitoring dashboard
│   │   │   ├── simulation/            # Test runner UI
│   │   │   └── auth/                  # Login, RBAC, user management
│   │   ├── pages/                     # Route-level pages
│   │   ├── store/                     # Zustand global state
│   │   └── types/                     # Shared TypeScript types
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── backend/                           # Python FastAPI
│   ├── app/
│   │   ├── main.py                    # FastAPI app entry point
│   │   ├── config.py                  # Azure OpenAI keys, DB URL, env vars
│   │   ├── database.py                # SQLAlchemy engine + session
│   │   ├── models/                    # SQLAlchemy ORM models
│   │   │   ├── agent.py               # Agent, AgentVersion
│   │   │   ├── workflow.py            # Workflow, WorkflowNode, WorkflowEdge
│   │   │   ├── user.py                # User, Role, Permission
│   │   │   ├── audit.py               # AuditLog
│   │   │   └── rag.py                 # KnowledgeBase, Document
│   │   ├── schemas/                   # Pydantic request/response schemas
│   │   │   ├── agent.py
│   │   │   ├── workflow.py
│   │   │   ├── user.py
│   │   │   └── rag.py
│   │   ├── api/                       # FastAPI routers
│   │   │   ├── auth.py                # Login, JWT, RBAC
│   │   │   ├── agents.py              # CRUD + run agent
│   │   │   ├── workflows.py           # CRUD + execute workflow
│   │   │   ├── rag.py                 # Upload docs, query KB
│   │   │   ├── tools.py               # Tool registry + connector configs
│   │   │   ├── simulation.py          # Run simulation tests
│   │   │   └── control_plane.py       # Live traces, logs, guardrail tuning
│   │   ├── core/
│   │   │   ├── azure_openai.py        # Azure OpenAI client wrapper (GPT-4o/4.5)
│   │   │   ├── orchestrator.py        # Manager + worker agent orchestration
│   │   │   ├── guardrails.py          # Hallucination + PII detection middleware
│   │   │   ├── rag_engine.py          # Document ingestion + retrieval
│   │   │   ├── tool_registry.py       # Tool definitions + execution
│   │   │   ├── prompt_to_agent.py     # NL prompt → agent config generator
│   │   │   └── audit.py               # Audit log writer
│   │   └── tests/
│   │       ├── test_agents.py
│   │       ├── test_orchestrator.py
│   │       ├── test_guardrails.py
│   │       ├── test_rag.py
│   │       └── test_simulation.py
│   ├── requirements.txt
│   ├── alembic/                       # DB migrations
│   └── Dockerfile
│
├── docker-compose.yml                 # Postgres + pgvector + backend + frontend
├── .env.example
└── README.md
```

---

## Phase 1: Foundation — FastAPI + DB + Azure OpenAI + React Scaffold

### Task 1: Project Bootstrap

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create `.env.example`**

```env
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://YOUR_RESOURCE.openai.azure.com/
AZURE_OPENAI_API_KEY=your_key_here
AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o
AZURE_OPENAI_DEPLOYMENT_GPT45=gpt-4-5
AZURE_OPENAI_API_VERSION=2024-12-01-preview

# Database
DATABASE_URL=postgresql+asyncpg://architect:architect@localhost:5432/aiarchitect

# Auth
JWT_SECRET=change_me_in_production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480

# Azure AI Search (RAG)
AZURE_SEARCH_ENDPOINT=https://YOUR_SEARCH.search.windows.net
AZURE_SEARCH_KEY=your_search_key
AZURE_SEARCH_INDEX=aiarchitect-index
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
version: "3.9"
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: architect
      POSTGRES_PASSWORD: architect
      POSTGRES_DB: aiarchitect
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - postgres
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
    command: npm run dev -- --host

volumes:
  pgdata:
```

- [ ] **Step 3: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
alembic==1.13.3
pydantic==2.9.2
pydantic-settings==2.5.2
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.12
openai==1.51.0
langchain==0.3.3
langchain-openai==0.2.3
langchain-community==0.3.3
pgvector==0.3.3
presidio-analyzer==2.2.355
presidio-anonymizer==2.2.355
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.2
```

- [ ] **Step 4: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    azure_openai_endpoint: str
    azure_openai_api_key: str
    azure_openai_deployment_gpt4o: str = "gpt-4o"
    azure_openai_deployment_gpt45: str = "gpt-4-5"
    azure_openai_api_version: str = "2024-12-01-preview"

    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    azure_search_endpoint: str = ""
    azure_search_key: str = ""
    azure_search_index: str = "aiarchitect-index"

    class Config:
        env_file = ".env"

settings = Settings()
```

- [ ] **Step 5: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, agents, workflows, rag, tools, simulation, control_plane
from app.database import engine, Base

app = FastAPI(title="AIArchitect", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["workflows"])
app.include_router(rag.router, prefix="/api/rag", tags=["rag"])
app.include_router(tools.router, prefix="/api/tools", tags=["tools"])
app.include_router(simulation.router, prefix="/api/simulation", tags=["simulation"])
app.include_router(control_plane.router, prefix="/api/control-plane", tags=["control-plane"])

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Create `backend/app/database.py`**

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

- [ ] **Step 7: Scaffold React frontend**

```bash
cd C:\Users\n.sureshmanikandan\Repo1\AIArchitect
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @xyflow/react zustand axios react-router-dom @radix-ui/react-dialog @radix-ui/react-tabs lucide-react tailwindcss @tailwindcss/vite
```

- [ ] **Step 8: Start Postgres with Docker, verify connection**

```bash
cd C:\Users\n.sureshmanikandan\Repo1\AIArchitect
cp .env.example .env
# Fill in your Azure OpenAI keys in .env
docker-compose up postgres -d
```

- [ ] **Step 9: Commit**

```bash
git init
git add .
git commit -m "feat: project bootstrap — FastAPI + React + Docker scaffold"
```

---

## Phase 2: Database Models + Auth + RBAC

### Task 2: SQLAlchemy Models

**Files:**
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/agent.py`
- Create: `backend/app/models/workflow.py`
- Create: `backend/app/models/audit.py`
- Create: `backend/app/models/rag.py`
- Create: `backend/app/models/__init__.py`

- [ ] **Step 1: Write failing test for User model**

```python
# backend/app/tests/test_models.py
import pytest
from app.models.user import User, Role

def test_user_model_fields():
    user = User(
        email="test@example.com",
        hashed_password="hashed",
        full_name="Test User",
        role=Role.ADMIN,
    )
    assert user.email == "test@example.com"
    assert user.role == Role.ADMIN
```

Run: `pytest backend/app/tests/test_models.py -v`
Expected: FAIL (ImportError)

- [ ] **Step 2: Create `backend/app/models/user.py`**

```python
import uuid
import enum
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Role(str, enum.Enum):
    ADMIN = "admin"
    DEVELOPER = "developer"
    VIEWER = "viewer"

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[Role] = mapped_column(SAEnum(Role), default=Role.DEVELOPER)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 3: Create `backend/app/models/agent.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    system_prompt: Mapped[str] = mapped_column(String, default="")
    model: Mapped[str] = mapped_column(String, default="gpt-4o")
    tools: Mapped[list] = mapped_column(JSON, default=list)
    guardrails: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    versions: Mapped[list["AgentVersion"]] = relationship("AgentVersion", back_populates="agent")

class AgentVersion(Base):
    __tablename__ = "agent_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id: Mapped[str] = mapped_column(String, ForeignKey("agents.id"))
    version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    agent: Mapped["Agent"] = relationship("Agent", back_populates="versions")
```

- [ ] **Step 4: Create `backend/app/models/workflow.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    nodes: Mapped[list] = mapped_column(JSON, default=list)   # ReactFlow node configs
    edges: Mapped[list] = mapped_column(JSON, default=list)   # ReactFlow edge configs
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 5: Create `backend/app/models/audit.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)   # e.g. "agent.run", "agent.update"
    resource_type: Mapped[str] = mapped_column(String, nullable=False)
    resource_id: Mapped[str] = mapped_column(String, nullable=True)
    input_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True)
    output_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True)
    guardrail_triggered: Mapped[bool] = mapped_column(default=False)
    latency_ms: Mapped[int] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 6: Create `backend/app/models/rag.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    agent_id: Mapped[str] = mapped_column(String, ForeignKey("agents.id"), nullable=True)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kb_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"))
    filename: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=True)
    chunk_count: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String, default="processing")  # processing | ready | failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 7: Create `backend/app/models/__init__.py`**

```python
from app.models.user import User, Role
from app.models.agent import Agent, AgentVersion
from app.models.workflow import Workflow
from app.models.audit import AuditLog
from app.models.rag import KnowledgeBase, Document
```

- [ ] **Step 8: Run Alembic migration**

```bash
cd backend
alembic init alembic
# Edit alembic/env.py to import Base from app.database and set target_metadata = Base.metadata
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

- [ ] **Step 9: Run test to verify model fields pass**

```bash
pytest backend/app/tests/test_models.py -v
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/app/models/ backend/app/tests/test_models.py
git commit -m "feat: database models — User, Agent, Workflow, AuditLog, KnowledgeBase"
```

---

### Task 3: Auth API — JWT + RBAC

**Files:**
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/core/security.py`
- Create: `backend/app/api/auth.py`
- Create: `backend/app/tests/test_auth.py`

- [ ] **Step 1: Write failing auth test**

```python
# backend/app/tests/test_auth.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_register_and_login():
    async with AsyncClient(app=app, base_url="http://test") as client:
        r = await client.post("/api/auth/register", json={
            "email": "admin@test.com",
            "password": "Test1234!",
            "full_name": "Admin User"
        })
        assert r.status_code == 201

        r = await client.post("/api/auth/login", data={
            "username": "admin@test.com",
            "password": "Test1234!"
        })
        assert r.status_code == 200
        assert "access_token" in r.json()
```

Run: `pytest backend/app/tests/test_auth.py -v`
Expected: FAIL (ImportError / 404)

- [ ] **Step 2: Create `backend/app/schemas/user.py`**

```python
from pydantic import BaseModel, EmailStr
from app.models.user import Role

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: Role

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

- [ ] **Step 3: Create `backend/app/core/security.py`**

```python
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
```

- [ ] **Step 4: Create `backend/app/api/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserRegister, UserOut, Token
from app.core.security import hash_password, verify_password, create_access_token

router = APIRouter()

@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: UserRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=body.email, hashed_password=hash_password(body.password), full_name=body.full_name)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == form.username))
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user.id, user.role.value)
    return {"access_token": token}
```

- [ ] **Step 5: Run auth test**

```bash
pytest backend/app/tests/test_auth.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/auth.py backend/app/core/security.py backend/app/schemas/user.py backend/app/tests/test_auth.py
git commit -m "feat: JWT auth — register, login, RBAC roles"
```

---

## Phase 3: Azure OpenAI Core + Prompt-to-Agent Generator

### Task 4: Azure OpenAI Client Wrapper

**Files:**
- Create: `backend/app/core/azure_openai.py`
- Create: `backend/app/tests/test_azure_openai.py`

- [ ] **Step 1: Write failing test**

```python
# backend/app/tests/test_azure_openai.py
import pytest
from unittest.mock import AsyncMock, patch
from app.core.azure_openai import AzureOpenAIClient

@pytest.mark.asyncio
async def test_chat_returns_string():
    client = AzureOpenAIClient(model="gpt-4o")
    with patch.object(client._client.chat.completions, "create", new_callable=AsyncMock) as mock_create:
        mock_create.return_value.choices = [
            type("Choice", (), {"message": type("Msg", (), {"content": "Hello"})()})()
        ]
        result = await client.chat([{"role": "user", "content": "Hi"}])
        assert result == "Hello"
```

Run: `pytest backend/app/tests/test_azure_openai.py -v`
Expected: FAIL

- [ ] **Step 2: Create `backend/app/core/azure_openai.py`**

```python
from openai import AsyncAzureOpenAI
from app.config import settings

class AzureOpenAIClient:
    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        deployment = (
            settings.azure_openai_deployment_gpt45
            if "4-5" in model or "5" in model
            else settings.azure_openai_deployment_gpt4o
        )
        self.deployment = deployment
        self._client = AsyncAzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )

    async def chat(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 2048) -> str:
        response = await self._client.chat.completions.create(
            model=self.deployment,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    async def stream_chat(self, messages: list[dict]):
        stream = await self._client.chat.completions.create(
            model=self.deployment,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
```

- [ ] **Step 3: Run test**

```bash
pytest backend/app/tests/test_azure_openai.py -v
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/azure_openai.py backend/app/tests/test_azure_openai.py
git commit -m "feat: Azure OpenAI GPT-4o/4.5 async client wrapper"
```

---

### Task 5: Prompt-to-Agent Generator

**Files:**
- Create: `backend/app/core/prompt_to_agent.py`
- Create: `backend/app/tests/test_prompt_to_agent.py`

- [ ] **Step 1: Write failing test**

```python
# backend/app/tests/test_prompt_to_agent.py
import pytest
from unittest.mock import AsyncMock, patch
from app.core.prompt_to_agent import generate_agent_config

@pytest.mark.asyncio
async def test_generate_returns_agent_config():
    mock_response = '{"name":"HR Bot","description":"Handles HR queries","system_prompt":"You are an HR assistant.","model":"gpt-4o","tools":["email"],"guardrails":{"pii":true,"hallucination":true}}'
    with patch("app.core.prompt_to_agent.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value=mock_response)
        result = await generate_agent_config("Build an HR assistant that answers employee questions")
        assert result["name"] == "HR Bot"
        assert "system_prompt" in result
        assert result["guardrails"]["pii"] is True
```

Run: `pytest backend/app/tests/test_prompt_to_agent.py -v`
Expected: FAIL

- [ ] **Step 2: Create `backend/app/core/prompt_to_agent.py`**

```python
import json
from app.core.azure_openai import AzureOpenAIClient

SYSTEM_PROMPT = """You are an AI agent architect. Given a natural language description of an agent, 
return ONLY a valid JSON object with these exact fields:
{
  "name": "string — short agent name",
  "description": "string — one sentence description",
  "system_prompt": "string — detailed system prompt for the agent",
  "model": "gpt-4o",
  "tools": ["list of tool names from: email, slack, github, jira, google_drive, notion, web_search, calculator"],
  "guardrails": {
    "pii": true,
    "hallucination": true,
    "max_tokens": 2048
  }
}
Return ONLY the JSON. No explanation."""

async def generate_agent_config(user_description: str) -> dict:
    client = AzureOpenAIClient(model="gpt-4o")
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_description},
    ]
    raw = await client.chat(messages, temperature=0.3)
    raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
    return json.loads(raw)
```

- [ ] **Step 3: Run test**

```bash
pytest backend/app/tests/test_prompt_to_agent.py -v
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/prompt_to_agent.py backend/app/tests/test_prompt_to_agent.py
git commit -m "feat: prompt-to-agent — NL description generates full agent config via GPT-4o"
```

---

## Phase 4: Guardrails Engine (Hallucination + PII)

### Task 6: Guardrails Middleware

**Files:**
- Create: `backend/app/core/guardrails.py`
- Create: `backend/app/tests/test_guardrails.py`

- [ ] **Step 1: Write failing test**

```python
# backend/app/tests/test_guardrails.py
import pytest
from app.core.guardrails import GuardrailsEngine

@pytest.mark.asyncio
async def test_pii_redaction():
    engine = GuardrailsEngine(pii_enabled=True, hallucination_enabled=False)
    result = await engine.check("Contact John at john.doe@example.com or 555-1234")
    assert "john.doe@example.com" not in result["output"]
    assert result["pii_triggered"] is True

@pytest.mark.asyncio
async def test_no_pii_passes():
    engine = GuardrailsEngine(pii_enabled=True, hallucination_enabled=False)
    result = await engine.check("The capital of France is Paris.")
    assert result["pii_triggered"] is False
    assert result["output"] == "The capital of France is Paris."
```

Run: `pytest backend/app/tests/test_guardrails.py -v`
Expected: FAIL

- [ ] **Step 2: Create `backend/app/core/guardrails.py`**

```python
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

class GuardrailResult:
    def __init__(self, output: str, pii_triggered: bool, hallucination_triggered: bool, blocked: bool):
        self.output = output
        self.pii_triggered = pii_triggered
        self.hallucination_triggered = hallucination_triggered
        self.blocked = blocked

    def dict(self):
        return {
            "output": self.output,
            "pii_triggered": self.pii_triggered,
            "hallucination_triggered": self.hallucination_triggered,
            "blocked": self.blocked,
        }

class GuardrailsEngine:
    def __init__(self, pii_enabled: bool = True, hallucination_enabled: bool = True):
        self.pii_enabled = pii_enabled
        self.hallucination_enabled = hallucination_enabled

    async def check(self, text: str) -> dict:
        pii_triggered = False
        output = text

        if self.pii_enabled:
            results = analyzer.analyze(text=text, language="en")
            if results:
                pii_triggered = True
                anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
                output = anonymized.text

        # Hallucination check: flag responses with known uncertainty phrases
        hallucination_triggered = False
        if self.hallucination_enabled:
            uncertainty_phrases = [
                "i'm not sure but", "i think maybe", "i believe but i'm not certain",
                "it might be", "i cannot verify"
            ]
            lower = output.lower()
            if any(phrase in lower for phrase in uncertainty_phrases):
                hallucination_triggered = True

        return GuardrailResult(
            output=output,
            pii_triggered=pii_triggered,
            hallucination_triggered=hallucination_triggered,
            blocked=False,
        ).dict()
```

- [ ] **Step 3: Run test**

```bash
pytest backend/app/tests/test_guardrails.py -v
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/guardrails.py backend/app/tests/test_guardrails.py
git commit -m "feat: guardrails engine — PII redaction via Presidio + hallucination phrase detection"
```

---

## Phase 5: Agent Orchestrator (Manager + Worker Pattern)

### Task 7: Orchestrator Core

**Files:**
- Create: `backend/app/core/orchestrator.py`
- Create: `backend/app/tests/test_orchestrator.py`

- [ ] **Step 1: Write failing test**

```python
# backend/app/tests/test_orchestrator.py
import pytest
from unittest.mock import AsyncMock, patch
from app.core.orchestrator import AgentOrchestrator

@pytest.mark.asyncio
async def test_single_agent_run():
    config = {
        "name": "Test Agent",
        "system_prompt": "You are a helpful assistant.",
        "model": "gpt-4o",
        "tools": [],
        "guardrails": {"pii": True, "hallucination": True},
    }
    orch = AgentOrchestrator(config)
    with patch.object(orch._llm, "chat", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = "Paris is the capital of France."
        result = await orch.run("What is the capital of France?")
        assert "Paris" in result["output"]
        assert result["guardrail_triggered"] is False
```

Run: `pytest backend/app/tests/test_orchestrator.py -v`
Expected: FAIL

- [ ] **Step 2: Create `backend/app/core/orchestrator.py`**

```python
from app.core.azure_openai import AzureOpenAIClient
from app.core.guardrails import GuardrailsEngine
import time

class AgentOrchestrator:
    def __init__(self, agent_config: dict):
        self.config = agent_config
        self._llm = AzureOpenAIClient(model=agent_config.get("model", "gpt-4o"))
        guardrail_cfg = agent_config.get("guardrails", {})
        self._guardrails = GuardrailsEngine(
            pii_enabled=guardrail_cfg.get("pii", True),
            hallucination_enabled=guardrail_cfg.get("hallucination", True),
        )

    async def run(self, user_input: str, chat_history: list[dict] = None) -> dict:
        start = time.monotonic()
        messages = [{"role": "system", "content": self.config.get("system_prompt", "")}]
        if chat_history:
            messages.extend(chat_history)
        messages.append({"role": "user", "content": user_input})

        raw_output = await self._llm.chat(messages)
        guardrail_result = await self._guardrails.check(raw_output)
        latency_ms = int((time.monotonic() - start) * 1000)

        return {
            "output": guardrail_result["output"],
            "raw_output": raw_output,
            "guardrail_triggered": guardrail_result["pii_triggered"] or guardrail_result["hallucination_triggered"],
            "pii_triggered": guardrail_result["pii_triggered"],
            "hallucination_triggered": guardrail_result["hallucination_triggered"],
            "latency_ms": latency_ms,
        }


class MultiAgentOrchestrator:
    """Manager agent coordinates multiple worker agents."""

    def __init__(self, manager_config: dict, worker_configs: list[dict]):
        self.manager = AgentOrchestrator(manager_config)
        self.workers = {cfg["name"]: AgentOrchestrator(cfg) for cfg in worker_configs}

    async def run(self, user_input: str) -> dict:
        # Manager decides which workers to invoke
        manager_prompt = f"""You are a manager agent. Given the user request below, 
decide which worker agents to invoke (from: {list(self.workers.keys())}) and in what order.
Return ONLY a JSON list of worker names: ["WorkerA", "WorkerB"]

User request: {user_input}"""

        import json
        manager_result = await self.manager.run(manager_prompt)
        try:
            worker_order = json.loads(manager_result["output"].strip())
        except Exception:
            worker_order = list(self.workers.keys())[:1]

        results = []
        context = user_input
        for worker_name in worker_order:
            if worker_name in self.workers:
                result = await self.workers[worker_name].run(context)
                results.append({"agent": worker_name, "result": result})
                context = result["output"]

        return {
            "final_output": context,
            "steps": results,
            "guardrail_triggered": any(r["result"]["guardrail_triggered"] for r in results),
        }
```

- [ ] **Step 3: Run test**

```bash
pytest backend/app/tests/test_orchestrator.py -v
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/orchestrator.py backend/app/tests/test_orchestrator.py
git commit -m "feat: agent orchestrator — single agent + multi-agent manager/worker pattern"
```

---

## Phase 6: Agents REST API

### Task 8: Agents CRUD + Run Endpoint

**Files:**
- Create: `backend/app/schemas/agent.py`
- Create: `backend/app/api/agents.py`
- Create: `backend/app/tests/test_agents_api.py`

- [ ] **Step 1: Write failing test**

```python
# backend/app/tests/test_agents_api.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_and_get_agent(auth_token):
    async with AsyncClient(app=app, base_url="http://test") as client:
        r = await client.post("/api/agents/", json={
            "name": "Support Bot",
            "description": "Handles support tickets",
            "system_prompt": "You are a support assistant.",
            "model": "gpt-4o",
            "tools": [],
            "guardrails": {"pii": True, "hallucination": True}
        }, headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 201
        agent_id = r.json()["id"]

        r = await client.get(f"/api/agents/{agent_id}", headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200
        assert r.json()["name"] == "Support Bot"
```

Run: `pytest backend/app/tests/test_agents_api.py -v`
Expected: FAIL

- [ ] **Step 2: Create `backend/app/schemas/agent.py`**

```python
from pydantic import BaseModel
from datetime import datetime

class AgentCreate(BaseModel):
    name: str
    description: str = ""
    system_prompt: str
    model: str = "gpt-4o"
    tools: list[str] = []
    guardrails: dict = {"pii": True, "hallucination": True}

class AgentOut(BaseModel):
    id: str
    name: str
    description: str
    system_prompt: str
    model: str
    tools: list[str]
    guardrails: dict
    created_by: str
    current_version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AgentRunRequest(BaseModel):
    input: str
    chat_history: list[dict] = []

class AgentRunResponse(BaseModel):
    output: str
    guardrail_triggered: bool
    pii_triggered: bool
    hallucination_triggered: bool
    latency_ms: int
```

- [ ] **Step 3: Create `backend/app/api/agents.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.agent import Agent, AgentVersion
from app.models.audit import AuditLog
from app.schemas.agent import AgentCreate, AgentOut, AgentRunRequest, AgentRunResponse
from app.core.orchestrator import AgentOrchestrator
import json

router = APIRouter()

@router.post("/", response_model=AgentOut, status_code=201)
async def create_agent(body: AgentCreate, db: AsyncSession = Depends(get_db)):
    agent = Agent(**body.model_dump(), created_by="system")
    db.add(agent)
    await db.flush()
    version = AgentVersion(agent_id=agent.id, version=1, snapshot=body.model_dump())
    db.add(version)
    await db.commit()
    await db.refresh(agent)
    return agent

@router.get("/", response_model=list[AgentOut])
async def list_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent))
    return result.scalars().all()

@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@router.put("/{agent_id}", response_model=AgentOut)
async def update_agent(agent_id: str, body: AgentCreate, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in body.model_dump().items():
        setattr(agent, field, value)
    agent.current_version += 1
    version = AgentVersion(agent_id=agent.id, version=agent.current_version, snapshot=body.model_dump())
    db.add(version)
    await db.commit()
    await db.refresh(agent)
    return agent

@router.post("/{agent_id}/run", response_model=AgentRunResponse)
async def run_agent(agent_id: str, body: AgentRunRequest, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    config = {
        "name": agent.name,
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "tools": agent.tools,
        "guardrails": agent.guardrails,
    }
    orch = AgentOrchestrator(config)
    result = await orch.run(body.input, body.chat_history)
    log = AuditLog(
        action="agent.run",
        resource_type="agent",
        resource_id=agent_id,
        input_snapshot={"input": body.input},
        output_snapshot={"output": result["output"]},
        guardrail_triggered=result["guardrail_triggered"],
        latency_ms=result["latency_ms"],
    )
    db.add(log)
    await db.commit()
    return result
```

- [ ] **Step 4: Run test**

```bash
pytest backend/app/tests/test_agents_api.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/agents.py backend/app/schemas/agent.py backend/app/tests/test_agents_api.py
git commit -m "feat: agents API — CRUD, versioning, run with guardrails + audit log"
```

---

## Phase 7: RAG Engine + Knowledge Base API

### Task 9: RAG Engine (Azure AI Search + LangChain)

**Files:**
- Create: `backend/app/core/rag_engine.py`
- Create: `backend/app/api/rag.py`
- Create: `backend/app/tests/test_rag.py`

- [ ] **Step 1: Write failing test**

```python
# backend/app/tests/test_rag.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.core.rag_engine import RAGEngine

@pytest.mark.asyncio
async def test_query_returns_answer():
    engine = RAGEngine(kb_id="test-kb")
    with patch.object(engine, "_retrieve", new_callable=AsyncMock) as mock_retrieve, \
         patch.object(engine._llm, "chat", new_callable=AsyncMock) as mock_chat:
        mock_retrieve.return_value = ["Azure is a cloud platform by Microsoft."]
        mock_chat.return_value = "Azure is Microsoft's cloud platform."
        result = await engine.query("What is Azure?")
        assert "Azure" in result["answer"]
        assert len(result["sources"]) > 0
```

Run: `pytest backend/app/tests/test_rag.py -v`
Expected: FAIL

- [ ] **Step 2: Create `backend/app/core/rag_engine.py`**

```python
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from app.core.azure_openai import AzureOpenAIClient
from app.config import settings
import tempfile, os

class RAGEngine:
    def __init__(self, kb_id: str):
        self.kb_id = kb_id
        self._llm = AzureOpenAIClient(model="gpt-4o")
        self._chunks: list[str] = []  # In-memory fallback; replace with Azure AI Search in prod

    async def ingest(self, file_bytes: bytes, filename: str) -> int:
        suffix = os.path.splitext(filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        if suffix == ".pdf":
            loader = PyPDFLoader(tmp_path)
        else:
            loader = TextLoader(tmp_path)

        docs = loader.load()
        splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = splitter.split_documents(docs)
        self._chunks.extend([c.page_content for c in chunks])
        os.unlink(tmp_path)
        return len(chunks)

    async def _retrieve(self, query: str, top_k: int = 3) -> list[str]:
        # Simple keyword match fallback — replace with Azure AI Search vector query
        scored = [(c, sum(w in c.lower() for w in query.lower().split())) for c in self._chunks]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [c for c, _ in scored[:top_k] if _ > 0]

    async def query(self, question: str) -> dict:
        sources = await self._retrieve(question)
        context = "\n\n".join(sources) if sources else "No relevant context found."
        messages = [
            {"role": "system", "content": "Answer using only the provided context. If unsure, say so."},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ]
        answer = await self._llm.chat(messages, temperature=0.1)
        return {"answer": answer, "sources": sources}
```

- [ ] **Step 3: Create `backend/app/api/rag.py`**

```python
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.database import get_db
from app.models.rag import KnowledgeBase, Document
from app.core.rag_engine import RAGEngine

router = APIRouter()
_engines: dict[str, RAGEngine] = {}

def get_engine(kb_id: str) -> RAGEngine:
    if kb_id not in _engines:
        _engines[kb_id] = RAGEngine(kb_id=kb_id)
    return _engines[kb_id]

class KBCreate(BaseModel):
    name: str
    description: str = ""

class QueryRequest(BaseModel):
    question: str

@router.post("/knowledge-bases", status_code=201)
async def create_kb(body: KBCreate, db: AsyncSession = Depends(get_db)):
    kb = KnowledgeBase(name=body.name, description=body.description, created_by="system")
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return kb

@router.post("/knowledge-bases/{kb_id}/upload")
async def upload_document(kb_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    contents = await file.read()
    engine = get_engine(kb_id)
    chunk_count = await engine.ingest(contents, file.filename)
    doc = Document(kb_id=kb_id, filename=file.filename, chunk_count=chunk_count, status="ready")
    db.add(doc)
    await db.commit()
    return {"filename": file.filename, "chunks": chunk_count, "status": "ready"}

@router.post("/knowledge-bases/{kb_id}/query")
async def query_kb(kb_id: str, body: QueryRequest):
    engine = get_engine(kb_id)
    result = await engine.query(body.question)
    return result
```

- [ ] **Step 4: Run test**

```bash
pytest backend/app/tests/test_rag.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/rag_engine.py backend/app/api/rag.py backend/app/tests/test_rag.py
git commit -m "feat: RAG engine — document ingestion, chunking, retrieval + knowledge base API"
```

---

## Phase 8: Simulation Engine

### Task 10: Agent Simulation / Test Runner

**Files:**
- Create: `backend/app/core/simulation.py`
- Create: `backend/app/api/simulation.py`
- Create: `backend/app/tests/test_simulation.py`

- [ ] **Step 1: Write failing test**

```python
# backend/app/tests/test_simulation.py
import pytest
from unittest.mock import AsyncMock, patch
from app.core.simulation import SimulationRunner

@pytest.mark.asyncio
async def test_simulation_runs_test_cases():
    config = {
        "name": "Test Agent", "system_prompt": "You are helpful.",
        "model": "gpt-4o", "tools": [], "guardrails": {"pii": True, "hallucination": True}
    }
    test_cases = [
        {"input": "What is 2+2?", "expected_contains": "4"},
        {"input": "Hello", "expected_contains": "hello"},
    ]
    runner = SimulationRunner(config, test_cases)
    with patch("app.core.simulation.AgentOrchestrator") as MockOrch:
        instance = MockOrch.return_value
        instance.run = AsyncMock(side_effect=[
            {"output": "The answer is 4.", "guardrail_triggered": False, "pii_triggered": False, "hallucination_triggered": False, "latency_ms": 100},
            {"output": "Hello there!", "guardrail_triggered": False, "pii_triggered": False, "hallucination_triggered": False, "latency_ms": 80},
        ])
        results = await runner.run()
        assert results["passed"] == 2
        assert results["failed"] == 0
```

Run: `pytest backend/app/tests/test_simulation.py -v`
Expected: FAIL

- [ ] **Step 2: Create `backend/app/core/simulation.py`**

```python
from app.core.orchestrator import AgentOrchestrator

class SimulationRunner:
    def __init__(self, agent_config: dict, test_cases: list[dict]):
        self.config = agent_config
        self.test_cases = test_cases

    async def run(self) -> dict:
        orch = AgentOrchestrator(self.config)
        results = []
        for tc in self.test_cases:
            result = await orch.run(tc["input"])
            expected = tc.get("expected_contains", "").lower()
            passed = expected in result["output"].lower() if expected else True
            results.append({
                "input": tc["input"],
                "output": result["output"],
                "expected_contains": expected,
                "passed": passed,
                "guardrail_triggered": result["guardrail_triggered"],
                "latency_ms": result["latency_ms"],
            })
        passed_count = sum(1 for r in results if r["passed"])
        return {
            "total": len(results),
            "passed": passed_count,
            "failed": len(results) - passed_count,
            "pass_rate": round(passed_count / len(results) * 100, 1) if results else 0,
            "results": results,
        }
```

- [ ] **Step 3: Create `backend/app/api/simulation.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.database import get_db
from app.models.agent import Agent
from app.core.simulation import SimulationRunner

router = APIRouter()

class TestCase(BaseModel):
    input: str
    expected_contains: str = ""

class SimulationRequest(BaseModel):
    test_cases: list[TestCase]

@router.post("/{agent_id}/run")
async def run_simulation(agent_id: str, body: SimulationRequest, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    config = {
        "name": agent.name,
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "tools": agent.tools,
        "guardrails": agent.guardrails,
    }
    runner = SimulationRunner(config, [tc.model_dump() for tc in body.test_cases])
    return await runner.run()
```

- [ ] **Step 4: Run test**

```bash
pytest backend/app/tests/test_simulation.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/simulation.py backend/app/api/simulation.py backend/app/tests/test_simulation.py
git commit -m "feat: simulation engine — batch test runner with pass/fail scoring"
```

---

## Phase 9: Tool Registry + Native Integrations

### Task 11: Tool Registry

**Files:**
- Create: `backend/app/core/tool_registry.py`
- Create: `backend/app/api/tools.py`

- [ ] **Step 1: Create `backend/app/core/tool_registry.py`**

```python
from pydantic import BaseModel
from typing import Callable, Awaitable
import httpx

class ToolDefinition(BaseModel):
    name: str
    description: str
    parameters: dict  # JSON Schema

TOOL_REGISTRY: dict[str, ToolDefinition] = {
    "web_search": ToolDefinition(
        name="web_search",
        description="Search the web for current information",
        parameters={"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
    ),
    "calculator": ToolDefinition(
        name="calculator",
        description="Evaluate a math expression",
        parameters={"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]},
    ),
    "email": ToolDefinition(
        name="email",
        description="Send an email",
        parameters={"type": "object", "properties": {
            "to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}
        }, "required": ["to", "subject", "body"]},
    ),
    "slack": ToolDefinition(
        name="slack",
        description="Post a message to a Slack channel",
        parameters={"type": "object", "properties": {
            "channel": {"type": "string"}, "message": {"type": "string"}
        }, "required": ["channel", "message"]},
    ),
    "github": ToolDefinition(
        name="github",
        description="Create a GitHub issue",
        parameters={"type": "object", "properties": {
            "repo": {"type": "string"}, "title": {"type": "string"}, "body": {"type": "string"}
        }, "required": ["repo", "title"]},
    ),
}

async def execute_tool(tool_name: str, params: dict, credentials: dict = None) -> str:
    if tool_name == "calculator":
        try:
            return str(eval(params["expression"], {"__builtins__": {}}))
        except Exception as e:
            return f"Error: {e}"
    # Stub implementations — wire real APIs via credentials in production
    return f"[{tool_name}] executed with params: {params}"
```

- [ ] **Step 2: Create `backend/app/api/tools.py`**

```python
from fastapi import APIRouter
from app.core.tool_registry import TOOL_REGISTRY, ToolDefinition

router = APIRouter()

@router.get("/", response_model=list[ToolDefinition])
async def list_tools():
    return list(TOOL_REGISTRY.values())
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/tool_registry.py backend/app/api/tools.py
git commit -m "feat: tool registry — web_search, calculator, email, slack, github definitions"
```

---

## Phase 10: Control Plane API + Audit Logs

### Task 12: Control Plane

**Files:**
- Create: `backend/app/api/control_plane.py`

- [ ] **Step 1: Create `backend/app/api/control_plane.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.database import get_db
from app.models.audit import AuditLog
from app.models.agent import Agent, AgentVersion

router = APIRouter()

@router.get("/audit-logs")
async def get_audit_logs(limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "action": l.action,
            "resource_type": l.resource_type,
            "resource_id": l.resource_id,
            "guardrail_triggered": l.guardrail_triggered,
            "latency_ms": l.latency_ms,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]

@router.get("/agents/{agent_id}/versions")
async def get_agent_versions(agent_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentVersion).where(AgentVersion.agent_id == agent_id).order_by(desc(AgentVersion.version))
    )
    versions = result.scalars().all()
    return [{"version": v.version, "snapshot": v.snapshot, "created_at": v.created_at.isoformat()} for v in versions]

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func
    agent_count = await db.scalar(select(func.count(Agent.id)))
    log_count = await db.scalar(select(func.count(AuditLog.id)))
    guardrail_count = await db.scalar(select(func.count(AuditLog.id)).where(AuditLog.guardrail_triggered == True))
    avg_latency = await db.scalar(select(func.avg(AuditLog.latency_ms)))
    return {
        "total_agents": agent_count,
        "total_runs": log_count,
        "guardrail_triggers": guardrail_count,
        "avg_latency_ms": round(avg_latency or 0, 1),
    }
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/control_plane.py
git commit -m "feat: control plane — audit logs, agent versioning, platform stats"
```

---

## Phase 11: React Frontend

### Task 13: Frontend Scaffold + API Client + Auth

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/store/auth.ts`
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Create `frontend/src/api/client.ts`**

```typescript
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", new URLSearchParams({ username: email, password })),
  register: (email: string, password: string, full_name: string) =>
    api.post("/auth/register", { email, password, full_name }),
};

export const agentsApi = {
  list: () => api.get("/agents/"),
  create: (data: object) => api.post("/agents/", data),
  get: (id: string) => api.get(`/agents/${id}`),
  update: (id: string, data: object) => api.put(`/agents/${id}`, data),
  run: (id: string, input: string) => api.post(`/agents/${id}/run`, { input }),
  generateFromPrompt: (description: string) =>
    api.post("/agents/generate", { description }),
};

export const ragApi = {
  createKB: (name: string, description: string) =>
    api.post("/rag/knowledge-bases", { name, description }),
  upload: (kbId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/rag/knowledge-bases/${kbId}/upload`, form);
  },
  query: (kbId: string, question: string) =>
    api.post(`/rag/knowledge-bases/${kbId}/query`, { question }),
};

export const simulationApi = {
  run: (agentId: string, testCases: object[]) =>
    api.post(`/simulation/${agentId}/run`, { test_cases: testCases }),
};

export const controlPlaneApi = {
  stats: () => api.get("/control-plane/stats"),
  auditLogs: () => api.get("/control-plane/audit-logs"),
  versions: (agentId: string) => api.get(`/control-plane/agents/${agentId}/versions`),
};

export default api;
```

- [ ] **Step 2: Create `frontend/src/store/auth.ts`**

```typescript
import { create } from "zustand";

interface AuthStore {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthStore>((set) => ({
  token: localStorage.getItem("token"),
  login: (token) => {
    localStorage.setItem("token", token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem("token");
    set({ token: null });
  },
}));
```

- [ ] **Step 3: Create `frontend/src/pages/Login.tsx`**

```tsx
import { useState } from "react";
import { useAuth } from "../store/auth";
import { authApi } from "../api/client";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await authApi.login(email, password);
      login(res.data.access_token);
      navigate("/");
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-96">
        <h1 className="text-2xl font-bold text-white mb-6">AIArchitect</h1>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        <input className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 mb-3 outline-none"
          placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 mb-6 outline-none"
          type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        <button onClick={handleLogin}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 font-semibold">
          Sign In
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: React frontend — API client, Zustand auth store, Login page"
```

---

### Task 14: Agent Builder Canvas (ReactFlow)

**Files:**
- Create: `frontend/src/components/canvas/AgentCanvas.tsx`
- Create: `frontend/src/components/agents/AgentConfigPanel.tsx`
- Create: `frontend/src/pages/WorkflowBuilder.tsx`

- [ ] **Step 1: Create `frontend/src/components/canvas/AgentCanvas.tsx`**

```tsx
import { useCallback } from "react";
import {
  ReactFlow, addEdge, useNodesState, useEdgesState,
  Controls, MiniMap, Background, Connection, Edge, Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const initialNodes: Node[] = [
  { id: "input", type: "input", position: { x: 100, y: 200 }, data: { label: "User Input" } },
  { id: "agent-1", position: { x: 350, y: 200 }, data: { label: "Agent 1" } },
  { id: "output", type: "output", position: { x: 600, y: 200 }, data: { label: "Response" } },
];
const initialEdges: Edge[] = [
  { id: "e1-2", source: "input", target: "agent-1" },
  { id: "e2-3", source: "agent-1", target: "output" },
];

interface AgentCanvasProps {
  onNodeSelect: (nodeId: string) => void;
}

export default function AgentCanvas({ onNodeSelect }: AgentCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const addAgentNode = () => {
    const id = `agent-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      { id, position: { x: Math.random() * 400 + 100, y: Math.random() * 200 + 100 }, data: { label: "New Agent" } },
    ]);
  };

  return (
    <div className="w-full h-full relative">
      <button onClick={addAgentNode}
        className="absolute top-4 left-4 z-10 bg-violet-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
        + Add Agent
      </button>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeSelect(node.id)}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background gap={16} />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/agents/AgentConfigPanel.tsx`**

```tsx
import { useState } from "react";
import { agentsApi } from "../../api/client";

const TOOLS = ["email", "slack", "github", "jira", "google_drive", "web_search", "calculator"];

interface Props {
  agentId?: string;
  onSave: () => void;
}

export default function AgentConfigPanel({ onSave }: Props) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [tools, setTools] = useState<string[]>([]);
  const [nlPrompt, setNlPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const generateFromNL = async () => {
    setLoading(true);
    try {
      const res = await agentsApi.generateFromPrompt(nlPrompt);
      const config = res.data;
      setName(config.name);
      setDescription(config.description);
      setPrompt(config.system_prompt);
      setModel(config.model);
      setTools(config.tools);
    } finally {
      setLoading(false);
    }
  };

  const saveAgent = async () => {
    await agentsApi.create({ name, description, system_prompt: prompt, model, tools,
      guardrails: { pii: true, hallucination: true } });
    onSave();
  };

  const toggleTool = (tool: string) =>
    setTools(prev => prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]);

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
      <h2 className="text-white font-semibold mb-4">Agent Config</h2>

      <div className="mb-4 p-3 bg-gray-800 rounded-lg">
        <p className="text-gray-400 text-xs mb-2">Generate from description</p>
        <textarea className="w-full bg-gray-700 text-white text-sm rounded p-2 mb-2 resize-none"
          rows={2} placeholder="Describe your agent..." value={nlPrompt}
          onChange={e => setNlPrompt(e.target.value)} />
        <button onClick={generateFromNL} disabled={loading}
          className="w-full bg-violet-600 text-white text-sm py-1.5 rounded disabled:opacity-50">
          {loading ? "Generating..." : "Generate with GPT-4o"}
        </button>
      </div>

      <input className="w-full bg-gray-800 text-white rounded px-3 py-2 mb-2 text-sm"
        placeholder="Agent Name" value={name} onChange={e => setName(e.target.value)} />
      <textarea className="w-full bg-gray-800 text-white rounded px-3 py-2 mb-2 text-sm resize-none"
        rows={4} placeholder="System Prompt" value={prompt} onChange={e => setPrompt(e.target.value)} />

      <select className="w-full bg-gray-800 text-white rounded px-3 py-2 mb-3 text-sm"
        value={model} onChange={e => setModel(e.target.value)}>
        <option value="gpt-4o">GPT-4o</option>
        <option value="gpt-4-5">GPT-4.5</option>
      </select>

      <p className="text-gray-400 text-xs mb-2">Tools</p>
      <div className="flex flex-wrap gap-1 mb-4">
        {TOOLS.map(t => (
          <button key={t} onClick={() => toggleTool(t)}
            className={`text-xs px-2 py-1 rounded ${tools.includes(t) ? "bg-violet-600 text-white" : "bg-gray-700 text-gray-300"}`}>
            {t}
          </button>
        ))}
      </div>

      <button onClick={saveAgent}
        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-medium text-sm">
        Save Agent
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/pages/WorkflowBuilder.tsx`**

```tsx
import { useState } from "react";
import AgentCanvas from "../components/canvas/AgentCanvas";
import AgentConfigPanel from "../components/agents/AgentConfigPanel";

export default function WorkflowBuilder() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex h-screen bg-gray-950">
      <div className="flex-1">
        <AgentCanvas onNodeSelect={setSelectedNode} />
      </div>
      {selectedNode && (
        <AgentConfigPanel agentId={selectedNode} onSave={() => setSaved(true)} />
      )}
      {saved && (
        <div className="absolute bottom-6 right-6 bg-green-600 text-white px-4 py-2 rounded-lg">
          Agent saved!
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ frontend/src/pages/WorkflowBuilder.tsx
git commit -m "feat: visual workflow builder — ReactFlow canvas + agent config panel + prompt-to-agent UI"
```

---

### Task 15: Dashboard + Control Plane UI

**Files:**
- Create: `frontend/src/pages/Dashboard.tsx`
- Create: `frontend/src/components/control-plane/AuditLogTable.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/pages/Dashboard.tsx`**

```tsx
import { useEffect, useState } from "react";
import { controlPlaneApi, agentsApi } from "../api/client";

interface Stats { total_agents: number; total_runs: number; guardrail_triggers: number; avg_latency_ms: number; }

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    controlPlaneApi.stats().then(r => setStats(r.data));
    agentsApi.list().then(r => setAgents(r.data));
  }, []);

  const StatCard = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5`}>
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );

  return (
    <div className="p-8 bg-gray-950 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-6">Control Plane</h1>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Agents" value={stats?.total_agents ?? "—"} color="text-violet-400" />
        <StatCard label="Total Runs" value={stats?.total_runs ?? "—"} color="text-blue-400" />
        <StatCard label="Guardrail Triggers" value={stats?.guardrail_triggers ?? "—"} color="text-orange-400" />
        <StatCard label="Avg Latency" value={stats ? `${stats.avg_latency_ms}ms` : "—"} color="text-green-400" />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="font-semibold mb-4">Agents</h2>
        <div className="space-y-2">
          {agents.map(a => (
            <div key={a.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-gray-400 text-sm">{a.model} · v{a.current_version}</p>
              </div>
              <span className="text-xs bg-violet-600 px-2 py-1 rounded">{a.tools?.length ?? 0} tools</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./store/auth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import WorkflowBuilder from "./pages/WorkflowBuilder";

function Nav() {
  const { logout } = useAuth();
  return (
    <nav className="h-14 bg-gray-900 border-b border-gray-800 flex items-center px-6 gap-6">
      <span className="text-violet-400 font-bold text-lg">AIArchitect</span>
      <Link to="/" className="text-gray-300 hover:text-white text-sm">Dashboard</Link>
      <Link to="/builder" className="text-gray-300 hover:text-white text-sm">Builder</Link>
      <button onClick={logout} className="ml-auto text-gray-400 hover:text-white text-sm">Logout</button>
    </nav>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Nav /><Dashboard /></Protected>} />
        <Route path="/builder" element={<Protected><Nav /><div className="h-[calc(100vh-56px)]"><WorkflowBuilder /></div></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Add prompt-to-agent endpoint to backend**

```python
# Add to backend/app/api/agents.py
from app.core.prompt_to_agent import generate_agent_config

class GenerateRequest(BaseModel):
    description: str

@router.post("/generate")
async def generate_agent(body: GenerateRequest):
    config = await generate_agent_config(body.description)
    return config
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/Dashboard.tsx backend/app/api/agents.py
git commit -m "feat: Dashboard + control plane UI + prompt-to-agent endpoint"
```

---

## Phase 12: Final Wiring + Run Everything

### Task 16: Integration + Docker + README

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_lg
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json .
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

- [ ] **Step 3: Run full stack**

```bash
cd C:\Users\n.sureshmanikandan\Repo1\AIArchitect
cp .env.example .env
# Fill in Azure OpenAI keys
docker-compose up --build
```

Access:
- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

- [ ] **Step 4: Run all tests**

```bash
cd backend
pytest app/tests/ -v --tb=short
```
Expected: All PASS

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: full AIArchitect platform — visual agent builder, orchestration, RAG, guardrails, control plane"
```

---

## Feature Checklist vs Lyzr Architect

| Lyzr Architect Feature | Implemented In |
|---|---|
| Prompt-to-agent generation | Task 5 + Task 15 |
| Visual drag-drop canvas | Task 14 (ReactFlow) |
| Multi-agent orchestration | Task 7 (MultiAgentOrchestrator) |
| Manager + worker agents | Task 7 |
| RAG pipeline + document ingestion | Task 9 |
| Hallucination detection | Task 6 (GuardrailsEngine) |
| PII redaction | Task 6 (Presidio) |
| Simulation / test engine | Task 10 |
| Tool integrations (email, Slack, GitHub) | Task 11 |
| Control plane (observe agents live) | Task 12 |
| Audit logs (every run traced) | Task 8 + Task 12 |
| Agent versioning | Task 8 (AgentVersion) |
| RBAC (roles: admin/dev/viewer) | Task 2 + Task 3 |
| Azure GPT-4o + GPT-4.5 | Task 4 |
| On-premise / Docker deploy | Task 16 |

---

## Next Enhancements (Post-MVP)

- Replace in-memory RAG with **Azure AI Search** vector queries
- Add **WebSocket** for real-time agent streaming in frontend
- Wire real **Slack / GitHub / Email** credentials via tool settings UI
- Add **FigJam-style** visual workflow export
- Add **multi-tenant** workspace support
