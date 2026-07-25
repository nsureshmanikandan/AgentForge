import io
import os
import re
import tempfile
import numpy as np
import faiss
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.azure_openai import AzureOpenAIClient
from app.core.telemetry import get_tracer
from app.models.rag import Chunk

try:
    from langchain_community.document_loaders import PyPDFLoader, TextLoader
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    _LANGCHAIN_AVAILABLE = True
except ImportError:
    _LANGCHAIN_AVAILABLE = False

try:
    from docx import Document as DocxDocument
    _DOCX_AVAILABLE = True
except ImportError:
    _DOCX_AVAILABLE = False

EMBED_DIM = 1536  # text-embedding-3-small
MAX_CHUNK_CHARS = 800
CHUNK_OVERLAP = 150
TOP_K = 4
SIMILARITY_CUTOFF = 0.3

_INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "kb_indexes")


def index_path(kb_id: str) -> str:
    return os.path.join(_INDEX_DIR, f"{kb_id}.faiss")


def _split_text_blocks(text: str) -> list[str]:
    """Blank-line-separated section split, used as the structure-aware pass
    for sources without paragraph-level metadata (PDF/TXT)."""
    return [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]


def _extract_docx_units(file_bytes: bytes) -> list[tuple[str, str | None]]:
    """Structure-aware pass for .docx: one candidate unit per heading-delimited
    section, further split at Q&A question-paragraph boundaries within a
    section so a question stays with its answer paragraphs."""
    if not _DOCX_AVAILABLE:
        return [(file_bytes.decode("utf-8", errors="ignore"), None)]

    doc = DocxDocument(io.BytesIO(file_bytes))
    units: list[tuple[str, str | None]] = []
    heading: str | None = None
    buf: list[str] = []

    def flush():
        if buf:
            units.append(("\n".join(buf).strip(), heading))
            buf.clear()

    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
        style = (p.style.name or "") if p.style else ""
        if style.startswith("Heading"):
            flush()
            heading = text
            continue
        if text.endswith("?") and buf:
            # a new question starts a new Q&A chunk within the same section
            flush()
        buf.append(text)
    flush()

    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                units.append((" | ".join(cells), heading))

    return units or [("", None)]


def _chunk_units(units: list[tuple[str, str | None]]) -> list[tuple[str, str | None]]:
    """Recursive-split fallback: any unit longer than MAX_CHUNK_CHARS gets
    further split with overlap so a split doesn't lose its preceding context."""
    splitter = (
        RecursiveCharacterTextSplitter(chunk_size=MAX_CHUNK_CHARS, chunk_overlap=CHUNK_OVERLAP)
        if _LANGCHAIN_AVAILABLE else None
    )
    final: list[tuple[str, str | None]] = []
    for text, heading in units:
        if not text:
            continue
        if len(text) <= MAX_CHUNK_CHARS or splitter is None:
            final.append((text, heading))
        else:
            for piece in splitter.split_text(text):
                final.append((piece, heading))
    return final


