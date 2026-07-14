from openai import AsyncAzureOpenAI
from opentelemetry import trace
from opentelemetry.trace import StatusCode
from app.config import settings
from app.core.telemetry import get_tracer

class AzureOpenAIClient:
    def __init__(self, deployment: str | None = None):
        # Single source of truth: always read from settings/.env
        # Pass deployment only when explicitly needing the gpt45 variant
        self.deployment = deployment or settings.azure_openai_deployment_gpt4o
        self.model = self.deployment
        self._client = AsyncAzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
        )

    async def chat(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 2048) -> str:
        tracer = get_tracer()
        with tracer.start_as_current_span("llm.chat") as span:
            span.set_attribute("llm.model", self.deployment)
            span.set_attribute("llm.provider", "azure_openai")
            span.set_attribute("llm.temperature", temperature)
            span.set_attribute("llm.max_tokens", max_tokens)
            try:
                response = await self._client.chat.completions.create(
                    model=self.deployment,
                    messages=messages,
                    temperature=temperature,
                    max_completion_tokens=max_tokens,
                )
                result = response.choices[0].message.content
                span.set_attribute("llm.prompt_messages", len(messages))
                span.set_attribute("llm.response_length", len(result))
                return result
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(StatusCode.ERROR)
                raise

    async def stream_chat(self, messages: list[dict]):
        stream = await self._client.chat.completions.create(
            model=self.deployment,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
