import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_agent_model_has_worker_agent_ids_column():
    from app.models.agent import Agent
    agent = Agent(name="Manager", system_prompt="You manage workers.")
    assert agent.worker_agent_ids == []


def test_agent_create_schema_accepts_worker_agent_ids():
    from app.schemas.agent import AgentCreate
    body = AgentCreate(name="Manager", system_prompt="You manage.", agent_type="managerial", worker_agent_ids=["a", "b"])
    assert body.worker_agent_ids == ["a", "b"]


def test_manager_run_response_schema():
    from app.schemas.agent import ManagerRunResponse
    res = ManagerRunResponse(
        output="done",
        guardrail_triggered=False,
        pii_triggered=False,
        hallucination_triggered=False,
        latency_ms=100,
        steps=[{"agent": "worker-a", "result": {"output": "partial"}}],
    )
    assert res.steps[0]["agent"] == "worker-a"


@pytest.mark.asyncio
async def test_managerial_agent_run_delegates_to_workers(monkeypatch):
    async def fake_run(self, user_input, chat_history=None):
        return {
            "output": f"echo:{user_input}",
            "raw_output": f"echo:{user_input}",
            "guardrail_triggered": False,
            "pii_triggered": False,
            "input_pii_triggered": False,
            "output_pii_triggered": False,
            "hallucination_triggered": False,
            "latency_ms": 5,
        }

    from app.core.orchestrator import AgentOrchestrator
    monkeypatch.setattr(AgentOrchestrator, "run", fake_run)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        worker_res = await ac.post("/api/agents/", json={
            "name": "Worker One", "system_prompt": "You are a worker.",
        })
        worker_id = worker_res.json()["id"]

        manager_res = await ac.post("/api/agents/", json={
            "name": "Manager One", "system_prompt": "You manage workers.",
            "agent_type": "managerial", "worker_agent_ids": [worker_id],
        })
        manager_id = manager_res.json()["id"]

        run_res = await ac.post(f"/api/agents/{manager_id}/run", json={"input": "do the thing"})

    assert run_res.status_code == 200
    body = run_res.json()
    assert "steps" in body
    assert body["output"] == "echo:do the thing"


@pytest.mark.asyncio
async def test_managerial_agent_run_skips_deleted_workers(monkeypatch):
    async def fake_run(self, user_input, chat_history=None):
        return {
            "output": "ok", "raw_output": "ok", "guardrail_triggered": False,
            "pii_triggered": False, "input_pii_triggered": False,
            "output_pii_triggered": False, "hallucination_triggered": False, "latency_ms": 5,
        }

    from app.core.orchestrator import AgentOrchestrator
    monkeypatch.setattr(AgentOrchestrator, "run", fake_run)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        manager_res = await ac.post("/api/agents/", json={
            "name": "Manager Two", "system_prompt": "You manage.",
            "agent_type": "managerial", "worker_agent_ids": ["nonexistent-id"],
        })
        manager_id = manager_res.json()["id"]
        run_res = await ac.post(f"/api/agents/{manager_id}/run", json={"input": "go"})

    assert run_res.status_code == 400
    assert "no workers" in run_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_managerial_agent_falls_back_to_first_worker_on_malformed_manager_output(monkeypatch):
    """MultiAgentOrchestrator already falls back to invoking just the first
    configured worker when the manager LLM's worker-selection JSON fails to
    parse (orchestrator.py's `except Exception: worker_order = worker_names[:1]`).
    This test only needs to confirm that existing fallback still fires when
    reached through the new /run endpoint -- no new fallback logic is added."""
    call_count = {"n": 0}

    async def fake_run(self, user_input, chat_history=None):
        call_count["n"] += 1
        if call_count["n"] == 1:
            # Manager call: contains brackets (so the orchestrator's `start >= 0`
            # branch is taken) but the bracketed content isn't valid JSON, so
            # json.loads raises and the except-based fallback actually fires.
            return {
                "output": "[not valid json}", "raw_output": "[not valid json}",
                "guardrail_triggered": False, "pii_triggered": False,
                "input_pii_triggered": False, "output_pii_triggered": False,
                "hallucination_triggered": False, "latency_ms": 5,
            }
        return {
            "output": "worker ran anyway", "raw_output": "worker ran anyway",
            "guardrail_triggered": False, "pii_triggered": False,
            "input_pii_triggered": False, "output_pii_triggered": False,
            "hallucination_triggered": False, "latency_ms": 5,
        }

    from app.core.orchestrator import AgentOrchestrator
    monkeypatch.setattr(AgentOrchestrator, "run", fake_run)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        worker_res = await ac.post("/api/agents/", json={"name": "Worker Three", "system_prompt": "Worker."})
        worker_id = worker_res.json()["id"]
        manager_res = await ac.post("/api/agents/", json={
            "name": "Manager Three", "system_prompt": "You manage.",
            "agent_type": "managerial", "worker_agent_ids": [worker_id],
        })
        manager_id = manager_res.json()["id"]
        run_res = await ac.post(f"/api/agents/{manager_id}/run", json={"input": "go"})

    assert run_res.status_code == 200
    body = run_res.json()
    assert len(body["steps"]) == 1
    assert body["output"] == "worker ran anyway"
