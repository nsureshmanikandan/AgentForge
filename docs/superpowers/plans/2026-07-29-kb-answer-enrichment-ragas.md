# KB Answer Enrichment + Grounding Score + Agent KB Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the KB query answer card with sources, grounding score, related questions, and 👍/👎 feedback; add KB dropdown picker in CreateAgent so agents can attach existing KBs.

**Architecture:** Backend enriches `POST /query` to return `sources` (with filename/snippet/score), `related_questions` (3 LLM-generated), and `grounding_score` (mean FAISS similarity of top chunks). A new `POST /feedback` endpoint stores votes + optional comment. Frontend introduces a shared `KBAnswerCard` component used in both `KnowledgeBases.tsx` (query modal) and `CreateAgent.tsx` (inline test panel + KB picker).

**Tech Stack:** FastAPI · SQLAlchemy · React 18 · TypeScript · Tailwind CSS · react-markdown · existing `AzureOpenAIClient`

> **Note on RAGAS:** The `ragas` library requires LLM calls per query (faithfulness, relevancy) and a 200 MB `datasets` dependency — too expensive for inline use. The plan uses **mean FAISS cosine similarity score** as the grounding proxy instead, labelled "Grounding" in the UI. RAGAS batch evaluation can be added in a future task against the `kb_feedback` table.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/schemas/rag.py` | **Create** | `SourceChunk`, `QueryResponse`, `FeedbackRequest` Pydantic models |
| `backend/app/models/rag.py` | **Modify** | Add `KBFeedback` SQLAlchemy model |
| `backend/app/core/rag_engine.py` | **Modify** | `retrieve()` returns `(text, score, doc_id, filename)` tuples; `query()` returns enriched dict |
| `backend/app/core/graph_engine.py` | **Modify** | `query()` returns enriched dict matching `QueryResponse` shape |
| `backend/app/api/rag.py` | **Modify** | `/query` uses enriched engines; add `POST /feedback` endpoint; add `_generate_related_questions()` helper |
| `backend/app/tests/test_rag.py` | **Create** | Unit tests for enriched query response shape and feedback endpoint |
| `frontend/src/components/KBAnswerCard.tsx` | **Create** | Shared structured answer card: answer + sources + entities + related questions + grounding badge + feedback |
| `frontend/src/pages/KnowledgeBases.tsx` | **Modify** | Replace plain answer box (lines 409–434) with `<KBAnswerCard>` |
| `frontend/src/pages/CreateAgent.tsx` | **Modify** | Replace upload-only KB section with dropdown picker + attached KB info card + `<KBTestPanel>` |
| `frontend/src/api/client.ts` | **Modify** | Add `ragApi.feedback()` method |

---

## Task 1 — RAG schema file + enriched `SourceChunk` / `QueryResponse`

**Files:**
- Create: `backend/app/schemas/rag.py`

- [ ] **Step 1: Create the schema file**

```python
# backend/app/schemas/rag.py
from pydantic import BaseModel
from typing import Literal


class SourceChunk(BaseModel):
    filename: str
    snippet: str       # first 200 chars of the chunk text
    score: float       # cosine similarity (0.0–1.0)
    doc_id: str        # Document.id — used to construct a View link


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]
    graph_entities: list[dict] | None = None   # Graph KB only: [{name, type}]
    related_questions: list[str] = []
    grounding_score: float | None = None       # mean(sources[].score), null if no sources
```

- [ ] **Step 2: Add `FeedbackRequest` to the same file**

```python
# append to backend/app/schemas/rag.py
class FeedbackRequest(BaseModel):
    question: str
    answer: str
    vote: Literal["up", "down"]
    comment: str | None = None    # free-text from "What was wrong?" text box
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/rag.py
git commit -m "feat(rag): add QueryResponse, SourceChunk, FeedbackRequest schemas"
```

---

## Task 2 — `KBFeedback` SQLAlchemy model

**Files:**
- Modify: `backend/app/models/rag.py`

- [ ] **Step 1: Add the model at the bottom of `backend/app/models/rag.py`**

```python
class KBFeedback(Base):
    __tablename__ = "kb_feedback"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kb_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    vote: Mapped[str] = mapped_column(String(4), nullable=False)   # "up" | "down"
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: No extra registration needed**

