import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


async def _register_and_login(ac: AsyncClient, suffix: str) -> str:
    email = f"projtest_{suffix}@example.com"
    await ac.post("/api/auth/register", json={"email": email, "password": "testpass123", "full_name": "Test User"})
    login_res = await ac.post("/api/auth/login", data={"username": email, "password": "testpass123"})
    return login_res.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_and_get_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _register_and_login(ac, uuid.uuid4().hex[:8])
        create_res = await ac.post(
            "/api/projects/",
            json={"name": "My App", "summary": "A test app", "original_prompt": "build me a thing"},
            headers=_auth(token),
        )
        assert create_res.status_code == 201
        project_id = create_res.json()["id"]

        get_res = await ac.get(f"/api/projects/{project_id}", headers=_auth(token))
        assert get_res.status_code == 200
        assert get_res.json()["name"] == "My App"
        assert get_res.json()["visibility"] == "private"


@pytest.mark.asyncio
async def test_list_private_projects_scoped_to_owner():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await _register_and_login(ac, uuid.uuid4().hex[:8])
        token_b = await _register_and_login(ac, uuid.uuid4().hex[:8])
        await ac.post("/api/projects/", json={"name": "A's project"}, headers=_auth(token_a))

        list_as_a = await ac.get("/api/projects/?visibility=private", headers=_auth(token_a))
        list_as_b = await ac.get("/api/projects/?visibility=private", headers=_auth(token_b))
        assert any(p["name"] == "A's project" for p in list_as_a.json())
        assert not any(p["name"] == "A's project" for p in list_as_b.json())


@pytest.mark.asyncio
async def test_non_owner_cannot_view_private_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await _register_and_login(ac, uuid.uuid4().hex[:8])
        token_b = await _register_and_login(ac, uuid.uuid4().hex[:8])
        create_res = await ac.post("/api/projects/", json={"name": "Private"}, headers=_auth(token_a))
        project_id = create_res.json()["id"]

        res = await ac.get(f"/api/projects/{project_id}", headers=_auth(token_b))
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_published_project_visible_to_others():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await _register_and_login(ac, uuid.uuid4().hex[:8])
        token_b = await _register_and_login(ac, uuid.uuid4().hex[:8])
        create_res = await ac.post("/api/projects/", json={"name": "Public one"}, headers=_auth(token_a))
        project_id = create_res.json()["id"]

        publish_res = await ac.put(
            f"/api/projects/{project_id}/visibility",
            json={"visibility": "published", "shared_with": []},
            headers=_auth(token_a),
        )
        assert publish_res.status_code == 200

        get_as_b = await ac.get(f"/api/projects/{project_id}", headers=_auth(token_b))
        assert get_as_b.status_code == 200

        list_published = await ac.get("/api/projects/?visibility=published", headers=_auth(token_b))
        assert any(p["id"] == project_id for p in list_published.json())


@pytest.mark.asyncio
async def test_shared_project_visible_only_to_shared_with_list():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await _register_and_login(ac, uuid.uuid4().hex[:8])
        token_b = await _register_and_login(ac, uuid.uuid4().hex[:8])
        token_c = await _register_and_login(ac, uuid.uuid4().hex[:8])

        me_res = await ac.get("/api/auth/me", headers=_auth(token_b))
        user_b_id = me_res.json()["id"]

        create_res = await ac.post("/api/projects/", json={"name": "Shared one"}, headers=_auth(token_a))
        project_id = create_res.json()["id"]

        await ac.put(
            f"/api/projects/{project_id}/visibility",
            json={"visibility": "shared", "shared_with": [user_b_id]},
            headers=_auth(token_a),
        )

        res_b = await ac.get(f"/api/projects/{project_id}", headers=_auth(token_b))
        assert res_b.status_code == 200

        res_c = await ac.get(f"/api/projects/{project_id}", headers=_auth(token_c))
        assert res_c.status_code == 403


@pytest.mark.asyncio
async def test_soft_delete_restore_and_permanent_delete_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = await _register_and_login(ac, uuid.uuid4().hex[:8])
        create_res = await ac.post("/api/projects/", json={"name": "Temp"}, headers=_auth(token))
        project_id = create_res.json()["id"]

        del_res = await ac.delete(f"/api/projects/{project_id}", headers=_auth(token))
        assert del_res.status_code == 204

        # Gone from the normal private list...
        list_res = await ac.get("/api/projects/?visibility=private", headers=_auth(token))
        assert not any(p["id"] == project_id for p in list_res.json())

        # ...but present in Trash
        trash_res = await ac.get("/api/projects/trash", headers=_auth(token))
        assert any(p["id"] == project_id for p in trash_res.json())

        # Restore brings it back
        restore_res = await ac.post(f"/api/projects/{project_id}/restore", headers=_auth(token))
        assert restore_res.status_code == 200
        list_res_after_restore = await ac.get("/api/projects/?visibility=private", headers=_auth(token))
        assert any(p["id"] == project_id for p in list_res_after_restore.json())

        # Permanent delete requires it to be in Trash first
        premature_res = await ac.delete(f"/api/projects/{project_id}/permanent", headers=_auth(token))
        assert premature_res.status_code == 400

        await ac.delete(f"/api/projects/{project_id}", headers=_auth(token))
        final_res = await ac.delete(f"/api/projects/{project_id}/permanent", headers=_auth(token))
        assert final_res.status_code == 204

        get_after_purge = await ac.get(f"/api/projects/{project_id}", headers=_auth(token))
        assert get_after_purge.status_code == 404


@pytest.mark.asyncio
async def test_non_owner_cannot_mutate_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token_a = await _register_and_login(ac, uuid.uuid4().hex[:8])
        token_b = await _register_and_login(ac, uuid.uuid4().hex[:8])
        create_res = await ac.post("/api/projects/", json={"name": "Mine"}, headers=_auth(token_a))
        project_id = create_res.json()["id"]

        update_res = await ac.put(
            f"/api/projects/{project_id}", json={"name": "Hijacked"}, headers=_auth(token_b)
        )
        assert update_res.status_code == 403

        delete_res = await ac.delete(f"/api/projects/{project_id}", headers=_auth(token_b))
        assert delete_res.status_code == 403


@pytest.mark.asyncio
async def test_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/projects/")
    assert res.status_code == 401
