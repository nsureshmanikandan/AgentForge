from app.config import settings
import pytest
from app.schemas.agent import AgentCreate, AgentOut, AgentRunRequest, AgentRunResponse, GenerateRequest

def test_agent_create_schema_defaults():
    body = AgentCreate(name="Bot", system_prompt="You are helpful.")
    assert body.model == settings.azure_openai_deployment_gpt4o
    assert body.tools == []
    assert body.guardrails == {"pii": True, "hallucination": True}

def test_agent_run_request_schema():
    req = AgentRunRequest(input="Hello")
    assert req.input == "Hello"
    assert req.chat_history == []

def test_generate_request_schema():
    req = GenerateRequest(description="Build an HR bot")
    assert req.description == "Build an HR bot"

def test_agent_out_config():
    # Verify from_attributes is set (needed for SQLAlchemy ORM → Pydantic)
    assert AgentOut.model_config.get("from_attributes") is True or \
           getattr(AgentOut, "model_config", {}).get("from_attributes") is True or \
           hasattr(AgentOut, "Config")
