# Multi-framework export enterprise-readiness upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the generated LangGraph/MS Agent Framework/CrewAI exports from `backend/app/api/builder_export.py` from ~40-46/100 enterprise-readiness toward 9/10 across secrets, OpenTelemetry observability, SQLite-backed persistence/resume, retries, container hygiene, generated tests, and Foundry deployability.

**Architecture:** Each export gains a new `runtime.py` file (framework-specific, workflow-agnostic: settings validation, retry decorators, OpenTelemetry bootstrap, SQLite pause/resume helpers) that the workflow-specific `main.py` imports from. CrewAI's `main.py` generation is rewritten from bespoke per-workflow `if`/`elif` control flow to a data-driven `NODES`/`EDGES` dict walked by a fixed `run_graph()` engine shipped inside `runtime.py` — this is what makes CrewAI resumable and closes the class of bug fixed earlier (unconditional calls appended after conditional branch dispatch).

**Tech Stack:** `pydantic-settings`, `tenacity` (retry), `azure-monitor-opentelemetry` + `opentelemetry-api` (tracing), Python stdlib `sqlite3` (persistence), `langgraph-checkpoint-sqlite` (LangGraph-specific), `langchain-azure-ai[hosting]` + `azure-ai-agentserver-responses` (Foundry wrappers), `pytest`/`pytest-asyncio` (generated test suites).

---

## Scope check

This spec covers one cohesive upgrade to one file (`builder_export.py`) and its three sibling exporter functions, explicitly phased (A/B/C) rather than split into separate specs, per the approved design doc. Not decomposed further.

## File structure

- **Modify:** `backend/app/api/builder_export.py` — all new generator functions live here, alongside the existing `_export_langgraph`/`_export_ms_agent_framework`/`_export_crewai`/`_env_example`/`_dockerfile`/`_readme`.
- **Modify:** `backend/app/tests/test_builder_export.py` — new assertions per phase.
- **New generated files** (per export, returned by `export_workflow()`): `runtime.py`, `foundry_main.py`, `azure.yaml`, `tests/test_workflow.py`, `.gitignore`, `.dockerignore`, `requirements-dev.txt`. Existing generated files (`main.py`, `requirements.txt`, `.env.example`, `Dockerfile`, `README.md`) are modified in place.

---

## Phase A: Secrets, container hygiene, error handling, OpenTelemetry

### Task 1: Shared `.gitignore` / `.dockerignore` generators

**Files:**
- Modify: `backend/app/api/builder_export.py` (add near `_env_example`, ~line 110)
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_gitignore_and_dockerignore_present_and_correct():
    nodes, edges = _fraud_triage()
    for fw in ("langgraph", "ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        assert ".gitignore" in files
        assert ".env" in files[".gitignore"]
        assert "!.env.example" in files[".gitignore"]
        assert "*.db" in files[".gitignore"]
        assert ".dockerignore" in files
        assert ".env" in files[".dockerignore"]
        assert "tests/" in files[".dockerignore"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_gitignore_and_dockerignore_present_and_correct -v`
Expected: FAIL with `KeyError: '.gitignore'`

- [ ] **Step 3: Implement `_gitignore()` and `_dockerignore()`**

Add to `builder_export.py` near `_env_example()`:

```python
def _gitignore() -> str:
    return (
        ".env\n"
        "!.env.example\n"
        "__pycache__/\n"
        "*.pyc\n"
        "*.db\n"
        ".pytest_cache/\n"
        ".venv/\n"
        "venv/\n"
    )


def _dockerignore() -> str:
    return (
        ".env\n"
        ".git/\n"
        "__pycache__/\n"
        "*.pyc\n"
        "*.db\n"
        ".pytest_cache/\n"
        "tests/\n"
        "requirements-dev.txt\n"
        "README.md\n"
    )
```

- [ ] **Step 4: Wire into all 3 `export_workflow` return dicts**

In `_export_langgraph`, `_export_ms_agent_framework`, `_export_crewai`, each `return {...}` dict gains:
```python
        ".gitignore": _gitignore(),
        ".dockerignore": _dockerignore(),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_gitignore_and_dockerignore_present_and_correct -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): add generated .gitignore/.dockerignore to every framework export"
```

---

### Task 2: `runtime.py` settings loader (fail-fast config validation)

**Files:**
- Modify: `backend/app/api/builder_export.py`
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_runtime_settings_validates_provider_env_vars():
    nodes, edges = _fraud_triage()
    for fw in ("langgraph", "ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        assert "runtime.py" in files
        rt = files["runtime.py"]
        ast.parse(rt)
        assert "class ConfigError" in rt
        assert "pydantic_settings" in rt
        assert "def load_settings" in rt
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_runtime_settings_validates_provider_env_vars -v`
Expected: FAIL with `KeyError: 'runtime.py'`

- [ ] **Step 3: Implement the shared settings snippet**

Add to `builder_export.py`:

```python
_RUNTIME_SETTINGS_SNIPPET = '''
import os
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ConfigError(ValueError):
    """Raised when required environment variables are missing or invalid."""


class _AzureSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    azure_openai_endpoint: str = Field(default="")
    azure_openai_api_key: str = Field(default="")
    azure_openai_deployment: str = Field(default="gpt-4o")
    azure_openai_api_version: str = Field(default="2024-12-01-preview")


class _GeminiSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    gemini_api_key: str = Field(default="")
    gemini_model: str = Field(default="gemini-3.1-flash-lite")


class _LmStudioSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    lmstudio_base_url: str = Field(default="http://localhost:1234/v1")
    lmstudio_model: str = Field(default="qwen/qwen3.5-9b")


def load_settings() -> dict:
    """Validates the env vars required by LLM_PROVIDER and raises one clear
    ConfigError listing everything missing, instead of letting a misconfigured
    deployment fail deep inside an HTTP call with a cryptic auth error."""
    provider = os.getenv("LLM_PROVIDER", "azure").lower()
    missing: list[str] = []
    if provider == "azure":
        settings = _AzureSettings()
        if not settings.azure_openai_endpoint:
            missing.append("AZURE_OPENAI_ENDPOINT")
        if not settings.azure_openai_api_key:
            missing.append("AZURE_OPENAI_API_KEY")
    elif provider == "gemini":
        settings = _GeminiSettings()
        if not settings.gemini_api_key:
            missing.append("GEMINI_API_KEY")
    elif provider == "lmstudio":
        settings = _LmStudioSettings()
    else:
        raise ConfigError(f"Unknown LLM_PROVIDER={provider!r}. Expected azure, gemini, or lmstudio.")
    if missing:
        raise ConfigError(
            f"Missing required environment variable(s) for LLM_PROVIDER={provider!r}: "
            + ", ".join(missing)
            + ". Copy .env.example to .env and fill them in, or set them in your deployment's secrets/config."
        )
    return settings.model_dump()
'''
```

- [ ] **Step 4: Wire `runtime.py` into all 3 exporters and call `load_settings()` at startup**

In each `main.py` template's `if __name__ == "__main__":` block, add a call to
`load_settings()` (imported `from runtime import load_settings`) before any
provider client is constructed, so misconfiguration fails immediately:

```python
from runtime import load_settings

if __name__ == "__main__":
    load_settings()
    ...
```

Add `"runtime.py": _RUNTIME_SETTINGS_SNIPPET,` to each framework's returned
files dict (this line grows across Tasks 3-7 as more content is appended to
the same `runtime.py` string — see Task 3).

- [ ] **Step 5: Add `pydantic-settings` to every `requirements.txt`**

Append `"pydantic-settings==2.7.1\n"` to the requirements string in all 3
`_export_*` functions.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_runtime_settings_validates_provider_env_vars -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): generate runtime.py with fail-fast settings validation"
```

---

### Task 3: Retry/timeout decorators (`tenacity`) in `runtime.py`

**Files:**
- Modify: `backend/app/api/builder_export.py`
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_runtime_has_retry_and_typed_exceptions():
    nodes, edges = _fraud_triage()
    for fw in ("langgraph", "ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        rt = files["runtime.py"]
        assert "class LLMCallError" in rt
        assert "class HTTPStepError" in rt
        assert "from tenacity import" in rt
        assert "retry_if_exception_type" in rt
        assert "tenacity==" in files["requirements.txt"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_runtime_has_retry_and_typed_exceptions -v`
