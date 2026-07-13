import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Float, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class VoiceCallLog(Base):
    __tablename__ = "voice_call_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    agent_id: Mapped[str] = mapped_column(String, index=True, nullable=False, default="default")
    role: Mapped[str] = mapped_column(String, nullable=False)        # "user" | "assistant"
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    persona: Mapped[str] = mapped_column(String, default="friendly")
    tts_voice: Mapped[str] = mapped_column(String, default="")
    speaking_rate: Mapped[float] = mapped_column(Float, default=1.0)
    pitch: Mapped[float] = mapped_column(Float, default=0.0)
    llm_duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
    tts_duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
