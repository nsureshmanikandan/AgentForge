import os
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.database import get_db
from app.models.rag import KnowledgeBase, Document, Chunk, GraphEntity, GraphRelationship
from app.core.rag_engine import RAGEngine, index_path
from app.core.graph_engine import GraphEngine

router = APIRouter()
_engines: dict[str, RAGEngine] = {}
_graph_engines: dict[str, GraphEngine] = {}

MAX_SUGGESTED_QUESTIONS = 5


def _get_engine(kb_id: str) -> RAGEngine:
    if kb_id not in _engines:
        _engines[kb_id] = RAGEngine(kb_id=kb_id)
    return _engines[kb_id]


def _get_graph_engine(kb_id: str) -> GraphEngine:
    if kb_id not in _graph_engines:
        _graph_engines[kb_id] = GraphEngine(kb_id=kb_id)
    return _graph_engines[kb_id]


def _leading_question(chunk_text: str) -> str | None:
    """Pull out a chunk's own leading question line, if it has one -- our
    Q&A-aware docx chunker (see rag_engine._extract_docx_units) keeps each
    question paired with its answer in the same chunk, so for Q&A-formatted
    source documents the first line very often *is* a real question a user
    might ask. Used to suggest starter questions without any extra LLM call."""
    first_line = chunk_text.strip().splitlines()[0].strip() if chunk_text.strip() else ""
    if first_line.endswith("?") and 8 <= len(first_line) <= 200:
        return first_line
    return None


class KBCreate(BaseModel):
    name: str
    description: str = ""
    kb_type: str = "basic"


class QueryRequest(BaseModel):
    question: str


@router.get("/knowledge-bases")
async def list_kbs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase))
    kbs = result.scalars().all()
    out = []
    for kb in kbs:
        count_result = await db.execute(select(Document).where(Document.kb_id == kb.id))
        doc_count = len(count_result.scalars().all())
        out.append({
            "id": kb.id,
            "name": kb.name,
            "description": kb.description,
            "kb_type": kb.kb_type,
            "agent_id": kb.agent_id,
            "document_count": doc_count,
            "created_at": kb.created_at.isoformat(),
        })
    return out


@router.get("/knowledge-bases/{kb_id}")
async def get_kb(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    docs_result = await db.execute(select(Document).where(Document.kb_id == kb_id))
    docs = docs_result.scalars().all()
    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "kb_type": kb.kb_type,
        "agent_id": kb.agent_id,
        "created_at": kb.created_at.isoformat(),
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "chunk_count": d.chunk_count,
                "status": d.status,
                "created_at": d.created_at.isoformat(),
            }
            for d in docs
        ],
    }


@router.post("/knowledge-bases", status_code=201)
async def create_kb(body: KBCreate, db: AsyncSession = Depends(get_db)):
    kb_type = body.kb_type if body.kb_type in ("basic", "graph") else "basic"
    kb = KnowledgeBase(name=body.name, description=body.description, kb_type=kb_type)
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return {"id": kb.id, "name": kb.name, "description": kb.description, "kb_type": kb.kb_type}


@router.delete("/knowledge-bases/{kb_id}", status_code=204)
async def delete_kb(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # Delete graph data if applicable
    if kb.kb_type == "graph":
        await db.execute(delete(GraphRelationship).where(GraphRelationship.kb_id == kb_id))
        await db.execute(delete(GraphEntity).where(GraphEntity.kb_id == kb_id))
        _graph_engines.pop(kb_id, None)

    await db.execute(delete(Chunk).where(Chunk.kb_id == kb_id))
    await db.execute(delete(Document).where(Document.kb_id == kb_id))
    await db.delete(kb)
    await db.commit()
    _engines.pop(kb_id, None)
    path = index_path(kb_id)
    if os.path.exists(path):
        os.remove(path)


@router.post("/knowledge-bases/{kb_id}/upload")
async def upload_document(
    kb_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    contents = await file.read()

    # Upsert by filename: re-uploading the same file name into this KB
    # replaces its old chunks/vectors instead of accumulating duplicates.
    existing_result = await db.execute(
        select(Document).where(Document.kb_id == kb_id, Document.filename == file.filename)
    )
    existing_docs = existing_result.scalars().all()
    replaced_existing = bool(existing_docs)
    if existing_docs:
        existing_ids = [d.id for d in existing_docs]
        await db.execute(delete(Chunk).where(Chunk.document_id.in_(existing_ids)))
        await db.execute(delete(Document).where(Document.id.in_(existing_ids)))
        await db.flush()
        # Also clear graph data so it gets rebuilt cleanly on re-upload
        if kb.kb_type == "graph":
            await db.execute(delete(GraphRelationship).where(GraphRelationship.kb_id == kb_id))
            await db.execute(delete(GraphEntity).where(GraphEntity.kb_id == kb_id))
        engine_base = _get_engine(kb_id)
        await engine_base.rebuild_index(db)

    doc = Document(kb_id=kb_id, filename=file.filename, status="processing")
    db.add(doc)
    await db.flush()

    if kb.kb_type == "graph":
        engine = _get_graph_engine(kb_id)
    else:
        engine = _get_engine(kb_id)

    chunk_count, full_text = await engine.ingest(contents, file.filename, doc.id, db)
    doc.content = full_text
    doc.chunk_count = chunk_count
    doc.status = "ready"
    await db.commit()
    return {
        "filename": file.filename,
        "chunks": chunk_count,
        "status": "ready",
        "replaced_existing": replaced_existing,
    }


@router.get("/knowledge-bases/{kb_id}/suggested-questions")
async def suggested_questions(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    result = await db.execute(
        select(Chunk.text)
        .where(Chunk.kb_id == kb_id)
        .order_by(Chunk.document_id, Chunk.chunk_index)
    )
    seen: set[str] = set()
    questions: list[str] = []
    for (text,) in result.all():
        question = _leading_question(text)
        if question and question not in seen:
            seen.add(question)
            questions.append(question)
        if len(questions) >= MAX_SUGGESTED_QUESTIONS:
            break
    return {"questions": questions}


@router.post("/knowledge-bases/{kb_id}/query")
async def query_kb(kb_id: str, body: QueryRequest, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if kb.kb_type == "graph":
        return await _get_graph_engine(kb_id).query(body.question, db)
    return await _get_engine(kb_id).query(body.question, db)


@router.get("/knowledge-bases/{kb_id}/graph")
async def get_graph(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if kb.kb_type != "graph":
        raise HTTPException(status_code=400, detail="This knowledge base is not a graph type")
    return await _get_graph_engine(kb_id).get_graph_data(db)