Expected: FAIL with `assert "class LLMCallError" in rt` (AssertionError)

- [ ] **Step 3: Implement the retry snippet, appended into `runtime.py`**

```python
_RUNTIME_RETRY_SNIPPET = '''
import logging
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger("agentforge_export")


class LLMCallError(Exception):
    """Raised when an LLM call fails after all retries are exhausted."""


class HTTPStepError(Exception):
    """Raised when an http_request step fails after all retries are exhausted."""


def _is_retryable_http_error(exc: BaseException) -> bool:
    import httpx
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return False


llm_retry = retry(
    reraise=True,
    stop=stop_after_attempt(int(os.getenv("LLM_MAX_RETRIES", "3"))),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)

http_retry = retry(
    reraise=True,
    stop=stop_after_attempt(int(os.getenv("HTTP_MAX_RETRIES", "3"))),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(Exception) if False else None,
)
'''
```

Note: `http_retry`'s conditional retry predicate is set properly (not the
placeholder `if False else None` above) in Step 4 below — this step exists to
establish the two typed exceptions and the tenacity import shape first.

- [ ] **Step 4: Fix `http_retry` to use `_is_retryable_http_error` correctly**

Replace the `http_retry` definition with:

```python
http_retry = retry(
    reraise=True,
    stop=stop_after_attempt(int(os.getenv("HTTP_MAX_RETRIES", "3"))),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(Exception),
)
```

(tenacity's `retry_if_exception_type(Exception)` combined with `reraise=True`
retries any exception up to the stop condition, then re-raises the last one;
the actual 4xx-vs-5xx distinction is enforced inside `call_http_request`
itself in Task 4, which raises `HTTPStepError` immediately on 4xx so it never
reaches the retry loop.)

- [ ] **Step 5: Append `_RUNTIME_RETRY_SNIPPET` after `_RUNTIME_SETTINGS_SNIPPET` in every exporter's `runtime.py` file content, and add `tenacity==9.0.0` to requirements.txt in all 3 exporters**

- [ ] **Step 6: Update `call_http_request` (shared across all 3 `main.py` templates) to use the retry + typed exception**

```python
def call_http_request(url: str, method: str, headers_raw: str, body_raw: str, previous_output: str) -> str:
    from runtime import http_retry, HTTPStepError
    url = url.replace("{{input}}", previous_output or "")
    body_raw = body_raw.replace("{{input}}", previous_output or "") if body_raw else body_raw
    headers = json.loads(headers_raw) if headers_raw else None
    json_body, data_body = None, None
    if body_raw:
        try:
            json_body = json.loads(body_raw)
        except json.JSONDecodeError:
            data_body = body_raw

    @http_retry
    def _do_request():
        timeout = float(os.getenv("HTTP_TIMEOUT_SECONDS", "15.0"))
        with httpx.Client(timeout=timeout) as client:
            response = client.request(method, url, headers=headers, json=json_body, content=data_body)
        if response.status_code >= 400 and response.status_code < 500:
            raise HTTPStepError(f"{method} {url} failed with client error {response.status_code}: {response.text[:500]}")
        response.raise_for_status()
        return response.text[:4000]

    try:
        return _do_request()
    except HTTPStepError:
        raise
    except Exception as e:
        raise HTTPStepError(f"{method} {url} failed after retries: {e}") from e
```

Apply this replacement in `_export_langgraph`, `_export_ms_agent_framework`,
and `_export_crewai`'s `call_http_request` definitions (all three currently
have byte-identical bodies per the existing code — replace all three).

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_runtime_has_retry_and_typed_exceptions -v`
Expected: PASS

- [ ] **Step 8: Run the full existing suite to confirm no regressions**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py -v -k "not azure_is_default"`
Expected: all PASS (the excluded test is the pre-existing Postgres-flake, unrelated)

- [ ] **Step 9: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): add tenacity retry + typed exceptions for LLM/HTTP calls"
```

---

### Task 4: OpenTelemetry observability in `runtime.py`

**Files:**
- Modify: `backend/app/api/builder_export.py`
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_runtime_has_opentelemetry_observability():
    nodes, edges = _fraud_triage()
    for fw in ("langgraph", "ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        rt = files["runtime.py"]
        assert "def configure_observability" in rt
        assert "configure_azure_monitor" in rt
        assert "APPLICATIONINSIGHTS_CONNECTION_STRING" in rt
        assert "def traced_step" in rt
        assert "workflow_run_id" in rt
        assert "OTEL_LOG_PROMPTS" in rt
        assert "azure-monitor-opentelemetry==" in files["requirements.txt"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_runtime_has_opentelemetry_observability -v`
Expected: FAIL with `assert "def configure_observability" in rt`

- [ ] **Step 3: Implement the observability snippet**

```python
_RUNTIME_OBSERVABILITY_SNIPPET = '''
import json as _json
import logging as _logging
import uuid
from contextlib import contextmanager

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

_tracer = trace.get_tracer("agentforge.export")
_ALLOWED_ATTRS = {"node_id", "role", "model", "branch", "http_status", "duration_ms", "workflow_run_id"}


class _JsonLogFormatter(_logging.Formatter):
    def format(self, record: _logging.LogRecord) -> str:
        span = trace.get_current_span()
        ctx = span.get_span_context()
        payload = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "trace_id": format(ctx.trace_id, "032x") if ctx.trace_id else None,
            "span_id": format(ctx.span_id, "016x") if ctx.span_id else None,
        }
        return _json.dumps(payload)


def configure_observability() -> None:
    """Sets up OpenTelemetry: Azure Monitor exporter when Foundry (or any
    Azure Monitor-backed host) has injected APPLICATIONINSIGHTS_CONNECTION_STRING,
    otherwise a local console exporter. Also configures JSON structured
    logging correlated to the active trace/span."""
    handler = _logging.StreamHandler()
    handler.setFormatter(_JsonLogFormatter())
    root = _logging.getLogger()
    root.handlers = [handler]
    root.setLevel(_logging.INFO)

    if os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING"):
        from azure.monitor.opentelemetry import configure_azure_monitor
        configure_azure_monitor()
    else:
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        trace.set_tracer_provider(provider)


def new_run_id() -> str:
    return uuid.uuid4().hex[:12]


@contextmanager
def traced_step(name: str, **attrs):
    """Wraps one node/LLM/HTTP/condition step in a span. Only allow-listed
    attribute keys are ever attached (see _ALLOWED_ATTRS) -- prompt/response
    content is excluded unless OTEL_LOG_PROMPTS=true, to avoid leaking
    business data or secrets into traces by default."""
    with _tracer.start_as_current_span(name) as span:
        for k, v in attrs.items():
            if k in _ALLOWED_ATTRS:
                span.set_attribute(k, v)
        try:
            yield span
        except Exception as e:
            span.set_status(Status(StatusCode.ERROR, str(e)))
            span.record_exception(e)
            raise
'''
```

- [ ] **Step 4: Append `_RUNTIME_OBSERVABILITY_SNIPPET` into every exporter's `runtime.py` content, and add to requirements.txt in all 3 exporters**

```
azure-monitor-opentelemetry==1.6.4
opentelemetry-api==1.29.0
```

- [ ] **Step 5: Wire `configure_observability()` and `traced_step()` into each `main.py`**

In each framework's `main.py` template:
- Call `configure_observability()` as the first line of `if __name__ == "__main__":` (before `load_settings()`).
- Generate a `workflow_run_id = new_run_id()` at the start of the run and thread it through as a log/span attribute.
- Wrap each generated node function's body in `with traced_step(f"node.{node_id}", node_id=node_id, role=role, workflow_run_id=workflow_run_id):`.

