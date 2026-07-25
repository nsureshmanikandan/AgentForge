# Gemini LLM Provider Design

## Problem

AgentForge's Azure OpenAI credits are expiring soon and need a working replacement/alternative that
users can switch to per-agent, the same way they already switch between "Local Model" (LM Studio)
and "Azure GPT-5.4-mini" today. Every LLM-calling feature in the backend (Agent Studio orchestrator,
RAG engine's answer generation, voice call replies, Visual Builder's workflow engine, and a few
smaller helper endpoints) funnels through a single class, `AzureOpenAIClient`
(`backend/app/core/azure_openai.py`), which currently supports exactly two providers: `"azure"`
and `"lmstudio"`.

Google Gemini (via the `google-genai` SDK) was chosen as the replacement, based on a working
reference implementation already in a sibling project
(`VernacularCast/backend/app/services/gemini_service.py`) and a round of live testing against the
actual Google AI Studio API key the user has (documented in "Model choice" below).

## Non-Goals

- **Architect's code-generation flow** (`generate_project()` and friends in `backend/app/api/architect.py`).
  Architect doesn't go through `AzureOpenAIClient` today — it talks to a raw OpenAI-compatible client
  directly, and its generations are far larger/more complex (full multi-file projects, ~14,000 token
  budgets, multiple independent LLM passes) than anything validated in this round of testing. A small
  scaled-down test showed Gemini can produce Architect's exact `{"files": {"path": "content"}}`
  JSON-mode contract correctly, but real confidence at Architect's actual production scale needs a
  separate, dedicated validation pass. Left for a later round.
- **Switching the embeddings provider.** RAG's `RAGEngine._embedder` stays pinned to
  `AzureOpenAIClient(provider="azure")` regardless of which provider an agent's chat uses. Gemini's
  embedding models produce different-dimensioned vectors than Azure's `text-embedding-3-small`
  (hardcoded as `EMBED_DIM = 1536` in `rag_engine.py`), and mixing providers per KB would silently
  break FAISS search. Not addressed here.
- **Streaming.** `AzureOpenAIClient.stream_chat()` exists today but nothing in the codebase actually
  calls it. No Gemini streaming support is added in this pass.
- **A model-selection UI beyond the existing three-way dropdown.** Users pick a *provider*
  ("local"/"azure"/"gemini"), not a literal model string, in the UI — same as today. The specific
  Gemini model version is a single global setting (`GEMINI_MODEL`), not a per-agent choice, mirroring
  how the Azure deployment name already works.

## Model choice

Live-tested against the real API key before deciding:

| Model | Result |
|---|---|
| `gemini-3.1-flash` | Does not exist (404) — the 3.1 generation only ships `-flash-lite` for text generation, not a plain `-flash` tier. |
| `gemini-3.1-flash-lite` | Works. Fast, no hidden reasoning overhead. On a real RAG grounding test (reset-MFA question against real support docs), gave a correct, well-formatted, grounded answer — slightly more concise than Azure GPT-5.4-mini's answer to the same input, but accurate. Also correctly produced Architect-shaped JSON-mode multi-file output in a small-scale test. |
| `gemini-3.5-flash` | Works, but is a "thinking" model that spends part of its `max_output_tokens` budget on hidden reasoning (confirmed via `usage_metadata.thoughts_token_count`) — needs a much larger token budget to avoid coming back empty, and costs/latency more per call. On the same grounding test, it gave a **worse** answer than `flash-lite` (refused to use clearly-relevant context on an overly literal reading of the question), despite the extra cost. Not used. |

**Decision: `gemini-3.1-flash-lite` is the only model used, with no "upgrade path" model documented** — testing didn't support `gemini-3.5-flash` being better for this app's actual use cases, so there's no reason to recommend switching to it. `GEMINI_MODEL` remains an overridable env var for whenever a future model is worth re-testing.

## Design

### 1. Config (`backend/app/config.py`)

```python
gemini_api_key: str = ""
gemini_model: str = "gemini-3.1-flash-lite"
google_cloud_project: str = ""
google_cloud_location: str = "global"
google_application_credentials: str = ""
```

`google-genai` added to `backend/requirements.txt`. Real credential values go into `backend/.env`
(gitignored), never into this repo's tracked files.

### 2. `AzureOpenAIClient` gains a third provider branch

