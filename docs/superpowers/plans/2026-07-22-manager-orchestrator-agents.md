# Manager/Orchestrator Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create a Manager Agent in Agent Studio, pick a set of existing plain agents as its workers, and run it with a goal — the manager LLM dynamically decides which workers to invoke and in what order.

**Architecture:** Wire the existing, already-working `MultiAgentOrchestrator` (`backend/app/core/orchestrator.py`) into the existing `POST /api/agents/{id}/run` endpoint via a new `worker_agent_ids` column on `Agent`, and finish the existing (currently free-text, not a real picker) "Managerial Agent" section in `CreateAgent.tsx` so it saves real agent references and `AgentStudio.tsx` renders the extra per-worker steps on run.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (backend), React + TypeScript + axios (frontend), pytest + httpx.AsyncClient (tests).

---

## File Structure

- Modify: `backend/app/models/agent.py` — add `worker_agent_ids` column
- Create: `backend/migrations/versions/<hash>_add_worker_agent_ids.py` — migration
- Modify: `backend/app/schemas/agent.py` — add `worker_agent_ids` to `AgentCreate`/`AgentOut`, add `ManagerRunResponse`
- Modify: `backend/app/api/agents.py` — branch `run_agent` to a new `_run_managerial` helper; import `MultiAgentOrchestrator`
- Create: `backend/app/tests/test_agents_managerial.py` — new endpoint tests
- Modify: `frontend/src/pages/CreateAgent.tsx` — replace free-text worker-name modal with a real picker over existing agents; send `worker_agent_ids`/`agent_type` on submit
- Modify: `frontend/src/pages/AgentStudio.tsx` — render per-worker steps after a managerial run
- Modify: `frontend/src/api/client.ts` — no signature change needed (`agentsApi.run` already returns `res.data`; managerial responses are a superset)

---

### Task 1: Add `worker_agent_ids` column to `Agent` model

**Files:**
- Modify: `backend/app/models/agent.py`
- Create: `backend/migrations/versions/<new_hash>_add_worker_agent_ids.py`
- Test: `backend/app/tests/test_agents_managerial.py`

- [ ] **Step 1: Write the failing test**

Create `backend/app/tests/test_agents_managerial.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_agent_model_has_worker_agent_ids_column():
    from app.models.agent import Agent
    agent = Agent(name="Manager", system_prompt="You manage workers.")
    assert agent.worker_agent_ids == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv\Scripts\python.exe -m pytest app/tests/test_agents_managerial.py -v`
Expected: FAIL with `AttributeError: 'Agent' object has no attribute 'worker_agent_ids'`

- [ ] **Step 3: Add the column**

In `backend/app/models/agent.py`, add after the existing `agent_type` line (line 23):

```python
    worker_agent_ids: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv\Scripts\python.exe -m pytest app/tests/test_agents_managerial.py -v`
Expected: PASS

- [ ] **Step 5: Generate and apply the Alembic migration**

Run:
```bash
cd backend
venv\Scripts\python.exe -m alembic revision --autogenerate -m "add worker_agent_ids to agents"
```

Open the generated file under `backend/migrations/versions/` and confirm `upgrade()` contains:

```python
    op.add_column('agents', sa.Column('worker_agent_ids', sa.JSON(), nullable=False, server_default='[]'))
```

and `downgrade()` contains:

```python
    op.drop_column('agents', 'worker_agent_ids')
```

Then apply it:

```bash
venv\Scripts\python.exe -m alembic upgrade head
```

