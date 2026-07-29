from pydantic import BaseModel, Field
from datetime import datetime
from app.config import settings


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    system_prompt: str
    # Structured source fields from the Create Agent form's Role/Goal inputs,
    # kept separate from system_prompt so editing an agent doesn't have to
    # regex-parse them back out of the composed prompt text. None for agents
    # authored without the structured Role/Goal flow.
    role: str | None = None
    goal: str | None = None
    model: str = Field(default_factory=lambda: settings.azure_openai_deployment_gpt4o)
    tools: list[str] = []
    guardrails: dict = Field(default_factory=lambda: {"pii": True, "hallucination": True})
    agent_type: str = "agent"
    worker_agent_ids: list[str] = []
    # Write-only: which KnowledgeBase this agent should be linked to. Not a
    # column on Agent itself -- the FK lives on KnowledgeBase.agent_id (one
    # KB per agent), so this is popped off and applied separately by the
    # create/update endpoints rather than passed straight into Agent(**data).
    knowledge_base_id: str | None = None
    is_voice_agent: bool = False
    voice_config: dict | None = None


class AgentOut(BaseModel):
    id: str
    name: str
    description: str
    system_prompt: str
    role: str | None = None
    goal: str | None = None
    model: str
    tools: list[str]
    guardrails: dict
    created_by: str
    current_version: int
    agent_type: str
    worker_agent_ids: list[str]
    created_at: datetime
    updated_at: datetime
    # Populated by the API layer (queried from KnowledgeBase.agent_id) since
    # it isn't a real column on Agent -- see knowledge_base_id on AgentCreate.
    knowledge_base_id: str | None = None
    is_voice_agent: bool = False
    voice_config: dict | None = None

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
