import pytest
from app.models.user import User, Role
from app.models.agent import Agent, AgentVersion
from app.models.workflow import Workflow
from app.models.audit import AuditLog
from app.models.rag import KnowledgeBase, Document

def test_user_model_fields():
    user = User(
        email="test@example.com",
        hashed_password="hashed",
        full_name="Test User",
        role=Role.ADMIN,
    )
    assert user.email == "test@example.com"
    assert user.role == Role.ADMIN

def test_agent_model_fields():
    agent = Agent(
        name="Test Agent",
        system_prompt="You are helpful.",
        created_by="user-1",
    )
    assert agent.name == "Test Agent"
    assert agent.current_version == 1

def test_audit_log_fields():
    log = AuditLog(action="agent.run", resource_type="agent")
    assert log.action == "agent.run"
    assert log.guardrail_triggered == False
