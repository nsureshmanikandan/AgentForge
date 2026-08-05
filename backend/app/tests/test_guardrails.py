import pytest
from app.core.guardrails import GuardrailsEngine, GLOBAL_SAFETY_RULES, is_rule_enabled


@pytest.fixture
def restore_global_rules():
    """GLOBAL_SAFETY_RULES is shared, mutable module state (the same dict
    api/safety.py's endpoints mutate) -- any test that toggles a rule must
    restore it, or it leaks into every other test/request that runs after."""
    snapshot = {rule_id: dict(rule) for rule_id, rule in GLOBAL_SAFETY_RULES.items()}
    yield
    for rule_id, rule in snapshot.items():
        GLOBAL_SAFETY_RULES[rule_id].update(rule)


def test_is_rule_enabled_reflects_toggle(restore_global_rules):
    assert is_rule_enabled("pii-detection") is True
    GLOBAL_SAFETY_RULES["pii-detection"]["enabled"] = False
    assert is_rule_enabled("pii-detection") is False


def test_is_rule_enabled_fails_open_for_unknown_rule():
    assert is_rule_enabled("not-a-real-rule") is True


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
