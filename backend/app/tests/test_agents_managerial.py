import json
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


@pytest.mark.asyncio
async def test_managerial_agent_skips_self_reference_and_duplicate_worker_ids(monkeypatch):
    """A manager should never invoke itself as a worker, and duplicate ids in
    worker_agent_ids shouldn't be resolved/counted twice."""
    call_count = {"n": 0}
    # Populated after the worker agent is created below -- create_agent
    # auto-renames on a name collision (e.g. "Worker Five" -> "Worker Five_v2"
    # if a prior test run left one behind), so the manager's worker-selection
    # JSON must reference whatever name the worker actually ended up with.
    real_worker_name = {}

    async def fake_run(self, user_input, chat_history=None):
        call_count["n"] += 1
        # First call is the manager deciding which workers to invoke -- return
        # a JSON array naming the one real worker so MultiAgentOrchestrator
        # actually dispatches to it (subsequent calls are worker runs).
        output = json.dumps([real_worker_name["name"]]) if call_count["n"] == 1 else "ok"
        return {
            "output": output, "raw_output": output, "guardrail_triggered": False,
            "pii_triggered": False, "input_pii_triggered": False,
            "output_pii_triggered": False, "hallucination_triggered": False, "latency_ms": 5,
        }

    from app.core.orchestrator import AgentOrchestrator
    monkeypatch.setattr(AgentOrchestrator, "run", fake_run)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        worker_res = await ac.post("/api/agents/", json={"name": "Worker Five", "system_prompt": "Worker."})
        worker_id = worker_res.json()["id"]
        real_worker_name["name"] = worker_res.json()["name"]

        create_res = await ac.post("/api/agents/", json={
            "name": "Manager Five", "system_prompt": "You manage.",
            "agent_type": "managerial", "worker_agent_ids": [worker_id],
        })
        manager_id = create_res.json()["id"]

        # Update the manager to reference itself and a duplicate of the real worker.
        update_res = await ac.put(f"/api/agents/{manager_id}", json={
            "name": "Manager Five", "system_prompt": "You manage.",
            "agent_type": "managerial", "worker_agent_ids": [manager_id, worker_id, worker_id],
        })
        assert update_res.status_code == 200

        run_res = await ac.post(f"/api/agents/{manager_id}/run", json={"input": "go"})

    assert run_res.status_code == 200
    body = run_res.json()
    # Only the one real, non-self, de-duplicated worker should have run.
    assert len(body["steps"]) == 1
    assert body["steps"][0]["agent"] == real_worker_name["name"]


@pytest.mark.asyncio
async def test_delete_agent_with_version_history_succeeds():
    """Every agent gets an AgentVersion row on creation (current_version=1),
    and AgentVersion.agent_id has no ON DELETE CASCADE -- deleting an agent
    used to hit an uncaught foreign key violation (500) instead of actually
    deleting it. delete_agent must clear its versions first."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_res = await ac.post("/api/agents/", json={"name": "Deletable Agent", "system_prompt": "Temp."})
        agent_id = create_res.json()["id"]

        delete_res = await ac.delete(f"/api/agents/{agent_id}")
        assert delete_res.status_code == 204

        get_res = await ac.get(f"/api/agents/{agent_id}")
        assert get_res.status_code == 404
