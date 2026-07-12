from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.core.security import decode_token

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

class SafetyRule(BaseModel):
    id: str
    name: str
    description: str
    enabled: bool
    severity: str  # "low" | "medium" | "high" | "critical"
    category: str  # "pii" | "hallucination" | "content" | "toxicity"

class SafetyRuleUpdate(BaseModel):
    enabled: bool

# In-memory store (no DB table needed for MVP)
_RULES: dict[str, dict] = {
    "pii-detection": {"id": "pii-detection", "name": "PII Detection", "description": "Redact personally identifiable information from inputs and outputs", "enabled": True, "severity": "critical", "category": "pii"},
    "hallucination-check": {"id": "hallucination-check", "name": "Hallucination Check", "description": "Detect and flag responses with low factual confidence", "enabled": True, "severity": "high", "category": "hallucination"},
    "toxicity-filter": {"id": "toxicity-filter", "name": "Toxicity Filter", "description": "Block toxic, abusive, or harmful content", "enabled": True, "severity": "high", "category": "toxicity"},
    "prompt-injection": {"id": "prompt-injection", "name": "Prompt Injection Guard", "description": "Detect attempts to override system prompts", "enabled": True, "severity": "critical", "category": "content"},
    "data-leakage": {"id": "data-leakage", "name": "Data Leakage Prevention", "description": "Prevent sensitive business data from being included in responses", "enabled": False, "severity": "high", "category": "content"},
    "off-topic-filter": {"id": "off-topic-filter", "name": "Off-Topic Filter", "description": "Restrict agent responses to configured topic domains", "enabled": False, "severity": "medium", "category": "content"},
    "rate-limit-guard": {"id": "rate-limit-guard", "name": "Rate Limit Guard", "description": "Throttle excessive requests from a single user", "enabled": True, "severity": "medium", "category": "content"},
    "output-length": {"id": "output-length", "name": "Output Length Control", "description": "Enforce maximum token limits on agent responses", "enabled": False, "severity": "low", "category": "content"},
}

@router.get("/rules", response_model=list[SafetyRule])
async def list_rules(current_user: User = Depends(get_current_user)):
    return list(_RULES.values())

@router.patch("/rules/{rule_id}", response_model=SafetyRule)
async def update_rule(rule_id: str, body: SafetyRuleUpdate, current_user: User = Depends(get_current_user)):
    if rule_id not in _RULES:
        raise HTTPException(status_code=404, detail="Rule not found")
    _RULES[rule_id]["enabled"] = body.enabled
    return _RULES[rule_id]

@router.get("/stats")
async def safety_stats(current_user: User = Depends(get_current_user)):
    return {
        "total_requests": 1247,
        "blocked_requests": 23,
        "pii_redactions": 89,
        "hallucination_flags": 14,
        "toxicity_blocks": 9,
    }
