from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.user import User, Role
from app.core.security import decode_token, hash_password
from fastapi.security import OAuth2PasswordBearer

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

TEMP_PASSWORD = "TempPass123!"


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


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


class InviteRequest(BaseModel):
    email: str
    role: str


class UpdateRoleRequest(BaseModel):
    role: str


@router.get("/team/")
async def list_team(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.value,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.post("/team/invite", status_code=201)
async def invite_member(body: InviteRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    try:
        role = Role(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {[r.value for r in Role]}")
    full_name = body.email.split("@")[0]
    user = User(
        email=body.email,
        hashed_password=hash_password(TEMP_PASSWORD),
        full_name=full_name,
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "created_at": user.created_at.isoformat(),
        "temp_password": TEMP_PASSWORD,
    }


@router.put("/team/{user_id}/role")
async def update_role(user_id: str, body: UpdateRoleRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        user.role = Role(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {[r.value for r in Role]}")
    # Prevent removing last admin
    if user.role != Role.ADMIN:
        admins = await db.execute(select(User).where(User.role == Role.ADMIN))
        admin_list = admins.scalars().all()
        if len(admin_list) == 1 and admin_list[0].id == user_id:
            raise HTTPException(status_code=400, detail="Cannot remove the only admin")
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "email": user.email, "role": user.role.value}


@router.delete("/team/{user_id}", status_code=204)
async def remove_member(user_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Prevent removing last admin
    if user.role == Role.ADMIN:
        admins = await db.execute(select(User).where(User.role == Role.ADMIN))
        admin_list = admins.scalars().all()
        if len(admin_list) == 1:
            raise HTTPException(status_code=400, detail="Cannot remove the only admin")
    await db.delete(user)
    await db.commit()
