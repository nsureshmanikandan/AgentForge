from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.agent import Agent, AgentVersion
from app.models.audit import AuditLog
from app.schemas.agent import AgentCreate, AgentOut, AgentRunRequest, AgentRunResponse, GenerateRequest
from app.core.orchestrator import AgentOrchestrator
from app.core.prompt_to_agent import generate_agent_config

router = APIRouter()


@router.post("/generate")
async def generate_agent(body: GenerateRequest):
    return await generate_agent_config(body.description)


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


@router.post("/{agent_id}/run", response_model=AgentRunResponse)
async def run_agent(agent_id: str, body: AgentRunRequest, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    config = {
        "name": agent.name,
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "tools": agent.tools,
        "guardrails": agent.guardrails,
    }
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
