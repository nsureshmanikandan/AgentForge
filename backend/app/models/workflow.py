import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    nodes: Mapped[list] = mapped_column(JSON, default=list)
    edges: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String, nullable=False, default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WorkflowRun(Base):
    """Persisted execution trace for every deploy/trigger call."""
    __tablename__ = "workflow_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_id: Mapped[str] = mapped_column(String, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    trigger_input: Mapped[str] = mapped_column(Text, default="")
    final_output: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="completed")  # completed | failed
    node_logs: Mapped[list] = mapped_column(JSON, default=list)       # full per-node trace
    total_duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
