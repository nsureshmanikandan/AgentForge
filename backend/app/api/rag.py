from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.database import get_db
from app.models.rag import KnowledgeBase, Document
from app.core.rag_engine import RAGEngine

router = APIRouter()
_engines: dict[str, RAGEngine] = {}


def _get_engine(kb_id: str) -> RAGEngine:
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
    kb = KnowledgeBase(name=body.name, description=body.description)
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return {"id": kb.id, "name": kb.name, "description": kb.description}


@router.post("/knowledge-bases/{kb_id}/upload")
async def upload_document(
    kb_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    kb = await db.get(KnowledgeBase, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    contents = await file.read()
    engine = _get_engine(kb_id)
    chunk_count = await engine.ingest(contents, file.filename)
    doc = Document(kb_id=kb_id, filename=file.filename, chunk_count=chunk_count, status="ready")
    db.add(doc)
    await db.commit()
    return {"filename": file.filename, "chunks": chunk_count, "status": "ready"}


@router.post("/knowledge-bases/{kb_id}/query")
async def query_kb(kb_id: str, body: QueryRequest):
    engine = _get_engine(kb_id)
    return await engine.query(body.question)
