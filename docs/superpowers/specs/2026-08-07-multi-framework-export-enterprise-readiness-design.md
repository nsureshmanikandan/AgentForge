# Multi-framework export: enterprise-readiness upgrade

## Problem

`backend/app/api/builder_export.py` generates real, runnable LangGraph /
Microsoft Agent Framework / CrewAI projects from a canvas workflow (see
`2026-07-26-multi-framework-agent-export-design.md`). Live end-to-end testing
against a real Azure OpenAI resource confirmed correctness (and found/fixed a
critical CrewAI branch-dispatch bug), but a follow-up review scored the
generated code's enterprise-readiness at ~40-46/100 across 8 dimensions:
Correctness, Secrets handling, Observability/tracing, Persistence/state,
Error handling/retries, Container hygiene, Test coverage, Foundry
deployability.

This spec raises all 8 dimensions toward 9/10, explicitly using OpenTelemetry
for observability, without turning the export into an unmaintainable pile of
generated boilerplate.

## Non-goals

- Rewriting the translation architecture from `builder_export.py`'s
  deterministic per-framework functions (`_export_langgraph`,
  `_export_ms_agent_framework`, `_export_crewai`) — this spec extends those
  functions and their shared helpers, it doesn't replace them.
- Multi-region/HA deployment topologies, autoscaling policy, cost
  optimization — out of scope for a generated starter project.
- Building the actual Azure AI Foundry deployment (this ships the
  `foundry_main.py`/`azure.yaml` files that make deployment possible; running
  `azd up` against a real Foundry project is left to the user, same as the
  original export design).

## Architectural decision: CrewAI gets a data-driven graph engine

CrewAI's export currently generates bespoke Python control flow per workflow
(`if branch == "true": ...`) — this is exactly what caused the branch-dispatch
bug fixed earlier today (every branch target got an extra unconditional call
appended after the correct conditional one). To support resumable execution
(needed for durable persistence) without reintroducing that bug class, the
CrewAI export changes shape:

- The generator emits the workflow as **data**: a `NODES: dict[str, dict]` and
  `EDGES: list[dict]` literal baked into `main.py`, not per-node Python
  `if`/`elif` chains.
- A single, hand-written, unit-tested `run_graph(nodes, edges, engine_hooks,
  start_input, resume_from=None)` engine function is shipped **verbatim**
  into every CrewAI export (never regenerated per-workflow) and walks the
  graph, dispatching to per-node-role handler functions (`_run_agent_node`,
  `_run_condition_node`, `_run_http_node`, `_run_approval_node`) that CrewAI
  code still generates one-per-node (same as today, since each node's
  `Agent`/`Task`/`Crew` construction is genuinely workflow-specific).
- The engine checkpoints `(run_id, last_completed_node_id, context)` after
  every node via the same `save_pause`/`load_pause` SQLite helpers used for
  approval persistence (see Persistence section) — so a plain crash/restart
  mid-run and an approval pause are handled by the same mechanism.

LangGraph and Microsoft Agent Framework already have native graph engines
(`StateGraph`, `WorkflowBuilder`) — they are not restructured, only extended
per the sections below.

## Per-dimension design

### 1. Correctness (8-9 -> 9-10)

Already verified live for all 3 frameworks (see the prior design's testing
appendix). This spec adds:
- Input validation: reject empty/`None` workflow input with a clear
  `ValueError` before any LLM/HTTP call, instead of sending an empty prompt.
- A `--dry-run` CLI flag (all 3 frameworks) that validates the graph shape
  (every condition/router node has a reachable edge for every branch label,
  every node id referenced by an edge exists) without calling any LLM or
  HTTP endpoint — catches a whole class of "the export is malformed" errors
  before spending a token.

### 2. Secrets handling (5-6 -> 9)

- Generate `.gitignore` (`*.env`, `!.env.example`, `__pycache__/`, `*.db`,
  `.pytest_cache/`) and `.dockerignore` (same list) in every export.
- Add a small `settings.py` using `pydantic-settings` that declares every env
  var the chosen provider needs, validates presence/type at import time, and
  raises one clear `ConfigError` listing every missing variable (not a
  cryptic downstream `AuthenticationError` after a network round-trip). This
  also serves the Error-handling dimension.
- `azure.yaml` (new, part of the Foundry-deployability section) references
  secrets via Foundry's `${{connections.<name>.<path>}}` placeholder syntax,
  never a literal key.
- OpenTelemetry span/log attributes are built through an explicit
  allow-list (`node_id`, `role`, `model`, `branch`, `http_status`,
  `duration_ms`) — request/response *content* (prompts, LLM output, HTTP
  bodies) is never attached to a span or log line unless the deployer opts in
  via `OTEL_LOG_PROMPTS=true`. This is both a secrets and a PII concern.

