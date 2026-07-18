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
        client = AzureOpenAIClient()
        result = await client.chat([{"role": "user", "content": "Hi"}])
        assert result == "Hello there!"

@pytest.mark.asyncio
async def test_gpt45_uses_correct_deployment():
    with patch("app.core.azure_openai.AsyncAzureOpenAI"):
        client = AzureOpenAIClient()
        from app.config import settings
        assert client.deployment == settings.azure_openai_deployment_gpt45


@pytest.mark.asyncio
async def test_lmstudio_provider_uses_openai_client_and_local_model():
    from app.config import settings
    with patch("app.core.azure_openai.AsyncOpenAI") as MockOpenAI, \
         patch.object(settings, "llm_provider", "lmstudio"), \
         patch.object(settings, "lmstudio_base_url", "http://localhost:1234/v1"), \
         patch.object(settings, "lmstudio_model", "qwen/qwen3.5-9b"):
        client = AzureOpenAIClient()
        assert client.provider == "lmstudio"
        assert client.deployment == "qwen/qwen3.5-9b"
        MockOpenAI.assert_called_once_with(base_url="http://localhost:1234/v1", api_key="lm-studio")


@pytest.mark.asyncio
async def test_default_provider_still_uses_azure():
    from app.config import settings
    with patch("app.core.azure_openai.AsyncAzureOpenAI") as MockAzure, \
         patch.object(settings, "llm_provider", "azure"):
        client = AzureOpenAIClient()
        assert client.provider == "azure"
        MockAzure.assert_called_once()


@pytest.mark.asyncio
async def test_lmstudio_chat_uses_max_tokens_not_max_completion_tokens():
    from app.config import settings
    with patch("app.core.azure_openai.AsyncOpenAI") as MockOpenAI, \
         patch.object(settings, "llm_provider", "lmstudio"):
        mock_instance = MockOpenAI.return_value
        mock_choice = MagicMock()
        mock_choice.message.content = "hi from local model"
        mock_instance.chat.completions.create = AsyncMock(
            return_value=MagicMock(choices=[mock_choice])
        )
        client = AzureOpenAIClient()
        result = await client.chat([{"role": "user", "content": "Hi"}], max_tokens=100)
        assert result == "hi from local model"
        _, kwargs = mock_instance.chat.completions.create.call_args
        assert kwargs.get("max_tokens") == 100
        assert "max_completion_tokens" not in kwargs
