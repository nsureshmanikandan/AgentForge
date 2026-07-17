import json
from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture(autouse=True)
async def _dispose_engine_after_test():
    """Each pytest-asyncio test function gets its own event loop by default.
    The module-level asyncpg engine/pool must not carry connections across
    event loops (Windows ProactorEventLoop + asyncpg raises AttributeError
    during teardown otherwise), so dispose it after every test in this file."""
    yield
    from app.database import engine
    await engine.dispose()


@pytest.mark.asyncio
async def test_sse_stream_condition_node_skips_false_branch():
    workflow_payload = {
        "name": "SSE Condition Test",
        "nodes": [
            {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
            {"id": "cond", "type": "condition", "data": {"label": "Amount Check", "role": "condition", "rule": "amount < 25"}},
            {"id": "auto", "type": "output", "data": {"label": "Auto-Approved", "role": "output"}},
            {"id": "manual", "type": "output", "data": {"label": "Manual Review", "role": "output"}},
        ],
        "edges": [
            {"source": "n1", "target": "cond"},
            {"source": "cond", "target": "auto", "label": "true"},
            {"source": "cond", "target": "manual", "label": "false"},
        ],
    }
    with patch("app.api.builder.AzureOpenAIClient") as MockClient, \
         patch("app.api.builder._extract_variables", new=AsyncMock(return_value={"amount": 10})):
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="ignored")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            save_res = await ac.post("/api/builder/workflows", json=workflow_payload)
            workflow_id = save_res.json()["workflow_id"]

            visited_node_ids = []
            async with ac.stream(
                "POST", f"/api/builder/workflows/{workflow_id}/trigger-stream",
                json={"input": "Expense of $10"},
            ) as stream_res:
                async for line in stream_res.aiter_lines():
                    if line.startswith("data: "):
                        evt = json.loads(line[6:])
                        if evt.get("event") == "node_done":
                            visited_node_ids.append(evt["node_id"])

    assert "auto" in visited_node_ids
    assert "manual" not in visited_node_ids


@pytest.mark.asyncio
async def test_sse_stream_approval_node_pauses_and_stops():
    workflow_payload = {
        "name": "SSE Approval Test",
        "nodes": [
            {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
            {"id": "appr", "type": "approval", "data": {"label": "Manager Approval", "role": "approval", "approver_email": "mgr@example.com"}},
            {"id": "n3", "type": "output", "data": {"label": "Output", "role": "output"}},
        ],
        "edges": [
            {"source": "n1", "target": "appr"},
            {"source": "appr", "target": "n3"},
        ],
    }
    with patch("app.api.builder.send_email", return_value=True) as mock_send:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            save_res = await ac.post("/api/builder/workflows", json=workflow_payload)
            workflow_id = save_res.json()["workflow_id"]

            events = []
            async with ac.stream(
                "POST", f"/api/builder/workflows/{workflow_id}/trigger-stream",
                json={"input": "Expense of $430"},
            ) as stream_res:
                async for line in stream_res.aiter_lines():
                    if line.startswith("data: "):
                        events.append(json.loads(line[6:]))

    event_types = [e.get("event") for e in events]
    assert "pipeline_paused" in event_types
    node_done_ids = [e["node_id"] for e in events if e.get("event") == "node_done"]
    assert "n3" not in node_done_ids
    mock_send.assert_called_once()
