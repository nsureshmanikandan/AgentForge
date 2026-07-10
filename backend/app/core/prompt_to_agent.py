import json
from app.core.azure_openai import AzureOpenAIClient

SYSTEM_PROMPT = """You are an AI agent architect. Given a natural language description of an agent,
return ONLY a valid JSON object with these exact fields:
{
  "name": "string — short agent name",
  "description": "string — one sentence description",
  "system_prompt": "string — detailed system prompt for the agent",
  "model": "gpt-4o",
  "tools": ["list of tool names from: email, slack, github, jira, google_drive, notion, web_search, calculator"],
  "guardrails": {
    "pii": true,
    "hallucination": true,
    "max_tokens": 2048
  }
}
Return ONLY the JSON. No explanation. No markdown fences."""

async def generate_agent_config(user_description: str) -> dict:
    client = AzureOpenAIClient(model="gpt-4o")
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_description},
    ]
    raw = await client.chat(messages, temperature=0.3)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]
    return json.loads(raw.strip())
