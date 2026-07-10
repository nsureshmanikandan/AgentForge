from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.auth import router as auth_router
from app.api.agents import router as agents_router
from app.api.rag import router as rag_router
from app.api.tools import router as tools_router
from app.api.control_plane import router as control_plane_router
from app.api.simulation import router as simulation_router
from app.core.telemetry import setup_telemetry

app = FastAPI(title="AIArchitect", version="1.0.0")

setup_telemetry(app)

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

@app.get("/health")
async def health():
    return {"status": "ok"}