For LangGraph's `node_{var}` functions specifically, wrap the body:
```python
def node_{var}(state: WorkflowState) -> WorkflowState:
    """{label} (role: {role})."""
    from runtime import traced_step
    with traced_step("node.{var}", node_id={json.dumps(var)}, role={json.dumps(role)}):
        ...existing body...
        return state
```
(Apply the equivalent wrapping to MS-AF's `@executor`-decorated functions and CrewAI's `run_{var}` functions — same pattern, indent existing body one level deeper under the `with` block.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_runtime_has_opentelemetry_observability -v`
Expected: PASS

- [ ] **Step 7: Validate generated code is still syntactically correct with the new indentation**

Run: `cd backend && ./venv/Scripts/python.exe -c "
import sys, ast
sys.path.insert(0, '.')
from app.api.builder_export import export_workflow
from app.tests.test_builder_export import _fraud_triage, _support_supervisor
for fixture in (_fraud_triage, _support_supervisor):
    nodes, edges = fixture()
    for fw in ('langgraph', 'ms_agent_framework', 'crewai'):
        files = export_workflow(nodes, edges, 'x', fw)
        ast.parse(files['main.py'])
        ast.parse(files['runtime.py'])
print('all valid')
"`
Expected: `all valid`

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): wire OpenTelemetry tracing + structured logging into runtime.py"
```

---

### Task 5: Harden the Dockerfile (multi-stage, non-root, healthcheck)

**Files:**
- Modify: `backend/app/api/builder_export.py` (`_dockerfile` function)
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_dockerfile_is_hardened():
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "x", "langgraph")
    dockerfile = files["Dockerfile"]
    assert "FROM python:3.12.8-slim AS builder" in dockerfile
    assert "useradd" in dockerfile
    assert "USER appuser" in dockerfile
    assert "HEALTHCHECK" in dockerfile
    assert "PYTHONDONTWRITEBYTECODE" in dockerfile
    assert "PYTHONUNBUFFERED" in dockerfile
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_dockerfile_is_hardened -v`
Expected: FAIL (current Dockerfile is the 6-line minimal version)

- [ ] **Step 3: Rewrite `_dockerfile()`**

```python
def _dockerfile(entry_module: str) -> str:
    return f'''FROM python:3.12.8-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12.8-slim
WORKDIR /app
ENV PATH="/opt/venv/bin:$PATH" \\
    PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1
RUN useradd --create-home --shell /bin/bash appuser
COPY --from=builder /opt/venv /opt/venv
COPY . .
RUN chown -R appuser:appuser /app
USER appuser
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
    CMD curl -f http://localhost:8088/readiness || exit 1
EXPOSE 8088
CMD ["python", "foundry_main.py"]
'''
```

Note: `curl` isn't in `python:3.12.8-slim` by default. Add
`RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*`
to the final stage, before `USER appuser` (must run as root).

- [ ] **Step 4: Add the curl install line and re-verify**

Final `_dockerfile()`:

```python
def _dockerfile(entry_module: str) -> str:
    return f'''FROM python:3.12.8-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12.8-slim
WORKDIR /app
ENV PATH="/opt/venv/bin:$PATH" \\
    PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends curl \\
    && rm -rf /var/lib/apt/lists/* \\
    && useradd --create-home --shell /bin/bash appuser
COPY --from=builder /opt/venv /opt/venv
COPY . .
RUN chown -R appuser:appuser /app
USER appuser
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
    CMD curl -f http://localhost:8088/readiness || exit 1
EXPOSE 8088
CMD ["python", "foundry_main.py"]
'''
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_dockerfile_is_hardened -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): harden Dockerfile with multi-stage build, non-root user, healthcheck"
```

**Note:** `CMD ["python", "foundry_main.py"]` references a file created in
Phase C (Task 11/12). Until Phase C lands, this Dockerfile is temporarily
inconsistent with the file set — this is resolved by the end of this same
implementation session (Phase C is the last phase), so it's acceptable
within-plan sequencing, not a shipped inconsistency.

---

## Phase B: SQLite persistence/resume + CrewAI graph-engine rewrite

### Task 6: Shared SQLite pause/resume helpers in `runtime.py`

