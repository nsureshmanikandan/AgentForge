import pytest
from app.core.tool_registry import TOOL_REGISTRY, execute_tool, ToolDefinition

def test_registry_has_expected_tools():
    expected = {"web_search", "calculator", "email", "slack", "github", "jira", "google_drive"}
    assert expected.issubset(set(TOOL_REGISTRY.keys()))

def test_tool_definitions_are_valid():
    for name, tool in TOOL_REGISTRY.items():
        assert isinstance(tool, ToolDefinition)
        assert tool.name == name
        assert tool.parameters.get("type") == "object"

@pytest.mark.asyncio
async def test_calculator_evaluates_expression():
    result = await execute_tool("calculator", {"expression": "2 + 2 * 3"})
    assert result == "8"

@pytest.mark.asyncio
async def test_calculator_handles_error():
    result = await execute_tool("calculator", {"expression": "1 / 0"})
    assert "Error" in result

@pytest.mark.asyncio
async def test_stub_tools_return_confirmation():
    result = await execute_tool("slack", {"channel": "#general", "message": "Hello"})
    assert "slack" in result.lower()
