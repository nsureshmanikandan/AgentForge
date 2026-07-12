from pydantic import BaseModel, Field
from datetime import datetime


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    system_prompt: str
    model: str = "gpt-4o"
    tools: list[str] = []
    guardrails: dict = Field(default_factory=lambda: {"pii": True, "hallucination": True})


class AgentOut(BaseModel):
    id: str
    name: str
    description: str
    system_prompt: str
    model: str
    tools: list[str]
    guardrails: dict
    created_by: str
    current_version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentRunRequest(BaseModel):
    input: str
    chat_history: list[dict] = []


class AgentRunResponse(BaseModel):
    output: str
    guardrail_triggered: bool
    pii_triggered: bool
    input_pii_triggered: bool = False   # PII found in user input (redacted before LLM)
    output_pii_triggered: bool = False  # PII found in LLM output (redacted before response)
    hallucination_triggered: bool
    latency_ms: int


class GenerateRequest(BaseModel):
    description: str
