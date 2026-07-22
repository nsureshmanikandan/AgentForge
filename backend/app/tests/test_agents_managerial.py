import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_agent_model_has_worker_agent_ids_column():
    from app.models.agent import Agent
    agent = Agent(name="Manager", system_prompt="You manage workers.")
    assert agent.worker_agent_ids == []
