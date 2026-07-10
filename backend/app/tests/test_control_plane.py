import pytest
from app.api.control_plane import router
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

app = FastAPI()
app.include_router(router, prefix="/api/control-plane")


def test_control_plane_router_has_expected_routes():
    paths = [r.path for r in router.routes]
    assert "/audit-logs" in paths
    assert "/stats" in paths
    assert "/agents/{agent_id}/versions" in paths


def test_control_plane_router_methods():
    route_map = {r.path: r.methods for r in router.routes}
    assert "GET" in route_map["/audit-logs"]
    assert "GET" in route_map["/stats"]
    assert "GET" in route_map["/agents/{agent_id}/versions"]
