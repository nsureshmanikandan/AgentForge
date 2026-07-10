from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from app.database import get_db
from app.models.audit import AuditLog
from app.models.agent import Agent, AgentVersion

router = APIRouter()


@router.get("/audit-logs")
async def get_audit_logs(limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "guardrail_triggered": log.guardrail_triggered,
            "latency_ms": log.latency_ms,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/agents/{agent_id}/versions")
async def get_agent_versions(agent_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentVersion)
        .where(AgentVersion.agent_id == agent_id)
        .order_by(desc(AgentVersion.version))
    )
    versions = result.scalars().all()
    return [
        {
            "version": v.version,
            "snapshot": v.snapshot,
            "created_at": v.created_at.isoformat(),
        }
        for v in versions
    ]


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    agent_count = await db.scalar(select(func.count(Agent.id))) or 0
    log_count = await db.scalar(select(func.count(AuditLog.id))) or 0
    guardrail_count = (
        await db.scalar(
            select(func.count(AuditLog.id)).where(AuditLog.guardrail_triggered.is_(True))
        )
        or 0
    )
    avg_latency = await db.scalar(select(func.avg(AuditLog.latency_ms))) or 0.0
    return {
        "total_agents": agent_count,
        "total_runs": log_count,
        "guardrail_triggers": guardrail_count,
        "avg_latency_ms": round(float(avg_latency), 1),
    }
