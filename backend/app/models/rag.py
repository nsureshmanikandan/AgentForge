import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    agent_id: Mapped[str] = mapped_column(String, nullable=True)
    created_by: Mapped[str] = mapped_column(String, nullable=False, default="system")
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
