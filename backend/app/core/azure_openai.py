from openai import AsyncAzureOpenAI, AsyncOpenAI
from opentelemetry import trace
from opentelemetry.trace import StatusCode
from app.config import settings
from app.core.telemetry import get_tracer


def _extract_gemini_text(response) -> str:
    """Pull the answer text out of a Gemini response.

    Thinking models (e.g. gemini-3.5-flash) can return response.text as None
    or empty even on a successful call -- the real answer lives in
    candidates[].content.parts, alongside separate "thought" parts that must
    be skipped. Confirmed by live testing against gemini-3.5-flash; not
    needed for gemini-3.1-flash-lite (not a thinking model) but harmless and
    correct to always check.
    """
    if response.text:
        return response.text
    parts = []
    for candidate in (response.candidates or []):
        for part in (getattr(candidate.content, "parts", None) or []):
            if not getattr(part, "thought", False) and getattr(part, "text", None):
                parts.append(part.text)
    return "".join(parts)


class AzureOpenAIClient:
    def __init__(self, deployment: str | None = None, provider: str | None = None):
        # `provider` lets a caller (e.g. a per-agent model choice) override the
        # global BUILDER_LLM_PROVIDER/.env default for this one client instance.
        self.provider = provider or settings.builder_llm_provider or settings.llm_provider or "azure"
        if self.provider == "lmstudio":
            # LM Studio's local server exposes an OpenAI-compatible /v1 API --
            # api_key is unused by LM Studio but the SDK requires a non-empty string.
            # NOTE: deployment overrides passed in by callers (e.g. orchestrator.py's
            # agent_config.get("model")) are always Azure deployment names like
            # "gpt-4o"/"gpt-4-5" -- meaningless on LM Studio's local model registry,
            # so they're intentionally ignored here in favor of LMSTUDIO_MODEL.
            self.deployment = settings.lmstudio_model
            self._client = AsyncOpenAI(
                base_url=settings.lmstudio_base_url,
                api_key="lm-studio",
            )
        elif self.provider == "gemini":
            # Deployment overrides are ignored here too, same reasoning as
            # lmstudio above -- GEMINI_MODEL is the one setting that picks
            # which Gemini model every gemini-provider call uses.
            self.deployment = settings.gemini_model
            self._gemini_client = None  # built lazily on first chat() call
        else:
            self.deployment = deployment or settings.azure_openai_deployment_gpt4o
            self._client = AsyncAzureOpenAI(
                azure_endpoint=settings.azure_openai_endpoint,
                api_key=settings.azure_openai_api_key,
                api_version=settings.azure_openai_api_version,
            )
        self.model = self.deployment

    def _get_gemini_client(self):
        # Imported here (not at module level) so the rest of the app keeps
        # working without the google-genai package for setups that never
        # select the gemini provider.
        from google import genai

        if self._gemini_client is not None:
            return self._gemini_client
        if settings.gemini_api_key:
            self._gemini_client = genai.Client(api_key=settings.gemini_api_key)
        else:
            self._gemini_client = genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.google_cloud_location,
            )
        return self._gemini_client

    async def _gemini_chat(self, messages: list[dict], temperature: float, max_tokens: int) -> str:
        import asyncio
        from google.genai import types

        # Gemini has no "system" role -- system_instruction is a separate
        # config field, and the assistant's turn is called "model", not
        # "assistant".
        system_parts = [m["content"] for m in messages if m.get("role") == "system"]
        contents = [
            {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
            for m in messages if m.get("role") != "system"
        ]
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            system_instruction="\n\n".join(system_parts) or None,
        )
        client = self._get_gemini_client()

        def _sync_call():
            response = client.models.generate_content(model=self.deployment, contents=contents, config=config)
            return _extract_gemini_text(response)

        return await asyncio.to_thread(_sync_call)

    @staticmethod
    def _fold_system_messages(messages: list[dict]) -> list[dict]:
        """Merge any system-role messages into the first user message.

        Several local chat templates (Mistral-7B-Instruct-v0.3 among them)
        reject a "system" role outright, so this keeps the same instructions
        but sends them as part of the first user turn instead.
        """
        system_parts = [m["content"] for m in messages if m.get("role") == "system"]
        if not system_parts:
            return messages
        preamble = "\n\n".join(system_parts)
        rest = [m for m in messages if m.get("role") != "system"]
        for i, m in enumerate(rest):
            if m.get("role") == "user":
                merged = dict(m, content=f"{preamble}\n\n{m['content']}")
                return rest[:i] + [merged] + rest[i + 1:]
        return [{"role": "user", "content": preamble}] + rest

    async def chat(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 2048) -> str:
        tracer = get_tracer()
        with tracer.start_as_current_span("llm.chat") as span:
            span.set_attribute("llm.model", self.deployment)
            span.set_attribute("llm.provider", self.provider)
            span.set_attribute("llm.temperature", temperature)
            span.set_attribute("llm.max_tokens", max_tokens)
            try:
                if self.provider == "gemini":
                    result = await self._gemini_chat(messages, temperature, max_tokens)
                    span.set_attribute("llm.prompt_messages", len(messages))
                    span.set_attribute("llm.response_length", len(result))
                    return result

                # LM Studio's OpenAI-compat layer expects the standard "max_tokens"
                # param; Azure OpenAI's newer models expect "max_completion_tokens".
                token_kwarg = {"max_tokens": max_tokens} if self.provider == "lmstudio" else {"max_completion_tokens": max_tokens}
                # Some local models' chat templates (e.g. Mistral-7B-Instruct-v0.3)
                # reject the "system" role outright ("Only user and assistant
                # roles are supported!"). Fold any system message into the first
                # user turn instead so callers don't need per-model workarounds.
                send_messages = self._fold_system_messages(messages) if self.provider == "lmstudio" else messages
                response = await self._client.chat.completions.create(
                    model=self.deployment,
                    messages=send_messages,
                    temperature=temperature,
                    **token_kwarg,
                )
                result = response.choices[0].message.content
                span.set_attribute("llm.prompt_messages", len(messages))
                span.set_attribute("llm.response_length", len(result))
                return result
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(StatusCode.ERROR)
                raise

    async def embed(self, texts: list[str]) -> list[list[float]]:
        tracer = get_tracer()
        with tracer.start_as_current_span("llm.embed") as span:
            span.set_attribute("llm.embed_count", len(texts))
            response = await self._client.embeddings.create(
                model=settings.azure_openai_deployment_embedding,
                input=texts,
            )
            return [d.embedding for d in response.data]

    async def stream_chat(self, messages: list[dict]):
        stream = await self._client.chat.completions.create(
            model=self.deployment,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
