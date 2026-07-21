from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.core.security import decode_token
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectVisibilityUpdate,
    ProjectOut,
    ProjectSummaryOut,
)

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


async def _get_owned_project(project_id: str, user: User, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not the project owner")
    return project


@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(
    body: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(**body.model_dump(), owner_id=user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/trash", response_model=list[ProjectSummaryOut])
async def list_trash(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.owner_id == user.id, Project.deleted_at.is_not(None))
    )
    return result.scalars().all()


@router.get("/", response_model=list[ProjectSummaryOut])
async def list_projects(
    visibility: str = Query("private", pattern="^(private|published|shared)$"),
    mine: bool = Query(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project).where(Project.deleted_at.is_(None))
    if visibility == "private":
        query = query.where(Project.visibility == "private", Project.owner_id == user.id)
    elif visibility == "published":
        query = query.where(Project.visibility == "published")
        if mine:
            query = query.where(Project.owner_id == user.id)
    else:  # shared
        query = query.where(Project.visibility == "shared")
    result = await db.execute(query.order_by(Project.updated_at.desc()))
    projects = result.scalars().all()
    if visibility == "shared":
        # JSON array membership isn't portably expressible at the SQL level
        # via the generic JSON column type, so filter in Python instead --
        # shared-project counts are small enough for this to be cheap.
        projects = [
            p for p in projects
            if p.owner_id == user.id or user.id in (p.shared_with or [])
        ]
    return projects


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    is_owner = project.owner_id == user.id
    is_visible = (
        project.visibility == "published"
        or (project.visibility == "shared" and user.id in (project.shared_with or []))
    )
    if not is_owner and not is_visible:
        raise HTTPException(status_code=403, detail="Not authorized to view this project")
    return project


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_owned_project(project_id, user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project


@router.put("/{project_id}/visibility", response_model=ProjectOut)
async def update_visibility(
    project_id: str,
    body: ProjectVisibilityUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.visibility not in ("private", "published", "shared"):
        raise HTTPException(status_code=400, detail="Invalid visibility value")
    project = await _get_owned_project(project_id, user, db)
    project.visibility = body.visibility
    project.shared_with = body.shared_with if body.visibility == "shared" else []
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_owned_project(project_id, user, db)
    project.deleted_at = datetime.utcnow()
    await db.commit()


@router.post("/{project_id}/restore", response_model=ProjectOut)
async def restore_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_owned_project(project_id, user, db)
    project.deleted_at = None
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}/permanent", status_code=204)
async def permanently_delete_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_owned_project(project_id, user, db)
    if project.deleted_at is None:
        raise HTTPException(status_code=400, detail="Move to Trash before permanently deleting")
    await db.delete(project)
    await db.commit()
