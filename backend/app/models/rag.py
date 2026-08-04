import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    kb_type: Mapped[str] = mapped_column(String, default="basic")  # "basic" | "graph" | "semantic"
    agent_id: Mapped[str] = mapped_column(String, nullable=True)
    created_by: Mapped[str] = mapped_column(String, nullable=False, default="system")
    # Basic-KB retrieval settings (unused by graph/semantic KBs).
    retrieval_strategy: Mapped[str] = mapped_column(String, default="default")  # "default" | "mmr" | "hyde"
    retrieval_top_k: Mapped[int] = mapped_column(Integer, default=6)
    retrieval_threshold: Mapped[float] = mapped_column(Float, default=0.3)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kb_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="processing")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kb_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id"), nullable=False)
    faiss_id: Mapped[int] = mapped_column(Integer, nullable=False)  # position in the FAISS index
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)  # order within the document
    text: Mapped[str] = mapped_column(Text, nullable=False)
    section_heading: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class GraphEntity(Base):
    __tablename__ = "graph_entities"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kb_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, default="CONCEPT")
    description: Mapped[str] = mapped_column(Text, default="")
    faiss_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # position in the entity FAISS index
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class GraphRelationship(Base):
    __tablename__ = "graph_relationships"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kb_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    source_id: Mapped[str] = mapped_column(String, ForeignKey("graph_entities.id"), nullable=False)
    target_id: Mapped[str] = mapped_column(String, ForeignKey("graph_entities.id"), nullable=False)
    relation_type: Mapped[str] = mapped_column(String, nullable=False)
    context: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SemanticConnection(Base):
    __tablename__ = "semantic_connections"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kb_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False, unique=True)
    db_type: Mapped[str] = mapped_column(String, default="postgresql")
    connection_url: Mapped[str] = mapped_column(Text, nullable=False)
    schema_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    connected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SemanticTable(Base):
    __tablename__ = "semantic_tables"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kb_id: Mapped[str] = mapped_column(String, ForeignKey("knowledge_bases.id"), nullable=False)
    table_name: Mapped[str] = mapped_column(String, nullable=False)
    ddl: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    faiss_id: Mapped[int] = mapped_column(Integer, nullable=False)  # position in the schema FAISS index
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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
