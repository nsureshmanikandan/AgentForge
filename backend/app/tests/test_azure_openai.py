import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.core.azure_openai import AzureOpenAIClient

@pytest.mark.asyncio
async def test_chat_returns_string():
    from app.config import settings
    with patch("app.core.azure_openai.AsyncAzureOpenAI") as MockClient, \
         patch.object(settings, "llm_provider", "azure"), \
         patch.object(settings, "builder_llm_provider", None):
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
    from app.config import settings
    with patch("app.core.azure_openai.AsyncAzureOpenAI"), \
         patch.object(settings, "llm_provider", "azure"), \
         patch.object(settings, "builder_llm_provider", None):
        client = AzureOpenAIClient()
        assert client.deployment == settings.azure_openai_deployment_gpt45


@pytest.mark.asyncio
async def test_lmstudio_provider_uses_openai_client_and_local_model():
    from app.config import settings
    with patch("app.core.azure_openai.AsyncOpenAI") as MockOpenAI, \
         patch.object(settings, "llm_provider", "lmstudio"), \
         patch.object(settings, "builder_llm_provider", None), \
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
         patch.object(settings, "llm_provider", "azure"), \
         patch.object(settings, "builder_llm_provider", None):
        client = AzureOpenAIClient()
        assert client.provider == "azure"
        MockAzure.assert_called_once()


@pytest.mark.asyncio
async def test_lmstudio_chat_uses_max_tokens_not_max_completion_tokens():
    from app.config import settings
    with patch("app.core.azure_openai.AsyncOpenAI") as MockOpenAI, \
         patch.object(settings, "llm_provider", "lmstudio"), \
         patch.object(settings, "builder_llm_provider", None):
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


@pytest.mark.asyncio
async def test_lmstudio_ignores_azure_deployment_override():
    """An Agent Studio agent saved with model="gpt-4o" (an Azure deployment
    name, the only options in that dropdown) must NOT be sent to LM Studio's
    server as-is -- it isn't a model LM Studio has loaded. lmstudio always
    uses LMSTUDIO_MODEL regardless of what's passed as `deployment`."""
    from app.config import settings
    with patch("app.core.azure_openai.AsyncOpenAI"), \
         patch.object(settings, "llm_provider", "lmstudio"), \
         patch.object(settings, "builder_llm_provider", None), \
         patch.object(settings, "lmstudio_model", "qwen/qwen3.5-9b"):
        client = AzureOpenAIClient(deployment="gpt-4o")
        assert client.deployment == "qwen/qwen3.5-9b"


@pytest.mark.asyncio
async def test_builder_llm_provider_overrides_global_llm_provider():
    """BUILDER_LLM_PROVIDER takes priority over LLM_PROVIDER when set, so
    Visual Builder/orchestrator/RAG/voice-text can run on a different
    provider than the rest of the app without restarting between tests."""
    from app.config import settings
    with patch("app.core.azure_openai.AsyncOpenAI"), \
         patch.object(settings, "llm_provider", "azure"), \
         patch.object(settings, "builder_llm_provider", "lmstudio"):
        client = AzureOpenAIClient()
        assert client.provider == "lmstudio"


@pytest.mark.asyncio
async def test_builder_llm_provider_unset_falls_back_to_global():
    from app.config import settings
    with patch("app.core.azure_openai.AsyncAzureOpenAI"), \
         patch.object(settings, "llm_provider", "azure"), \
         patch.object(settings, "builder_llm_provider", None):
        client = AzureOpenAIClient()
        assert client.provider == "azure"


@pytest.mark.asyncio
async def test_gemini_provider_resolves_deployment_and_defers_client():
    """gemini is a third valid provider; unlike azure/lmstudio it doesn't
    build its SDK client eagerly in __init__ (google-genai's Client() isn't
    imported until first use, so setups without the package installed still
    work as long as they never select gemini)."""
    from app.config import settings
    with patch.object(settings, "llm_provider", "azure"), \
         patch.object(settings, "builder_llm_provider", None), \
         patch.object(settings, "gemini_model", "gemini-3.1-flash-lite"):
        client = AzureOpenAIClient(provider="gemini")
        assert client.provider == "gemini"
        assert client.deployment == "gemini-3.1-flash-lite"
        assert client._gemini_client is None


@pytest.mark.asyncio
async def test_gemini_client_prefers_api_key_mode():
    from app.config import settings
    with patch("google.genai.Client") as MockGenaiClient, \
         patch.object(settings, "gemini_api_key", "test-key-123"):
        client = AzureOpenAIClient(provider="gemini")
        client._get_gemini_client()
        MockGenaiClient.assert_called_once_with(api_key="test-key-123")


@pytest.mark.asyncio
async def test_gemini_client_falls_back_to_vertex_ai_without_api_key():
    from app.config import settings
    with patch("google.genai.Client") as MockGenaiClient, \
         patch.object(settings, "gemini_api_key", ""), \
         patch.object(settings, "google_cloud_project", "my-project"), \
         patch.object(settings, "google_cloud_location", "global"):
        client = AzureOpenAIClient(provider="gemini")
        client._get_gemini_client()
        MockGenaiClient.assert_called_once_with(vertexai=True, project="my-project", location="global")


@pytest.mark.asyncio
async def test_gemini_chat_splits_system_message_and_maps_assistant_to_model_role():
    """Gemini has no "system" role and calls the assistant's turn "model",
    not "assistant" -- chat() must translate AgentForge's OpenAI-shaped
    messages list into that shape before calling generate_content."""
    from app.config import settings
    with patch("google.genai.Client") as MockGenaiClient, \
         patch.object(settings, "gemini_api_key", "test-key"):
        mock_response = MagicMock()
        mock_response.text = "Gemini says hi"
        MockGenaiClient.return_value.models.generate_content.return_value = mock_response

        client = AzureOpenAIClient(provider="gemini")
        result = await client.chat([
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
            {"role": "user", "content": "How are you?"},
        ])

        assert result == "Gemini says hi"
        _, kwargs = MockGenaiClient.return_value.models.generate_content.call_args
        assert kwargs["config"].system_instruction == "You are helpful."
        roles = [c["role"] for c in kwargs["contents"]]
        assert roles == ["user", "model", "user"]


@pytest.mark.asyncio
async def test_gemini_chat_falls_back_to_parts_when_text_is_empty():
    """Thinking models (e.g. gemini-3.5-flash) can return response.text as
    empty even on success -- confirmed via live testing -- so chat() must
    fall back to scanning candidates[].content.parts, skipping any part
    flagged as internal "thought" reasoning."""
    from app.config import settings
    with patch("google.genai.Client") as MockGenaiClient, \
         patch.object(settings, "gemini_api_key", "test-key"):
        thought_part = MagicMock(thought=True, text="internal reasoning...")
        answer_part = MagicMock(thought=False, text="the real answer")
        mock_candidate = MagicMock()
        mock_candidate.content.parts = [thought_part, answer_part]
        mock_response = MagicMock()
        mock_response.text = ""
        mock_response.candidates = [mock_candidate]
        MockGenaiClient.return_value.models.generate_content.return_value = mock_response

        client = AzureOpenAIClient(provider="gemini")
        result = await client.chat([{"role": "user", "content": "Hi"}])
        assert result == "the real answer"
