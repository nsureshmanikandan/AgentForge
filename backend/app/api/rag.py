import os
import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.database import get_db
from app.models.rag import KnowledgeBase, Document, Chunk, GraphEntity, GraphRelationship, KBFeedback, SemanticConnection
from app.schemas.rag import FeedbackRequest
from app.core.rag_engine import RAGEngine, index_path
from app.core.graph_engine import GraphEngine
from app.core.semantic_engine import SemanticEngine
from app.core.azure_openai import AzureOpenAIClient

router = APIRouter()
_engines: dict[str, RAGEngine] = {}
_graph_engines: dict[str, GraphEngine] = {}
_semantic_engines: dict[str, SemanticEngine] = {}

MAX_SUGGESTED_QUESTIONS = 5


def _get_engine(kb_id: str) -> RAGEngine:
    if kb_id not in _engines:
        _engines[kb_id] = RAGEngine(kb_id=kb_id)
    return _engines[kb_id]


def _get_graph_engine(kb_id: str) -> GraphEngine:
    if kb_id not in _graph_engines:
        _graph_engines[kb_id] = GraphEngine(kb_id=kb_id)
    return _graph_engines[kb_id]


def _get_semantic_engine(kb_id: str) -> SemanticEngine:
    if kb_id not in _semantic_engines:
        _semantic_engines[kb_id] = SemanticEngine(kb_id=kb_id)
    return _semantic_engines[kb_id]


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


class KBCreate(BaseModel):
    name: str
    description: str = ""
    kb_type: str = "basic"


class QueryRequest(BaseModel):
    question: str


class KBSettingsUpdate(BaseModel):
    retrieval_strategy: str | None = None
    retrieval_top_k: int | None = None
    retrieval_threshold: float | None = None