### 3. Observability -- OpenTelemetry (2-3 -> 9)

Shared `_OBSERVABILITY_SNIPPET` (new helper in `builder_export.py`, emitted
into all 3 exports) providing:

- `configure_observability()`: calls `azure.monitor.opentelemetry
  .configure_azure_monitor()` when `APPLICATIONINSIGHTS_CONNECTION_STRING`
  is set (Foundry injects this automatically once deployed -- zero extra
  config needed), otherwise falls back to a `ConsoleSpanExporter` for local
  runs. One code path, two environments.
- `get_tracer()` / a `traced_step(name, **attrs)` context manager wrapping:
  every node execution, every LLM call, every HTTP call, every condition
  evaluation -- attributes limited to the allow-list above.
- A `workflow_run_id` (`uuid4`, generated once per `run_workflow`/
  `compiled.invoke`/`workflow.run` call) attached as a root-span attribute
  and included in every structured log line, so an operator can filter one
  execution end-to-end in Application Insights or console output.
- Structured JSON logging via `logging.Formatter` emitting
  `{timestamp, level, message, trace_id, span_id, workflow_run_id, ...}`,
  replacing today's bare `print()` calls in `main.py`'s CLI entrypoint.

New dependency: `azure-monitor-opentelemetry` (pulls in `opentelemetry-sdk`
transitively). No new dependency for the console-only fallback path.

### 4. Persistence / state (2-4 -> 9), backend: SQLite

- **LangGraph**: swap `MemorySaver` -> `SqliteSaver` (from
  `langgraph-checkpoint-sqlite`), pointed at `CHECKPOINT_DB_PATH` (default
  `./data/checkpoints.db`, directory created if missing). LangGraph's own
  `interrupt()`/`Command(resume=...)` already provides correct resume
  semantics -- this change only makes that state survive a restart. Minimal,
  low-risk change to a single line plus one new dependency.
- **CrewAI**: the new `run_graph()` engine (see Architectural decision above)
  persists `(run_id, node_id, context)` via `save_pause()` after every node
  and on `WorkflowPaused`. `resume_workflow(run_id, decision)` reloads the
  row, injects the decision into context, and calls `run_graph(..., resume_from=node_id)`
  to continue from the correct point.
- **Microsoft Agent Framework**: same `save_pause`/`load_pause` SQLite
  helpers (shared verbatim snippet across CrewAI and MS-AF -- the mechanism
  is framework-agnostic). On `WorkflowPaused`, persist state before raising.
  A `--resume <run_id> --decision "..."` CLI path reconstructs a minimal
  workflow run starting at the persisted node with the decision injected as
  input, using the framework's own `WorkflowBuilder` execution from that
  point (MS-AF's native branching is untouched; only the pause/resume
  bridge is added).
- All three: `python main.py --list-pending` prints any runs currently
  parked in a pause state (run id, node, approver email, age) -- gives an
  operator visibility without needing to query SQLite directly.

### 5. Error handling / retries (3 -> 9)

- `tenacity`-based retry (new dependency, ~10KB, no transitive bloat) wrapping
  LLM calls and `call_http_request`: exponential backoff, retry on
  timeout/connection-error/5xx, **never** retry on 4xx/auth errors (fail
  fast on misconfiguration instead of masking it with retries).
  `LLM_MAX_RETRIES`/`HTTP_MAX_RETRIES` env vars (default 3).
- Typed exceptions (`LLMCallError`, `HTTPStepError`, `ConfigError` from the
  settings loader) instead of bare `except Exception`. `evaluate_condition`'s
  existing fail-closed behavior is kept (never raises into the workflow) but
  now emits a `logger.warning(...)` with the rule and the exception, so a
  silently-mis-routing condition is visible in logs/traces instead of mute.
