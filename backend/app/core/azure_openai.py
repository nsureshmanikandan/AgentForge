from openai import AsyncAzureOpenAI
from app.config import settings

class AzureOpenAIClient:
    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        self.deployment = (
            settings.azure_openai_deployment_gpt45
            if "4-5" in model or model.endswith("5")
            else settings.azure_openai_deployment_gpt4o
        )
        self._client = AsyncAzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )

    async def chat(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 2048) -> str:
        response = await self._client.chat.completions.create(
            model=self.deployment,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    async def stream_chat(self, messages: list[dict]):
        stream = await self._client.chat.completions.create(
            model=self.deployment,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