`backend/app/main.py` line 63 already has `import app.models.rag  # noqa` in the startup handler. Since `KBFeedback` is added to `app/models/rag.py`, it is automatically registered with `Base.metadata` when the startup import runs. No changes to `main.py` or `database.py` are required.

- [ ] **Step 3: Create the table by restarting the backend**

The app uses `Base.metadata.create_all(bind=engine)` on startup (no Alembic). Restart the backend — `kb_feedback` table will be created automatically.

```bash
# In backend/ with venv activated:
uvicorn app.main:app --reload --port 8000
# Check startup logs for no errors
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/rag.py backend/app/database.py
git commit -m "feat(rag): add KBFeedback model for thumbs up/down votes"
```

---

## Task 3 — Enrich `RAGEngine.retrieve()` to return scores + doc metadata

**Files:**
- Modify: `backend/app/core/rag_engine.py`

The current `retrieve()` returns `list[str]` (chunk texts only). We need to return `(text, score, doc_id, filename)` tuples so the query endpoint can build `SourceChunk` objects.

- [ ] **Step 1: Update the `retrieve` return type and body**

Find `retrieve()` at line ~220. Replace the entire method:

```python
async def retrieve(
    self,
    question: str,
    db: AsyncSession,
    top_k: int = TOP_K,
    enforce_cutoff: bool = True,
) -> list[tuple[str, float, str, str]]:
    """Return list of (text, score, doc_id, filename) tuples."""
    index = self._load_index()
    if index is None or index.ntotal == 0:
        return []

    q_vec = await self._embedder.embed([question])
    k = min(top_k, index.ntotal)
    scores, ids = index.search(self._normalize(q_vec), k)
    candidates = [(int(i), float(s)) for i, s in zip(ids[0], scores[0]) if i >= 0]
    kept = [(i, s) for i, s in candidates if s >= SIMILARITY_CUTOFF] if enforce_cutoff else candidates
    if not kept:
        return []

    faiss_ids = [i for i, _ in kept]
    score_map = {i: s for i, s in kept}

    chunk_result = await db.execute(
        select(Chunk).where(Chunk.kb_id == self.kb_id, Chunk.faiss_id.in_(faiss_ids))
    )
    chunks = chunk_result.scalars().all()

    # Fetch document metadata for filenames
    doc_ids = list({c.document_id for c in chunks})
    doc_result = await db.execute(
        select(Document).where(Document.id.in_(doc_ids))
    )
    doc_map = {d.id: d.filename for d in doc_result.scalars().all()}

    return [
        (c.text, score_map.get(c.faiss_id, 0.0), c.document_id, doc_map.get(c.document_id, "unknown"))
        for c in sorted(chunks, key=lambda c: score_map.get(c.faiss_id, 0.0), reverse=True)
        if c.faiss_id in score_map
    ]
```

- [ ] **Step 2: Update `query()` to use the new tuple format**

Replace the `query()` method body (currently lines ~247–267):

```python
async def query(self, question: str, db: AsyncSession, top_k: int = TOP_K, enforce_cutoff: bool = True) -> dict:
    tracer = get_tracer()
    with tracer.start_as_current_span("rag.query") as span:
        span.set_attribute("rag.question_length", len(question))

        results = await self.retrieve(question, db, top_k, enforce_cutoff)
        span.set_attribute("rag.sources_found", len(results))

        if not results and enforce_cutoff:
            return {
                "answer": "I don't have enough information in the available documents to answer this.",
                "sources": [],
                "graph_entities": None,
                "related_questions": [],
                "grounding_score": None,
            }

        sources_out = [
            {"filename": filename, "snippet": text[:200], "score": round(score, 3), "doc_id": doc_id}
            for text, score, doc_id, filename in results
        ]
        context = "\n\n".join(text for text, _, _, _ in results) if results else "No relevant context found."
        messages = [
            {"role": "system", "content": "Answer using only the provided context."},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ]
        answer = await self._llm.chat(messages, temperature=0.1)

        grounding_score = round(sum(s for _, s, _, _ in results) / len(results), 3) if results else None

        return {
            "answer": answer,
            "sources": sources_out,
            "graph_entities": None,
            "related_questions": [],    # filled by rag.py router
            "grounding_score": grounding_score,
        }
```

- [ ] **Step 3: Fix the one internal caller of `retrieve()` that expects `list[str]`**

Search `rag_engine.py` for any other call to `self.retrieve(` or `engine.retrieve(`. In `graph_engine.py` line ~208 there is `rag_sources = await self._get_rag().retrieve(...)` — it only uses the text. Update that call:

