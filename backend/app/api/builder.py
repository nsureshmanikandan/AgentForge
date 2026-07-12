from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.azure_openai import AzureOpenAIClient
from app.database import get_db
from app.models.workflow import Workflow
import uuid
import time

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

async def _run_pipeline(nodes: list[dict], edges: list[dict], initial_input: str = "") -> tuple[list[WorkflowRunLog], str]:
    """Execute nodes in topological order with GPT-4o. Returns (logs, final_output)."""
    ordered = _topo_sort(nodes, edges)
    client = AzureOpenAIClient(model="gpt-4o")
    logs: list[WorkflowRunLog] = []
    previous_output: str = initial_input

    for node in ordered:
        node_id = node.get("id", "unknown")
        node_label = node.get("data", {}).get("label") or node.get("label", node_id)
        node_role = node.get("data", {}).get("role") or node.get("role", "agent")
        node_description = node.get("data", {}).get("description") or node.get("description", "")

        # Pass-through nodes — no LLM call needed
        if node.get("type") in ("input",):
            log = WorkflowRunLog(
                node_id=node_id,
                node_label=node_label,
                status="done",
                output=previous_output or "Pipeline started. Awaiting user input.",
                duration_ms=0,
            )
            logs.append(log)
            previous_output = log.output
            continue

        if node.get("type") in ("output",):
            log = WorkflowRunLog(
                node_id=node_id,
                node_label=node_label,
                status="done",
                output=f"Pipeline complete. Final output: {previous_output}",
                duration_ms=0,
            )
            logs.append(log)
            previous_output = log.output
            continue

        # Agent node — call LLM
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
                {
                    "role": "user",
                    "content": previous_output or "Start the pipeline.",
                },
            ]
            start = time.time()
            output = await client.chat(messages, temperature=0.3)
            duration_ms = int((time.time() - start) * 1000)

            log = WorkflowRunLog(
                node_id=node_id,
                node_label=node_label,
                status="done",
                output=output,
                duration_ms=duration_ms,
            )
            previous_output = output
        except Exception as exc:
            log = WorkflowRunLog(
                node_id=node_id,
                node_label=node_label,
                status="error",
                output=f"Error: {str(exc)}",
                duration_ms=0,
            )
        logs.append(log)

    return logs, previous_output


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/auto-build")
async def auto_build_workflow(body: AutoBuildRequest):
    """Use GPT-4o to decompose a pipeline description into a React Flow node graph."""
    client = AzureOpenAIClient(model="gpt-4o")
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


@router.post("/workflows/{workflow_id}/deploy")
async def deploy_workflow(workflow_id: str, db: AsyncSession = Depends(get_db)):
    """
    Simulate pipeline execution.
    Iterates nodes in topological order; calls GPT-4o for each non-input/output node.
    Returns a list of WorkflowRunLog entries.
    """
    # Try cache, then DB
    wf = _workflows.get(workflow_id)
    if not wf:
        result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
        db_wf = result.scalar_one_or_none()
        if not db_wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        wf = _wf_to_dict(db_wf)
        _workflows[workflow_id] = wf

    logs, _ = await _run_pipeline(wf["nodes"], wf["edges"])
    return {"logs": [log.model_dump() for log in logs]}


@router.post("/workflows/{workflow_id}/trigger")
async def trigger_workflow(workflow_id: str, body: TriggerRequest, db: AsyncSession = Depends(get_db)):
    """
    Trigger a workflow with a user-provided input.
    Runs the same pipeline execution as /deploy but uses body.input as the starting value.
    Returns logs and the final output of the last node.
    """
    # Try cache, then DB
    wf = _workflows.get(workflow_id)
    if not wf:
        result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
        db_wf = result.scalar_one_or_none()
        if not db_wf:
            raise HTTPException(status_code=404, detail="Workflow not found")
        wf = _wf_to_dict(db_wf)
        _workflows[workflow_id] = wf

    logs, final_output = await _run_pipeline(wf["nodes"], wf["edges"], initial_input=body.input)
    return {
        "logs": [log.model_dump() for log in logs],
        "final_output": final_output,
    }


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
