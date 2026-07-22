from pydantic import BaseModel, Field
from datetime import datetime
from app.config import settings


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    system_prompt: str
    model: str = Field(default_factory=lambda: settings.azure_openai_deployment_gpt4o)
    tools: list[str] = []
    guardrails: dict = Field(default_factory=lambda: {"pii": True, "hallucination": True})
    agent_type: str = "agent"
    worker_agent_ids: list[str] = []


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
    agent_type: str
    worker_agent_ids: list[str]
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


class ManagerRunResponse(BaseModel):
    output: str
    guardrail_triggered: bool
    pii_triggered: bool
    hallucination_triggered: bool
    latency_ms: int
    steps: list[dict]


class GenerateRequest(BaseModel):
    description: str
