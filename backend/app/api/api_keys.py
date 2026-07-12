import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User
from app.core.security import decode_token
from fastapi.security import OAuth2PasswordBearer

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


class ApiKeyCreate(BaseModel):
    name: str


class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: str
    last_used_at: str | None

    class Config:
        from_attributes = True


@router.get("/api-keys/", response_model=list[ApiKeyOut])
async def list_api_keys(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ApiKey).where(ApiKey.user_id == current_user.id))
    keys = result.scalars().all()
    return [
        {
            "id": k.id,
            "name": k.name,
            "key_prefix": k.key_prefix,
            "created_at": k.created_at.isoformat(),
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
        }
        for k in keys
    ]


@router.post("/api-keys/", status_code=201)
async def create_api_key(body: ApiKeyCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    raw_token = secrets.token_hex(32)
    key_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    key_prefix = raw_token[:8]
    api_key = ApiKey(
        user_id=current_user.id,
        name=body.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    return {
        "id": api_key.id,
        "name": api_key.name,
        "key_prefix": key_prefix,
        "created_at": api_key.created_at.isoformat(),
        "last_used_at": None,
        "token": raw_token,
    }


@router.delete("/api-keys/{key_id}", status_code=204)
async def delete_api_key(key_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    key = await db.scalar(select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id))
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    await db.delete(key)
    await db.commit()
