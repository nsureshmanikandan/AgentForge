from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment_gpt4o: str = "gpt-4o"
    azure_openai_deployment_gpt45: str = "gpt-4-5"
    azure_openai_api_version: str = "2024-12-01-preview"

    database_url: str = "postgresql+asyncpg://architect:architect@localhost:5432/aiarchitect"
    jwt_secret: str = "change_me_in_production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    azure_search_endpoint: str = ""
    azure_search_key: str = ""
    azure_search_index: str = "aiarchitect-index"

    class Config:
        env_file = ".env"

settings = Settings()