- Configurable timeouts: `LLM_TIMEOUT_SECONDS` / `HTTP_TIMEOUT_SECONDS` env
  vars (defaults matching today's hardcoded `15.0`), threaded into the
  relevant client constructors/`httpx.Client(timeout=...)`.
- Top-level handler in every `main()`/`_main()`: catches any unhandled
  exception, logs it as a structured error with an OTel error span, prints a
  one-line human-readable summary, exits non-zero -- no raw Python
  traceback as the "user-facing" failure mode.

### 6. Test coverage (0 -> 9)

Full pytest suite per export (confirmed default), generated into
`tests/test_workflow.py`:
- Mocks the provider client (`get_chat_model()`/`get_chat_client()`/
  `get_llm()` monkeypatched to a fake returning a canned response) --
  no network calls, no API key needed to run the suite.
- One test per condition/router branch asserting the correct downstream
  node runs and no other branch's node runs -- this is the exact assertion
  shape that would have caught the CrewAI bug fixed earlier today.
- `evaluate_condition` fail-closed test (malformed rule -> `"false"`, no
  exception, warning logged).
- `call_http_request` tested against a mocked `httpx.Client`
  (`unittest.mock.patch`, no new test-only dependency).
- Pause/resume roundtrip test: trigger the approval pause, assert the SQLite
  row exists with the right node id and context, call `resume_workflow`,
  assert execution continues from the correct node.
- Shipped as `requirements-dev.txt` (pytest, pytest-asyncio for MS-AF's
  async driver) separate from `requirements.txt`, so a production container
  build never installs test tooling.

### 7. Container hygiene (4 -> 9)

- Multi-stage `Dockerfile`: `builder` stage installs dependencies into a
  venv; final stage copies only the venv + app code, on the same
  `python:3.12-slim` patch-pinned base (no floating `:slim` tag).
- Non-root user (`useradd -m appuser`, `USER appuser`) in the final stage.
- `HEALTHCHECK` against the new Foundry wrapper's `/readiness` endpoint
  (the protocol libraries expose this automatically -- no extra code).
- `PYTHONDONTWRITEBYTECODE=1`, `PYTHONUNBUFFERED=1` set as image env.
- `.dockerignore` excludes `.env`, `tests/`, `.git`, `__pycache__`, `*.db`,
  `.pytest_cache`.
- Default `CMD` runs `foundry_main.py` (the containerized/hosted entrypoint);
  `main.py` remains the fast local-CLI entrypoint for `python main.py "..."`
  outside Docker.

### 8. Foundry deployability (3 -> 9)

- **LangGraph**: generate `foundry_main.py` using the real
  `langchain_azure_ai.agents.hosting.ResponsesHostServer`, wrapping the
  now-SQLite-checkpointed `compiled` graph (per Microsoft's documented
  pattern, verified against current docs during the original validation
  pass). New deps: `langchain-azure-ai[hosting]>=1.2.4`, `azure-identity`.
- **MS Agent Framework / CrewAI**: generate `foundry_main.py` using
  `azure-ai-agentserver-responses`. **Open item, not guessed**: the exact
  Python-side handler interface (analogous to the C# `IResponseHandler`
  shown in Microsoft's docs) will be verified via current documentation/
  package inspection at implementation time, not assumed from the C# shape
  -- same discipline that caught the `ChatAgent`/`AzureOpenAIChatClient`
  naming issue in the original export design. If the Python package's
  real API differs materially from what's documented, implementation pauses
  to re-verify rather than shipping a guessed interface.
- Generate `azure.yaml` (the `azd`-recognized descriptor) with
  `codeConfiguration` pointing at `foundry_main.py` and an `env` map using
  the Foundry connection placeholder syntax for secrets.
- README's "Deploying" section shrinks to the real, verified `azd up` flow
  from the prior validation pass, since the generated files now make that
  flow actually work end-to-end instead of requiring manual wrapping.

## Testing plan

1. Regenerate all 3 frameworks' exports for the existing pytest fixtures
   (`_fraud_triage`, `_support_supervisor`, etc.) and confirm `ast.parse()`
   validity, same as the original design's test suite.
2. Extend `test_builder_export.py` with new assertions per dimension:
   OTel imports/spans present, `.gitignore`/`.dockerignore` present,
   `tenacity` retry decorator present, `tests/test_workflow.py` itself is
   valid Python and (where feasible) actually runnable with `pytest` inside
   a throwaway venv, `SqliteSaver`/`save_pause` present, `foundry_main.py`/
   `azure.yaml` present and valid.
3. Real end-to-end run (mirroring the rigor already applied to the base
   export): install the new dependencies in the isolated `C:\aftest\*`
   venvs, run each export's `main.py` against the real Azure OpenAI
   resource, trigger an approval pause, kill and restart the process, and
   confirm `--resume` correctly continues from the persisted checkpoint
   rather than restarting the workflow. Confirm OTel console spans are
   emitted locally. Fix any real issues found, the same way the CrewAI
   branch-dispatch bug and the `agent-framework-core` API-drift issues were
   found and fixed in the base export's validation pass.

## Rollout phases (single spec, one implementation plan, ordered)

- **Phase A** (additive, shared, low risk): secrets hardening, container
  hygiene, error handling/retries, OpenTelemetry.
- **Phase B** (structural): CrewAI graph-engine rewrite, SQLite persistence
  + resume for all 3 frameworks.
- **Phase C** (depends on A+B): Foundry wrapper + `azure.yaml` generation,
  full pytest suite generation (tests exercise retry/persistence behavior
  from Phase A/B, so they're written last).