@router.get("/knowledge-bases")
async def list_kbs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeBase))
    kbs = result.scalars().all()
    out = []
    for kb in kbs:
        count_result = await db.execute(select(Document).where(Document.kb_id == kb.id))
        doc_count = len(count_result.scalars().all())
        schema_table_count = None
        if kb.kb_type == "semantic":
            conn_result = await db.execute(
                select(SemanticConnection).where(SemanticConnection.kb_id == kb.id)
            )
            conn_record = conn_result.scalars().first()
            if conn_record and conn_record.schema_json:
                schema = json.loads(conn_record.schema_json)
                schema_table_count = len(schema.get("tables", []))
        out.append({
            "id": kb.id,
            "name": kb.name,
            "description": kb.description,
            "kb_type": kb.kb_type,
            "agent_id": kb.agent_id,
            "document_count": doc_count,
            "schema_table_count": schema_table_count,
            "created_at": kb.created_at.isoformat(),
            "retrieval_strategy": kb.retrieval_strategy,
            "retrieval_top_k": kb.retrieval_top_k,
            "retrieval_threshold": kb.retrieval_threshold,
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
        "retrieval_strategy": kb.retrieval_strategy,
        "retrieval_top_k": kb.retrieval_top_k,
        "retrieval_threshold": kb.retrieval_threshold,
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


@router.patch("/knowledge-bases/{kb_id}/settings")
async def update_kb_settings(
    kb_id: str, body: KBSettingsUpdate, db: AsyncSession = Depends(get_db)
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if kb.kb_type != "basic":
        raise HTTPException(status_code=400, detail="Retrieval settings only apply to Basic knowledge bases")

    if body.retrieval_strategy is not None:
        if body.retrieval_strategy not in ("default", "mmr", "hyde"):
            raise HTTPException(status_code=400, detail="retrieval_strategy must be 'default', 'mmr', or 'hyde'")
        kb.retrieval_strategy = body.retrieval_strategy
    if body.retrieval_top_k is not None:
        if not 1 <= body.retrieval_top_k <= 20:
            raise HTTPException(status_code=400, detail="retrieval_top_k must be between 1 and 20")
        kb.retrieval_top_k = body.retrieval_top_k
    if body.retrieval_threshold is not None:
        if not 0.0 <= body.retrieval_threshold <= 1.0:
            raise HTTPException(status_code=400, detail="retrieval_threshold must be between 0.0 and 1.0")
        kb.retrieval_threshold = body.retrieval_threshold

    await db.commit()
    return {
        "retrieval_strategy": kb.retrieval_strategy,
        "retrieval_top_k": kb.retrieval_top_k,
        "retrieval_threshold": kb.retrieval_threshold,
    }


@router.post("/knowledge-bases", status_code=201)
async def create_kb(body: KBCreate, db: AsyncSession = Depends(get_db)):
    kb_type = body.kb_type if body.kb_type in ("basic", "graph", "semantic") else "basic"
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

    # Delete semantic connection if applicable
    if kb.kb_type == "semantic":
        await db.execute(delete(SemanticConnection).where(SemanticConnection.kb_id == kb_id))
        _semantic_engines.pop(kb_id, None)

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
        result = await _get_graph_engine(kb_id).query(body.question, db)
    elif kb.kb_type == "semantic":
        conn_result = await db.execute(
            select(SemanticConnection).where(SemanticConnection.kb_id == kb_id)
        )
        conn_record = conn_result.scalars().first()
        if not conn_record:
            raise HTTPException(
                status_code=400,
                detail="Database not connected. Use 'Connect DB' to link a database first.",
            )
        result = await _get_semantic_engine(kb_id).query(
            body.question,
            conn_record.schema_json or "{}",
            conn_record.connection_url,
            db,
        )
    else:
        result = await _get_engine(kb_id).query(
            body.question,
            db,
            top_k=kb.retrieval_top_k,
            strategy=kb.retrieval_strategy,
            similarity_threshold=kb.retrieval_threshold,
        )

    related = await _generate_related_questions(body.question, result.get("answer", ""))
    result["related_questions"] = related
    return result


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


@router.get("/knowledge-bases/{kb_id}/graph")
async def get_graph(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if kb.kb_type != "graph":
        raise HTTPException(status_code=400, detail="This knowledge base is not a graph type")
    return await _get_graph_engine(kb_id).get_graph_data(db)


class SemanticConnectRequest(BaseModel):
    db_type: str = "postgresql"
    host: str
    port: int = 5432
    database: str
    username: str
    password: str = ""


@router.post("/knowledge-bases/{kb_id}/connect")
async def connect_semantic(
    kb_id: str, body: SemanticConnectRequest, db: AsyncSession = Depends(get_db)
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if kb.kb_type != "semantic":
        raise HTTPException(status_code=400, detail="Only semantic knowledge bases support DB connection")

    connection_url = (
        f"postgresql://{body.username}:{body.password}@{body.host}:{body.port}/{body.database}"
    )

    try:
        schema = await _get_semantic_engine(kb_id).discover_schema(connection_url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Connection failed: {exc}")

    conn_result = await db.execute(
        select(SemanticConnection).where(SemanticConnection.kb_id == kb_id)
    )
    conn_record = conn_result.scalars().first()
    if conn_record:
        conn_record.connection_url = connection_url
        conn_record.schema_json = json.dumps(schema)
    else:
        conn_record = SemanticConnection(
            kb_id=kb_id,
            db_type=body.db_type,
            connection_url=connection_url,
            schema_json=json.dumps(schema),
        )
        db.add(conn_record)

    indexed_tables = await _get_semantic_engine(kb_id).index_schema(schema, db)

    await db.commit()
    return {"table_count": len(schema.get("tables", [])), "indexed_tables": indexed_tables}


@router.get("/knowledge-bases/{kb_id}/schema")
async def get_schema(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if kb.kb_type != "semantic":
        raise HTTPException(status_code=400, detail="Only semantic knowledge bases have a schema")

    conn_result = await db.execute(
        select(SemanticConnection).where(SemanticConnection.kb_id == kb_id)
    )
    conn_record = conn_result.scalars().first()
    if not conn_record or not conn_record.schema_json:
        return {"connected": False, "tables": []}

    schema = json.loads(conn_record.schema_json)
    return {"connected": True, **schema}
