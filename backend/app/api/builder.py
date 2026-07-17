from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.azure_openai import AzureOpenAIClient
from app.core.email import send_email
from app.database import get_db, AsyncSessionLocal
from app.models.workflow import Workflow, WorkflowRun
from app.config import settings
import uuid
import time
import json
import secrets
from simpleeval import simple_eval

router = APIRouter()

# In-memory write-through cache (workflow_id -> dict)
_workflows: dict[str, dict] = {}


# ─── Pydantic models ──────────────────────────────────────────────────────────

class WorkflowNode(BaseModel):
    id: str
    role: str = "agent"
    label: str
    description: str = ""
    x: float = 0
    y: float = 0


class WorkflowEdge(BaseModel):
    source: str
    target: str


class AutoBuildRequest(BaseModel):
    description: str
    name: str = "My Workflow"


class SuggestIdeasRequest(BaseModel):
    partial_name: str


class SuggestInputRequest(BaseModel):
    nodes: list[dict]


class WorkflowSaveRequest(BaseModel):
    name: str
    nodes: list[dict]
    edges: list[dict]


class WorkflowRunLog(BaseModel):
    node_id: str
    node_label: str
    status: str  # "running" | "done" | "error"
    output: str
    duration_ms: int


class TriggerRequest(BaseModel):
    input: str = ""


# ─── Helper: topological sort ────────────────────────────────────────────────

