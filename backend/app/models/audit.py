import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    resource_type: Mapped[str] = mapped_column(String, nullable=False)
    resource_id: Mapped[str] = mapped_column(String, nullable=True)
    input_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True)
    output_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True)
    guardrail_triggered: Mapped[bool] = mapped_column(Boolean, default=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __init__(self, **kwargs):
        kwargs.setdefault("guardrail_triggered", False)
        super().__init__(**kwargs)