```python
# In graph_engine.py, around line 208:
rag_result = await self._get_rag().retrieve(question, db, top_k=3, enforce_cutoff=False)
rag_sources = [text for text, _, _, _ in rag_result]
```

- [ ] **Step 4: Fix `orchestrator.py` — it joins sources as strings (line 57)**

`orchestrator.py` calls `retrieve()` and does `"\n\n".join(kb_sources)`. Update line 54–58:

```python
# backend/app/core/orchestrator.py lines 54–58
kb_result = await engine.retrieve(safe_input, self.db, enforce_cutoff=hallucination_enabled)
kb_sources = [text for text, _, _, _ in kb_result]   # unpack tuples → plain strings
span.set_attribute("agent.kb_sources_found", len(kb_sources))
if kb_sources:
    context = "\n\n".join(kb_sources)
    system_prompt = f"{system_prompt}\n\nUse the following retrieved document context to answer:\n{context}"
```

- [ ] **Step 5: Fix `test_rag.py` — test expects `list[str]` from `retrieve()` (lines 89–91)**

The existing test mocks a `Chunk` row but not `Document` (for the filename lookup). Update the mock and assertion:

```python
# backend/app/tests/test_rag.py — update the retrieve test (around lines 83–91)
chunk_row = MagicMock(faiss_id=0, text="marginal match", document_id="doc-1")
doc_row = MagicMock(id="doc-1", filename="test.pdf")

async def fake_execute(stmt):
    # Return chunks on first call, documents on second
    result = MagicMock()
    if "Chunk" in str(stmt) or hasattr(stmt, "_where_criteria"):
        result.scalars.return_value.all.return_value = [chunk_row]
    else:
        result.scalars.return_value.all.return_value = [doc_row]
    return result

db = AsyncMock()
db.execute.side_effect = fake_execute

with patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed:
    mock_embed.return_value = [[0.1] * 1536]
    sources = await engine.retrieve("question", db, enforce_cutoff=False)

# sources is now list[tuple[str, float, str, str]]
assert len(sources) == 1
assert sources[0][0] == "marginal match"   # text
assert sources[0][3] == "test.pdf"         # filename
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/rag_engine.py backend/app/core/graph_engine.py backend/app/core/orchestrator.py backend/app/tests/test_rag.py
git commit -m "feat(rag): enrich retrieve() to return (text, score, doc_id, filename) tuples"
```

---

## Task 4 — Enrich `GraphEngine.query()` to match `QueryResponse` shape

**Files:**
- Modify: `backend/app/core/graph_engine.py`

- [ ] **Step 1: Update the return dict in `GraphEngine.query()`**

Find the `return {` block at the end of `query()` (around line 231) and replace it:

```python
        # Build enriched sources from relationship contexts
        rag_result = await self._get_rag().retrieve(question, db, top_k=3, enforce_cutoff=False)
        rag_sources = [text for text, _, _, _ in rag_result]

        sources_out = [
            {
                "filename": filename,
                "snippet": text[:200],
                "score": round(score, 3),
                "doc_id": doc_id,
            }
            for text, score, doc_id, filename in rag_result
        ]
        grounding_score = (
            round(sum(s for _, s, _, _ in rag_result) / len(rag_result), 3)
            if rag_result else None
        )

        return {
            "answer": answer,
            "sources": sources_out,
            "graph_entities": [{"name": e.name, "type": e.entity_type} for e in relevant[:5]],
            "related_questions": [],    # filled by rag.py router
            "grounding_score": grounding_score,
        }
```

> Also remove the old `rag_sources` variable that was retrieved above the `messages` block — it's now inside the updated return section.

- [ ] **Step 2: Commit**

```bash
git add backend/app/core/graph_engine.py
git commit -m "feat(rag): enrich GraphEngine.query() to return sources + grounding_score"
```

---

## Task 5 — `_generate_related_questions()` helper + feedback endpoint in `rag.py`

**Files:**
- Modify: `backend/app/api/rag.py`

- [ ] **Step 1: Add imports at top of `rag.py`**

```python
import json
from app.schemas.rag import FeedbackRequest
from app.models.rag import KBFeedback
from app.core.azure_openai import AzureOpenAIClient
```

- [ ] **Step 2: Add `_generate_related_questions()` helper after the existing `_leading_question()` function (after line 39)**

