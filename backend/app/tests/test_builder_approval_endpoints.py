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


@pytest.mark.asyncio
async def test_approval_info_returns_404_for_nonexistent_run():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Register + login to get a real token so we get past auth and hit the 404 branch
        await ac.post("/api/auth/register", json={"email": "approval404test@example.com", "password": "testpass123", "full_name": "Test User"})
        login_res = await ac.post("/api/auth/login", data={"username": "approval404test@example.com", "password": "testpass123"})
        token = login_res.json()["access_token"]
        res = await ac.get("/api/builder/runs/nonexistent-run-id/approval-info", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_approve_returns_404_for_nonexistent_run():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/auth/register", json={"email": "approve404test@example.com", "password": "testpass123", "full_name": "Test User"})
        login_res = await ac.post("/api/auth/login", data={"username": "approve404test@example.com", "password": "testpass123"})
        token = login_res.json()["access_token"]
        res = await ac.post("/api/builder/runs/nonexistent-run-id/approve", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 404
