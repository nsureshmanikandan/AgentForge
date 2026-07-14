from app.config import settings
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_simulation_all_pass():
    from app.core.simulation import SimulationRunner
    config = {
        "name": "Test Agent", "system_prompt": "You are helpful.",
        "model": settings.azure_openai_deployment_gpt4o, "tools": [], "guardrails": {"pii": False, "hallucination": False},
    }
    test_cases = [
        {"input": "What is 2+2?", "expected_contains": "4"},
        {"input": "Hello", "expected_contains": "hello"},
    ]
    runner = SimulationRunner(config, test_cases)
    with patch("app.core.simulation.AgentOrchestrator") as MockOrch:
        instance = MockOrch.return_value
        instance.run = AsyncMock(side_effect=[
            {"output": "The answer is 4.", "guardrail_triggered": False, "pii_triggered": False, "hallucination_triggered": False, "latency_ms": 100},
            {"output": "Hello there!", "guardrail_triggered": False, "pii_triggered": False, "hallucination_triggered": False, "latency_ms": 80},
        ])
        results = await runner.run()
    assert results["passed"] == 2
    assert results["failed"] == 0
    assert results["pass_rate"] == 100.0

@pytest.mark.asyncio
async def test_simulation_partial_fail():
    from app.core.simulation import SimulationRunner
    config = {"name": "Bot", "system_prompt": "...", "model": settings.azure_openai_deployment_gpt4o, "tools": [], "guardrails": {}}
    test_cases = [
        {"input": "Q1", "expected_contains": "yes"},
        {"input": "Q2", "expected_contains": "no"},
    ]
    runner = SimulationRunner(config, test_cases)
    with patch("app.core.simulation.AgentOrchestrator") as MockOrch:
        instance = MockOrch.return_value
        instance.run = AsyncMock(side_effect=[
            {"output": "Yes definitely.", "guardrail_triggered": False, "pii_triggered": False, "hallucination_triggered": False, "latency_ms": 50},
            {"output": "Maybe.", "guardrail_triggered": False, "pii_triggered": False, "hallucination_triggered": False, "latency_ms": 60},
        ])
        results = await runner.run()
    assert results["passed"] == 1
    assert results["failed"] == 1
    assert results["pass_rate"] == 50.0

@pytest.mark.asyncio
async def test_simulation_no_expected_always_passes():
    from app.core.simulation import SimulationRunner
    config = {"name": "Bot", "system_prompt": "...", "model": settings.azure_openai_deployment_gpt4o, "tools": [], "guardrails": {}}
    test_cases = [{"input": "Anything", "expected_contains": ""}]
    runner = SimulationRunner(config, test_cases)
    with patch("app.core.simulation.AgentOrchestrator") as MockOrch:
        instance = MockOrch.return_value
        instance.run = AsyncMock(return_value={"output": "Response", "guardrail_triggered": False, "pii_triggered": False, "hallucination_triggered": False, "latency_ms": 10})
        results = await runner.run()
    assert results["passed"] == 1