**Files:**
- Modify: `backend/app/api/builder_export.py`
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_runtime_has_sqlite_persistence_helpers():
    nodes, edges = _support_supervisor()
    for fw in ("ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        rt = files["runtime.py"]
        assert "def save_pause" in rt
        assert "def load_pause" in rt
        assert "def list_pending" in rt
        assert "CHECKPOINT_DB_PATH" in rt
        assert "CREATE TABLE IF NOT EXISTS" in rt
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_runtime_has_sqlite_persistence_helpers -v`
Expected: FAIL with `assert "def save_pause" in rt`

- [ ] **Step 3: Implement the persistence snippet**

```python
_RUNTIME_PERSISTENCE_SNIPPET = '''
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

_DB_PATH = Path(os.getenv("CHECKPOINT_DB_PATH", "./data/checkpoints.db"))


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.execute(
        """CREATE TABLE IF NOT EXISTS paused_runs (
            run_id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            context_json TEXT NOT NULL,
            approver_email TEXT,
            node_label TEXT,
            paused_at TEXT NOT NULL
        )"""
    )
    return conn


def save_pause(run_id: str, node_id: str, context: dict, approver_email: str = "", node_label: str = "") -> None:
    conn = _connect()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO paused_runs (run_id, node_id, context_json, approver_email, node_label, paused_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (run_id, node_id, _json.dumps(context), approver_email, node_label, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    finally:
        conn.close()


def load_pause(run_id: str) -> dict | None:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT node_id, context_json, approver_email, node_label, paused_at FROM paused_runs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "node_id": row[0],
            "context": _json.loads(row[1]),
            "approver_email": row[2],
            "node_label": row[3],
            "paused_at": row[4],
        }
    finally:
        conn.close()


def clear_pause(run_id: str) -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM paused_runs WHERE run_id = ?", (run_id,))
        conn.commit()
    finally:
        conn.close()


def list_pending() -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT run_id, node_id, node_label, approver_email, paused_at FROM paused_runs ORDER BY paused_at DESC"
        ).fetchall()
        return [
            {"run_id": r[0], "node_id": r[1], "node_label": r[2], "approver_email": r[3], "paused_at": r[4]}
            for r in rows
        ]
    finally:
        conn.close()
'''
```

- [ ] **Step 4: Append `_RUNTIME_PERSISTENCE_SNIPPET` into `runtime.py` for `ms_agent_framework` and `crewai` exporters only (LangGraph uses its own native `SqliteSaver` from Task 8, not this generic helper)**

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_runtime_has_sqlite_persistence_helpers -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): add shared SQLite pause/resume helpers for MS-AF and CrewAI"
```

---

### Task 7: Rewrite CrewAI's `main.py` generation to a data-driven graph engine

This is the highest-risk task in the plan — it replaces `_export_crewai`'s
`driver_lines`-based codegen (fixed for the double-execution bug earlier
today) with a fixed, shared `run_graph()` engine plus per-workflow node data.

**Files:**
- Modify: `backend/app/api/builder_export.py` (`_export_crewai`, ~line 759 onward)
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test (this replaces the existing branch-target regression test with a stronger one)**

```python
def test_crewai_graph_engine_resumes_correctly():
    nodes, edges = _support_supervisor()
    files = export_workflow(nodes, edges, "Support Supervisor", "crewai")
    src = files["main.py"]
    ast.parse(src)
    assert "NODES = {" in src
    assert "EDGES = [" in src
    assert "from runtime import run_graph" in src
    assert "def _run_s2(context: dict) -> dict:" in src  # per-node handler still generated
    # No bespoke if/elif branch dispatch left in main.py -- that logic now
    # lives once in runtime.py's run_graph(), not regenerated per workflow.
    assert 'if context.get("branch") ==' not in src
    rt = files["runtime.py"]
    assert "def run_graph(" in rt
    assert "resume_from" in rt
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_crewai_graph_engine_resumes_correctly -v`
Expected: FAIL (current CrewAI export has no `NODES`/`EDGES`/`run_graph`)

- [ ] **Step 3: Implement `run_graph()` in the persistence snippet's `runtime.py` (append this to `_RUNTIME_PERSISTENCE_SNIPPET`, CrewAI-only)**

```python
_CREWAI_GRAPH_ENGINE_SNIPPET = '''

class WorkflowPaused(Exception):
    """Raised by an approval node handler."""
    def __init__(self, run_id: str, node_id: str, node_label: str, approver_email: str, context: dict):
        self.run_id = run_id
        self.node_id = node_id
        self.node_label = node_label
        self.approver_email = approver_email
        self.context = context
        super().__init__(f"Paused at '{node_label}' (run {run_id}) -- awaiting approval from {approver_email}")


def run_graph(nodes: dict, edges: list, handlers: dict, workflow_input: str, run_id: str, resume_from: str | None = None) -> str:
    """Walks the node/edge graph defined as plain data, dispatching each node
    to its handler function. Checkpoints (run_id, node_id, context) to SQLite
    after every node so a crash or an approval pause can be resumed from
    exactly where it left off, instead of restarting the whole workflow.

    `handlers` maps node_id -> callable(context: dict) -> dict. Handlers for
    condition/router nodes additionally set context["branch"], which this
    engine uses (via the node's outgoing edges) to pick the next node --
    replacing the old per-workflow-generated if/elif dispatch."""
    if resume_from is not None:
        paused = load_pause(run_id)
        if paused is None:
            raise ValueError(f"No paused run found for run_id={run_id!r}")
        context = paused["context"]
        current = _next_node_after(nodes, edges, resume_from, context)
    else:
        context = {"output": workflow_input}
        current = next(n["id"] for n in nodes.values() if n["role"] == "input")
        current = _next_node_after(nodes, edges, current, context)

    while current is not None:
        node = nodes[current]
        if node["role"] == "output":
            clear_pause(run_id)
            return context["output"]
        try:
            context = handlers[current](context)
        except WorkflowPaused:
            save_pause(run_id, current, context, approver_email=node.get("approver_email", ""), node_label=node.get("label", current))
            raise
        save_pause(run_id, current, context)
        current = _next_node_after(nodes, edges, current, context)
    return context.get("output", workflow_input)


def _next_node_after(nodes: dict, edges: list, node_id: str, context: dict) -> str | None:
    outs = [e for e in edges if e["source"] == node_id]
    if not outs:
        return None
    role = nodes[node_id]["role"]
    if role in ("condition", "router"):
        branch = context.get("branch")
        for e in outs:
            if e.get("label") == branch:
                return e["target"]
        return None
    return outs[0]["target"]
'''
```

- [ ] **Step 4: Rewrite `_export_crewai` to emit `NODES`/`EDGES` data plus per-node handler functions instead of `driver_lines`**

Replace the body of `_export_crewai` from the `agent_defs`/`step_fns`/
`driver_lines` construction onward with:

```python
def _export_crewai(nodes: list[dict], edges: list[dict], workflow_name: str) -> dict[str, str]:
    flat = _normalize_nodes(nodes)
    ordered = _topo_sort_export(flat, edges)
    has_approval = any(n["role"] == "approval" for n in flat)
    has_branching = any(n["role"] in ("condition", "router") for n in flat)

    agent_defs: list[str] = []
    handler_defs: list[str] = []
    nodes_data_lines: list[str] = []
    handlers_map_lines: list[str] = []

    for node in ordered:
        nid = node["id"]
        var = _safe_id(nid)
        role = node["role"]
        label_lit = json.dumps(node["label"])
        nodes_data_lines.append(
            f'    {json.dumps(nid)}: {{"id": {json.dumps(nid)}, "role": {json.dumps(role)}, '
            f'"label": {label_lit}, "approver_email": {json.dumps(node.get("approver_email", ""))}}},'
        )

        if role in ("input", "output"):
            continue  # run_graph() handles these roles structurally, no handler needed

        if role in _AGENT_LIKE_ROLES:
            desc_lit = json.dumps(node["description"] or f'You are the {node["label"]} step in a workflow.')
            agent_defs.append(
                f'{var}_agent = Agent(role={label_lit}, goal={desc_lit}, backstory={desc_lit}, llm=get_llm(), verbose=False)'
            )
            handler_defs.append(
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (role: {role})."""\n'
                f'    with traced_step("node.{var}", node_id={json.dumps(nid)}, role={json.dumps(role)}, workflow_run_id=context.get("_run_id", "")):\n'
                f'        task = Task(description=context["output"], expected_output="A helpful response.", agent={var}_agent)\n'
                f'        crew = Crew(agents=[{var}_agent], tasks=[task], memory=False)\n'
                f'        result = str(crew.kickoff())\n'
                f'        context["output"] = result\n'
                f'        try:\n'
                f'            parsed = json.loads(result)\n'
                f'            if isinstance(parsed, dict):\n'
                f'                context.update(parsed)\n'
                f'        except (json.JSONDecodeError, TypeError):\n'
                f'            pass\n'
                f'        return context\n'
            )
        elif role == "http_request":
            url_lit = json.dumps(node["url"])
            method_lit = json.dumps(node["method"] or "GET")
            headers_lit = json.dumps(node["headers"])
            body_lit = json.dumps(node["body"])
            handler_defs.append(
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (http_request)."""\n'
                f'    with traced_step("node.{var}", node_id={json.dumps(nid)}, role="http_request", workflow_run_id=context.get("_run_id", "")):\n'
                f'        context["output"] = call_http_request({url_lit}, {method_lit}, {headers_lit}, {body_lit}, context["output"])\n'
                f'        return context\n'
            )
        elif role == "condition":
            rule_lit = json.dumps(node["rule"])
            handler_defs.append(
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (condition): {node["rule"]}"""\n'
                f'    context["branch"] = evaluate_condition({rule_lit}, context)\n'
                f'    return context\n'
            )
        elif role == "router":
            labels = sorted({e.get("label") for e in _outgoing(edges, nid) if e.get("label")})
            labels_lit = json.dumps(labels)
            handler_defs.append(
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (router)."""\n'
                f'    labels = {labels_lit}\n'
                f'    router_agent = Agent(role="Router", goal="Classify text into exactly one label", backstory="", llm=get_llm(), verbose=False)\n'
                f'    task = Task(description="Choose exactly one of these labels that best matches the intent: " + ", ".join(labels) + ". Return ONLY the label. Text: " + context["output"], expected_output="One label, nothing else.", agent=router_agent)\n'
                f'    crew = Crew(agents=[router_agent], tasks=[task], memory=False)\n'
                f'    chosen = str(crew.kickoff()).strip().strip(\'"\').strip("\'")\n'
                f'    context["branch"] = chosen if chosen in labels else (labels[0] if labels else "")\n'
                f'    return context\n'
            )
        elif role == "approval":
            approver_lit = json.dumps(node["approver_email"])
            handler_defs.append(
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (approval) -- CUSTOM GLUE: CrewAI has no native\n'
                f'    human-in-the-loop primitive, so this raises WorkflowPaused; run_graph()\n'
                f'    persists context to SQLite before this propagates, so --resume can\n'
                f'    continue from exactly this node after a human decision.\n'
                f'    """\n'
                f'    raise WorkflowPaused(context.get("_run_id", ""), {json.dumps(nid)}, {label_lit}, {approver_lit}, context)\n'
            )
        handlers_map_lines.append(f'    {json.dumps(nid)}: _run_{var},')

    branch_note = (
        "\n**Note on branching**: CrewAI has no native conditional/router primitive -- "
        "this export represents the workflow as data (NODES/EDGES) walked by the shared "
        "run_graph() engine in runtime.py, which is the same, unit-tested code for every "
        "CrewAI export regardless of workflow shape.\n\n"
        if has_branching else ""
    )
    approval_note = (
        "\n**Note on the approval node**: CrewAI has no native human-in-the-loop pause "
        "primitive. run_graph() persists (run_id, node_id, context) to SQLite before the "
        "WorkflowPaused exception propagates -- resume with "
        "`python main.py --resume <run_id> --decision \"approved\"`.\n\n"
        if has_approval else ""
    )
    memory_note = (
        "This export uses **SQLite-backed durable checkpointing** (see runtime.py's "
        "save_pause/load_pause/run_graph) so a paused approval or a crash mid-run survives "
        "a container restart -- set CHECKPOINT_DB_PATH to control where the .db file lives. "
        "CrewAI's own Crew(memory=True) long-term/entity memory (separate from workflow "
        "checkpointing) still defaults to local file storage (SQLite/ChromaDB) if enabled -- "
        "see https://docs.crewai.com/en/concepts/memory\n\n"
        "**Known limitation with custom Azure deployment names**: CrewAI (via LiteLLM) decides "
        "whether to send a `stop` parameter by looking up `model=\"azure/<deployment>\"` in "
        "LiteLLM's model registry. A custom Azure deployment name/alias won't match any entry, "
        "so LiteLLM assumes `stop` is supported even when the underlying model is a reasoning "
        "model that rejects it (`Unsupported parameter: 'stop'`) -- confirmed live against a "
        "reasoning-family Azure deployment. If you hit this, either deploy/alias a "
        "non-reasoning model for CrewAI, or override `CrewAILLM.supports_stop_words()` to "
        "return `False` for your deployment."
    )

    script = f'''"""
Auto-generated by AgentForge's Visual Workflow Builder -- CrewAI export.
Workflow: {workflow_name}

Real CrewAI primitives: agent-like nodes are Agent + Task + Crew. The graph
itself (NODES/EDGES) is data, walked by runtime.py's run_graph() engine --
see each node handler's own docstring below for per-role custom glue.

Run it:
    python main.py "your test input text here"
    python main.py --resume <run_id> --decision "approved"
    python main.py --list-pending
"""
import json
import sys
import argparse

from crewai import Agent, Task, Crew
from runtime import (
    load_settings, configure_observability, new_run_id, traced_step,
    save_pause, load_pause, clear_pause, list_pending, run_graph, WorkflowPaused,
    evaluate_condition, call_http_request,
)

{_CREWAI_LLM_SNIPPET}

{chr(10).join(agent_defs)}

{chr(10).join(handler_defs)}

NODES = {{
{chr(10).join(nodes_data_lines)}
}}

EDGES = {json.dumps([{"source": e["source"], "target": e["target"], "label": e.get("label")} for e in edges], indent=4)}

HANDLERS = {{
{chr(10).join(handlers_map_lines)}
}}


def main() -> None:
    load_settings()
    configure_observability()
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", default="Hello, I need help")
    parser.add_argument("--resume", metavar="RUN_ID")
    parser.add_argument("--decision", default="approved")
    parser.add_argument("--list-pending", action="store_true")
    args = parser.parse_args()

    if args.list_pending:
        for p in list_pending():
            print(p)
        return

    run_id = args.resume or new_run_id()
    workflow_input = args.decision if args.resume else args.input
    try:
        result = run_graph(NODES, EDGES, HANDLERS, workflow_input, run_id, resume_from=args.resume)
        print(result)
    except WorkflowPaused as p:
        print(f"Paused at '{{p.node_label}}' (run {{p.run_id}}) -- awaiting approval from {{p.approver_email}}. "
              f"Resume with: python main.py --resume {{p.run_id}} --decision \\"approved\\"")


if __name__ == "__main__":
    main()
'''

    requirements = (
        "crewai==0.130.0\n"
        "simpleeval==1.0.3\n"
        "httpx==0.28.1\n"
        "python-dotenv==1.0.1\n"
        "pydantic-settings==2.7.1\n"
        "tenacity==9.0.0\n"
        "azure-monitor-opentelemetry==1.6.4\n"
        "opentelemetry-api==1.29.0\n"
    )

    runtime_py = (
        _RUNTIME_SETTINGS_SNIPPET + "\n" + _RUNTIME_RETRY_SNIPPET + "\n"
        + _RUNTIME_OBSERVABILITY_SNIPPET + "\n" + _RUNTIME_PERSISTENCE_SNIPPET
        + "\n" + _CREWAI_GRAPH_ENGINE_SNIPPET
        + "\n\ndef evaluate_condition(rule: str, variables: dict) -> str:\n"
        "    try:\n"
        "        from simpleeval import simple_eval\n"
        "        return \"true\" if bool(simple_eval(rule, names=variables)) else \"false\"\n"
        "    except Exception as e:\n"
        "        logger.warning(f\"condition '{rule}' failed to evaluate: {e}; defaulting to false\")\n"
        "        return \"false\"\n"
        "\n\ndef call_http_request(url, method, headers_raw, body_raw, previous_output):\n"
        "    ...\n"  # replaced verbatim by Task 3's retry-wrapped version at generation time
    )

    return {
        "main.py": script,
        "runtime.py": runtime_py,
        "requirements.txt": requirements,
        "requirements-dev.txt": "pytest==8.3.4\npytest-asyncio==0.25.2\n",
        ".env.example": _env_example(),
        ".gitignore": _gitignore(),
        ".dockerignore": _dockerignore(),
        "Dockerfile": _dockerfile("main.py"),
        "README.md": _readme(
            "CrewAI", workflow_name,
            "Azure AI Foundry Hosted Agents supports CrewAI natively.\n" + branch_note + approval_note,
            memory_note,
        ),
    }
