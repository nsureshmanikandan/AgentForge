from pydantic import BaseModel


class ToolDefinition(BaseModel):
    name: str
    description: str
    parameters: dict  # JSON Schema


TOOL_REGISTRY: dict[str, ToolDefinition] = {
    "web_search": ToolDefinition(
        name="web_search",
        description="Search the web for current information",
        parameters={
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Search query"}},
            "required": ["query"],
        },
    ),
    "calculator": ToolDefinition(
        name="calculator",
        description="Evaluate a safe math expression",
        parameters={
            "type": "object",
            "properties": {"expression": {"type": "string", "description": "Math expression to evaluate"}},
            "required": ["expression"],
        },
    ),
    "email": ToolDefinition(
        name="email",
        description="Send an email to a recipient",
        parameters={
            "type": "object",
            "properties": {
                "to": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["to", "subject", "body"],
        },
    ),
    "slack": ToolDefinition(
        name="slack",
        description="Post a message to a Slack channel",
        parameters={
            "type": "object",
            "properties": {
                "channel": {"type": "string"},
                "message": {"type": "string"},
            },
            "required": ["channel", "message"],
        },
    ),
    "github": ToolDefinition(
        name="github",
        description="Create a GitHub issue in a repository",
        parameters={
            "type": "object",
            "properties": {
                "repo": {"type": "string", "description": "owner/repo format"},
                "title": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["repo", "title"],
        },
    ),
    "jira": ToolDefinition(
        name="jira",
        description="Create a Jira ticket",
        parameters={
            "type": "object",
            "properties": {
                "project": {"type": "string"},
                "summary": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["project", "summary"],
        },
    ),
    "google_drive": ToolDefinition(
        name="google_drive",
        description="Search and retrieve files from Google Drive",
        parameters={
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    ),
}

# Safe math evaluator — no builtins exposed
_SAFE_MATH_GLOBALS: dict = {"__builtins__": {}}
_SAFE_MATH_LOCALS: dict = {}
try:
    import math
    _SAFE_MATH_LOCALS = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}
except ImportError:
    pass


async def execute_tool(tool_name: str, params: dict, credentials: dict | None = None) -> str:
    if tool_name == "calculator":
        try:
            result = eval(params["expression"], _SAFE_MATH_GLOBALS, _SAFE_MATH_LOCALS)  # noqa: S307
            return str(result)
        except Exception as e:
            return f"Error evaluating expression: {e}"
    # All other tools: stub — wire real APIs via credentials in production
    return f"[{tool_name}] executed with params: {params}"
