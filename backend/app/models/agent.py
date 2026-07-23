import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    system_prompt: Mapped[str] = mapped_column(String, default="")
    # Nullable: role/goal are the Create Agent form's own structured fields, kept
    # separate from system_prompt (which stays the single field the orchestrator
    # actually reads at runtime) so editing an agent doesn't have to regex-parse
    # them back out of the composed prompt text. NULL for agents created before
    # this column existed -- CreateAgent.tsx falls back to regex parsing for those.
    role: Mapped[str | None] = mapped_column(String, nullable=True)
    goal: Mapped[str | None] = mapped_column(String, nullable=True)
    # "local" (default) or "azure" -- resolved to a real provider/deployment by
    # AgentOrchestrator, not a literal Azure deployment name.
    model: Mapped[str] = mapped_column(String, default="local")
    tools: Mapped[list] = mapped_column(JSON, default=list)
    guardrails: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String, nullable=False, default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    agent_type: Mapped[str] = mapped_column(String, default="agent", server_default="agent")
    worker_agent_ids: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    versions: Mapped[list["AgentVersion"]] = relationship("AgentVersion", back_populates="agent")

    def __init__(self, **kwargs):
        kwargs.setdefault("current_version", 1)
        kwargs.setdefault("worker_agent_ids", [])
        super().__init__(**kwargs)

class AgentVersion(Base):
    __tablename__ = "agent_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id: Mapped[str] = mapped_column(String, ForeignKey("agents.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    agent: Mapped["Agent"] = relationship("Agent", back_populates="versions")