def _topo_sort(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Return nodes in topological order (best-effort; falls back to original order)."""
    node_map = {n["id"]: n for n in nodes}
    adj: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}

    for e in edges:
        src, tgt = e.get("source", ""), e.get("target", "")
        if src in adj and tgt in in_degree:
            adj[src].append(tgt)
            in_degree[tgt] += 1

    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    result = []
    while queue:
        nid = queue.pop(0)
        result.append(node_map[nid])
        for neighbor in adj[nid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # If there's a cycle, append remaining nodes
    visited_ids = {n["id"] for n in result}
    for n in nodes:
        if n["id"] not in visited_ids:
            result.append(n)

    return result


def _reachable_from(start_id: str, edges: list[dict]) -> set[str]:
    """Return all node ids reachable from start_id by following edges forward (BFS)."""
    seen = {start_id}
    queue = [start_id]
    while queue:
        current = queue.pop(0)
        for e in edges:
            if e.get("source") == current:
                tgt = e.get("target")
                if tgt and tgt not in seen:
                    seen.add(tgt)
                    queue.append(tgt)
    return seen


def _wf_to_dict(wf: Workflow) -> dict:
    """Convert a Workflow ORM object to a plain dict."""
    return {
        "id": wf.id,
        "name": wf.name,
        "nodes": wf.nodes,
        "edges": wf.edges,
        "created_at": wf.created_at.isoformat() if wf.created_at else None,
        "updated_at": wf.updated_at.isoformat() if wf.updated_at else None,
    }


def _evaluate_condition(rule: str, variables: dict) -> bool:
    """Safely evaluate a boolean rule string against extracted variables. Never uses eval()."""
    try:
        return bool(simple_eval(rule, names=variables))
    except Exception:
        return False  # fail closed -- an unparseable rule or missing variable takes the false branch


async def _extract_variables(text: str, client: AzureOpenAIClient) -> dict:
    """Ask GPT-4o to extract a flat JSON object of named numeric/string variables from text."""
    messages = [
        {"role": "system", "content": (
            "Extract all named numeric and short string values mentioned in the text below as "
            'a flat JSON object (e.g. {"amount": 430, "department": "Sales"}). '
            "Return ONLY the JSON object, no explanation."
        )},
        {"role": "user", "content": text},
    ]
    raw = await client.chat(messages, temperature=0.0)
    try:
        return json.loads(raw)
    except Exception:
        return {}


ROLE_COLORS: dict[str, dict] = {
    "input":      {"bg": "#1e3a5f", "border": "#3b82f6", "text": "#93c5fd"},
    "classifier": {"bg": "#3b1f5e", "border": "#8b5cf6", "text": "#c4b5fd"},
    "router":     {"bg": "#1e3a5f", "border": "#06b6d4", "text": "#67e8f9"},
    "responder":  {"bg": "#14532d", "border": "#22c55e", "text": "#86efac"},
    "guard":      {"bg": "#7f1d1d", "border": "#ef4444", "text": "#fca5a5"},
    "rag":        {"bg": "#1c1917", "border": "#f59e0b", "text": "#fcd34d"},
    "output":     {"bg": "#14532d", "border": "#166534", "text": "#86efac"},
}

AUTO_BUILD_SYSTEM = """You are an AI workflow architect. Given a pipeline description, decompose it into a visual workflow of agents.

Return ONLY valid JSON with this exact structure:
{
  "name": "workflow name",
  "nodes": [
    {
      "id": "node_1",
      "role": "one of: input | classifier | router | responder | guard | rag | output",
      "label": "short display name",
      "description": "one sentence what this node does",
      "x": 80,
      "y": 200
    }
  ],
  "edges": [
    {"from": "node_1", "to": "node_2"}
  ]
}

Rules:
- Always start with an "input" role node and end with an "output" role node
- Use 3-6 nodes total
- Space nodes horizontally: x values 80, 280, 480, 680, 880. y=200 for main path, branch nodes at y=100 or y=300
- For branching (router splits), use different y values for branches
- Return ONLY JSON. No markdown, no explanation."""


# ─── Helpers ──────────────────────────────────────────────────────────────────

PAUSED = "waiting_approval"


async def _run_pipeline_from(
    ordered_nodes: list[dict],
    edges: list[dict],
    start_index: int,
    previous_output: str,
    run_id: str = "",
) -> dict:
    """Execute nodes starting at start_index in the given order. Returns a dict:
    {"status": "completed" | PAUSED, "logs": [...], "final_output": str,
     "paused_at_node_id": str | None}.
    Stops immediately (without executing later nodes) when it reaches an approval node.
    Follows only the matching labeled edge when it reaches a condition node.
    """
    client = AzureOpenAIClient()
    logs: list[WorkflowRunLog] = []
    node_by_id = {n["id"]: n for n in ordered_nodes}
    remaining = ordered_nodes[start_index:]

    i = 0
    while i < len(remaining):
        node = remaining[i]
        node_id = node.get("id", "unknown")
        node_label = node.get("data", {}).get("label") or node.get("label", node_id)
        node_role = node.get("data", {}).get("role") or node.get("role", "agent")
        node_description = node.get("data", {}).get("description") or node.get("description", "")

        if node.get("type") in ("input",):
            log = WorkflowRunLog(
                node_id=node_id, node_label=node_label, status="done",
                output=previous_output or "Pipeline started. Awaiting user input.", duration_ms=0,
            )
            logs.append(log)
            previous_output = log.output
            i += 1
            continue

        if node.get("type") in ("output",):
            log = WorkflowRunLog(
                node_id=node_id, node_label=node_label, status="done",
                output=f"Pipeline complete. Final output: {previous_output}", duration_ms=0,
            )
            logs.append(log)
            previous_output = log.output
            i += 1
            continue

        if node_role == "condition":
            rule = node.get("data", {}).get("rule") or node.get("rule", "")
            variables = await _extract_variables(previous_output, client)
            result = _evaluate_condition(rule, variables)
            branch_label = "true" if result else "false"
            log = WorkflowRunLog(
                node_id=node_id, node_label=node_label, status="done",
                output=f"Rule '{rule}' evaluated to {result} with variables {variables}. Taking '{branch_label}' branch.",
                duration_ms=0,
            )
            logs.append(log)
            next_edge = next(
                (e for e in edges if e.get("source") == node_id and e.get("label") == branch_label),
                None,
            )
            if next_edge is None:
                break  # no matching branch edge -- stop the run here
            next_node = node_by_id.get(next_edge.get("target"))
            if next_node is None:
                break
            # Exclude the ENTIRE untaken branch (every node reachable only through it),
            # not just the sibling edges' immediate targets.
            nodes_to_exclude: set[str] = set()
            for e in edges:
                if e.get("source") == node_id and e is not next_edge:
                    sibling_target = e.get("target")
                    if sibling_target:
                        nodes_to_exclude |= _reachable_from(sibling_target, edges)
            # Don't exclude nodes that the chosen branch also reaches (converging paths).
            chosen_reachable = _reachable_from(next_node["id"], edges)
            nodes_to_exclude_only_untaken = nodes_to_exclude - chosen_reachable - {node_id}
            cond_index = ordered_nodes.index(node)
            # Jump remaining execution to the chosen branch's node, skipping the untaken branch entirely
            remaining = [next_node] + [
                n for n in ordered_nodes
                if n["id"] not in ({node_id, next_node["id"]} | nodes_to_exclude_only_untaken)
                and ordered_nodes.index(n) > cond_index
            ]
            i = 0
            continue

        if node_role == "approval":
            approver_email = node.get("data", {}).get("approver_email") or node.get("approver_email", "")
            approval_token = secrets.token_urlsafe(32)
            link = f"{settings.frontend_base_url}/approvals/{run_id}"
            send_email(
                approver_email,
                f"Approval required: {node_label}",
                f"<p>A workflow run requires your approval.</p><p>Context: {previous_output}</p>"
                f'<p><a href="{link}">Review and respond</a></p>',
            )
            return {
                "status": PAUSED,
                "logs": logs,
                "final_output": previous_output,
                "paused_at_node_id": node_id,
                "approval_token": approval_token,
            }

        # Agent node -- call LLM
        try:
            messages = [
                {
                    "role": "system",
                    "content": (
                        f"You are a {node_role} agent. "
                        f"{node_description}. "
                        "Process the input and return a brief output (2-3 sentences)."
                    ),
                },
                {"role": "user", "content": previous_output or "Start the pipeline."},
            ]
            start = time.time()
            output = await client.chat(messages, temperature=0.3)
            duration_ms = int((time.time() - start) * 1000)
            log = WorkflowRunLog(node_id=node_id, node_label=node_label, status="done", output=output, duration_ms=duration_ms)
            previous_output = output
        except Exception as exc:
            log = WorkflowRunLog(node_id=node_id, node_label=node_label, status="error", output=f"Error: {str(exc)}", duration_ms=0)
        logs.append(log)
        i += 1

    return {"status": "completed", "logs": logs, "final_output": previous_output, "paused_at_node_id": None}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/auto-build")
async def auto_build_workflow(body: AutoBuildRequest):
    """Use GPT-4o to decompose a pipeline description into a React Flow node graph."""
    client = AzureOpenAIClient()
    messages = [
        {"role": "system", "content": AUTO_BUILD_SYSTEM},
        {"role": "user", "content": f"Pipeline: {body.description}"},
    ]
    raw = await client.chat(messages, temperature=0.4)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data = __import__("json").loads(raw)
    except Exception:
        raise HTTPException(status_code=500, detail=f"GPT-4o returned invalid JSON: {raw[:200]}")

    gpt_nodes = data.get("nodes", [])
    gpt_edges = data.get("edges", [])

    rf_nodes = []
    for n in gpt_nodes:
        role = n.get("role", "agent")
        colors = ROLE_COLORS.get(role, {"bg": "#1e1b4b", "border": "#7c3aed", "text": "#c4b5fd"})
        rf_nodes.append({
            "id": n["id"],
            "type": "roleNode",
            "position": {"x": n.get("x", 80), "y": n.get("y", 200)},
            "data": {
                "label": n.get("label", role),
                "role": role,
                "description": n.get("description", ""),
            },
            "style": {
                "background": colors["bg"],
                "border": f"1px solid {colors['border']}",
                "color": colors["text"],
            },
        })

    rf_edges = []
    for i, e in enumerate(gpt_edges):
        rf_edges.append({
            "id": f"e-{i}",
            "source": e.get("from", ""),
            "target": e.get("to", ""),
            "animated": True,
            "style": {"stroke": "#7c3aed", "strokeWidth": 2.5},
            "markerEnd": {"type": "arrowclosed", "color": "#7c3aed", "width": 20, "height": 20},
        })

    return {"nodes": rf_nodes, "edges": rf_edges, "name": data.get("name", body.name)}


@router.post("/suggest-ideas")
async def suggest_ideas(body: SuggestIdeasRequest):
    """Return 3-4 realistic agentic workflow ideas related to the partial name typed so far."""
    client = AzureOpenAIClient()
    messages = [
        {"role": "system", "content": (
            "You are helping a user brainstorm an AI agent workflow. Given a partial workflow "
            "name/topic, return 3-4 distinct, realistic agentic pipeline ideas as a JSON array. "
            'Each item: {"title": "<short title>", "description": "<1-2 sentence pipeline '
            'description suitable for an Auto-Build description field>"}. Return ONLY the JSON '
            "array, no markdown fences, no explanation."
        )},
        {"role": "user", "content": f"Partial workflow name/topic: {body.partial_name}"},
    ]
    raw = await client.chat(messages, temperature=0.6)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        ideas = json.loads(raw.strip())
    except Exception:
        return {"ideas": []}
    return {"ideas": ideas[:4]}


@router.post("/suggest-input")
async def suggest_input(body: SuggestInputRequest):
    """Given a workflow's nodes, generate one realistic example input to trigger it with."""
    client = AzureOpenAIClient()
    node_summary = "\n".join(
        f"- {(n.get('data') or {}).get('label', n.get('id'))} "
        f"({(n.get('data') or {}).get('role', 'agent')}): "
        f"{(n.get('data') or {}).get('description', '')}"
        for n in body.nodes
    )
    messages = [
        {"role": "system", "content": (
            "You are helping a user test an AI agent pipeline. Given the pipeline's nodes below, "
            "write ONE realistic, specific example input a real user might submit to trigger this "
            "exact pipeline. Return ONLY the example input text, no quotes, no explanation, no "
            "markdown."
        )},
        {"role": "user", "content": f"Pipeline nodes:\n{node_summary}"},
    ]
    raw = await client.chat(messages, temperature=0.5)
    return {"suggested_input": raw.strip()}


@router.post("/workflows")
async def save_workflow(body: WorkflowSaveRequest, db: AsyncSession = Depends(get_db)):
    """Save a workflow definition to PostgreSQL and return its UUID."""
    workflow_id = str(uuid.uuid4())

    wf = Workflow(
        id=workflow_id,
        name=body.name,
        nodes=body.nodes,
        edges=body.edges,
    )
    db.add(wf)
    await db.commit()
    await db.refresh(wf)

    # Write-through cache
    _workflows[workflow_id] = _wf_to_dict(wf)

    return {"workflow_id": workflow_id}


@router.get("/workflows")
async def list_workflows(db: AsyncSession = Depends(get_db)):
    """Return all saved workflows."""
    result = await db.execute(select(Workflow).order_by(Workflow.created_at.desc()))
    wfs = result.scalars().all()
    return [_wf_to_dict(w) for w in wfs]


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    """Return a previously saved workflow."""
    # Try cache first
    if workflow_id in _workflows:
        return _workflows[workflow_id]

    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    data = _wf_to_dict(wf)
    _workflows[workflow_id] = data
    return data


async def _persist_run(
    db: AsyncSession,
    workflow_id: str,
    trigger_input: str,
    logs: list[WorkflowRunLog],
    final_output: str,
    status: str = "completed",
) -> WorkflowRun:
    """Save a workflow execution trace to workflow_runs table."""
    total_ms = sum(log.duration_ms for log in logs)
    run = WorkflowRun(
        id=str(uuid.uuid4()),
        workflow_id=workflow_id,
        trigger_input=trigger_input,
        final_output=final_output,
        status=status,
        node_logs=[log.model_dump() for log in logs],
        total_duration_ms=float(total_ms),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


@router.post("/workflows/{workflow_id}/deploy")
async def deploy_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    """Execute pipeline; persist run trace and return logs."""
    wf = _workflows.get(workflow_id)
    if not wf:
        result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
        db_wf = result.scalar_one_or_none()
        if not db_wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        wf = _wf_to_dict(db_wf)
        _workflows[workflow_id] = wf

    ordered = _topo_sort(wf["nodes"], wf["edges"])
    result = await _run_pipeline_from(ordered, wf["edges"], 0, "")
    await _persist_run(db, workflow_id, "", result["logs"], result["final_output"])
    return {"logs": [log.model_dump() for log in result["logs"]]}


@router.post("/workflows/{workflow_id}/trigger")
async def trigger_workflow(workflow_id: str, body: TriggerRequest, db: AsyncSession = Depends(get_db)):
    """Trigger workflow with input; persist full execution trace."""
    wf = _workflows.get(workflow_id)
    if not wf:
        result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
        db_wf = result.scalar_one_or_none()
        if not db_wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        wf = _wf_to_dict(db_wf)
        _workflows[workflow_id] = wf

    ordered = _topo_sort(wf["nodes"], wf["edges"])
    run_id_placeholder = str(uuid.uuid4())
    result = await _run_pipeline_from(ordered, wf["edges"], 0, body.input, run_id=run_id_placeholder)

    if result["status"] == PAUSED:
        run = WorkflowRun(
            id=run_id_placeholder,
            workflow_id=workflow_id,
            trigger_input=body.input,
            final_output=result["final_output"],
            status=PAUSED,
            node_logs=[log.model_dump() for log in result["logs"]],
            total_duration_ms=float(sum(log.duration_ms for log in result["logs"])),
            paused_at_node_id=result["paused_at_node_id"],
            paused_context=json.dumps(result["final_output"]),
            approval_token=result["approval_token"],
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        return {
            "run_id": run.id,
            "logs": [log.model_dump() for log in result["logs"]],
            "final_output": result["final_output"],
            "status": PAUSED,
        }

    run = await _persist_run(db, workflow_id, body.input, result["logs"], result["final_output"])
    return {
        "run_id": run.id,
        "logs": [log.model_dump() for log in result["logs"]],
        "final_output": result["final_output"],
        "status": "completed",
    }


@router.get("/workflows/{workflow_id}/runs")
async def list_workflow_runs(workflow_id: str, db: AsyncSession = Depends(get_db)):
    """Return all stored execution traces for a workflow (newest first)."""
    result = await db.execute(
        select(WorkflowRun)
        .where(WorkflowRun.workflow_id == workflow_id)
        .order_by(WorkflowRun.triggered_at.desc())
    )
    runs = result.scalars().all()
    return [
        {
            "run_id": r.id,
            "workflow_id": r.workflow_id,
            "trigger_input": r.trigger_input,
            "final_output": r.final_output,
            "status": r.status,
            "node_logs": r.node_logs,
            "total_duration_ms": r.total_duration_ms,
            "triggered_at": r.triggered_at.isoformat() if r.triggered_at else None,
        }
        for r in runs
    ]


@router.get("/runs")
async def list_all_runs(db: AsyncSession = Depends(get_db)):
    """Return the 50 most recent execution traces across all workflows."""
    result = await db.execute(
        select(WorkflowRun).order_by(WorkflowRun.triggered_at.desc()).limit(50)
    )


    runs = result.scalars().all()
    return [
        {
            "run_id": r.id,
            "workflow_id": r.workflow_id,
            "trigger_input": r.trigger_input[:120] if r.trigger_input else "",
            "final_output": r.final_output[:120] if r.final_output else "",
            "status": r.status,
            "node_count": len(r.node_logs),
            "total_duration_ms": r.total_duration_ms,
            "triggered_at": r.triggered_at.isoformat() if r.triggered_at else None,
        }
        for r in runs
    ]


@router.get("/runs/{run_id}")
async def get_run_detail(run_id: str, db: AsyncSession = Depends(get_db)):
    """Return full execution trace for a single run including all node logs."""
    result = await db.execute(select(WorkflowRun).where(WorkflowRun.id == run_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "run_id": r.id,
        "workflow_id": r.workflow_id,
        "trigger_input": r.trigger_input,
        "final_output": r.final_output,
        "status": r.status,
        "node_logs": r.node_logs,
        "total_duration_ms": r.total_duration_ms,
        "triggered_at": r.triggered_at.isoformat() if r.triggered_at else None,
    }


@router.post("/workflows/{workflow_id}/trigger-stream")
async def trigger_workflow_stream(workflow_id: str, body: TriggerRequest, db: AsyncSession = Depends(get_db)):
    """Stream workflow execution events via SSE. Each node emits 'node_start' then 'node_done'."""
    wf = _workflows.get(workflow_id)
    if not wf:
        result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
        db_wf = result.scalar_one_or_none()
        if not db_wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        wf = _wf_to_dict(db_wf)
        _workflows[workflow_id] = wf

    nodes = wf["nodes"]
    edges = wf["edges"]
    trigger_input = body.input

    async def event_stream():
        ordered = _topo_sort(nodes, edges)
        client = AzureOpenAIClient()
        logs: list[WorkflowRunLog] = []
        previous_output: str = trigger_input

        # Emit pipeline_start with all node IDs in execution order
        yield f"data: {json.dumps({'event': 'pipeline_start', 'node_order': [n.get('id') for n in ordered]})}\n\n"

        for node in ordered:
            node_id = node.get("id", "unknown")
            node_label = node.get("data", {}).get("label") or node.get("label", node_id)
            node_role = node.get("data", {}).get("role") or node.get("role", "agent")
            node_description = node.get("data", {}).get("description") or node.get("description", "")

            # Emit edges from previous nodes to this one
            incoming_edges = [e for e in edges if e.get("target") == node_id]
            if incoming_edges:
                yield f"data: {json.dumps({'event': 'edge_activate', 'edges': [{'source': e.get('source'), 'target': e.get('target')} for e in incoming_edges]})}\n\n"

            # Emit node_start
            yield f"data: {json.dumps({'event': 'node_start', 'node_id': node_id, 'node_label': node_label})}\n\n"

            if node.get("type") in ("input",):
                log = WorkflowRunLog(node_id=node_id, node_label=node_label, status="done",
                                     output=previous_output or "Pipeline started.", duration_ms=0)
                logs.append(log)
                previous_output = log.output
                yield f"data: {json.dumps({'event': 'node_done', 'node_id': node_id, 'node_label': node_label, 'output': log.output, 'duration_ms': 0})}\n\n"
                continue

            if node.get("type") in ("output",):
                log = WorkflowRunLog(node_id=node_id, node_label=node_label, status="done",
                                     output=f"Pipeline complete. Final output: {previous_output}", duration_ms=0)
                logs.append(log)
                previous_output = log.output
                yield f"data: {json.dumps({'event': 'node_done', 'node_id': node_id, 'node_label': node_label, 'output': log.output, 'duration_ms': 0})}\n\n"
                continue

            try:
                messages = [
                    {"role": "system", "content": f"You are a {node_role} agent. {node_description}. Process the input and return a brief output (2-3 sentences)."},
                    {"role": "user", "content": previous_output or "Start the pipeline."},
                ]
                start = time.time()
                output = await client.chat(messages, temperature=0.3)
                duration_ms = int((time.time() - start) * 1000)
                log = WorkflowRunLog(node_id=node_id, node_label=node_label, status="done", output=output, duration_ms=duration_ms)
                previous_output = output
                yield f"data: {json.dumps({'event': 'node_done', 'node_id': node_id, 'node_label': node_label, 'output': output, 'duration_ms': duration_ms})}\n\n"
            except Exception as exc:
                log = WorkflowRunLog(node_id=node_id, node_label=node_label, status="error", output=f"Error: {str(exc)}", duration_ms=0)
                yield f"data: {json.dumps({'event': 'node_error', 'node_id': node_id, 'node_label': node_label, 'error': str(exc)})}\n\n"
            logs.append(log)

        # Persist run to DB
        try:
            async with AsyncSessionLocal() as session:
                await _persist_run(session, workflow_id, trigger_input, logs, previous_output)
        except Exception:
            pass

        yield f"data: {json.dumps({'event': 'pipeline_done', 'final_output': previous_output, 'total_nodes': len(logs)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/workflows/{workflow_id}/webhook-url")
async def get_webhook_url(workflow_id: str, db: AsyncSession = Depends(get_db)):
    """Return the webhook trigger URL and schema for a workflow."""
    # Confirm workflow exists
    if workflow_id not in _workflows:
        result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Workflow not found")

    return {
        "url": f"http://localhost:8000/api/builder/workflows/{workflow_id}/trigger",
        "method": "POST",
        "body_schema": {"input": "string"},
    }
