from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.auth import router as auth_router
from app.api.agents import router as agents_router
from app.api.rag import router as rag_router
from app.api.tools import router as tools_router
from app.api.control_plane import router as control_plane_router
from app.api.simulation import router as simulation_router
from app.api.architect import router as architect_router
from app.api.api_keys import router as api_keys_router
from app.api.team import router as team_router
from app.api.safety import router as safety_router
from app.api.evaluations import router as evaluations_router
from app.api.voice import router as voice_router
from app.api.builder import router as builder_router
from app.core.telemetry import setup_telemetry
from app.core.seed import seed_admin

from fastapi.openapi.utils import get_openapi
from fastapi.security import OAuth2PasswordBearer

app = FastAPI(
    title="AgentForge",
    version="1.0.0",
    description="Enterprise AI Agent Platform",
    swagger_ui_parameters={"persistAuthorization": True},
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
    }
    for path in schema.get("paths", {}).values():
        for operation in path.values():
            operation.setdefault("security", [{"BearerAuth": []}])
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi

setup_telemetry(app)

@app.on_event("startup")
async def on_startup():
    # Import all models so SQLAlchemy sees them before create_all
    import app.models.user      # noqa
    import app.models.audit     # noqa
    import app.models.rag       # noqa
    import app.models.workflow  # noqa
    import app.models.voice     # noqa
    from app.database import Base, engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_admin()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(agents_router, prefix="/api/agents", tags=["agents"])
app.include_router(rag_router, prefix="/api/rag", tags=["rag"])
app.include_router(tools_router, prefix="/api/tools", tags=["tools"])
app.include_router(control_plane_router, prefix="/api/control-plane", tags=["control-plane"])
app.include_router(simulation_router, prefix="/api/simulation", tags=["simulation"])
app.include_router(architect_router, prefix="/api/architect", tags=["architect"])
app.include_router(api_keys_router, prefix="/api", tags=["api-keys"])
app.include_router(team_router, prefix="/api", tags=["team"])
app.include_router(safety_router, prefix="/api/safety", tags=["safety"])
app.include_router(evaluations_router, prefix="/api/evaluations", tags=["evaluations"])
app.include_router(voice_router, prefix="/api/voice", tags=["voice"])
app.include_router(builder_router, prefix="/api/builder", tags=["builder"])

@app.get("/health")
async def health():
    return {"status": "ok"}