class RAGEngine:
    def __init__(self, kb_id: str):
        self.kb_id = kb_id
        self._llm = AzureOpenAIClient()
        # Embeddings always go through Azure OpenAI regardless of the chat
        # provider (e.g. lmstudio) an agent/session is otherwise configured for.
        self._embedder = AzureOpenAIClient(provider="azure")
        self._index: faiss.IndexFlatIP | None = None

    def _load_index(self) -> faiss.IndexFlatIP:
        if self._index is not None:
            return self._index
        path = index_path(self.kb_id)
        if os.path.exists(path):
            self._index = faiss.read_index(path)
        else:
            self._index = faiss.IndexFlatIP(EMBED_DIM)
        return self._index

    def _save_index(self):
        os.makedirs(_INDEX_DIR, exist_ok=True)
        faiss.write_index(self._index, index_path(self.kb_id))

    @staticmethod
    def _normalize(vectors: list[list[float]]) -> np.ndarray:
        arr = np.array(vectors, dtype="float32")
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return arr / norms

    async def ensure_loaded(self, db: AsyncSession):
        """Rebuild the FAISS index from persisted Chunk rows if the on-disk
        file is missing (or was never created) -- resilient to losing the
        FAISS file without losing the underlying chunk data."""
        index = self._load_index()
        if index.ntotal > 0:
            return
        result = await db.execute(
            select(Chunk).where(Chunk.kb_id == self.kb_id).order_by(Chunk.faiss_id)
        )
        chunks = result.scalars().all()
        if not chunks:
            return
        vectors = await self._embedder.embed([c.text for c in chunks])
        index.add(self._normalize(vectors))
        self._save_index()

    async def rebuild_index(self, db: AsyncSession):
        """Fully discard the current FAISS index and rebuild it from
        whatever Chunk rows currently exist for this KB, reassigning fresh
        sequential faiss_ids as it goes. Unlike ensure_loaded() (which only
        fills an empty index), this always rebuilds -- used after deleting a
        document's chunks (e.g. re-uploading a file with the same name) so
        the removed vectors don't linger as dead weight in the index."""
        result = await db.execute(
            select(Chunk).where(Chunk.kb_id == self.kb_id).order_by(Chunk.faiss_id)
        )
        chunks = result.scalars().all()

        self._index = faiss.IndexFlatIP(EMBED_DIM)
        if chunks:
            vectors = await self._embedder.embed([c.text for c in chunks])
            self._index.add(self._normalize(vectors))
            for i, chunk in enumerate(chunks):
                chunk.faiss_id = i

        self._save_index()

    async def ingest(self, file_bytes: bytes, filename: str, document_id: str, db: AsyncSession) -> tuple[int, str]:
        """Chunk, embed, and persist a document's chunks. Returns (chunk_count, full_text)."""
        tracer = get_tracer()
        with tracer.start_as_current_span("rag.ingest") as span:
            span.set_attribute("rag.filename", filename)
            suffix = os.path.splitext(filename)[1].lower()

            if suffix == ".docx":
                units = _extract_docx_units(file_bytes)
            elif not _LANGCHAIN_AVAILABLE:
                text = file_bytes.decode("utf-8", errors="ignore")
                units = [(b, None) for b in _split_text_blocks(text)] or [(text, None)]
            else:
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(file_bytes)
                    tmp_path = tmp.name
                try:
                    loader = PyPDFLoader(tmp_path) if suffix == ".pdf" else TextLoader(tmp_path, encoding="utf-8")
                    docs = loader.load()
                finally:
                    os.unlink(tmp_path)
                full_text = "\n\n".join(d.page_content for d in docs)
                units = [(b, None) for b in _split_text_blocks(full_text)] or [(full_text, None)]

            full_text = "\n\n".join(u[0] for u in units if u[0])
            chunk_units = _chunk_units(units)
            if not chunk_units:
                span.set_attribute("rag.chunk_count", 0)
                return 0, full_text

            await self.ensure_loaded(db)
            index = self._index
            vectors = await self._embedder.embed([c[0] for c in chunk_units])
            start_id = index.ntotal
            index.add(self._normalize(vectors))
            self._save_index()

            for i, (text, heading) in enumerate(chunk_units):
                db.add(Chunk(
                    kb_id=self.kb_id,
                    document_id=document_id,
                    faiss_id=start_id + i,
                    chunk_index=i,
                    text=text,
                    section_heading=heading,
                ))

            span.set_attribute("rag.chunk_count", len(chunk_units))
            return len(chunk_units), full_text

    async def retrieve(self, question: str, db: AsyncSession, top_k: int = TOP_K, enforce_cutoff: bool = True) -> list[str]:
        """Retrieval-only: embed the question, FAISS search, apply the
        similarity cutoff (unless disabled), and resolve matched faiss ids
        back to chunk text. No LLM call -- callers (the query() endpoint
        and the agent orchestrator) each decide what to do with the result."""
        await self.ensure_loaded(db)
        index = self._index
        if index.ntotal == 0:
            return []

        q_vec = await self._embedder.embed([question])
        k = min(top_k, index.ntotal)
        scores, ids = index.search(self._normalize(q_vec), k)
        candidates = [(int(i), float(s)) for i, s in zip(ids[0], scores[0]) if i >= 0]
        kept = [(i, s) for i, s in candidates if s >= SIMILARITY_CUTOFF] if enforce_cutoff else candidates
        if not kept:
            return []

        result = await db.execute(
            select(Chunk).where(Chunk.kb_id == self.kb_id, Chunk.faiss_id.in_([i for i, _ in kept]))
        )
        by_id = {c.faiss_id: c.text for c in result.scalars().all()}
        return [by_id[i] for i, _ in kept if i in by_id]

    async def query(self, question: str, db: AsyncSession, top_k: int = TOP_K, enforce_cutoff: bool = True) -> dict:
        tracer = get_tracer()
        with tracer.start_as_current_span("rag.query") as span:
            span.set_attribute("rag.question_length", len(question))

            sources = await self.retrieve(question, db, top_k, enforce_cutoff)
            span.set_attribute("rag.sources_found", len(sources))

            if not sources and enforce_cutoff:
                return {
                    "answer": "I don't have enough information in the available documents to answer this.",
                    "sources": [],
                }

            context = "\n\n".join(sources) if sources else "No relevant context found."
            messages = [
                {"role": "system", "content": "Answer using only the provided context."},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
            ]
            answer = await self._llm.chat(messages, temperature=0.1)
            return {"answer": answer, "sources": sources}