Expected: migration file created with `down_revision = '17d21b681f28'`, `alembic upgrade head` prints the new revision hash with no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/agent.py backend/migrations/versions/ backend/app/tests/test_agents_managerial.py
git commit -m "feat: add worker_agent_ids column to Agent model"
```

---

### Task 2: Add `worker_agent_ids` to schemas + new `ManagerRunResponse`

**Files:**
- Modify: `backend/app/schemas/agent.py`
- Test: `backend/app/tests/test_agents_managerial.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/app/tests/test_agents_managerial.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv\Scripts\python.exe -m pytest app/tests/test_agents_managerial.py -v`
Expected: FAIL — `AgentCreate` rejects `worker_agent_ids` as an unexpected field is NOT the failure (pydantic ignores unknown kwargs by default only if `model_config` allows it — here it will actually raise `ValidationError: worker_agent_ids extra fields not permitted` is NOT default behavior in pydantic v2, unknown fields are silently dropped unless `model_config = ConfigDict(extra="forbid")` — check by running the test: expect `AttributeError: 'AgentCreate' object has no attribute 'worker_agent_ids'` since the field was silently dropped) and `ImportError: cannot import name 'ManagerRunResponse'`

- [ ] **Step 3: Update the schema file**

In `backend/app/schemas/agent.py`, modify `AgentCreate` (add after `agent_type: str = "agent"`):

```python
    worker_agent_ids: list[str] = []
```

Modify `AgentOut` (add after `agent_type: str`):

```python
    worker_agent_ids: list[str]
```

Add a new class after `AgentRunResponse`:

```python
class ManagerRunResponse(BaseModel):
    output: str
    guardrail_triggered: bool
    pii_triggered: bool
    hallucination_triggered: bool
    latency_ms: int
    steps: list[dict]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv\Scripts\python.exe -m pytest app/tests/test_agents_managerial.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/agent.py backend/app/tests/test_agents_managerial.py