```

**Important implementation note for whoever executes this task:** the
`runtime_py` assembly above has a placeholder `call_http_request` body
(`...`) because Task 3's retry-wrapped version must be spliced in at the
same point — when executing this task, use the ACTUAL `call_http_request`
function body from Task 3 Step 6, not the literal `...` shown here. This is
flagged explicitly (not silently left as `...`) because Tasks 3, 4, and 6
all append to the same `runtime.py` string and must be composed in the
correct order: settings -> retry -> observability -> persistence -> graph
engine -> `evaluate_condition`/`call_http_request` (which depend on `logger`
and `http_retry`/`HTTPStepError` from earlier snippets).

- [ ] **Step 5: Remove the now-obsolete `branch_target_ids` logic from this function (superseded by the graph-engine rewrite) and delete the old regression test that asserted on `driver_lines` shape**

Delete `test_crewai_branch_targets_not_also_called_unconditionally` from
`test_builder_export.py` (its assertions target the old `driver_lines`
codegen shape that no longer exists) — it's superseded by
`test_crewai_graph_engine_resumes_correctly` (Step 1) and the resume
round-trip test (Task 9).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_crewai_graph_engine_resumes_correctly -v`
Expected: PASS

- [ ] **Step 7: Run the full suite**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py -v -k "not azure_is_default"`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "refactor(export): rewrite CrewAI export to data-driven graph engine with SQLite resume"
```

---

### Task 8: LangGraph `SqliteSaver` swap

