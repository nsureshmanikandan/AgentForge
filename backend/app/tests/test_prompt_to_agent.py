from app.config import settings
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_generate_returns_agent_config():
    from app.core.prompt_to_agent import generate_agent_config
    mock_response = f'{{"name":"HR Bot","description":"Handles HR queries","system_prompt":"You are an HR assistant.","model":"{settings.azure_openai_deployment_gpt4o}","tools":["email"],"guardrails":{{"pii":true,"hallucination":true}}}}'
    with patch("app.core.prompt_to_agent.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value=mock_response)
        result = await generate_agent_config("Build an HR assistant that answers employee questions")
        assert result["name"] == "HR Bot"
        assert "system_prompt" in result
        assert result["guardrails"]["pii"] is True
        assert result["tools"] == ["email"]

@pytest.mark.asyncio
async def test_generate_strips_markdown_fences():
    from app.core.prompt_to_agent import generate_agent_config
    mock_response = f'```json\n{{"name":"Sales Bot","description":"Sales agent","system_prompt":"You sell.","model":"{settings.azure_openai_deployment_gpt4o}","tools":[],"guardrails":{{"pii":true,"hallucination":true}}}}\n```'
    with patch("app.core.prompt_to_agent.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value=mock_response)
        result = await generate_agent_config("Build a sales agent")
        assert result["name"] == "Sales Bot"
