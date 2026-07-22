# Manager/Orchestrator Agents — Design

## Context

A live end-to-end test of AgentForge against Lyzr AI (2026-07-22) identified four competitive gaps. This spec covers the first and largest: **Manager Agents** — Lyzr's pattern of an agent that dynamically decomposes a goal and delegates to worker agents at runtime, rather than following a fixed pre-drawn flow.

AgentForge already has two pieces of this half-built, previously disconnected from each other:

- `backend/app/core/orchestrator.py` — `MultiAgentOrchestrator`: given a `manager_config` and a list of `worker_configs`, prompts the manager LLM to return a JSON array choosing which named workers to invoke and in what order, then runs them sequentially, piping each worker's output into the next as input. Already has OTel tracing (`multi_agent.run`, `agent.worker` spans) and guardrail aggregation. **Confirmed present on `main`, not something this branch invented — and never wired into any API endpoint.**
- `frontend/src/pages/CreateAgent.tsx` (lines ~427-430, 806-870) — a "Managerial Agent" section with local component state (`managerialAgents: {id, name, type: "agent"|"a2a"}[]`) and a modal for picking worker agents. **UI-only** — never persisted, never read by any backend endpoint.
- `frontend/src/pages/AgentStudio.tsx` (line ~546-565) — a "Managerial" filter tab, already counting agents by `agent_type === "managerial"`. Currently always 0 because nothing ever sets that value.

This is a wiring task: connect the existing orchestrator to the existing UI stub via a new persisted field and a new run path, not a from-scratch feature.

## Goal

A user can create a Manager Agent in Agent Studio, pick a set of existing plain agents as its workers, and run it with a goal. The manager LLM decides which of its configured workers to invoke and in what order; results flow from Agent Studio exactly like a normal agent run.

## Non-goals (v1)

- **Workflow workers**: a worker cannot itself be a full Visual Builder workflow (which might pause for approval mid-run). Verified live that the Human-in-the-Loop approval gate (`condition`/`approval`/`http_request` node types in `builder.py`, `_run_pipeline_from`) is fully implemented and tested (20/20 tests passing across `test_builder_approval_endpoints.py`, `test_builder_sse_condition_approval.py`, `test_builder_condition.py`, `test_builder_pause_resume.py`), but composing a manager's dynamic dispatch with that pause/resume state machine is a separate, larger effort. v1 workers are plain Agent Studio agents only (`agent_type == "agent"`).
- **Parallel worker execution**: today's orchestrator runs workers sequentially, piping one's output into the next. Keeping that behavior — no fan-out/fan-in in v1.
- **A2A protocol workers**: `CreateAgent.tsx`'s existing UI stub has a `type: "a2a"` option on worker entries; v1 drops this option (not wired to anything today).
- **Visual Builder canvas node**: no new node type is added to the workflow canvas in this spec. A manager agent is created and run from Agent Studio only, like any other agent. A canvas node that invokes a saved Manager Agent from within a drawn workflow is a natural v2 follow-up, not part of this spec.

## Design

### 1. Data model

Add one field to `Agent` (`backend/app/models/agent.py`):

```python
worker_agent_ids: Mapped[list] = mapped_column(JSON, default=list)
```

New Alembic migration (`backend/migrations/versions/`) adding this column, JSON, default `[]`, nullable=False with server_default `'[]'`.

`agent_type` already exists and already accepts arbitrary strings (`default="agent"`) — no migration needed for that field. This spec is the first place that ever sets it to `"managerial"`.

### 2. Schemas (`backend/app/schemas/agent.py`)

- `AgentCreate`: add `worker_agent_ids: list[str] = []`.
- `AgentOut`: add `worker_agent_ids: list[str]`.
- New response shape for managerial runs, since `MultiAgentOrchestrator.run()` returns `{final_output, steps, guardrail_triggered}` (no per-step `pii_triggered`/`hallucination_triggered`/`latency_ms` rollup today):

```python
class ManagerRunResponse(BaseModel):
    output: str
    guardrail_triggered: bool
    pii_triggered: bool
    hallucination_triggered: bool
    latency_ms: int
    steps: list[dict]  # [{agent: str, result: {...single-agent AgentRunResponse-shaped dict...}}]
```

