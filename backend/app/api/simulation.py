from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.database import get_db
from app.models.agent import Agent
from app.core.simulation import SimulationRunner

router = APIRouter()


class TestCase(BaseModel):
    input: str
    expected_contains: str = ""


class SimulationRequest(BaseModel):
    test_cases: list[TestCase]


@router.post("/{agent_id}/run")
async def run_simulation(
    agent_id: str, body: SimulationRequest, db: AsyncSession = Depends(get_db)
):
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
    runner = SimulationRunner(config, [tc.model_dump() for tc in body.test_cases])
    return await runner.run()