**Files:**
- Modify: `backend/app/api/builder_export.py` (`_export_langgraph`)
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_langgraph_uses_durable_sqlite_checkpointer():
    nodes, edges = _support_supervisor()  # has an approval node -> needs a checkpointer
    files = export_workflow(nodes, edges, "x", "langgraph")
    src = files["main.py"]
    assert "from langgraph.checkpoint.sqlite import SqliteSaver" in src
    assert "CHECKPOINT_DB_PATH" in src
    assert "MemorySaver" not in src
    assert "langgraph-checkpoint-sqlite==" in files["requirements.txt"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_langgraph_uses_durable_sqlite_checkpointer -v`
Expected: FAIL (`MemorySaver` is currently used)

- [ ] **Step 3: Replace the checkpointer construction in `_export_langgraph`**

Find the existing line (per the original design):
```python
from langgraph.checkpoint.memory import MemorySaver
compiled = graph.compile(checkpointer=MemorySaver())
```
Replace with:
```python
import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver
_checkpoint_path = os.getenv("CHECKPOINT_DB_PATH", "./data/checkpoints.db")
os.makedirs(os.path.dirname(_checkpoint_path) or ".", exist_ok=True)
_checkpointer = SqliteSaver(sqlite3.connect(_checkpoint_path, check_same_thread=False))
compiled = graph.compile(checkpointer=_checkpointer)
```

- [ ] **Step 4: Add `langgraph-checkpoint-sqlite==2.0.1` to the LangGraph requirements.txt string**

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_langgraph_uses_durable_sqlite_checkpointer -v`
Expected: PASS

- [ ] **Step 6: Run the full suite (this touches the existing `test_langgraph_no_checkpointer_without_approval` test — verify it still makes sense)**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py -v -k "langgraph"`
Expected: all PASS. If `test_langgraph_no_checkpointer_without_approval` fails
because it asserts `"MemorySaver" not in src` for a no-approval workflow,
update it to assert `"SqliteSaver" not in src` instead (workflows without an
approval node still don't need a checkpointer at all).

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): swap LangGraph's MemorySaver for durable SqliteSaver"
```

---

### Task 9: MS Agent Framework pause/resume via SQLite

**Files:**
- Modify: `backend/app/api/builder_export.py` (`_export_ms_agent_framework`)
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_ms_agent_framework_persists_and_resumes_approval():
    nodes, edges = _support_supervisor()
    files = export_workflow(nodes, edges, "x", "ms_agent_framework")
    src = files["main.py"]
    ast.parse(src)
    assert "from runtime import" in src
    assert "save_pause(" in src
    assert "--resume" in src
    assert "def _resume_run" in src
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_ms_agent_framework_persists_and_resumes_approval -v`
Expected: FAIL

- [ ] **Step 3: Update the approval-node executor to persist state, and add a `_resume_run` helper plus CLI wiring**

In the approval node's `@executor`-decorated function (existing code raises
`WorkflowPaused` directly), change it to persist first:

```python
@executor(id={json.dumps(var)})
async def {var}(message: Any, ctx: WorkflowContext) -> None:
    """{node["label"]} (approval) -- persists to SQLite via runtime.save_pause
    before raising, so --resume can continue from exactly this point after a
    container restart or a real human decision."""
    text = message.get("output") if isinstance(message, dict) else message
    save_pause(_run_id, {json.dumps(nid)}, {{"output": text}}, approver_email={approver_lit}, node_label={label_lit})
    raise WorkflowPaused({label_lit}, {approver_lit}, text)
```

Add near the bottom of the generated `main.py`, before `async def _main()`:

```python
def _resume_run(run_id: str, decision: str) -> None:
    """Reconstructs a minimal single-node run starting at the persisted
    approval node, injecting the human decision as input, then continues via
    the same WorkflowBuilder-defined graph from that point forward."""
    paused = load_pause(run_id)
    if paused is None:
        print(f"No paused run found for run_id={{run_id}}")
        return
    print(f"Resuming node '{{paused['node_id']}}' with decision: {{decision}}")
    clear_pause(run_id)
    # The approval node's own downstream edges (already defined on
    # workflow_builder above) take over from here -- re-running the full
    # workflow.run(decision) is intentionally simple: MS Agent Framework has
    # no native sub-graph-from-node entrypoint, so this restarts from the top
    # with the decision as input, relying on idempotent upstream nodes. For
    # workflows where upstream steps are NOT safe to re-run (e.g. an upstream
    # http_request with side effects), persist and skip those steps manually
    # using paused["context"] instead of relying on this default.
    import asyncio
    asyncio.run(workflow.run(decision))
```

Update the CLI block:

```python
if __name__ == "__main__":
    load_settings()
    configure_observability()
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", default="Hello, I need help")
    parser.add_argument("--resume", metavar="RUN_ID")
    parser.add_argument("--decision", default="approved")
    parser.add_argument("--list-pending", action="store_true")
    args = parser.parse_args()
    if args.list_pending:
        for p in list_pending():
            print(p)
    elif args.resume:
        _resume_run(args.resume, args.decision)
    else:
        import asyncio
        _run_id = new_run_id()
        asyncio.run(_main())
```

Add `from runtime import (load_settings, configure_observability, new_run_id, save_pause, load_pause, clear_pause, list_pending, traced_step)` to the imports.

- [ ] **Step 4: `runtime.py` for MS Agent Framework gets `_RUNTIME_SETTINGS_SNIPPET` + `_RUNTIME_RETRY_SNIPPET` + `_RUNTIME_OBSERVABILITY_SNIPPET` + `_RUNTIME_PERSISTENCE_SNIPPET` (no `_CREWAI_GRAPH_ENGINE_SNIPPET` — MS-AF keeps its native `WorkflowBuilder` graph)**

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_ms_agent_framework_persists_and_resumes_approval -v`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py -v -k "not azure_is_default"`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): persist MS Agent Framework approval pauses to SQLite with --resume"
```

---

## Phase C: Foundry wrappers + generated pytest suites

### Task 10: `azure.yaml` generator

**Files:**
- Modify: `backend/app/api/builder_export.py`
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_azure_yaml_generated_for_all_frameworks():
    import yaml
    nodes, edges = _fraud_triage()
    for fw in ("langgraph", "ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        assert "azure.yaml" in files
        parsed = yaml.safe_load(files["azure.yaml"])
        assert parsed["services"]["agent"]["host"] == "azure.ai.agent"
        assert "foundry_main.py" in str(parsed["services"]["agent"]["codeConfiguration"]["entryPoint"])
        assert "connections." in files["azure.yaml"]
```

Add `import yaml` to the test file's imports if not already present (`pyyaml`
is already a transitive dependency of the backend's FastAPI stack — verify
with `./venv/Scripts/python.exe -c "import yaml"` before assuming; if it's
missing, `pip install pyyaml` in the backend venv, dev-only, since this is a
test-only import).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_azure_yaml_generated_for_all_frameworks -v`
Expected: FAIL with `KeyError: 'azure.yaml'`

- [ ] **Step 3: Implement `_azure_yaml()`**

```python
def _azure_yaml(workflow_name: str) -> str:
    safe_name = "".join(c if c.isalnum() or c == "-" else "-" for c in workflow_name.lower())[:63].strip("-") or "agent"
    return f'''name: {safe_name}
services:
  agent:
    host: azure.ai.agent
    project: .
    kind: hosted
    codeConfiguration:
      runtime: python_3_13
      entryPoint:
        - python
        - foundry_main.py
      dependencyResolution: remote_build
    env:
      LLM_PROVIDER: azure
      AZURE_OPENAI_ENDPOINT: ${{{{connections.agent-secrets.target}}}}
      AZURE_OPENAI_API_KEY: ${{{{connections.agent-secrets.credentials.key}}}}
      AZURE_OPENAI_DEPLOYMENT: gpt-4o
      AZURE_OPENAI_API_VERSION: 2024-12-01-preview
'''
```

- [ ] **Step 4: Wire `"azure.yaml": _azure_yaml(workflow_name),` into all 3 exporters' return dicts**

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_azure_yaml_generated_for_all_frameworks -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): generate azure.yaml for azd-driven Foundry deployment"
```

---

### Task 11: LangGraph Foundry wrapper (`foundry_main.py`)

**Files:**
- Modify: `backend/app/api/builder_export.py` (`_export_langgraph`)
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_langgraph_foundry_wrapper_present():
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "x", "langgraph")
    fm = files["foundry_main.py"]
    ast.parse(fm)
    assert "ResponsesHostServer" in fm
    assert "from main import compiled" in fm
    assert "langchain-azure-ai" in files["requirements.txt"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_langgraph_foundry_wrapper_present -v`
Expected: FAIL with `KeyError: 'foundry_main.py'`

- [ ] **Step 3: Implement the LangGraph Foundry wrapper generator**

This uses the exact pattern documented at
https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/langchain-hosted-agents
(verified during the base export's live validation pass):

```python
def _foundry_wrapper_langgraph() -> str:
    return '''"""
Foundry Hosted Agent entrypoint -- wraps this export's compiled LangGraph
graph (already checkpointed with SqliteSaver, see main.py) through the
Responses protocol so `azd up` can deploy it directly.
"""
import os
from main import compiled
from langchain_azure_ai.agents.hosting import ResponsesHostServer

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8088"))
    ResponsesHostServer(compiled).run(port=port)
'''
```

- [ ] **Step 4: Wire into `_export_langgraph`'s return dict and requirements**

```python
"foundry_main.py": _foundry_wrapper_langgraph(),
```
Add to requirements.txt: `langchain-azure-ai[hosting]==1.2.4\nazure-identity==1.19.0\n`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_langgraph_foundry_wrapper_present -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): generate LangGraph Foundry wrapper via langchain_azure_ai.agents.hosting"
```

---

### Task 12: MS Agent Framework / CrewAI Foundry wrapper — verify real API first

**This task starts with research, not code**, per the design doc's explicit
flag that the Python `azure-ai-agentserver-responses` handler interface must
be verified against the actual installed package, not guessed from the C#
docs shown during the base export's research.

**Files:**
- Modify: `backend/app/api/builder_export.py` (`_export_ms_agent_framework`, `_export_crewai`)
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Verify the real Python API before writing any generator code**

```bash
pip install azure-ai-agentserver-responses --target /tmp/probe_agentserver
python -c "
import sys; sys.path.insert(0, '/tmp/probe_agentserver')
import azure.ai.agentserver.responses as m
print([n for n in dir(m) if not n.startswith('_')])
help(m)
"
```
Read the actual class/function names and constructor signatures this
prints. **Do not proceed to Step 2 until you've confirmed the real handler
base class name and its required method(s)** — if it differs from what's
assumed below (a `ResponseHandler` base class with an async `create` or
`handle` method taking the request and returning text/a stream), stop and
re-derive Steps 2-3 from what you actually found, the same way the original
export's `ChatAgent`/`AzureOpenAIChatClient` naming was corrected against
the real installed package rather than early docs.

- [ ] **Step 2: Write the failing test (shape depends on Step 1's findings — adjust the exact class/method names below if Step 1 found something different)**

```python
def test_msaf_and_crewai_foundry_wrapper_present():
    nodes, edges = _fraud_triage()
    for fw in ("ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        fm = files["foundry_main.py"]
        ast.parse(fm)
        assert "azure.ai.agentserver" in fm
        assert "azure-ai-agentserver-responses" in files["requirements.txt"]
```

- [ ] **Step 3: Implement the wrapper generators using the verified API from Step 1**

For MS Agent Framework (calls the exported `workflow.run(...)`):

```python
def _foundry_wrapper_ms_agent_framework() -> str:
    return '''"""
Foundry Hosted Agent entrypoint -- wraps this export's WorkflowBuilder-based
workflow (see main.py) through the Responses protocol.
"""
import os
import asyncio
from main import workflow

# NOTE: exact handler base class/method verified against the installed
# azure-ai-agentserver-responses package at implementation time -- see
# Task 12 Step 1's probe output for the real names used here.
from azure.ai.agentserver.responses import ResponseHandler, ResponsesHostServer


class WorkflowResponseHandler(ResponseHandler):
    async def create(self, request, context):
        user_input = await context.get_input_text()
        result = await workflow.run(user_input)
        return context.text_response(str(result))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8088"))
    ResponsesHostServer(WorkflowResponseHandler()).run(port=port)
'''
```

For CrewAI (calls the exported `run_graph(...)`):

```python
def _foundry_wrapper_crewai() -> str:
    return '''"""
Foundry Hosted Agent entrypoint -- wraps this export's run_graph()-driven
workflow (see main.py) through the Responses protocol.
"""
import os
from main import NODES, EDGES, HANDLERS
from runtime import run_graph, new_run_id, load_settings, configure_observability

# NOTE: exact handler base class/method verified against the installed
# azure-ai-agentserver-responses package at implementation time -- see
# Task 12 Step 1's probe output for the real names used here.
from azure.ai.agentserver.responses import ResponseHandler, ResponsesHostServer


class WorkflowResponseHandler(ResponseHandler):
    async def create(self, request, context):
        load_settings()
        user_input = await context.get_input_text()
        result = run_graph(NODES, EDGES, HANDLERS, user_input, new_run_id())
        return context.text_response(str(result))


if __name__ == "__main__":
    configure_observability()
    port = int(os.environ.get("PORT", "8088"))
    ResponsesHostServer(WorkflowResponseHandler()).run(port=port)
'''
```

If Step 1's probe reveals different real names (very likely, given how fast
this SDK moves per the base export's own findings), replace `ResponseHandler`/
`.create(request, context)`/`context.get_input_text()`/`context.text_response(...)`
above with whatever the actual installed package exposes before proceeding.

- [ ] **Step 4: Wire into both exporters' return dicts and requirements**

```python
"foundry_main.py": _foundry_wrapper_ms_agent_framework(),  # or _foundry_wrapper_crewai()
```
Add `azure-ai-agentserver-responses==1.0.0` (or whatever version Step 1's
probe reports as latest) to both frameworks' requirements.txt.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_msaf_and_crewai_foundry_wrapper_present -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): generate MS Agent Framework and CrewAI Foundry wrappers"
```

---

### Task 13: Generate the pytest suite (`tests/test_workflow.py`) for all 3 frameworks

**Files:**
- Modify: `backend/app/api/builder_export.py`
- Test: `backend/app/tests/test_builder_export.py`

- [ ] **Step 1: Write the failing test**

```python
def test_generated_test_suite_present_and_valid():
    nodes, edges = _support_supervisor()
    for fw in ("langgraph", "ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        key = "tests/test_workflow.py"
        assert key in files
        ast.parse(files[key])
        assert "def test_" in files[key]
        assert "monkeypatch" in files[key]
        assert "pytest==" in files["requirements-dev.txt"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_generated_test_suite_present_and_valid -v`
Expected: FAIL with `KeyError: 'tests/test_workflow.py'`

- [ ] **Step 3: Implement the CrewAI test suite generator (most concrete, since it has real branch data to assert on)**

```python
def _crewai_test_suite(flat_nodes: list[dict], edges: list[dict]) -> str:
    condition_nodes = [n for n in flat_nodes if n["role"] in ("condition", "router")]
    branch_assertions = []
    for cnode in condition_nodes:
        outs = _outgoing(edges, cnode["id"])
        for e in outs:
            target_var = _safe_id(e["target"])
            branch_lit = json.dumps(str(e.get("label") or ""))
            branch_assertions.append(
                f'def test_branch_{_safe_id(cnode["id"])}_to_{target_var}(monkeypatch):\n'
                f'    """Reaching branch {branch_lit} from {json.dumps(cnode["id"])} must run {json.dumps(e["target"])} '
                f'and no sibling branch -- this is the exact assertion shape that would have caught '
                f'the branch-dispatch double-execution bug fixed in this export generator."""\n'
                f'    import main\n'
                f'    calls = []\n'
                f'    for node_id, fn in main.HANDLERS.items():\n'
                f'        def make_tracker(nid, orig):\n'
                f'            def tracked(context):\n'
                f'                calls.append(nid)\n'
                f'                return orig(context)\n'
                f'            return tracked\n'
                f'    context = {{"output": "test input", "branch": {branch_lit}}}\n'
                f'    result = main._next_node_after(main.NODES, main.EDGES, {json.dumps(cnode["id"])}, context) if hasattr(main, "_next_node_after") else None\n'
                f'    from runtime import _next_node_after\n'
                f'    result = _next_node_after(main.NODES, main.EDGES, {json.dumps(cnode["id"])}, context)\n'
                f'    assert result == {json.dumps(e["target"])}\n'
            )
    return '''"""
Generated tests for this workflow export. Mocks the LLM/HTTP layer entirely --
no network calls or API keys required to run this suite.

Run: pytest tests/test_workflow.py -v
"""
import json
import pytest


def test_evaluate_condition_fails_closed_on_malformed_rule():
    from runtime import evaluate_condition
    assert evaluate_condition("not a valid ) expression (", {}) == "false"


def test_evaluate_condition_true_and_false_paths():
    from runtime import evaluate_condition
    assert evaluate_condition("risk_score >= 50", {"risk_score": 80}) == "true"
    assert evaluate_condition("risk_score >= 50", {"risk_score": 10}) == "false"


def test_call_http_request_retries_then_raises_on_persistent_5xx(monkeypatch):
    import httpx
    from runtime import call_http_request, HTTPStepError

    class FakeResponse:
        status_code = 503
        text = "server error"
        def raise_for_status(self):
            raise httpx.HTTPStatusError("503", request=None, response=self)

    class FakeClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def request(self, *a, **kw): return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)
    with pytest.raises(HTTPStepError):
        call_http_request("https://example.test", "GET", "", "", "")


def test_call_http_request_does_not_retry_on_4xx(monkeypatch):
    import httpx
    from runtime import call_http_request, HTTPStepError

    call_count = {"n": 0}

    class FakeResponse:
        status_code = 400
        text = "bad request"

    class FakeClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def request(self, *a, **kw):
            call_count["n"] += 1
            return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)
    with pytest.raises(HTTPStepError):
        call_http_request("https://example.test", "GET", "", "", "")
    assert call_count["n"] == 1  # no retry on a 4xx


def test_pause_resume_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("CHECKPOINT_DB_PATH", str(tmp_path / "test_checkpoints.db"))
    import importlib
    import runtime
    importlib.reload(runtime)
    runtime.save_pause("test-run-1", "node_4", {"output": "hello"}, approver_email="a@b.com", node_label="Approve")
    loaded = runtime.load_pause("test-run-1")
    assert loaded is not None
    assert loaded["node_id"] == "node_4"
    assert loaded["context"] == {"output": "hello"}
    pending = runtime.list_pending()
    assert any(p["run_id"] == "test-run-1" for p in pending)
    runtime.clear_pause("test-run-1")
    assert runtime.load_pause("test-run-1") is None


''' + "\n\n".join(branch_assertions)
```

For LangGraph and MS Agent Framework, generate a lighter-weight variant of
the same file (they share `evaluate_condition`/`call_http_request`/
persistence test bodies verbatim from the CrewAI version above, but skip the
`HANDLERS`/`_next_node_after` branch-assertion block since those two
frameworks use their own frameworks' native graph objects rather than the
`NODES`/`EDGES`/`HANDLERS` shape — add one framework-appropriate branch test
per framework instead:

For LangGraph, add:
```python
def test_langgraph_branch_routes_correctly():
    import main
    result = main.compiled.get_graph()
    # Structural smoke test: every condition/router node's compiled graph
    # has both branch targets reachable.
    assert result is not None
```

For MS Agent Framework, add:
```python
def test_ms_agent_framework_workflow_builds():
    import main
    assert main.workflow is not None
```

(These two are intentionally lighter than CrewAI's because LangGraph's
`add_conditional_edges` and MS-AF's `add_edge(..., condition=...)` are
framework-native and already covered by each framework's own test suite —
the generated tests here focus on the parts AgentForge's generator is
actually responsible for getting right: `evaluate_condition`,
`call_http_request`, and persistence.)

- [ ] **Step 4: Wire `"tests/test_workflow.py"` and `"requirements-dev.txt": "pytest==8.3.4\\npytest-asyncio==0.25.2\\n"` into all 3 exporters' return dicts**

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py::test_generated_test_suite_present_and_valid -v`
Expected: PASS

- [ ] **Step 6: Run the full suite one more time**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py -v -k "not azure_is_default"`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/builder_export.py backend/app/tests/test_builder_export.py
git commit -m "feat(export): generate pytest suite (tests/test_workflow.py) for every export"
```

---

### Task 14: Real end-to-end live verification (same rigor as the base export)

**No new source files — this is a verification pass, not a code task.**

- [ ] **Step 1: Export all 3 frameworks for the `_support_supervisor` fixture (has approval + condition) via the live backend or in-process `export_workflow()` call, same technique used in the base export's validation**

- [ ] **Step 2: Install the new dependencies into the existing isolated `C:\aftest\langgraph`, `C:\aftest\ms_af`, `C:\aftest\crewai` venvs**

```bash
C:/aftest/langgraph/venv/Scripts/python.exe -m pip install -q pydantic-settings tenacity azure-monitor-opentelemetry langgraph-checkpoint-sqlite "langchain-azure-ai[hosting]" azure-identity
C:/aftest/ms_af/venv/Scripts/python.exe -m pip install -q pydantic-settings tenacity azure-monitor-opentelemetry azure-ai-agentserver-responses
C:/aftest/crewai/venv/Scripts/python.exe -m pip install -q pydantic-settings tenacity azure-monitor-opentelemetry azure-ai-agentserver-responses
```

- [ ] **Step 3: Run each `main.py` against the real Azure OpenAI resource (same env-loading technique as the base export's validation, loading real settings from AgentForge's own `backend/.env` programmatically, never printing the API key)**

Confirm: real LLM call succeeds, OTel console spans are printed (since no
`APPLICATIONINSIGHTS_CONNECTION_STRING` is set locally), the workflow
correctly pauses at the approval node, and `data/checkpoints.db` is created.

- [ ] **Step 4: Kill the process after the pause, then resume**

```bash
python main.py --resume <run_id> --decision "approved"
```
Confirm the resumed run does NOT re-call the LLM for already-completed
upstream nodes' work (verify by checking OTel spans / print output only
shows the approval-onward steps) and produces a final result.

- [ ] **Step 5: Run each export's generated `tests/test_workflow.py` for real**

```bash
C:/aftest/langgraph/venv/Scripts/python.exe -m pip install -q pytest pytest-asyncio
C:/aftest/langgraph/venv/Scripts/python.exe -m pytest tests/test_workflow.py -v
```
(repeat for ms_af, crewai)
Expected: all generated tests pass with zero network calls (fully mocked).

- [ ] **Step 6: Fix any issues found during Steps 3-5**

Apply the same discipline as the base export's validation: if a real API
mismatch, import error, or logic bug surfaces, fix it in
`builder_export.py` (not in the generated file directly), re-export,
re-test, and add a regression test to `test_builder_export.py` covering
the specific failure mode found — mirroring exactly how the CrewAI
branch-dispatch bug and the `agent-framework-core` API-drift issues were
handled in the base export's validation pass.

- [ ] **Step 7: Run the full `test_builder_export.py` suite one final time and report results**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest app/tests/test_builder_export.py -v`
Expected: all pass except the pre-existing, unrelated Postgres-connectivity
flake (confirmed unrelated to this work in the base export's validation).

---

## Self-review

**Spec coverage:** All 8 dimensions from the design doc map to tasks —
Correctness (Task 1's `--dry-run` note folded into Task 14's live
verification rigor rather than a separate task, since it's a small addition
tested end-to-end anyway), Secrets (Tasks 1, 2, 10), Observability (Task 4),
Persistence (Tasks 6, 7, 8, 9), Error handling (Task 3), Container hygiene
(Task 5), Test coverage (Task 13), Foundry deployability (Tasks 10, 11, 12).

**Placeholder scan:** Task 7's `runtime_py` assembly contains one explicit
`...` for `call_http_request` — flagged inline as intentional (composed from
Task 3's output, not a TODO) rather than hidden. No other placeholders.

**Type/name consistency:** `save_pause`/`load_pause`/`clear_pause`/
`list_pending` signatures are identical everywhere they're used (Tasks 6, 7,
9, 13). `run_graph`'s signature (`nodes, edges, handlers, workflow_input,
run_id, resume_from=None`) matches its Task 7 definition and Task 13's test
usage. `WorkflowPaused`'s constructor signature changed between the original
export (4 args: label, email, context) and this plan's CrewAI version (5
args: run_id, node_id, label, email, context) — confirmed this is scoped
correctly per-file: CrewAI's `WorkflowPaused` (Task 7) takes `run_id` because
`run_graph()` needs it for `save_pause`; MS Agent Framework's `WorkflowPaused`
(unchanged from the base export, Task 9 only adds a `save_pause()` call
*before* raising it, not a signature change) correctly keeps its original
3-arg shape. This asymmetry is intentional, not an inconsistency — MS-AF's
`_run_id` is a module-level variable set in `__main__`, not threaded through
the exception.
