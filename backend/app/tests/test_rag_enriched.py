import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_query_response_has_enriched_fields():
    """Query endpoint must return all QueryResponse fields even when no docs are indexed."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # First create a KB
        kb_resp = await ac.post("/api/rag/knowledge-bases", json={"name": "Test KB", "description": ""})
        assert kb_resp.status_code == 201
        kb_id = kb_resp.json()["id"]

        # Query it (empty KB → graceful no-sources response)
        q_resp = await ac.post(f"/api/rag/knowledge-bases/{kb_id}/query", json={"question": "What is this?"})
        assert q_resp.status_code == 200
        data = q_resp.json()

        assert "answer" in data
        assert "sources" in data
        assert isinstance(data["sources"], list)
        assert "related_questions" in data
        assert isinstance(data["related_questions"], list)
        assert "grounding_score" in data   # may be None
        assert "graph_entities" in data    # may be None


@pytest.mark.asyncio
async def test_feedback_endpoint_stores_vote():
    """Feedback endpoint must accept vote and comment, return 201 with ok status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        kb_resp = await ac.post("/api/rag/knowledge-bases", json={"name": "Feedback KB", "description": ""})
        assert kb_resp.status_code == 201
        kb_id = kb_resp.json()["id"]

        resp = await ac.post(
            f"/api/rag/knowledge-bases/{kb_id}/feedback",
            json={"question": "Test?", "answer": "Test answer", "vote": "down", "comment": "Wrong info"},
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "ok"
