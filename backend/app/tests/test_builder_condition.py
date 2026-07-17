from unittest.mock import AsyncMock
import pytest
from app.api.builder import _evaluate_condition, _extract_variables


def test_evaluate_condition_true_case():
    assert _evaluate_condition("amount < 25", {"amount": 10}) is True


def test_evaluate_condition_false_case():
    assert _evaluate_condition("amount < 25", {"amount": 430}) is False


def test_evaluate_condition_fails_closed_on_missing_variable():
    assert _evaluate_condition("amount < 25", {}) is False


def test_evaluate_condition_fails_closed_on_code_injection_attempt():
    malicious = "__import__('os').system('echo pwned')"
    assert _evaluate_condition(malicious, {"amount": 10}) is False


def test_evaluate_condition_fails_closed_on_attribute_injection_via_existing_variable():
    """Even when the referenced variable exists, attempts to reach dangerous
    attributes/dunders through it must fail closed, not execute."""
    malicious = "amount.__class__.__base__.__subclasses__()"
    assert _evaluate_condition(malicious, {"amount": 10}) is False


@pytest.mark.asyncio
async def test_extract_variables_parses_json_response():
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value='{"amount": 430, "department": "Sales"}')
    result = await _extract_variables("Expense of $430 from Sales dept", fake_client)
    assert result == {"amount": 430, "department": "Sales"}


@pytest.mark.asyncio
async def test_extract_variables_returns_empty_dict_on_invalid_json():
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value="not json")
    result = await _extract_variables("some text", fake_client)
    assert result == {}
