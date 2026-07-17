import json
from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_suggest_ideas_returns_parsed_list():
    fake_ideas = json.dumps([
        {"title": "Expense Approval Pipeline", "description": "Classifies and routes expense claims."},
        {"title": "Expense Fraud Detector", "description": "Flags anomalous expense patterns."},
    ])
    with patch("app.api.builder.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value=fake_ideas)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/builder/suggest-ideas", json={"partial_name": "Expense"})
    assert res.status_code == 200
    body = res.json()
    assert len(body["ideas"]) == 2
    assert body["ideas"][0]["title"] == "Expense Approval Pipeline"


@pytest.mark.asyncio
async def test_suggest_ideas_returns_empty_list_on_invalid_json():
    with patch("app.api.builder.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="not valid json")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/builder/suggest-ideas", json={"partial_name": "Expense"})
    assert res.status_code == 200
    assert res.json() == {"ideas": []}