git commit -m "feat: add worker_agent_ids and ManagerRunResponse schemas"
```

---

### Task 3: Wire `MultiAgentOrchestrator` into `run_agent`

**Files:**
- Modify: `backend/app/api/agents.py`
- Test: `backend/app/tests/test_agents_managerial.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/app/tests/test_agents_managerial.py`:

```python
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
            # Manager call: return garbage that isn't valid JSON
            return {
                "output": "not valid json at all", "raw_output": "not valid json at all",
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && venv\Scripts\python.exe -m pytest app/tests/test_agents_managerial.py -v -k managerial_agent`
Expected: FAIL — `run_agent` currently has no branch for `agent_type == "managerial"`, so it tries `AgentOrchestrator(config).run(...)` on a manager with no `system_prompt` behavior difference; the `steps` key won't exist in the response and the deleted-worker/malformed-JSON cases won't behave as expected.

- [ ] **Step 3: Implement the managerial branch**

In `backend/app/api/agents.py`, update the import line (line 9):

```python
from app.core.orchestrator import AgentOrchestrator, MultiAgentOrchestrator
```

Add `ManagerRunResponse` to the schema import (line 8):

```python
from app.schemas.agent import AgentCreate, AgentOut, AgentRunRequest, AgentRunResponse, ManagerRunResponse, GenerateRequest
```

Replace the `run_agent` function (lines 166-199) with:

```python
def _agent_config(agent: Agent) -> dict:
    return {
        "name": agent.name,
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "tools": agent.tools,
        "guardrails": agent.guardrails,
    }


async def _run_managerial(agent: Agent, body: AgentRunRequest, db: AsyncSession) -> ManagerRunResponse:
    worker_agents = []
    for worker_id in agent.worker_agent_ids:
        worker = await db.get(Agent, worker_id)
        if worker is not None:
            worker_agents.append(worker)
        # Deleted/missing workers are silently skipped -- a manager should
        # degrade gracefully as its worker roster changes over time.

    if not worker_agents:
        raise HTTPException(status_code=400, detail="No workers configured for this manager agent")

    manager_config = _agent_config(agent)
    worker_configs = [_agent_config(w) for w in worker_agents]

    orch = MultiAgentOrchestrator(manager_config, worker_configs)
    result = await orch.run(body.input)

    step_results = [s["result"] for s in result["steps"]]
    pii_triggered = any(r.get("pii_triggered", False) for r in step_results)
    hallucination_triggered = any(r.get("hallucination_triggered", False) for r in step_results)
    latency_ms = sum(r.get("latency_ms", 0) for r in step_results)

    log = AuditLog(
        action="agent.run",
        resource_type="agent",
        resource_id=agent.id,
        input_snapshot={"input": body.input},
        output_snapshot={"output": result["final_output"], "worker_order": [s["agent"] for s in result["steps"]]},
        guardrail_triggered=result["guardrail_triggered"],
        latency_ms=latency_ms,
    )
    db.add(log)
    await db.commit()

    return ManagerRunResponse(
        output=result["final_output"],
        guardrail_triggered=result["guardrail_triggered"],
        pii_triggered=pii_triggered,
        hallucination_triggered=hallucination_triggered,
        latency_ms=latency_ms,
        steps=result["steps"],
    )


@router.post("/{agent_id}/run")
async def run_agent(agent_id: str, body: AgentRunRequest, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent.agent_type == "managerial":
        return await _run_managerial(agent, body, db)

    config = _agent_config(agent)
    orch = AgentOrchestrator(config)
    result = await orch.run(body.input, body.chat_history or None)
    log = AuditLog(
        action="agent.run",
        resource_type="agent",
        resource_id=agent_id,
        input_snapshot={"input": body.input},
        output_snapshot={"output": result["output"]},
        guardrail_triggered=result["guardrail_triggered"],
        latency_ms=result["latency_ms"],
    )
    db.add(log)
    await db.commit()
    return AgentRunResponse(
        output=result["output"],
        guardrail_triggered=result["guardrail_triggered"],
        pii_triggered=result["pii_triggered"],
        input_pii_triggered=result.get("input_pii_triggered", False),
        output_pii_triggered=result.get("output_pii_triggered", False),
        hallucination_triggered=result["hallucination_triggered"],
        latency_ms=result["latency_ms"],
    )
```

Note: the `response_model=AgentRunResponse` was removed from the `@router.post` decorator since this endpoint now returns two different shapes depending on `agent_type` — FastAPI will infer the response from whichever Pydantic model is returned.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && venv\Scripts\python.exe -m pytest app/tests/test_agents_managerial.py -v`
Expected: PASS (6 tests total)

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && venv\Scripts\python.exe -m pytest -v`
Expected: all tests pass (matches the 118-passed baseline from before this change, plus the 6 new ones)

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/agents.py backend/app/tests/test_agents_managerial.py
git commit -m "feat: wire MultiAgentOrchestrator into run_agent for managerial agents"
```

---

### Task 4: Replace free-text worker modal with a real agent picker in `CreateAgent.tsx`

**Files:**
- Modify: `frontend/src/pages/CreateAgent.tsx`

- [ ] **Step 1: Add state for the real agent list and change `managerialAgents` shape**

Find line 428:

```tsx
  const [managerialAgents, setManagerialAgents] = useState<{ id: string; name: string; type: "agent" | "a2a" }[]>([]);
  const [managerialModalOpen, setManagerialModalOpen] = useState(false);
  const [managerialModalType, setManagerialModalType] = useState<"agent" | "a2a">("agent");
  const [newAgentName, setNewAgentName] = useState("");
```

Replace with:

```tsx
  const [managerialAgents, setManagerialAgents] = useState<{ id: string; name: string }[]>([]);
  const [managerialModalOpen, setManagerialModalOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<{ id: string; name: string; agent_type?: string }[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
```

- [ ] **Step 2: Fetch existing agents when the modal opens**

Find the imports near the top of the file (there is already an `agentsApi` import used by `handleSubmit`/`agentsApi.create`). Add this `useEffect` right after the `managerialAgents`/`selectedWorkerId` state block from Step 1:

```tsx
  useEffect(() => {
    if (!managerialModalOpen) return;
    agentsApi.list().then((res) => {
      const plain = (res.data as { id: string; name: string; agent_type?: string }[]).filter(
        (a) => (a.agent_type ?? "agent") === "agent" && a.id !== editId
      );
      setAvailableAgents(plain);
    }).catch(() => setAvailableAgents([]));
  }, [managerialModalOpen, editId]);
```

- [ ] **Step 3: Replace the Managerial Agent section UI**

Find lines 804-877 (the full `<div className="border border-gray-200 rounded-xl p-4 relative">...` block for Managerial Agent) and replace the entire block with:

```tsx
            <div className="border border-gray-200 rounded-xl p-4 relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Managerial Agent</span>
                <button
                  onClick={() => { setManagerialModalOpen(true); setSelectedWorkerId(""); }}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                >+ Worker Agent</button>
              </div>
              <p className="text-xs text-gray-400 mb-3">Add existing agents as workers this manager can delegate to at runtime</p>
              {managerialAgents.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {managerialAgents.map((a) => (
                    <span key={a.id} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium bg-teal-50 border-teal-200 text-teal-700">
                      🤖 {a.name}
                      <button
                        onClick={() => setManagerialAgents((p) => p.filter((x) => x.id !== a.id))}
                        className="ml-0.5 opacity-60 hover:opacity-100"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}

              {managerialModalOpen && (
                <div className="absolute left-0 right-0 top-0 z-20 bg-white border border-gray-200 rounded-xl shadow-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-800">Add Worker Agent</p>
                    <button onClick={() => setManagerialModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                  </div>
                  <label className="block text-xs text-gray-500 mb-1">Choose an existing agent</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-teal-500 mb-3"
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                  >
                    <option value="">Select an agent…</option>
                    {availableAgents
                      .filter((a) => !managerialAgents.some((m) => m.id === a.id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                  </select>
                  {availableAgents.length === 0 && (
                    <p className="text-xs text-amber-600 mb-3">No other agents exist yet — create one first, then come back to add it as a worker.</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setManagerialModalOpen(false)}
                      className="flex-1 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                    >Cancel</button>
                    <button
                      disabled={!selectedWorkerId}
                      onClick={() => {
                        const picked = availableAgents.find((a) => a.id === selectedWorkerId);
                        if (!picked) return;
                        setManagerialAgents((p) => [...p, { id: picked.id, name: picked.name }]);
                        setManagerialModalOpen(false);
                      }}
                      className="flex-1 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 text-white rounded-lg text-xs font-medium"
                    >Add</button>
                  </div>
                </div>
              )}
            </div>
```

- [ ] **Step 4: Send `worker_agent_ids`/`agent_type` on submit**

Find `handleSubmit` (lines 610-653). Update the `payload` object (line 620) to add `agent_type` and `worker_agent_ids` when there are managerial workers:

```tsx
      const payload = {
        name: agentName,
        description: goal || instructions || role || agentName,
        model,
        system_prompt: systemPrompt || `You are ${agentName}, a helpful AI assistant.`,
        tools: [...selectedTools, ...selectedSkills],
        guardrails: {
          pii: responsibleAIConfig.enabledPolicies.includes("pii"),
          hallucination: responsibleAIConfig.enabledPolicies.includes("hallucination"),
        },
        temperature,
        top_p: topP,
        ...(managerialAgents.length > 0
          ? { agent_type: "managerial", worker_agent_ids: managerialAgents.map((a) => a.id) }
          : {}),
      };
```

- [ ] **Step 5: Verify with the dev server**

Start (or confirm running) the frontend dev server, then in a browser: create a plain agent named "Research Helper", then create a second agent, open its Managerial Agent section, click "+ Worker Agent", confirm "Research Helper" appears in the dropdown, select it, click Add, and click the top-level Save/Create button. Confirm no console errors and the new agent appears in Agent Studio under the "Managerial" filter tab with a count of 1.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CreateAgent.tsx
git commit -m "feat: replace free-text worker modal with real agent picker"
```

---

### Task 5: Render per-worker steps after a managerial run in `AgentStudio.tsx`

**Files:**
- Modify: `frontend/src/pages/AgentStudio.tsx`

- [ ] **Step 1: Add state for run steps**

Find line 353:

```tsx
  const [runResult, setRunResult] = useState<{ [id: string]: string }>({});
```

Add immediately after it:

```tsx
  const [runSteps, setRunSteps] = useState<{ [id: string]: { agent: string; result: { output: string } }[] }>({});
```

- [ ] **Step 2: Capture steps from the run response**

Find `runAgent` (lines 438-453):

```tsx
  const runAgent = async (id: string) => {
    const input = runInput[id];
    if (!input) return;
    setRunningId(id);
    try {
      const res = await agentsApi.run(id, input);
      const output = res.data.output;
      setRunResult((p) => ({ ...p, [id]: output }));
      // Record run in evolution history with self-healing
      recordRun(id, input, output);
    } catch {
      setRunResult((p) => ({ ...p, [id]: "Error running agent" }));
    } finally {
      setRunningId(null);
    }
  };
```

Replace with:

```tsx
  const runAgent = async (id: string) => {
    const input = runInput[id];
    if (!input) return;
    setRunningId(id);
    try {
      const res = await agentsApi.run(id, input);
      const output = res.data.output;
      setRunResult((p) => ({ ...p, [id]: output }));
      setRunSteps((p) => ({ ...p, [id]: res.data.steps ?? [] }));
      // Record run in evolution history with self-healing
      recordRun(id, input, output);
    } catch {
      setRunResult((p) => ({ ...p, [id]: "Error running agent" }));
      setRunSteps((p) => ({ ...p, [id]: [] }));
    } finally {
      setRunningId(null);
    }
  };
```

- [ ] **Step 3: Render the steps list**

Find lines 700-705:

```tsx
                {runResult[agent.id] && (
                  <AgentResponse
                    text={runResult[agent.id]}
                    onClear={() => setRunResult((p) => { const n = {...p}; delete n[agent.id]; return n; })}
                  />
                )}
```

Replace with:

```tsx
                {runResult[agent.id] && (
                  <AgentResponse
                    text={runResult[agent.id]}
                    onClear={() => setRunResult((p) => { const n = {...p}; delete n[agent.id]; return n; })}
                  />
                )}

                {(agent.agent_type ?? "agent") === "managerial" && (runSteps[agent.id]?.length ?? 0) > 0 && (
                  <details className="mt-2 text-xs text-gray-500">
                    <summary className="cursor-pointer hover:text-gray-700">
                      {runSteps[agent.id].length} worker{runSteps[agent.id].length === 1 ? "" : "s"} invoked
                    </summary>
                    <ul className="mt-1.5 space-y-1 pl-3 border-l border-gray-200">
                      {runSteps[agent.id].map((s, i) => (
                        <li key={i}>
                          <span className="font-medium text-gray-700">{s.agent}</span>: {s.result.output}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
```

- [ ] **Step 4: Verify with the dev server**

In the browser: run the managerial agent created in Task 4 (with input like "research something and summarize it"). Confirm the response renders, and a "N worker(s) invoked" expandable line appears below it listing the worker agent name and its output. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AgentStudio.tsx
git commit -m "feat: render per-worker steps after a managerial agent run"
```

---

### Task 6: Full regression check and branch wrap-up

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && venv\Scripts\python.exe -m pytest -v`
Expected: all tests pass, including the 6 new managerial tests

- [ ] **Step 2: Run the frontend type check**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 3: Live smoke test in the browser**

Using the running dev server: create two plain agents, create a managerial agent referencing both as workers, run it with a multi-part goal, confirm the manager picks a sensible subset/order and the steps list matches. Check the "Managerial" filter tab count in Agent Studio reflects the new agent.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feature/AgentForge1.1
```
