import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, JSON, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.config import settings

class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    system_prompt: Mapped[str] = mapped_column(String, default="")
    model: Mapped[str] = mapped_column(String, default=lambda: settings.azure_openai_deployment_gpt4o)
    tools: Mapped[list] = mapped_column(JSON, default=list)
    guardrails: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String, nullable=False, default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    agent_type: Mapped[str] = mapped_column(String, default="agent", server_default="agent")
    versions: Mapped[list["AgentVersion"]] = relationship("AgentVersion", back_populates="agent")

    def __init__(self, **kwargs):
        kwargs.setdefault("current_version", 1)
        super().__init__(**kwargs)

class AgentVersion(Base):
    __tablename__ = "agent_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id: Mapped[str] = mapped_column(String, ForeignKey("agents.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    agent: Mapped["Agent"] = relationship("Agent", back_populates="versions")
