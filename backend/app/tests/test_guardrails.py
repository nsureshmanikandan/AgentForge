import pytest
from app.core.guardrails import GuardrailsEngine

@pytest.mark.asyncio
async def test_pii_email_redacted():
    engine = GuardrailsEngine(pii_enabled=True, hallucination_enabled=False)
    result = await engine.check("Contact us at john.doe@example.com for help")
    assert "john.doe@example.com" not in result["output"]
    assert result["pii_triggered"] is True

@pytest.mark.asyncio
async def test_no_pii_passes_through():
    engine = GuardrailsEngine(pii_enabled=True, hallucination_enabled=False)
    result = await engine.check("The capital of France is Paris.")
    assert result["pii_triggered"] is False
    assert result["output"] == "The capital of France is Paris."

@pytest.mark.asyncio
async def test_hallucination_phrase_detected():
    engine = GuardrailsEngine(pii_enabled=False, hallucination_enabled=True)
    result = await engine.check("I think maybe the answer is 42.")
    assert result["hallucination_triggered"] is True

@pytest.mark.asyncio
async def test_no_hallucination_phrases_passes():
    engine = GuardrailsEngine(pii_enabled=False, hallucination_enabled=True)
    result = await engine.check("The answer is 42.")
    assert result["hallucination_triggered"] is False
