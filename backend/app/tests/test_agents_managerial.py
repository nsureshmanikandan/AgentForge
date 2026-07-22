import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_agent_model_has_worker_agent_ids_column():
    from app.models.agent import Agent
    agent = Agent(name="Manager", system_prompt="You manage workers.")
    assert agent.worker_agent_ids == []


def test_agent_create_schema_accepts_worker_agent_ids():
    from app.schemas.agent import AgentCreate
    body = AgentCreate(name="Manager", system_prompt="You manage.", agent_type="managerial", worker_agent_ids=["a", "b"])
    assert body.worker_agent_ids == ["a", "b"]


def test_manager_run_response_schema():
    from app.schemas.agent import ManagerRunResponse
    res = ManagerRunResponse(
        output="done",
        guardrail_triggered=False,
        pii_triggered=False,
        hallucination_triggered=False,
        latency_ms=100,
        steps=[{"agent": "worker-a", "result": {"output": "partial"}}],
    )
    assert res.steps[0]["agent"] == "worker-a"
