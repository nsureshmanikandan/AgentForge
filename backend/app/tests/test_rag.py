import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_query_returns_answer_and_sources():
    from app.core.rag_engine import RAGEngine
    engine = RAGEngine(kb_id="test-kb")
    with patch.object(engine, "_retrieve", new_callable=AsyncMock) as mock_retrieve, \
         patch.object(engine._llm, "chat", new_callable=AsyncMock) as mock_chat:
        mock_retrieve.return_value = ["Azure is a cloud platform by Microsoft."]
        mock_chat.return_value = "Azure is Microsoft's cloud platform."
        result = await engine.query("What is Azure?")
    assert "Azure" in result["answer"]
    assert len(result["sources"]) > 0

@pytest.mark.asyncio
async def test_query_no_sources_still_answers():
    from app.core.rag_engine import RAGEngine
    engine = RAGEngine(kb_id="test-kb-2")
    with patch.object(engine, "_retrieve", new_callable=AsyncMock) as mock_retrieve, \
         patch.object(engine._llm, "chat", new_callable=AsyncMock) as mock_chat:
        mock_retrieve.return_value = []
        mock_chat.return_value = "No relevant context found."
        result = await engine.query("Unknown question?")
    assert result["answer"] is not None
    assert result["sources"] == []