```python
async def _generate_related_questions(question: str, answer: str) -> list[str]:
    """Ask the LLM for 3 follow-up questions. Returns [] on any failure."""
    try:
        llm = AzureOpenAIClient()
        prompt = (
            f"Given this Q&A, generate exactly 3 short follow-up questions a user might ask next.\n"
            f"Question: {question}\nAnswer: {answer[:500]}\n"
            f"Return ONLY a JSON array of 3 strings, no other text. Example: [\"Q1?\",\"Q2?\",\"Q3?\"]"
        )
        raw = await llm.chat(
            [{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=200,
        )
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            return [str(q) for q in parsed[:3]]
    except Exception:
        pass
    return []
```

- [ ] **Step 3: Update the `/query` endpoint to call `_generate_related_questions()` and return the enriched shape**

Replace the existing `query_kb` function (lines 203–210):

```python
@router.post("/knowledge-bases/{kb_id}/query")
async def query_kb(kb_id: str, body: QueryRequest, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    if kb.kb_type == "graph":
        result = await _get_graph_engine(kb_id).query(body.question, db)
    else:
        result = await _get_engine(kb_id).query(body.question, db)

    # Generate related questions in parallel-ish (best-effort, never blocks answer)
    related = await _generate_related_questions(body.question, result.get("answer", ""))
    result["related_questions"] = related
    return result
```

- [ ] **Step 4: Add the feedback endpoint after the query endpoint**

```python
@router.post("/knowledge-bases/{kb_id}/feedback", status_code=201)
async def submit_feedback(
    kb_id: str,
    body: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    feedback = KBFeedback(
        kb_id=kb_id,
        question=body.question,
        answer=body.answer,
        vote=body.vote,
        comment=body.comment,
    )
    db.add(feedback)
    await db.commit()
    return {"status": "ok"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/rag.py
git commit -m "feat(rag): enrich /query response + add /feedback endpoint + related questions"
```

---

## Task 6 — Backend test for enriched query response shape

**Files:**
- Create: `backend/app/tests/test_rag_enriched.py`

- [ ] **Step 1: Create the test file**

```python
# backend/app/tests/test_rag_enriched.py
import pytest
from httpx import AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_query_response_has_enriched_fields():
    """Query endpoint must return all QueryResponse fields even when no docs are indexed."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # First create a KB
        kb_resp = await ac.post("/api/rag/knowledge-bases", json={"name": "Test KB", "description": ""})
        assert kb_resp.status_code == 201
        kb_id = kb_resp.json()["id"]

        # Query it (empty KB → graceful no-sources response)
        q_resp = await ac.post(f"/api/rag/knowledge-bases/{kb_id}/query", json={"question": "What is this?"})
        assert q_resp.status_code == 200
        data = q_resp.json()

        assert "answer" in data
        assert "sources" in data
        assert isinstance(data["sources"], list)
        assert "related_questions" in data
        assert isinstance(data["related_questions"], list)
        assert "grounding_score" in data   # may be None
        assert "graph_entities" in data    # may be None


@pytest.mark.asyncio
async def test_feedback_endpoint_stores_vote():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        kb_resp = await ac.post("/api/rag/knowledge-bases", json={"name": "Feedback KB", "description": ""})
        kb_id = kb_resp.json()["id"]

        resp = await ac.post(
            f"/api/rag/knowledge-bases/{kb_id}/feedback",
            json={"question": "Test?", "answer": "Test answer", "vote": "down", "comment": "Wrong info"},
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "ok"
```

- [ ] **Step 2: Run tests**

```bash
cd backend
pytest app/tests/test_rag_enriched.py -v
```

Expected: both tests PASS (or xfail gracefully if LLM keys not configured — the `related_questions` generation catches all exceptions).

- [ ] **Step 3: Commit**

```bash
git add backend/app/tests/test_rag_enriched.py
git commit -m "test(rag): add tests for enriched query response shape and feedback endpoint"
```

---

## Task 7 — Add `ragApi.feedback()` to `client.ts`

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add `feedback` method to `ragApi` object (around line 76 in client.ts)**

Find the `ragApi` object. Add after the `suggestedQuestions` line:

```typescript
  feedback: (
    kbId: string,
    body: { question: string; answer: string; vote: "up" | "down"; comment?: string | null }
  ) => api.post(`/rag/knowledge-bases/${kbId}/feedback`, body),
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(api): add ragApi.feedback() for KB answer votes"
```

