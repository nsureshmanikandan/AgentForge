# AgentForge backend startup script
# Copy this to start.ps1 and fill in your real values — start.ps1 is git-ignored
$env:AZURE_OPENAI_API_KEY          = "your-azure-openai-key-here"
$env:AZURE_OPENAI_ENDPOINT         = "https://YOUR_RESOURCE.cognitiveservices.azure.com/"
$env:AZURE_OPENAI_API_VERSION      = "2024-12-01-preview"
$env:AZURE_OPENAI_DEPLOYMENT_GPT4O = "gpt-4o"
$env:DATABASE_URL                  = "postgresql+asyncpg://architect:architect@localhost:5432/agentforge"
$env:JWT_SECRET                    = "change-this-in-production"
$env:OTEL_EXPORTER                 = "console"

Write-Host "Starting AgentForge backend..." -ForegroundColor Cyan
& venv\Scripts\uvicorn app.main:app --reload --port 8000
