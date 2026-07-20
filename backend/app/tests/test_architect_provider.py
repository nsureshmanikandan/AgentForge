import pytest
from unittest.mock import patch
from app.api.architect import _architect_provider


def test_architect_llm_provider_overrides_global_llm_provider():
    """ARCHITECT_LLM_PROVIDER takes priority over LLM_PROVIDER when set, so
    Architect can run on a different provider than the rest of the app
    (e.g. Azure for reliable heavy generation while Visual Builder runs on
    LM Studio) without restarting between tests."""
    from app.config import settings
    with patch.object(settings, "llm_provider", "lmstudio"), \
         patch.object(settings, "architect_llm_provider", "azure"):
        assert _architect_provider() == "azure"


def test_architect_llm_provider_unset_falls_back_to_global():
    from app.config import settings
    with patch.object(settings, "llm_provider", "lmstudio"), \
         patch.object(settings, "architect_llm_provider", None):
        assert _architect_provider() == "lmstudio"
