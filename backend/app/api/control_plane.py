from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from app.database import get_db
from app.models.audit import AuditLog
from app.models.agent import Agent, AgentVersion
from app.models.workflow import WorkflowRun
from app.models.voice import VoiceCallLog

router = APIRouter()


@router.get("/audit-logs")
async def get_audit_logs(limit: int = 100, db: AsyncSession = Depends(get_db)):
    # Combine AuditLog rows with WorkflowRun rows into a unified audit feed
    audit_result = await db.execute(
        select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit)
    )
    audit_logs = audit_result.scalars().all()

    run_result = await db.execute(
        select(WorkflowRun).order_by(desc(WorkflowRun.triggered_at)).limit(limit)
    )
    runs = run_result.scalars().all()

    combined = []

    for log in audit_logs:
        combined.append({
            "id": log.id,
            "agent_id": log.resource_id,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "guardrail_triggered": log.guardrail_triggered,
            "latency_ms": log.latency_ms,
            "created_at": log.created_at.isoformat(),
            "input_snapshot": log.input_snapshot or {},
            "output_snapshot": log.output_snapshot or {},
        })

    for run in runs:
        combined.append({
            "id": run.id,
            "agent_id": run.workflow_id,
            "action": "workflow_run",
            "resource_type": "workflow",
            "resource_id": run.workflow_id,
            "guardrail_triggered": False,
            "latency_ms": int(run.total_duration_ms or 0),
            "created_at": run.triggered_at.isoformat() if run.triggered_at else "",
            "input_snapshot": {"input": run.trigger_input or ""},
            "output_snapshot": {"output": run.final_output or ""},
        })

    # Sort combined list by created_at descending
    combined.sort(key=lambda x: x["created_at"], reverse=True)
    return combined[:limit]


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

    # Count runs from WorkflowRun (actual executions) + AuditLog (simulation runs)
    workflow_run_count = await db.scalar(select(func.count(WorkflowRun.id))) or 0
    audit_run_count = await db.scalar(select(func.count(AuditLog.id))) or 0
    total_runs = workflow_run_count + audit_run_count

    guardrail_count = (
        await db.scalar(
            select(func.count(AuditLog.id)).where(AuditLog.guardrail_triggered.is_(True))
        )
        or 0
    )

    # Avg latency from WorkflowRun.total_duration_ms (most reliable source)
    avg_latency_wf = await db.scalar(select(func.avg(WorkflowRun.total_duration_ms))) or 0.0
    avg_latency_audit = await db.scalar(select(func.avg(AuditLog.latency_ms))) or 0.0
    # Weighted average: prefer workflow runs if they exist
    if workflow_run_count > 0 and audit_run_count > 0:
        avg_latency = (avg_latency_wf * workflow_run_count + avg_latency_audit * audit_run_count) / total_runs
    elif workflow_run_count > 0:
        avg_latency = avg_latency_wf
    else:
        avg_latency = avg_latency_audit

    return {
        "total_agents": agent_count,
        "total_runs": total_runs,
        "guardrail_triggers": guardrail_count,
        "avg_latency_ms": round(float(avg_latency), 1),
    }