---

## Task 8 — Create `KBAnswerCard.tsx` shared component

**Files:**
- Create: `frontend/src/components/KBAnswerCard.tsx`

This component renders the full Option A structured card. It is used in both `KnowledgeBases.tsx` and `CreateAgent.tsx`.

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/KBAnswerCard.tsx
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ragApi } from "../api/client";

export interface SourceChunk {
  filename: string;
  snippet: string;
  score: number;
  doc_id: string;
}

interface KBAnswerCardProps {
  kbId: string;
  question: string;
  answer: string;
  sources: SourceChunk[];
  graphEntities?: { name: string; type: string }[];
  relatedQuestions: string[];
  groundingScore: number | null;
  onRelatedClick: (q: string) => void;
}

function groundingColor(score: number | null): string {
  if (score === null) return "bg-slate-400";
  if (score >= 0.8) return "bg-green-500";
  if (score >= 0.6) return "bg-amber-400";
  return "bg-red-400";
}

type FeedbackState = "idle" | "up_sent" | "down_open" | "down_sent";

export function KBAnswerCard({
  kbId,
  question,
  answer,
  sources,
  graphEntities,
  relatedQuestions,
  groundingScore,
  onRelatedClick,
}: KBAnswerCardProps) {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("idle");
  const [comment, setComment] = useState("");

  async function sendFeedback(vote: "up" | "down", commentText?: string) {
    try {
      await ragApi.feedback(kbId, { question, answer, vote, comment: commentText ?? null });
    } catch {
      // best-effort — never show error for feedback
    }
  }

  function handleThumbsUp() {
    if (feedbackState !== "idle") return;
    setFeedbackState("up_sent");
    sendFeedback("up");
  }

  function handleThumbsDown() {
    if (feedbackState !== "idle") return;
    setFeedbackState("down_open");
  }

  async function submitDownFeedback() {
    setFeedbackState("down_sent");
    await sendFeedback("down", comment || undefined);
  }

  return (
    <div className="border border-indigo-100 rounded-xl overflow-hidden">

      {/* ── Header: ANSWER + Grounding badge ── */}
      <div className="flex items-center justify-between bg-indigo-50 px-4 py-2.5 border-b border-indigo-100">
        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Answer</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Grounding</span>
          <span className={`text-white text-xs font-bold px-2 py-0.5 rounded-full ${groundingColor(groundingScore)}`}>
            {groundingScore !== null ? groundingScore.toFixed(2) : "N/A"}
          </span>
        </div>
      </div>

      {/* ── Answer body ── */}
      <div className="px-4 py-3 prose prose-sm prose-slate max-w-none prose-p:my-1.5 prose-ol:my-1.5 prose-ul:my-1.5 bg-white">
        <ReactMarkdown>{answer}</ReactMarkdown>
      </div>

      {/* ── Source Documents ── */}
      {sources.length > 0 && (
        <div className="border-t border-indigo-100 bg-slate-50 px-4 py-3">
          <details>
            <summary className="cursor-pointer text-xs font-bold text-indigo-600 list-none flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Source Documents ({sources.length} matched)
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {sources.map((src, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700">{src.filename}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                        Score: {src.score.toFixed(2)}
                      </span>
                      <a
                        href={`/knowledge-bases`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        target="_blank" rel="noreferrer"
                      >
                        View →
                      </a>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 italic line-clamp-2">"{src.snippet}"</p>
                </div>
              ))}
            </div>
          </details>

          {/* Graph entities (Graph KB only) */}
          {graphEntities && graphEntities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {graphEntities.map((e, i) => (
                <span key={i}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200">
                  {e.name}
                  <span className="text-violet-400">·</span>
                  <span className="text-violet-500">{e.type}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Related Questions ── */}
      {relatedQuestions.length > 0 && (
        <div className="border-t border-indigo-100 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Related Questions</p>
          <div className="flex flex-wrap gap-2">
            {relatedQuestions.map((q, i) => (
              <button key={i} onClick={() => onRelatedClick(q)}
                className="text-xs text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1.5 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Feedback row ── */}
      <div className="border-t border-indigo-100 bg-slate-50 px-4 py-2.5">
        {feedbackState === "up_sent" && (
          <p className="text-xs text-green-600 font-medium">Thanks for your feedback!</p>
        )}
        {feedbackState === "down_sent" && (
          <p className="text-xs text-slate-400">Thanks for your feedback.</p>
        )}
        {feedbackState === "idle" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Was this helpful?</span>
            <button onClick={handleThumbsUp}
              className="bg-green-50 border border-green-200 rounded-lg px-3 py-1 text-sm hover:bg-green-100 transition-colors">
              👍
            </button>
            <button onClick={handleThumbsDown}
              className="bg-red-50 border border-red-200 rounded-lg px-3 py-1 text-sm hover:bg-red-100 transition-colors">
              👎
            </button>
          </div>
        )}
        {feedbackState === "down_open" && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-500 font-medium">What was wrong? <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. The answer was incorrect, missing key details..."
              rows={2}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={submitDownFeedback}
                className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors font-medium">
                Submit
              </button>
              <button onClick={() => setFeedbackState("down_sent")}
                className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5">
                Skip
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/KBAnswerCard.tsx
git commit -m "feat(ui): add KBAnswerCard shared component with sources, grounding, feedback"
```

---

## Task 9 — Wire `KBAnswerCard` into `KnowledgeBases.tsx`

**Files:**
- Modify: `frontend/src/pages/KnowledgeBases.tsx`

- [ ] **Step 1: Add import at the top of `KnowledgeBases.tsx`**

```tsx
import { KBAnswerCard, type SourceChunk } from "../components/KBAnswerCard";
```

- [ ] **Step 2: Expand the state in `QueryModal` (currently lines 288–294)**

Replace the existing state declarations inside `QueryModal`:

```tsx
const [question, setQuestion] = useState("");
const [askedQuestion, setAskedQuestion] = useState("");
const [answer, setAnswer] = useState("");
const [sources, setSources] = useState<SourceChunk[]>([]);
const [graphEntities, setGraphEntities] = useState<{ name: string; type: string }[] | undefined>(undefined);
const [relatedQuestions, setRelatedQuestions] = useState<string[]>([]);
const [groundingScore, setGroundingScore] = useState<number | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
const [suggestions, setSuggestions] = useState<string[]>([]);
const [suggestionsLoading, setSuggestionsLoading] = useState(true);
```

- [ ] **Step 3: Update `runQuery()` to destructure enriched response (currently lines 309–322)**

```tsx
async function runQuery(q: string) {
  if (!q.trim()) return;
  setLoading(true);
  setAnswer(""); setSources([]); setGraphEntities(undefined);
  setRelatedQuestions([]); setGroundingScore(null);
  setError(""); setAskedQuestion(q.trim());
  try {
    const res = await ragApi.query(kb.id, q.trim());
    const data = res.data as {
      answer: string;
      sources: SourceChunk[];
      graph_entities?: { name: string; type: string }[];
      related_questions: string[];
      grounding_score: number | null;
    };
    setAnswer(data.answer);
    setSources(data.sources ?? []);
    setGraphEntities(data.graph_entities ?? undefined);
    setRelatedQuestions(data.related_questions ?? []);
    setGroundingScore(data.grounding_score ?? null);
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    setError(msg || "Query failed. Please try again.");
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 4: Update `clearQuery()` to reset new state**

```tsx
function clearQuery() {
  setQuestion(""); setAskedQuestion(""); setAnswer("");
  setSources([]); setGraphEntities(undefined);
  setRelatedQuestions([]); setGroundingScore(null); setError("");
}
```

- [ ] **Step 5: Replace the answer box (lines 409–431) with `<KBAnswerCard>`**

Find this block:
```tsx
{(loading || answer) && (
  <div className="mt-4 mx-6 mb-6 flex-1 min-h-0 flex flex-col bg-indigo-50 border border-indigo-100 rounded-xl overflow-hidden">
```

Replace the entire block (through its closing `</div>`) with:

```tsx
{loading && (
  <div className="mt-4 mx-6 mb-4 flex items-center gap-2 text-sm text-indigo-400">
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
    Thinking…
  </div>
)}

{answer && !loading && (
  <div className="mt-4 mx-6 mb-6">
    {askedQuestion && (
      <p className="text-xs text-slate-400 italic mb-2">"{askedQuestion}"</p>
    )}
    <KBAnswerCard
      kbId={kb.id}
      question={askedQuestion}
      answer={answer}
      sources={sources}
      graphEntities={graphEntities}
      relatedQuestions={relatedQuestions}
      groundingScore={groundingScore}
      onRelatedClick={(q) => { setQuestion(q); runQuery(q); }}
    />
  </div>
)}
```

- [ ] **Step 6: Widen the modal so the card fits (line 337)**

Change `max-w-lg` to `max-w-2xl`:

```tsx
<div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/KnowledgeBases.tsx
git commit -m "feat(ui): wire KBAnswerCard into KnowledgeBases QueryModal"
```

---

## Task 10 — KB Dropdown Picker in `CreateAgent.tsx`

**Files:**
- Modify: `frontend/src/pages/CreateAgent.tsx`

- [ ] **Step 1: Add new state + KB list fetch near the top of the component**

After the existing `const [kbId, setKbId] = useState<string | null>(null)` line, add:

```tsx
const [availableKBs, setAvailableKBs] = useState<
  { id: string; name: string; kb_type: string; document_count: number }[]
>([]);
const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
const [kbTestOpen, setKbTestOpen] = useState(false);
const [kbPickerMode, setKbPickerMode] = useState<"picker" | "upload">("picker");
```

- [ ] **Step 2: Fetch KB list on mount**

Find the main `useEffect` that loads agent data. Add a parallel KB fetch:

```tsx
useEffect(() => {
  ragApi.list().then((res) => {
    const data = res.data as { id: string; name: string; kb_type: string; document_count: number }[];
    setAvailableKBs(data);
  }).catch(() => {});
}, []);
```

- [ ] **Step 3: Pre-select KB if editing an existing agent**

In the existing agent-load `useEffect` (where `setAgentName`, `setSystemPrompt` etc. are set), also add:

```tsx
if (data.knowledge_base_id) {
  setSelectedKbId(data.knowledge_base_id);
  setKbPickerMode("picker");
}
```

- [ ] **Step 4: Replace the Knowledge accordion content**

Find the Knowledge accordion section (around line 1139). It currently starts with an upload-only UI. Replace the accordion **body** (keep the accordion header/toggle) with:

```tsx
{/* ── KB Picker ── */}
<div className="px-6 pb-4 pt-2 space-y-3">
  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
    Attach Knowledge Base
  </label>

  {kbPickerMode === "picker" && (
    <>
      <div className="flex items-center gap-2">
        <select
          value={selectedKbId ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "__upload__") {
              setKbPickerMode("upload");
              setSelectedKbId(null);
            } else {
              setSelectedKbId(val || null);
              setKbTestOpen(false);
            }
          }}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">— None (agent uses LLM knowledge only) —</option>
          {availableKBs.map((kb) => (
            <option key={kb.id} value={kb.id}>
              {kb.name}  ·  {kb.kb_type}  ·  {kb.document_count} docs
            </option>
          ))}
          <option value="__upload__">➕  Upload files to create a new KB...</option>
        </select>
        <a href="/knowledge-bases" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium whitespace-nowrap">
          Manage KBs →
        </a>
      </div>

      {selectedKbId && (() => {
        const kb = availableKBs.find((k) => k.id === selectedKbId);
        if (!kb) return null;
        return (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-green-800">{kb.name}</span>
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">{kb.kb_type}</span>
                <span className="text-xs text-green-600">{kb.document_count} docs</span>
              </div>
              <p className="text-xs text-green-600">✅ Grounding enabled — agent will cite sources from this KB</p>
            </div>
            <button
              type="button"
              onClick={() => setKbTestOpen((v) => !v)}
              className="text-xs border border-green-300 text-green-700 bg-white rounded-lg px-2.5 py-1 hover:bg-green-50 transition-colors whitespace-nowrap"
            >
              {kbTestOpen ? "Close Test" : "🔍 Test KB"}
            </button>
          </div>
        );
      })()}

      {/* Inline KB Test Panel */}
      {kbTestOpen && selectedKbId && (
        <KBTestPanel kbId={selectedKbId} />
      )}
    </>
  )}

  {kbPickerMode === "upload" && (
    <div>
      <button
        type="button"
        onClick={() => setKbPickerMode("picker")}
        className="text-xs text-indigo-500 hover:text-indigo-700 mb-2 flex items-center gap-1"
      >
        ← Back to picker
      </button>
      {/* existing upload UI goes here — keep the existing file-upload JSX unchanged */}
      {/* paste the existing upload accordion body below this comment */}
    </div>
  )}
</div>
```

- [ ] **Step 5: Wire `selectedKbId` into the agent submit payload**

In the `handleSave()` function, find where `knowledge_base_id: kbId` is set. Replace with:

```tsx
knowledge_base_id: kbPickerMode === "picker" ? (selectedKbId ?? undefined) : (kbId ?? undefined),
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CreateAgent.tsx
git commit -m "feat(ui): add KB dropdown picker to CreateAgent with Test KB panel"
```

---

## Task 11 — `KBTestPanel` sub-component (inline test inside CreateAgent)

**Files:**
- Modify: `frontend/src/components/KBAnswerCard.tsx` (add `KBTestPanel` to same file)

- [ ] **Step 1: Append `KBTestPanel` at the bottom of `KBAnswerCard.tsx`**

```tsx
// Append to frontend/src/components/KBAnswerCard.tsx

interface KBTestPanelProps {
  kbId: string;
}

export function KBTestPanel({ kbId }: KBTestPanelProps) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<{
    answer: string;
    sources: SourceChunk[];
    graphEntities?: { name: string; type: string }[];
    relatedQuestions: string[];
    groundingScore: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState("");

  async function runTest(q: string) {
    if (!q.trim()) return;
    setLoading(true); setResult(null); setAsked(q.trim());
    try {
      const res = await ragApi.query(kbId, q.trim());
      const d = res.data as {
        answer: string;
        sources: SourceChunk[];
        graph_entities?: { name: string; type: string }[];
        related_questions: string[];
        grounding_score: number | null;
      };
      setResult({
        answer: d.answer,
        sources: d.sources ?? [],
        graphEntities: d.graph_entities,
        relatedQuestions: d.related_questions ?? [],
        groundingScore: d.grounding_score ?? null,
      });
    } catch {
      setResult({ answer: "Query failed.", sources: [], relatedQuestions: [], groundingScore: null });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 border border-indigo-100 rounded-xl overflow-hidden bg-white">
      <div className="bg-indigo-50 px-3 py-2 border-b border-indigo-100">
        <p className="text-xs font-semibold text-indigo-600">Test KB — ask a question</p>
      </div>
      <div className="px-3 py-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runTest(question)}
          placeholder="Ask the KB a test question..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          type="button"
          onClick={() => runTest(question)}
          disabled={loading || !question.trim()}
          className="text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>
      {result && (
        <div className="px-3 pb-3">
          <KBAnswerCard
            kbId={kbId}
            question={asked}
            answer={result.answer}
            sources={result.sources}
            graphEntities={result.graphEntities}
            relatedQuestions={result.relatedQuestions}
            groundingScore={result.groundingScore}
            onRelatedClick={(q) => { setQuestion(q); runTest(q); }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add import in `CreateAgent.tsx`**

```tsx
import { KBTestPanel } from "../components/KBAnswerCard";
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/KBAnswerCard.tsx frontend/src/pages/CreateAgent.tsx
git commit -m "feat(ui): add KBTestPanel inline test component for CreateAgent KB picker"
```

---

## Task 12 — Smoke test end-to-end in browser

- [ ] **Step 1: Start backend + frontend**

```bash
# Terminal 1 — backend (venv activated)
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev
```

- [ ] **Step 2: Test Knowledge Bases page**

1. Navigate to `http://localhost:5173/knowledge-bases`
2. Open any KB with documents → click "Query"
3. Ask a question → verify:
   - Answer renders with **Grounding score badge** (green/amber/red)
   - **Source Documents** section is collapsible, shows filenames + snippets + scores + "View →"
   - **Related Questions** pills appear and clicking one re-runs the query
   - **👍** click → button stays green, "Thanks for your feedback!" appears
   - **👎** click → text box "What was wrong?" appears → Submit → "Thanks for your feedback." appears

- [ ] **Step 3: Test CreateAgent KB picker**

1. Navigate to `http://localhost:5173/studio/create`
2. Scroll to **Knowledge** accordion → verify dropdown shows all existing KBs
3. Select a KB → verify green info card appears with "Test KB" button
4. Click "Test KB" → verify inline `KBTestPanel` slides in
5. Ask a test question → verify `KBAnswerCard` renders with sources + grounding score
6. Save the agent → verify it loads with the correct KB pre-selected when you re-edit

- [ ] **Step 4: Push all changes**

```bash
git push origin feature/AgentForge1.1
```
