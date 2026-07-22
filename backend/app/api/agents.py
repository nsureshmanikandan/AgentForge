from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.agent import Agent, AgentVersion
from app.models.audit import AuditLog
from app.schemas.agent import AgentCreate, AgentOut, AgentRunRequest, AgentRunResponse, ManagerRunResponse, GenerateRequest
from app.core.orchestrator import AgentOrchestrator, MultiAgentOrchestrator
from app.core.prompt_to_agent import generate_agent_config
from app.core.azure_openai import AzureOpenAIClient
import json

router = APIRouter()


@router.get("/active-model")
async def get_active_model(model: str | None = None):
    """Returns the model an agent actually runs on right now, resolved the
    same way AgentOrchestrator resolves it for a real run: the agent's
    `model` field is a per-agent choice of "local" or "azure" (not a UI
    label), so pass it through here to reflect that exact agent's provider
    instead of only the global BUILDER_LLM_PROVIDER default."""
    provider_override = "lmstudio" if (model or "local") == "local" else "azure"
    client = AzureOpenAIClient(provider=provider_override)
    return {"provider": client.provider, "model": client.deployment}


@router.post("/generate")
async def generate_agent(body: GenerateRequest):
    return await generate_agent_config(body.description)


class SuggestRequest(BaseModel):
    problem: str


@router.post("/suggest")
async def suggest_agents(body: SuggestRequest):
    """Given a problem description, return 3 AI-powered agent suggestions."""
    system = """You are an expert AI agent architect. Given a user's problem or goal, suggest exactly 3 distinct AI agent ideas that would solve it.

Return ONLY a valid JSON array with exactly 3 objects. Each object must have:
{
  "title": "short agent name",
  "type": "one of: Customer Support | Research | Automation | Data Analysis | Content | HR | Finance | Engineering | Sales | Operations",
  "description": "2-sentence description of what this agent does",
  "prompt": "the ready-to-use prompt to build this agent (1-2 sentences, imperative)",
  "tools": ["list of 2-4 tool names from: RAG, Knowledge Base, Email, Slack, GitHub, Web Search, Calendar, CRM, Webhook, PDF Parser"],
  "complexity": "Starter | Intermediate | Advanced",
  "why": "one sentence explaining why this agent fits the problem"
}
Return ONLY the JSON array. No explanation. No markdown."""

    client = AzureOpenAIClient()
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"My problem/goal: {body.problem}"},
    ]
    raw = await client.chat(messages, temperature=0.5)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
        if raw.endswith("```"):
            raw = raw[:-3].strip()
    try:
        suggestions = json.loads(raw)
        if not isinstance(suggestions, list):
            suggestions = [suggestions]
        return {"suggestions": suggestions[:3]}
    except Exception:
        return {"suggestions": [], "error": "Could not parse suggestions"}


@router.post("/{agent_id}/suggest-input")
async def suggest_agent_input(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Given an agent's own config, generate one realistic example message a
    real user might send it -- lets Playground offer a "✨ Suggest" button
    instead of leaving the user to guess what to type for an unfamiliar agent."""
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    client = AzureOpenAIClient()
    tools_text = ", ".join(agent.tools or []) or "none"
    messages = [
        {"role": "system", "content": (
            "You are helping a user test an AI agent. Given the agent's own system "
            "prompt, description, and available tools below, write ONE realistic, "
            "specific example message a real end user might send this exact agent. "
            "Return ONLY the example message text, no quotes, no explanation, no markdown."
        )},
        {"role": "user", "content": (
            f"Agent name: {agent.name}\n"
            f"Description: {agent.description}\n"
            f"System prompt: {agent.system_prompt or '(none)'}\n"
            f"Tools available: {tools_text}"
        )},
    ]
    raw = await client.chat(messages, temperature=0.5)
    return {"suggested_input": raw.strip()}


@router.post("/", response_model=AgentOut, status_code=201)
async def create_agent(body: AgentCreate, db: AsyncSession = Depends(get_db)):
    # Ensure unique name by appending a suffix if name already exists
    base_name = body.name
    candidate = base_name
    counter = 2
    while True:
        existing = await db.execute(select(Agent).where(Agent.name == candidate))
        if not existing.scalars().first():
            break
        candidate = f"{base_name}_v{counter}"
        counter += 1
    body_data = body.model_dump()
    body_data["name"] = candidate
    agent = Agent(**body_data, created_by="system")
    db.add(agent)
    await db.flush()
    version = AgentVersion(agent_id=agent.id, version=1, snapshot=body_data)
    db.add(version)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/", response_model=list[AgentOut])
async def list_agents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent))
    return result.scalars().all()


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentOut)
async def update_agent(agent_id: str, body: AgentCreate, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in body.model_dump().items():
        setattr(agent, field, value)
    agent.current_version += 1
    version = AgentVersion(agent_id=agent.id, version=agent.current_version, snapshot=body.model_dump())
    db.add(version)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.delete(agent)
    await db.commit()


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
