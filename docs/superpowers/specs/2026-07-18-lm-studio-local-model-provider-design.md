# LM Studio Local Model Provider — Design

## Goal

Let AgentForge run against locally-hosted models served by LM Studio, instead of (or in addition to) Azure OpenAI, so workflows/agents can be tested for free and offline during development. This is a dev/test convenience feature, not a production deployment target.

## Background

Every LLM call in the backend goes through one class, `AzureOpenAIClient` (`backend/app/core/azure_openai.py`), instantiated fresh at each call site (`AzureOpenAIClient()`), across ~40+ locations in `builder.py`, `architect.py`, `orchestrator.py`, `agents.py`, and others. It wraps `openai.AsyncAzureOpenAI` and exposes two methods used throughout the codebase:

- `async def chat(messages: list[dict], temperature: float = 0.7, max_tokens: int = 2048) -> str`
- `async def stream_chat(messages: list[dict])` (async generator yielding text chunks)

LM Studio (already installed, 5 models downloaded) exposes an OpenAI-compatible REST API at `http://localhost:1234/v1` (the `/v1/chat/completions` endpoint used by the standard `openai` Python SDK's `AsyncOpenAI` client) whenever its Local Server is running with a model loaded. This is a separate, still-supported path alongside LM Studio's newer native `/api/v1/*` REST API — the OpenAI-compat client library will keep working correctly against `/v1`.

## Approach

Add an `LLM_PROVIDER` setting (`azure` | `lmstudio`, defaulting to `azure` — no change to existing behavior when unset). `AzureOpenAIClient.__init__` branches on this setting to decide which underlying OpenAI SDK client and model name to use:

- `azure` (default, current behavior): `AsyncAzureOpenAI(azure_endpoint=..., api_key=..., api_version=...)`, model = `settings.azure_openai_deployment_gpt4o` (or explicit `deployment` arg).
- `lmstudio`: `AsyncOpenAI(base_url=settings.lmstudio_base_url, api_key="lm-studio")` (LM Studio ignores the API key value but the SDK requires a non-empty string), model = `settings.lmstudio_model`.

Both `chat()` and `stream_chat()` call `self._client.chat.completions.create(...)` identically regardless of provider — the OpenAI SDK's request/response shape is the same for both `AsyncAzureOpenAI` and `AsyncOpenAI`, so no branching is needed inside the method bodies, only in `__init__`.

**No call sites change.** Every `AzureOpenAIClient()` instantiation across the codebase continues to work unmodified — the class name stays the same to avoid a 40+-site rename; only its internals change.

## Config

New settings in `backend/app/config.py` (`Settings` class), all with defaults so nothing breaks if unset in `.env`:

```python
llm_provider: str = "azure"                          # "azure" | "lmstudio"
lmstudio_base_url: str = "http://localhost:1234/v1"
lmstudio_model: str = "qwen/qwen3.5-9b"
```

New `.env` entries (documented in `.env.example`):
```
LLM_PROVIDER=lmstudio
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=qwen/qwen3.5-9b
```

Recommended default model: `qwen/qwen3.5-9b` (best balance of capability/size among the 5 loaded models for agent/workflow testing). `mistralai/mistral-7b-instruct-v0.3` is a faster fallback; `google/gemma-4-12b-qat` is heavier/slower but higher quality; `allenai/olmocr-2-7b` is OCR-specialized and unsuitable as a general default.

## Error handling

If `LLM_PROVIDER=lmstudio` but LM Studio's local server isn't running (or no model is loaded), the `openai` SDK raises a connection error from `chat.completions.create(...)` — this propagates up through the existing `try/except` blocks already present at every call site (e.g. `_run_pipeline_from` in `builder.py` catches the exception and logs the node as `status="error"` with the message), so no new error-handling code is needed; the existing per-node error surfacing already covers this case correctly.

## Testing

1. Unit test: instantiate `AzureOpenAIClient` with `settings.llm_provider = "lmstudio"` (monkeypatched), assert the underlying client is `AsyncOpenAI` with the configured `base_url`, and assert `self.model == settings.lmstudio_model`.
2. Unit test: default (`llm_provider = "azure"`) still constructs `AsyncAzureOpenAI` as before — regression guard.
3. Live verification: start LM Studio's local server with `qwen/qwen3.5-9b` loaded, set `LLM_PROVIDER=lmstudio` in `.env`, restart the backend, and re-run the existing Leave Tracking Workflow end-to-end (the same one used throughout this session's condition/approval testing) to confirm real local-model responses flow through the pipeline correctly.

## Out of scope

- Per-agent or per-workflow-node model selection (explicitly deferred this session — one configured default model for the whole app).
- Embeddings/RAG provider swap (RAG currently uses Azure OpenAI embeddings separately; not addressed here).
- Any change to Voice Agents (Azure Speech STT/TTS) — unrelated to chat completions.
- Production/multi-tenant support for local models — this is a local dev/test convenience only.
