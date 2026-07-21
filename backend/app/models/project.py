import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Project(Base):
    """A saved Architect session -- plan, generated files, and chat history,
    persisted to the backend instead of living only in browser localStorage."""
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, default="Untitled Project")
    summary: Mapped[str] = mapped_column(String, default="")
    original_prompt: Mapped[str] = mapped_column(Text, default="")
    plan: Mapped[dict] = mapped_column(JSON, default=dict)
    files: Mapped[dict] = mapped_column(JSON, default=dict)
    chat_history: Mapped[list] = mapped_column(JSON, default=list)
    app_type: Mapped[str] = mapped_column(String, default="custom_code")  # "rag" | "custom_code"
    visibility: Mapped[str] = mapped_column(String, default="private")   # "private" | "published" | "shared"
    shared_with: Mapped[list] = mapped_column(JSON, default=list)        # list of user ids
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
