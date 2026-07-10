from fastapi import APIRouter
from app.core.tool_registry import TOOL_REGISTRY, ToolDefinition

router = APIRouter()


@router.get("/", response_model=list[ToolDefinition])
async def list_tools():
    return list(TOOL_REGISTRY.values())
