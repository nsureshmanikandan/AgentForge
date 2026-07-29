from pydantic import BaseModel
from typing import Literal


class SourceChunk(BaseModel):
    filename: str
    snippet: str       # first 200 chars of the chunk text
    score: float       # cosine similarity (0.0–1.0)
    doc_id: str        # Document.id — used to construct a View link


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]
    graph_entities: list[dict] | None = None   # Graph KB only: [{name, type}]
    related_questions: list[str] = []
    grounding_score: float | None = None       # mean(sources[].score), null if no sources


class FeedbackRequest(BaseModel):
    question: str
    answer: str
    vote: Literal["up", "down"]
    comment: str | None = None    # free-text from "What was wrong?" text box