In `__init__`, a `provider == "gemini"` branch sets `self.deployment = settings.gemini_model` and
defers building the actual `google-genai` client until first use (lazy, via a `_get_gemini_client()`
helper) — mirroring the reference implementation's auth priority: prefer `GEMINI_API_KEY`
(Google AI Studio mode) if set, else fall back to Vertex AI + ADC via
`google_cloud_project`/`google_cloud_location`/`google_application_credentials`.

`chat()` gains a `provider == "gemini"` branch that:
1. Splits `messages` into `system_instruction` (any `"system"`-role content, joined) and `contents`
   (the rest, with `"assistant"` remapped to Gemini's `"model"` role — the SDK doesn't recognize
   `"assistant"`).
2. Calls `client.models.generate_content(...)` via `asyncio.to_thread` (matching the existing
   sync-wrapped-in-thread pattern the reference file uses, since `google-genai`'s Python SDK is sync).
3. Extracts the answer text defensively: use `response.text` if present, otherwise scan
   `candidates[].content.parts` and join any part not flagged `thought=True` — needed for "thinking"
   models like `gemini-3.5-flash` where `response.text` can come back empty even on success (verified
   directly via live testing). Not required for `flash-lite` but cheap and correct to include.

The `google.genai` import stays inside this Gemini-specific code path (not a top-level module import),
so nothing breaks for setups that never select the Gemini provider and don't have the package
installed.

`embed()` is untouched — it's only ever constructed with `provider="azure"` explicitly by
`RAGEngine`, never affected by an agent's chat-provider choice.

### 3. Wiring: every "local vs azure" choice becomes three-way

**Backend:**
- `backend/app/core/orchestrator.py` — `AgentOrchestrator.__init__`'s provider mapping:
  ```python
  provider_map = {"local": "lmstudio", "gemini": "gemini"}
  provider_override = provider_map.get(model_choice, "azure")
  ```
  `MultiAgentOrchestrator` needs no change — it already forwards each worker's own `model` config
  through to its own `AgentOrchestrator`, so managerial/multi-agent flows get three-way support for
  free once this mapping is fixed.
- `backend/app/api/agents.py`'s `get_active_model` endpoint — same binary→three-way fix (currently
  `"lmstudio" if (model or "local") == "local" else "azure"`).

No DB/schema migration needed anywhere: `Agent.model` and `AgentCreate.model` are already free-form
string fields, not enums — `"gemini"` is just a new accepted value.

**Frontend** (three separate copies of this dropdown found, not one):
- `frontend/src/pages/CreateAgent.tsx` — `MODELS` array gets a third entry.
- `frontend/src/components/agents/AgentConfigPanel.tsx` (Visual Builder's node config panel) — its
  own hardcoded `<option>` pair gets a third option.
- `frontend/src/pages/Playground.tsx` — same, **plus a real bug fix**: line 310's
  `value={agent.model === "local" ? "local" : "azure"}` currently forces any Gemini-configured
  agent's dropdown to silently display "Azure" selected. Needs to pass through the actual value (or
  an explicit three-way check) instead of collapsing anything non-"local" to "azure".

### 4. Error handling

No new error-handling code is added. A missing/invalid `GEMINI_API_KEY` or an unreachable Gemini
endpoint raises naturally out of `chat()` (the existing `except Exception` in `chat()` already
records the exception on the span and re-raises) — this matches how a misconfigured Azure key already
behaves today. No silent fallback to a different provider.

## Testing

- Unit (`backend/app/tests/test_azure_openai.py`): `AzureOpenAIClient(provider="gemini")` resolves
  `self.deployment` to `settings.gemini_model`; `chat()` correctly splits system messages into
  `system_instruction` and remaps `assistant`→`model` in `contents`; text extraction correctly falls
  back to part-scanning when `response.text` is empty.
- Unit (`backend/app/tests/test_orchestrator.py`): `AgentOrchestrator` resolves `"gemini"` model
  choice to `provider="gemini"` (extending the existing local/azure provider-resolution tests).
- Manual: set `BUILDER_LLM_PROVIDER=gemini` (or create an agent with model="gemini") and confirm a
  real Agent Studio chat run, a RAG KB query, and a voice call reply all produce real Gemini-backed
  answers end-to-end — swapping back to `azure` via `.env` alone (no code change) restores the
  previous behavior.
