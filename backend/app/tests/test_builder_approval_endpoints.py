import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_approval_info_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/builder/runs/nonexistent-run/approval-info")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_approve_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/builder/runs/nonexistent-run/approve")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_reject_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/builder/runs/nonexistent-run/reject")
    assert res.status_code == 401
