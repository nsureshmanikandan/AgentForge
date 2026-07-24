# Knowledge Base Backend Overhaul Design

## Problem

The existing "Knowledge Bases" feature (`backend/app/api/rag.py`, `backend/app/core/rag_engine.py`, `frontend/src/pages/KnowledgeBases.tsx`) looks functional in the UI but has four real gaps, confirmed by direct code inspection and a live test:

1. **Retrieval is keyword overlap, not vector search.** `RAGEngine._retrieve()` counts overlapping words between the question and each chunk — no embeddings, no FAISS/Chroma, despite `ragApi`'s naming implying otherwise.
2. **Nothing persists on the backend.** Chunks live only in an in-memory `_engines: dict[str, RAGEngine]` (`rag.py:9`), lost on every restart. `Document.content` is never populated.
3. **No list endpoint exists.** `KnowledgeBases.tsx` fakes the KB list and document list entirely from `localStorage` (`af_kbs`, `af_kb_docs_${id}`) — a backend restart or different browser shows nothing, even though uploads did hit the real `/upload` endpoint.
4. **No agent↔KB runtime linkage.** `KnowledgeBase.agent_id` exists as a column but is never set or read; the orchestrator never calls the RAG engine when an agent actually runs. This is the same gap that made the earlier "Loblaw Support RAG Chatbot" test agent return `tools: ['web_search']` with zero real document retrieval.

## Non-Goals (for this spec)

