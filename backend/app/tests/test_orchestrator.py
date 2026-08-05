from app.config import settings
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.core.guardrails import GLOBAL_SAFETY_RULES


@pytest.fixture
def restore_global_rules():
    snapshot = {rule_id: dict(rule) for rule_id, rule in GLOBAL_SAFETY_RULES.items()}
    yield
    for rule_id, rule in snapshot.items():
        GLOBAL_SAFETY_RULES[rule_id].update(rule)

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
async def test_org_disabled_pii_rule_overrides_agent_enabled_setting(restore_global_rules):
    """The org-wide PII toggle is a ceiling: disabling it must stop PII
    detection even for an agent whose own guardrails.pii is True."""
    from app.core.orchestrator import AgentOrchestrator
    GLOBAL_SAFETY_RULES["pii-detection"]["enabled"] = False
    config = {
        "name": "Test Agent",
        "system_prompt": "You are helpful.",
        "model": settings.azure_openai_deployment_gpt4o,
        "tools": [],
        "guardrails": {"pii": True, "hallucination": False},
    }
    orch = AgentOrchestrator(config)
    assert orch._pii_enabled is False
    with patch.object(orch._llm, "chat", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = "Contact admin@secret.com for access."
        result = await orch.run("How do I get access?")
    assert result["pii_triggered"] is False
    assert "admin@secret.com" in result["output"]


@pytest.mark.asyncio
async def test_org_enabled_pii_rule_still_respects_agent_disabled_setting(restore_global_rules):
    """The org toggle is a ceiling, not a floor -- an agent that has turned
    its own PII guardrail off must stay off even when the org rule is on."""
    from app.core.orchestrator import AgentOrchestrator
    assert GLOBAL_SAFETY_RULES["pii-detection"]["enabled"] is True
    config = {
        "name": "Test Agent",
        "system_prompt": "You are helpful.",
        "model": settings.azure_openai_deployment_gpt4o,
        "tools": [],
        "guardrails": {"pii": False, "hallucination": False},
    }
    orch = AgentOrchestrator(config)
    assert orch._pii_enabled is False


@pytest.mark.asyncio
async def test_gemini_model_choice_resolves_to_gemini_provider():
    """agent_config["model"] == "gemini" must resolve to provider="gemini",
    not fall through to the azure default the way an unrecognized value
    would (matching the local/azure/gemini three-way mapping)."""
    from app.core.orchestrator import AgentOrchestrator
    config = {
        "name": "Test Agent",
        "system_prompt": "You are helpful.",
        "model": "gemini",
        "tools": [],
        "guardrails": {"pii": True, "hallucination": True},
    }
    orch = AgentOrchestrator(config)
    assert orch._llm.provider == "gemini"

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
