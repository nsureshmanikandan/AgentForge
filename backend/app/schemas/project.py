from pydantic import BaseModel
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str = "Untitled Project"
    summary: str = ""
    original_prompt: str = ""
    plan: dict = {}
    files: dict = {}
    chat_history: list[dict] = []
    app_type: str = "custom_code"


class ProjectUpdate(BaseModel):
    name: str | None = None
    summary: str | None = None
    plan: dict | None = None
    files: dict | None = None
    chat_history: list[dict] | None = None
    app_type: str | None = None


class ProjectVisibilityUpdate(BaseModel):
    visibility: str  # "private" | "published" | "shared"
    shared_with: list[str] = []


class ProjectOut(BaseModel):
    id: str
    owner_id: str
    name: str
    summary: str
    original_prompt: str
    plan: dict
    files: dict
    chat_history: list[dict]
    app_type: str
    visibility: str
    shared_with: list[str]
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectSummaryOut(BaseModel):
    """Lightweight listing shape -- omits `plan`/`files`/`chat_history` so
    list endpoints stay cheap; full detail is fetched via GET /{id}."""
    id: str
    owner_id: str
    name: str
    summary: str
    app_type: str
    visibility: str
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