- **Knowledge graph / entity-relationship extraction** (what Lyzr AI Studio calls "Knowledge Base and Knowledge Graph") — a materially larger feature (multi-hop graph reasoning over extracted entities). Documented here as a future enhancement, not built now.
- **Contextual retrieval** (prepending an LLM-generated context blurb to each chunk before embedding, per Anthropic's published technique) — meaningfully improves retrieval quality but adds one LLM call per chunk at ingestion time. Documented as a future enhancement, not built now.
- **Semantic chunking** (embedding-based sentence-similarity splitting) — a further refinement over structure-aware splitting; not needed for the structured Q&A-style documents this is scoped for for now.
- Replacing FAISS with a hosted vector database (e.g. Qdrant, as Lyzr uses) — FAISS avoids standing up a new service; this is a "library vs. hosted service" choice, not a capability gap, and can be revisited later if AgentForge needs multi-process/distributed access to indexes.
- Many-to-many KB↔Agent linkage — the existing `KnowledgeBase.agent_id` column is a single FK; this spec keeps that one-KB-per-agent constraint rather than redesigning the schema.

## Design

### 1. Chunking: structure-aware splitting with recursive-split fallback

Given the target documents are Q&A-formatted (e.g. "Lane Issues Q&A.docx"), naive fixed-size character splitting risks cutting an answer mid-sentence. v1 approach:

1. **Structure-aware pass first**: detect document structure — headings (docx paragraph styles `Heading 1/2/3`), explicit Q&A markers (e.g. a paragraph ending in `?` followed by its answer paragraphs), and blank-line-separated sections. Each detected unit becomes one candidate chunk.
2. **Recursive-split fallback**: any candidate chunk still longer than `MAX_CHUNK_CHARS = 800` gets further split via `RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)` (LangChain, already a dependency) — the 150-char overlap prevents a split procedure from losing its preceding context.
3. Each final chunk keeps a reference to its source document and originating section/heading (for citation/debugging), stored in a new `Chunk` table (see below).

Implementation lives in `backend/app/core/rag_engine.py`, replacing the current single `RecursiveCharacterTextSplitter`-only ingestion path.

### 2. Embeddings: Azure OpenAI `text-embedding-3-small`

Add an `embed(texts: list[str]) -> list[list[float]]` method to `AzureOpenAIClient` (`backend/app/core/azure_openai.py`), calling the Azure OpenAI embeddings endpoint with the `text-embedding-3-small` deployment (1536-dim, cheaper and higher-retrieval-benchmark-quality than `ada-002`, which is what Lyzr's KB panel showed using). Used both at ingestion time (embed each chunk once) and at query time (embed the incoming question).

### 3. Vector storage: FAISS index per Knowledge Base

- One FAISS `IndexFlatIP` (cosine similarity via normalized vectors — appropriate at this KB's expected scale of hundreds to low-thousands of chunks; no need for an approximate/IVF index) per KB, persisted to `backend/data/kb_indexes/{kb_id}.faiss`.
- FAISS only stores vectors + an integer id, not chunk text — so add a new `Chunk` table:

```python
class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kb_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id"), nullable=False)
    faiss_id: Mapped[int] = mapped_column(Integer, nullable=False)  # position in the FAISS index
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)  # order within the document
    text: Mapped[str] = mapped_column(String, nullable=False)
    section_heading: Mapped[str | None] = mapped_column(String, nullable=True)
```

- On backend startup (or lazily on first access per KB), if a KB's FAISS file is missing but its `Chunk` rows exist, rebuild the index from DB rather than treating it as empty — this makes the system resilient to losing the FAISS file without losing the underlying data.
- Also fix `Document.content`: populate it with the full extracted document text on upload (currently left null) as a source-of-truth backup independent of chunking.

### 4. Retrieval: top-k with a similarity threshold

`RAGEngine.query()` changes from keyword-overlap scoring to:

1. Embed the question.
2. FAISS search for `top_k` nearest chunks (default `k=4`, configurable per call).
3. Apply a minimum cosine-similarity cutoff (default `0.3`); chunks below it are dropped.
4. If zero chunks remain after the cutoff, skip the LLM call and return a fixed "I don't have enough information in the available documents to answer this" response — this ties into the existing `hallucination` guardrail flag already present on the `Agent` model (`guardrails: {pii, hallucination}`), rather than inventing new config. When an agent's `guardrails.hallucination` is `true`, this cutoff behavior is enforced; if `false`, the LLM still receives whatever chunks were retrieved (even below threshold) and answers as best it can.
5. Otherwise, pass the surviving chunks + question to the existing `AzureOpenAIClient` chat call, unchanged.

### 5. Real list endpoints

Add to `backend/app/api/rag.py`:
- `GET /rag/knowledge-bases` — list all KBs owned by the current user (id, name, description, agent_id, document count, created_at).
- `GET /rag/knowledge-bases/{kb_id}` — single KB detail including its `Document` rows.

Update `frontend/src/pages/KnowledgeBases.tsx`: replace `loadKBs()`/`saveKBs()` (currently reading/writing `localStorage` key `af_kbs`) and `loadDocs()`/`saveDocs()` (`af_kb_docs_${id}`) with calls to these new endpoints. `localStorage` is no longer the source of truth for what KBs/documents exist.

### 6. Agent↔KB linkage

- Add a `kb_id` selector to the Create/Edit Agent form (`CreateAgent.tsx`), setting `KnowledgeBase.agent_id` when a KB is chosen for an agent (one KB per agent, matching the existing single-FK column).
- Wire `backend/app/core/orchestrator.py`: when running/chatting with an agent that has a linked KB, call the new `RAGEngine.query()` (or a similar retrieval-only method) before constructing the LLM prompt, and inject the retrieved chunk text into the system prompt/context — this is the piece that makes an agent's RAG behavior real, not just described in text.

## Known Migration Gap

The existing "test" KB (containing `Lane Issues.docx`, `MFA.docx`, uploaded under the old keyword-match engine) has `Document.content = NULL` today — chunk text was never persisted, only held in the now-discarded in-memory engine. There is no way to recover that chunk text retroactively. Those 2 documents will need to be re-uploaded after this change ships to get real embeddings/FAISS entries and populated `Document.content`.

## Future Enhancements (explicitly not built now)

- **Contextual retrieval**: prepend an LLM-generated context blurb to each chunk before embedding (Anthropic's technique, ~35-49% fewer retrieval misses per their published research) — adds one LLM call per chunk at ingestion time.
- **Knowledge graph**: extract entities/relationships into a graph for multi-hop reasoning, matching Lyzr AI Studio's "Knowledge Base and Knowledge Graph" feature.
- **Semantic chunking**: embedding-based sentence-similarity splitting, as a further refinement beyond structure-aware splitting.
- **Hosted vector DB** (e.g. Qdrant) instead of FAISS, if/when multi-process or distributed index access becomes necessary.

## Testing

- Unit: structure-aware chunker on a sample Q&A `.docx` — assert each Q&A pair stays in one chunk when under 800 chars, and splits correctly with overlap when a section exceeds it.
- Unit: `RAGEngine.query()` returns the fixed "not enough information" response when all retrieved chunks fall below the similarity cutoff.
- Integration: upload a document, restart the backend process, confirm the KB's FAISS index rebuilds from `Chunk` rows and `query()` still returns correct results.
- Integration: `GET /rag/knowledge-bases` returns the same KBs across two different browser sessions/localStorage states, proving the list is backend-sourced.
- Manual: link a KB to an agent via Create/Edit Agent, chat with that agent, and confirm the response reflects actual document content (re-running the original Loblaw MFA/ID-disabled question and confirming a grounded, document-based answer instead of "I don't have the approved document context").
