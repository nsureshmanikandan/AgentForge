from app.config import settings
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

@pytest.mark.asyncio
async def test_single_agent_run_returns_output():
    from app.core.orchestrator import AgentOrchestrator
    config = {
        "name": "Test Agent",
        "system_prompt": "You are helpful.",
        "model": settings.azure_openai_deployment_gpt4o,
        "tools": [],
        "guardrails": {"pii": True, "hallucination": True},
    }
    orch = AgentOrchestrator(config)
    with patch.object(orch._llm, "chat", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = "Paris is the capital of France."
        result = await orch.run("What is the capital of France?")
    assert "Paris" in result["output"]
    assert result["guardrail_triggered"] is False
    assert "latency_ms" in result

@pytest.mark.asyncio
async def test_single_agent_pii_triggers_guardrail():
    from app.core.orchestrator import AgentOrchestrator
    config = {
        "name": "Test Agent",
        "system_prompt": "You are helpful.",
        "model": settings.azure_openai_deployment_gpt4o,
        "tools": [],
        "guardrails": {"pii": True, "hallucination": False},
    }
    orch = AgentOrchestrator(config)
    with patch.object(orch._llm, "chat", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = "Contact admin@secret.com for access."
        result = await orch.run("How do I get access?")
    assert result["pii_triggered"] is True
    assert result["guardrail_triggered"] is True
    assert "admin@secret.com" not in result["output"]

@pytest.mark.asyncio
async def test_multi_agent_orchestrator():
    from app.core.orchestrator import MultiAgentOrchestrator
    manager_cfg = {"name": "Manager", "system_prompt": "You coordinate.", "model": settings.azure_openai_deployment_gpt4o, "tools": [], "guardrails": {"pii": False, "hallucination": False}}
    worker_cfg = {"name": "Researcher", "system_prompt": "You research.", "model": settings.azure_openai_deployment_gpt4o, "tools": [], "guardrails": {"pii": False, "hallucination": False}}

    orch = MultiAgentOrchestrator(manager_cfg, [worker_cfg])

    with patch.object(orch.manager._llm, "chat", new_callable=AsyncMock) as mgr_chat, \
         patch.object(orch.workers["Researcher"]._llm, "chat", new_callable=AsyncMock) as worker_chat:
        mgr_chat.return_value = '["Researcher"]'
        worker_chat.return_value = "Research complete."
        result = await orch.run("Do some research")

    assert result["final_output"] == "Research complete."
    assert len(result["steps"]) == 1
