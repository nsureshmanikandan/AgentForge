# Per-Feature LLM Provider Override — Design

## Goal

Today, `LLM_PROVIDER` in `backend/.env` is a single global toggle (`azure` | `lmstudio`) read by every LLM call site in the app. After today's LM Studio integration testing, we found:

- Architect's clarifying questions work fine against LM Studio, but heavy generation (full sandbox UI, full project export) is impractical on this hardware — LM Studio runs at ~6 tok/s (no discrete GPU), and Architect's generation calls request up to 16,000 tokens, which would take tens of minutes and blow past the frontend's request timeouts.
- Everything that runs through `AzureOpenAIClient` for lighter, single-call generation (a single Visual Builder node, a Knowledge Base RAG answer, an Agent Studio orchestrator run, the text-generation half of a voice call) works fine against LM Studio at this speed.

The user wants to run Architect on Azure (for reliable heavy generation) while simultaneously running Visual Builder and related agent-execution paths on LM Studio (for free/offline lightweight testing) — without restarting the backend or juggling one shared setting.

## Background

Two independent code paths currently read `settings.llm_provider`:

1. **`AzureOpenAIClient`** (`backend/app/core/azure_openai.py`) — an async client class used everywhere except Architect: `builder.py` (Visual Builder, 4 call sites), `orchestrator.py` (Agent Studio "Run" — 1 call site), `agents.py`, `prompt_to_agent.py`, `rag_engine.py` (Knowledge Base Q&A), and `voice.py` (the text-generation half of a voice call only — NOT the audio synthesis itself).
2. **`_get_architect_llm()`** (`backend/app/api/architect.py`) — a separate sync-client helper used only by Architect's 5 real endpoints (`generate_ui`, `generate_project`, `chat`, `score_plan`, `sandbox_to_apptsx`). Architect never uses `AzureOpenAIClient` at all.

Because these are two distinct code paths, giving Architect a different provider than everything else requires touching exactly one line in each.

**Explicitly out of scope:** `voice.py`'s Azure Speech SDK usage (`AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`, `azure.cognitiveservices.speech`) is a completely separate Microsoft service with no local equivalent wired in. It is unaffected by either provider setting and always uses Azure Speech regardless of `LLM_PROVIDER`/`BUILDER_LLM_PROVIDER`. This design only changes which provider generates the *text* the voice agent speaks, not how that text becomes audio.

## Approach

Add two new optional settings, both defaulting to `None` (meaning "fall back to the existing global `LLM_PROVIDER`" — fully backward compatible for anyone who doesn't set them):

```python
# backend/app/config.py
architect_llm_provider: str | None = None  # overrides llm_provider for Architect only
builder_llm_provider: str | None = None    # overrides llm_provider for everything else that runs agents
```

**`AzureOpenAIClient.__init__`** changes its provider resolution from:
```python
self.provider = settings.llm_provider or "azure"
```
to:
```python
self.provider = settings.builder_llm_provider or settings.llm_provider or "azure"
```
This is the only code change needed to cover `builder.py`, `orchestrator.py`, `agents.py`, `prompt_to_agent.py`, `rag_engine.py`, and the text-generation half of `voice.py` — none of those call sites need to change since they all go through this one class.

**`architect.py`'s `_get_architect_llm()`** changes its provider check from:
```python
if settings.llm_provider == "lmstudio":
```
to:
```python
if (settings.architect_llm_provider or settings.llm_provider) == "lmstudio":
```
This is the only place Architect's provider is decided, so this one change covers all 5 of Architect's real endpoints. All the `settings.llm_provider == "lmstudio"` checks added earlier today inside `architect.py` (the `_fold_system_messages` calls, the `_ARCHITECT_CHAT_SCHEMA` gating, the `_already_asked_questions` reminder injection) need the same substitution, since they all currently reference `settings.llm_provider` directly.

**`.env` additions** (both commented out by default, so existing setups are untouched until the user opts in):
```
# Per-feature overrides -- leave commented to use LLM_PROVIDER for everything.
#ARCHITECT_LLM_PROVIDER=azure
#BUILDER_LLM_PROVIDER=lmstudio
```

## Data Flow

- Architect endpoint hit → `_get_architect_llm()` resolves provider as `architect_llm_provider or llm_provider` → builds sync `AzureOpenAI`/`OpenAI` client accordingly. Unchanged otherwise from today's behavior.
- Visual Builder / orchestrator / RAG / voice-text call → `AzureOpenAIClient()` constructed → resolves provider as `builder_llm_provider or llm_provider` → builds async `AsyncAzureOpenAI`/`AsyncOpenAI` client accordingly. Unchanged otherwise from today's behavior.
- If both new settings are left unset, behavior is byte-for-byte identical to today's single-toggle behavior.

## Error Handling

No new failure modes are introduced — this only changes which of two already-existing, already-tested provider branches gets selected. Existing per-node try/except handling (Visual Builder's `node_error` SSE events, Architect's existing exception handling) is untouched.

## Testing

1. Unit test: with `ARCHITECT_LLM_PROVIDER=lmstudio` and `LLM_PROVIDER=azure`, assert `_get_architect_llm()` resolves to the lmstudio branch. With both unset, assert it still resolves to whatever `LLM_PROVIDER` says (regression guard for today's existing tests).
2. Unit test: with `BUILDER_LLM_PROVIDER=lmstudio` and `LLM_PROVIDER=azure`, assert `AzureOpenAIClient().provider == "lmstudio"`. With `BUILDER_LLM_PROVIDER` unset, assert it falls back to `LLM_PROVIDER`.
3. Live verification: set `LLM_PROVIDER=azure`, `ARCHITECT_LLM_PROVIDER` unset (so Architect uses azure), `BUILDER_LLM_PROVIDER=lmstudio`. Restart backend. Confirm Architect's `/chat` endpoint uses Azure GPT-4o (fast, full plan generation succeeds) while a Visual Builder single-node run uses LM Studio (confirm via response content matching LM Studio's model, e.g. checking the `AzureOpenAIClient.deployment` value logged in the OTel span `llm.model` attribute).

## Out of Scope

- Splitting `voice.py`'s Azure Speech SDK usage — always Azure, unaffected by this change.
- Per-node or per-agent provider selection within a single Visual Builder workflow — `BUILDER_LLM_PROVIDER` applies uniformly to every `AzureOpenAIClient()` instantiation, not per-node.
- A UI/settings-page way to change these values — this is an `.env`-only toggle, same as the existing `LLM_PROVIDER`.
