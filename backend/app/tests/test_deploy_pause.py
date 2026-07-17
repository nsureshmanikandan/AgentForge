from unittest.mock import patch
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_deploy_workflow_with_approval_node_returns_waiting_approval_status():
    workflow_payload = {
        "name": "Deploy Approval Test",
        "nodes": [
            {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
            {"id": "appr", "type": "approval", "data": {"label": "Manager Approval", "role": "approval", "approver_email": "mgr@example.com"}},
            {"id": "n3", "type": "output", "data": {"label": "Output", "role": "output"}},
        ],
        "edges": [{"source": "n1", "target": "appr"}, {"source": "appr", "target": "n3"}],
    }
    with patch("app.api.builder.send_email", return_value=True):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            save_res = await ac.post("/api/builder/workflows", json=workflow_payload)
            workflow_id = save_res.json()["workflow_id"]
            deploy_res = await ac.post(f"/api/builder/workflows/{workflow_id}/deploy")
    assert deploy_res.status_code == 200
    body = deploy_res.json()
    assert body["status"] == "waiting_approval"
    assert "run_id" in body and body["run_id"]
