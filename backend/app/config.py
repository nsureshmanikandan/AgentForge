from pathlib import Path
from pydantic_settings import BaseSettings

# Resolve .env relative to this file's directory so it works regardless of cwd
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

class Settings(BaseSettings):
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment_gpt4o: str = "gpt-4o"
    azure_openai_deployment_gpt45: str = "gpt-4o"
    azure_openai_api_version: str = "2024-12-01-preview"

    llm_provider: str = "azure"  # "azure" | "lmstudio"
    # Optional per-feature overrides -- leave unset (None) to fall back to
    # llm_provider above. architect_llm_provider covers only Architect's own
    # endpoints; builder_llm_provider covers everything else that runs agents
    # (Visual Builder, Agent Studio orchestrator runs, RAG, voice-call text
    # generation) since those all share the AzureOpenAIClient class.
    architect_llm_provider: str | None = None
    builder_llm_provider: str | None = None
    lmstudio_base_url: str = "http://localhost:1234/v1"
    lmstudio_model: str = "qwen/qwen3.5-9b"

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/agentforge"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    azure_search_endpoint: str = ""
    azure_search_key: str = ""
    azure_search_index: str = "aiarchitect-index"

    azure_speech_key: str = ""
    azure_speech_region: str = "eastus"
    azure_speech_endpoint: str = ""

    otel_exporter: str = "console"
    otel_service_name: str = "agentforge"
    otel_exporter_otlp_endpoint: str = "http://localhost:4318"
    otel_exporter_otlp_endpoint_grpc: str = "http://localhost:4317"
    azure_monitor_connection_string: str = ""
    gcp_project_id: str = ""

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    frontend_base_url: str = "http://localhost:5173"

    class Config:
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"

settings = Settings()
