from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.core.security import decode_token
from app.core.guardrails import GLOBAL_SAFETY_RULES as _RULES

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