### 3. Execution wiring (`backend/app/api/agents.py`)

Extend the existing `run_agent` endpoint (`POST /{agent_id}/run`) rather than adding a new route, so Agent Studio's existing "Run" UI needs no new API call:

```python
@router.post("/{agent_id}/run")
async def run_agent(agent_id: str, body: AgentRunRequest, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent.agent_type == "managerial":
        return await _run_managerial(agent, body, db)

    # ...existing single-agent path unchanged...
```

New helper `_run_managerial`:

1. Fetch worker `Agent` rows via `agent.worker_agent_ids` (skip any id that no longer exists — an agent may have been deleted since the manager was configured; log via existing `AuditLog` pattern, don't error the whole run).
2. Build `manager_config` from the managerial agent's own fields (same shape as the existing single-agent `config` dict at `agents.py:171-177`) and `worker_configs` as a list of that same shape, one per fetched worker.
3. Call `MultiAgentOrchestrator(manager_config, worker_configs).run(body.input)`.
4. Aggregate `pii_triggered`/`hallucination_triggered`/`latency_ms` across `steps[*].result` via `any()`/`sum()` (each step's `result` already has these fields, since workers run through the same `AgentOrchestrator.run()` as any plain agent — see `orchestrator.py:100`).
5. Write one `AuditLog` row (`action="agent.run"`, same as today) capturing the aggregate, plus the worker order chosen, in `output_snapshot`.
6. Return `ManagerRunResponse`.

If the manager LLM's worker-selection JSON fails to parse, `MultiAgentOrchestrator` already falls back to invoking just the first configured worker (`orchestrator.py:91-92`) — no new fallback logic needed, just a test confirming it.

### 4. Frontend — Agent Studio (`frontend/src/pages/AgentStudio.tsx`, `CreateAgent.tsx`)

- `CreateAgent.tsx`: wire the existing "Managerial Agent" modal's `managerialAgents` state to actually save — on submit, filter to `type === "agent"` entries only, map to `worker_agent_ids: string[]`, include in the `POST /api/agents/` body alongside `agent_type: "managerial"`. Remove the `"a2a"` option from the picker (or disable it with a "coming soon" label — implementer's call, not load-bearing).
- `AgentStudio.tsx`: no change needed to the filter-tab counting logic (`agent_type === "managerial"` already works once real data exists) or the inline run box (`POST /{id}/run` already works unchanged — response shape is a superset of what plain-agent runs return, so existing rendering of `output`/`guardrail_triggered` keeps working; add a small collapsible "steps" list showing which workers ran, using the new `steps` field, only rendered when `agent_type === "managerial"`).

### 5. Testing

- `backend/app/tests/test_agents_managerial.py` (new): manager with 2 workers picks a subset via a mocked LLM response; manager with malformed LLM JSON falls back to first worker; a worker id that no longer exists is skipped without erroring the run; `AuditLog` row is written with the aggregate.
- Existing approval/condition/pause tests are untouched — confirms this feature doesn't regress the workflow engine (already re-ran 20/20 passing as part of this design's research).

## Error handling

- Deleted worker agent referenced in `worker_agent_ids`: skip, don't 500 (a manager should degrade gracefully as its worker roster changes).
- Manager LLM returns unparseable JSON: existing fallback to first worker (no new code, just a test).
- Manager has zero valid workers after filtering: return a clear 400 ("no workers configured") rather than calling the orchestrator with an empty list.

## Spec self-review

- **Placeholders:** none — every field, endpoint, and file path is concrete.
- **Consistency:** the new `ManagerRunResponse` intentionally diverges from `AgentRunResponse` (adds `steps`) rather than trying to force-fit the single-agent shape; frontend handles this via a conditional render, not a schema hack.
- **Scope:** single cohesive unit — one model field, one migration, one endpoint branch, one UI wiring pass. Right-sized for one implementation plan.
- **Ambiguity resolved:** "zero valid workers" case was not explicit in the brainstorm; resolved here as a 400 rather than a silent no-op.
