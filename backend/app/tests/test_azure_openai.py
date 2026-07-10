import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.core.azure_openai import AzureOpenAIClient

@pytest.mark.asyncio
async def test_chat_returns_string():
    with patch("app.core.azure_openai.AsyncAzureOpenAI") as MockClient:
        mock_instance = MockClient.return_value
        mock_choice = MagicMock()
        mock_choice.message.content = "Hello there!"
        mock_instance.chat.completions.create = AsyncMock(
            return_value=MagicMock(choices=[mock_choice])
        )
        client = AzureOpenAIClient(model="gpt-4o")
        result = await client.chat([{"role": "user", "content": "Hi"}])
        assert result == "Hello there!"

@pytest.mark.asyncio
async def test_gpt45_uses_correct_deployment():
    with patch("app.core.azure_openai.AsyncAzureOpenAI"):
        client = AzureOpenAIClient(model="gpt-4-5")
        from app.config import settings
        assert client.deployment == settings.azure_openai_deployment_gpt45
