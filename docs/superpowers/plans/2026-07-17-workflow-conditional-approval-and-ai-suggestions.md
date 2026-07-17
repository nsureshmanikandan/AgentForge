# Workflow Builder — AI Suggestions + Conditional Branching & Email Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two AI-assisted UX helpers (Auto-Build idea suggestions, auto-generated Run input) and a real conditional-branching + human-in-the-loop email approval gate to the Visual Workflow Builder.

**Architecture:** Backend additions live in `backend/app/api/builder.py` (two new stateless suggestion endpoints, reusing `AzureOpenAIClient`), plus a restructured `_run_pipeline` → `_run_pipeline_from` execution loop that supports early-stop/resume for `approval` nodes and branch-selection for `condition` nodes. A new `backend/app/core/email.py` module sends SMTP mail. Frontend additions live in `frontend/src/pages/WorkflowBuilder.tsx` (idea-suggestion cards, auto-filled Run textarea, paused-run UI) plus a new `frontend/src/pages/ApprovalPage.tsx` route.

**Tech Stack:** FastAPI, SQLAlchemy async (Postgres), `simpleeval` (safe rule evaluation), Python `smtplib`, React + TypeScript, `@xyflow/react`, `axios`.

Specs: `docs/superpowers/specs/2026-07-17-workflow-builder-ai-suggestions-design.md`, `docs/superpowers/specs/2026-07-17-workflow-conditional-approval-design.md`.

---

## File Structure

- `backend/app/api/builder.py` — modify: add `SuggestIdeasRequest`/`SuggestInputRequest` + 2 endpoints (Tasks 1-2); add `condition`/`approval` node-role handling to the run engine, 3 new approval endpoints (Tasks 5-9).
- `backend/app/core/email.py` — create: `send_email()` SMTP helper (Task 4).
- `backend/app/config.py` — modify: add SMTP + frontend-base-url settings (Task 4).
- `backend/app/models/workflow.py` — modify: add 5 nullable columns to `WorkflowRun` (Task 5).
- `backend/requirements.txt` — modify: add `simpleeval` (Task 5).
- `backend/app/tests/test_builder_condition.py` — create: unit tests for `_evaluate_condition`/`_extract_variables` (Task 6).
- `backend/app/tests/test_builder_pause_resume.py` — create: unit tests for pause/resume state machine (Task 8).
- `frontend/src/pages/WorkflowBuilder.tsx` — modify: idea-suggestion cards (Task 3), auto-filled Run textarea (Task 3), condition/approval node UI + paused-run banner (Task 10).
- `frontend/src/pages/ApprovalPage.tsx` — create: login-gated approval/reject page (Task 11).
- `frontend/src/App.tsx` — modify: register `/approvals/:runId` route (Task 11).

---

### Task 1: `suggest-ideas` endpoint

**Files:**
- Modify: `backend/app/api/builder.py`
- Test: `backend/app/tests/test_builder_suggestions.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/app/tests/test_builder_suggestions.py
import json
from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_suggest_ideas_returns_parsed_list():
    fake_ideas = json.dumps([
        {"title": "Expense Approval Pipeline", "description": "Classifies and routes expense claims."},
        {"title": "Expense Fraud Detector", "description": "Flags anomalous expense patterns."},
    ])
    with patch("app.api.builder.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value=fake_ideas)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/builder/suggest-ideas", json={"partial_name": "Expense"})
    assert res.status_code == 200
    body = res.json()
    assert len(body["ideas"]) == 2
    assert body["ideas"][0]["title"] == "Expense Approval Pipeline"


@pytest.mark.asyncio
async def test_suggest_ideas_returns_empty_list_on_invalid_json():
    with patch("app.api.builder.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="not valid json")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/builder/suggest-ideas", json={"partial_name": "Expense"})
    assert res.status_code == 200
    assert res.json() == {"ideas": []}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/tests/test_builder_suggestions.py -v`
Expected: FAIL with `404` (endpoint `/api/builder/suggest-ideas` does not exist yet).

- [ ] **Step 3: Add the endpoint**

In `backend/app/api/builder.py`, add near the top with the other Pydantic models (after `AutoBuildRequest`, around line 38):

```python
class SuggestIdeasRequest(BaseModel):
    partial_name: str
```

Then add near the end of the file, after `auto_build_workflow` (after line 279):

```python
@router.post("/suggest-ideas")
async def suggest_ideas(body: SuggestIdeasRequest):
    """Return 3-4 realistic agentic workflow ideas related to the partial name typed so far."""
    client = AzureOpenAIClient()
    messages = [
        {"role": "system", "content": (
            "You are helping a user brainstorm an AI agent workflow. Given a partial workflow "
            "name/topic, return 3-4 distinct, realistic agentic pipeline ideas as a JSON array. "
            'Each item: {"title": "<short title>", "description": "<1-2 sentence pipeline '
            'description suitable for an Auto-Build description field>"}. Return ONLY the JSON '
            "array, no markdown fences, no explanation."
        )},
        {"role": "user", "content": f"Partial workflow name/topic: {body.partial_name}"},
    ]
    raw = await client.chat(messages, temperature=0.6)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        ideas = json.loads(raw.strip())
    except Exception:
        return {"ideas": []}
    return {"ideas": ideas[:4]}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest app/tests/test_builder_suggestions.py -v`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/builder.py backend/app/tests/test_builder_suggestions.py
git commit -m "feat: add suggest-ideas endpoint for Auto-Build panel"
```

---

### Task 2: `suggest-input` endpoint

**Files:**
- Modify: `backend/app/api/builder.py`
- Test: `backend/app/tests/test_builder_suggestions.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/app/tests/test_builder_suggestions.py`:

```python
@pytest.mark.asyncio
async def test_suggest_input_returns_generated_text():
    with patch("app.api.builder.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="Reimburse $430 for a client dinner in Chicago.")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                "/api/builder/suggest-input",
                json={"nodes": [
                    {"id": "n1", "data": {"label": "Input", "role": "input", "description": "Receives expense claim"}},
                    {"id": "n2", "data": {"label": "Classifier", "role": "classifier", "description": "Classifies expense type"}},
                ]},
            )
    assert res.status_code == 200
    assert res.json()["suggested_input"] == "Reimburse $430 for a client dinner in Chicago."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/tests/test_builder_suggestions.py::test_suggest_input_returns_generated_text -v`
Expected: FAIL with `404`.

- [ ] **Step 3: Add the endpoint**

In `backend/app/api/builder.py`, add the request model next to `SuggestIdeasRequest`:

```python
class SuggestInputRequest(BaseModel):
    nodes: list[dict]
```

Add the endpoint right after `suggest_ideas`:

```python
@router.post("/suggest-input")
async def suggest_input(body: SuggestInputRequest):
    """Given a workflow's nodes, generate one realistic example input to trigger it with."""
    client = AzureOpenAIClient()
    node_summary = "\n".join(
        f"- {n.get('data', {}).get('label', n.get('id'))} "
        f"({n.get('data', {}).get('role', 'agent')}): "
        f"{n.get('data', {}).get('description', '')}"
        for n in body.nodes
    )
    messages = [
        {"role": "system", "content": (
            "You are helping a user test an AI agent pipeline. Given the pipeline's nodes below, "
            "write ONE realistic, specific example input a real user might submit to trigger this "
            "exact pipeline. Return ONLY the example input text, no quotes, no explanation, no "
            "markdown."
        )},
        {"role": "user", "content": f"Pipeline nodes:\n{node_summary}"},
    ]
    raw = await client.chat(messages, temperature=0.5)
    return {"suggested_input": raw.strip()}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest app/tests/test_builder_suggestions.py -v`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/builder.py backend/app/tests/test_builder_suggestions.py
git commit -m "feat: add suggest-input endpoint for Run dialog auto-fill"
```

---

### Task 3: Frontend — idea-suggestion cards + auto-filled Run textarea

**Files:**
- Modify: `frontend/src/pages/WorkflowBuilder.tsx`

- [ ] **Step 1: Add state for idea suggestions**

In `WorkflowBuilder.tsx`, near the Auto-Build panel state (after line 82, `const [abLoading, setAbLoading] = useState(false);`), add:

```tsx
  interface IdeaSuggestion { title: string; description: string }
  const [ideaSuggestions, setIdeaSuggestions] = useState<IdeaSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
```

- [ ] **Step 2: Add a debounced effect that fetches ideas as the name is typed**

Add this `useEffect` right after the `handleAutoBuild` function (after line 360). First add `useEffect` to the import on line 1: change

```tsx
import { useState, useCallback, useRef } from "react";
```

to

```tsx
import { useState, useCallback, useRef, useEffect } from "react";
```

Then add the effect:

```tsx
  useEffect(() => {
    if (!showAutoBuild || abName.trim().length < 3) {
      setIdeaSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("agentforge_token");
        const res = await axios.post(
          `${API_BASE}/builder/suggest-ideas`,
          { partial_name: abName },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setIdeaSuggestions((res.data as { ideas: IdeaSuggestion[] }).ideas ?? []);
      } catch {
        setIdeaSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [abName, showAutoBuild]);
```

- [ ] **Step 3: Clear suggestions when the Auto-Build panel is closed or Name is cleared**

Update the close button in the Auto-Build panel (around line 636-641) so it also clears suggestions:

```tsx
              <button
                onClick={() => { setShowAutoBuild(false); setIdeaSuggestions([]); }}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
```

- [ ] **Step 4: Render suggestion cards below the Name field**

In the Auto-Build panel, right after the Workflow Name `<div>` block (after line 653, the closing `</div>` of the Name field group, before the Description field's `<div>`), add:

```tsx
              {suggestLoading && (
                <p className="text-xs text-gray-500">Thinking of ideas…</p>
              )}
              {ideaSuggestions.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 font-medium">Suggested ideas</label>
                  {ideaSuggestions.map((idea, i) => (
                    <button
                      key={i}
                      onClick={() => setAbDescription(idea.description)}
                      className="text-left bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-500 rounded-lg p-2 transition-colors"
                    >
                      <p className="text-white text-xs font-semibold">{idea.title}</p>
                      <p className="text-gray-400 text-xs mt-0.5 leading-snug">{idea.description}</p>
                    </button>
                  ))}
                </div>
              )}
```

- [ ] **Step 5: Auto-fill the Run dialog's textarea on open**

Add state for the auto-fill loading indicator, next to `running` state (after line 52):

```tsx
  const [autoFillLoading, setAutoFillLoading] = useState(false);
```

Replace the Run button's `onClick` (line 419-424) so it opens the modal without pre-setting `runInput` from a template only — keep template pre-fill as a fallback but trigger the AI suggestion first:

```tsx
        <button
          onClick={() => { setShowRunModal(true); setRunInput(lastLoadedTemplate?.sampleInput ?? ""); void fetchSuggestedInput(); }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow flex items-center gap-1.5"
        >
          ▶ Run
        </button>
```

Add the `fetchSuggestedInput` function right before `handleRunWithInput` (before line 145):

```tsx
  const fetchSuggestedInput = useCallback(async () => {
    if (!workflowRef.current || lastLoadedTemplate) return; // don't override a template's sample input
    setAutoFillLoading(true);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("agentforge_token");
      const res = await axios.post(
        `${API_BASE}/builder/suggest-input`,
        { nodes: workflowRef.current.nodes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const suggested = (res.data as { suggested_input: string }).suggested_input;
      if (suggested) setRunInput(suggested);
    } catch {
      // leave textarea as-is; user can still type their own input
    } finally {
      setAutoFillLoading(false);
    }
  }, [lastLoadedTemplate]);
```

- [ ] **Step 6: Show the loading state in the Run modal's textarea placeholder**

Update the Run modal's textarea (around line 717-723) to reflect the loading state:

```tsx
            <textarea
              rows={5}
              value={runInput}
              onChange={(e) => setRunInput(e.target.value)}
              placeholder={autoFillLoading ? "Generating a realistic example input…" : "e.g. Analyse Q3 sales trends for APAC region and flag anomalies..."}
              className="bg-gray-800 text-white text-sm border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 resize-none"
            />
```

- [ ] **Step 7: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors introduced by this change.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/WorkflowBuilder.tsx
git commit -m "feat: Auto-Build idea suggestions + auto-filled Run input"
```

---

### Task 4: Email helper + settings

**Files:**
- Create: `backend/app/core/email.py`
- Modify: `backend/app/config.py`
- Modify: `backend/requirements.txt`
- Test: `backend/app/tests/test_email.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/app/tests/test_email.py
from unittest.mock import MagicMock, patch
from app.core.email import send_email


def test_send_email_returns_false_when_smtp_host_not_configured():
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.smtp_host = ""
        result = send_email("user@example.com", "Subject", "<p>Body</p>")
    assert result is False


def test_send_email_returns_true_on_successful_send():
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.example.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = "bot@example.com"
        mock_settings.smtp_password = "secret"
        with patch("app.core.email.smtplib.SMTP") as MockSMTP:
            server = MockSMTP.return_value.__enter__.return_value
            result = send_email("user@example.com", "Subject", "<p>Body</p>")
    assert result is True
    server.starttls.assert_called_once()
    server.login.assert_called_once_with("bot@example.com", "secret")
    server.sendmail.assert_called_once()


def test_send_email_returns_false_on_smtp_exception():
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.example.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = ""
        mock_settings.smtp_password = ""
        with patch("app.core.email.smtplib.SMTP", side_effect=OSError("unreachable")):
            result = send_email("user@example.com", "Subject", "<p>Body</p>")
    assert result is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/tests/test_email.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.core.email'`

- [ ] **Step 3: Add settings**

In `backend/app/config.py`, add after `gcp_project_id: str = ""` (line 32), following the existing lowercase-snake-case convention used throughout this file:

```python
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    frontend_base_url: str = "http://localhost:5173"
```

- [ ] **Step 4: Add `simpleeval` to requirements**

In `backend/requirements.txt`, add under the `# Guardrails` section (after `presidio-anonymizer==2.2.356`, before `# HTTP client`):

```
simpleeval==1.0.3
```

Run: `cd backend && pip install simpleeval==1.0.3`
Expected: installs successfully.

- [ ] **Step 5: Create the email helper**

```python
# backend/app/core/email.py
import smtplib
import logging
from email.mime.text import MIMEText
from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an HTML email via SMTP. Returns False (never raises) on any failure."""
    if not settings.smtp_host:
        logger.warning("SMTP not configured -- email not sent: %s", subject)
        return False
    msg = MIMEText(html_body, "html")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_user or "noreply@agentforge.local"
    msg["To"] = to
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port or 587) as server:
            server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], [to], msg.as_string())
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest app/tests/test_email.py -v`
Expected: `3 passed`

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/email.py backend/app/config.py backend/requirements.txt backend/app/tests/test_email.py
git commit -m "feat: add SMTP email helper and related settings"
```

---

### Task 5: Data model changes for pause/resume

**Files:**
- Modify: `backend/app/models/workflow.py`

- [ ] **Step 1: Add new columns to `WorkflowRun`**

In `backend/app/models/workflow.py`, add `from datetime import datetime` is already imported (line 2). Add `Optional` typing isn't needed since the codebase uses `T | None` syntax already (`Mapped[str]` etc. — Python 3.13 confirmed by requirements.txt comments). Update the `WorkflowRun` class (lines 20-31):

```python
class WorkflowRun(Base):
    """Persisted execution trace for every deploy/trigger call."""
    __tablename__ = "workflow_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_id: Mapped[str] = mapped_column(String, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    trigger_input: Mapped[str] = mapped_column(Text, default="")
    final_output: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="completed")  # completed | failed | waiting_approval | rejected
    node_logs: Mapped[list] = mapped_column(JSON, default=list)       # full per-node trace
    total_duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    paused_at_node_id: Mapped[str | None] = mapped_column(String, nullable=True)
    paused_context: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded previous_output
    approval_token: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    approved_by: Mapped[str | None] = mapped_column(String, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

- [ ] **Step 2: Verify the app boots and creates the table with new columns**

Check how tables are created — run: `grep -n "create_all\|Base.metadata" backend/app/database.py`

If using `create_all` on startup (dev-mode auto-migration, no Alembic migration needed since this is a fresh nullable-columns-only change and the codebase's existing `Workflow`/`WorkflowRun` tables were confirmed to have no Alembic migration history for this table): start the backend and confirm no errors.

Run: `cd backend && python -c "from app.models.workflow import WorkflowRun; print([c.name for c in WorkflowRun.__table__.columns])"`
Expected: prints all 12 column names including `paused_at_node_id`, `paused_context`, `approval_token`, `approved_by`, `resolved_at`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/workflow.py
git commit -m "feat: add pause/resume columns to WorkflowRun model"
```

---

### Task 6: Condition evaluation helpers + unit tests

**Files:**
- Modify: `backend/app/api/builder.py`
- Test: `backend/app/tests/test_builder_condition.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/app/tests/test_builder_condition.py
from unittest.mock import AsyncMock
import pytest
from app.api.builder import _evaluate_condition, _extract_variables


def test_evaluate_condition_true_case():
    assert _evaluate_condition("amount < 25", {"amount": 10}) is True


def test_evaluate_condition_false_case():
    assert _evaluate_condition("amount < 25", {"amount": 430}) is False


def test_evaluate_condition_fails_closed_on_missing_variable():
    assert _evaluate_condition("amount < 25", {}) is False


def test_evaluate_condition_fails_closed_on_code_injection_attempt():
    malicious = "__import__('os').system('echo pwned')"
    assert _evaluate_condition(malicious, {"amount": 10}) is False


@pytest.mark.asyncio
async def test_extract_variables_parses_json_response():
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value='{"amount": 430, "department": "Sales"}')
    result = await _extract_variables("Expense of $430 from Sales dept", fake_client)
    assert result == {"amount": 430, "department": "Sales"}


@pytest.mark.asyncio
async def test_extract_variables_returns_empty_dict_on_invalid_json():
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value="not json")
    result = await _extract_variables("some text", fake_client)
    assert result == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/tests/test_builder_condition.py -v`
Expected: FAIL with `ImportError: cannot import name '_evaluate_condition'`

- [ ] **Step 3: Implement the helpers**

In `backend/app/api/builder.py`, add the import near the top (after `import json` on line 11):

```python
from simpleeval import simple_eval
```

Add the two helper functions right after `_wf_to_dict` (after line 100, before `ROLE_COLORS`):

```python
def _evaluate_condition(rule: str, variables: dict) -> bool:
    """Safely evaluate a boolean rule string against extracted variables. Never uses eval()."""
    try:
        return bool(simple_eval(rule, names=variables))
    except Exception:
        return False  # fail closed -- an unparseable rule or missing variable takes the false branch


async def _extract_variables(text: str, client: "AzureOpenAIClient") -> dict:
    """Ask GPT-4o to extract a flat JSON object of named numeric/string variables from text."""
    messages = [
        {"role": "system", "content": (
            "Extract all named numeric and short string values mentioned in the text below as "
            'a flat JSON object (e.g. {"amount": 430, "department": "Sales"}). '
            "Return ONLY the JSON object, no explanation."
        )},
        {"role": "user", "content": text},
    ]
    raw = await client.chat(messages, temperature=0.0)
    try:
        return json.loads(raw)
    except Exception:
        return {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest app/tests/test_builder_condition.py -v`
Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/builder.py backend/app/tests/test_builder_condition.py
git commit -m "feat: add safe condition-rule evaluation helpers"
```

---

### Task 7: Restructure `_run_pipeline` into `_run_pipeline_from` with condition/approval support

**Files:**
- Modify: `backend/app/api/builder.py`
- Test: `backend/app/tests/test_builder_pause_resume.py`

This is the core execution-engine change. It must preserve identical behavior for existing linear pipelines (no `condition`/`approval` nodes) — this is the regression risk called out in the spec.

- [ ] **Step 1: Write the failing tests (regression + new branching/pause behavior)**

```python
# backend/app/tests/test_builder_pause_resume.py
from unittest.mock import AsyncMock, patch
import pytest
from app.api.builder import _run_pipeline_from, _topo_sort, PAUSED


@pytest.mark.asyncio
async def test_linear_pipeline_still_runs_all_nodes_in_order():
    """Regression check: no condition/approval nodes -> identical behavior to before."""
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "n2", "type": "agent", "data": {"label": "Classifier", "role": "classifier", "description": "classify"}},
        {"id": "n3", "type": "output", "data": {"label": "Output", "role": "output"}},
    ]
    edges = [{"source": "n1", "target": "n2"}, {"source": "n2", "target": "n3"}]
    ordered = _topo_sort(nodes, edges)
    with patch("app.api.builder.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="Classified as travel expense.")
        result = await _run_pipeline_from(ordered, edges, 0, "")
    assert result["status"] == "completed"
    assert len(result["logs"]) == 3
    assert result["logs"][1].output == "Classified as travel expense."


@pytest.mark.asyncio
async def test_condition_node_routes_true_branch():
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "cond", "type": "condition", "data": {"label": "Amount Check", "role": "condition", "rule": "amount < 25"}},
        {"id": "auto", "type": "output", "data": {"label": "Auto-Approved", "role": "output"}},
        {"id": "manual", "type": "output", "data": {"label": "Manual Review", "role": "output"}},
    ]
    edges = [
        {"source": "n1", "target": "cond"},
        {"source": "cond", "target": "auto", "label": "true"},
        {"source": "cond", "target": "manual", "label": "false"},
    ]
    ordered = _topo_sort(nodes, edges)
    with patch("app.api.builder.AzureOpenAIClient") as MockClient, \
         patch("app.api.builder._extract_variables", new=AsyncMock(return_value={"amount": 10})):
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="ignored")
        result = await _run_pipeline_from(ordered, edges, 0, "Expense of $10")
    visited_ids = [log.node_id for log in result["logs"]]
    assert "auto" in visited_ids
    assert "manual" not in visited_ids


@pytest.mark.asyncio
async def test_condition_node_routes_false_branch():
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "cond", "type": "condition", "data": {"label": "Amount Check", "role": "condition", "rule": "amount < 25"}},
        {"id": "auto", "type": "output", "data": {"label": "Auto-Approved", "role": "output"}},
        {"id": "manual", "type": "output", "data": {"label": "Manual Review", "role": "output"}},
    ]
    edges = [
        {"source": "n1", "target": "cond"},
        {"source": "cond", "target": "auto", "label": "true"},
        {"source": "cond", "target": "manual", "label": "false"},
    ]
    ordered = _topo_sort(nodes, edges)
    with patch("app.api.builder.AzureOpenAIClient") as MockClient, \
         patch("app.api.builder._extract_variables", new=AsyncMock(return_value={"amount": 430})):
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="ignored")
        result = await _run_pipeline_from(ordered, edges, 0, "Expense of $430")
    visited_ids = [log.node_id for log in result["logs"]]
    assert "manual" in visited_ids
    assert "auto" not in visited_ids


@pytest.mark.asyncio
async def test_approval_node_pauses_and_does_not_run_later_nodes():
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "appr", "type": "approval", "data": {"label": "Manager Approval", "role": "approval", "approver_email": "mgr@example.com"}},
        {"id": "n3", "type": "output", "data": {"label": "Output", "role": "output"}},
    ]
    edges = [{"source": "n1", "target": "appr"}, {"source": "appr", "target": "n3"}]
    ordered = _topo_sort(nodes, edges)
    with patch("app.api.builder.send_email", return_value=True) as mock_send:
        result = await _run_pipeline_from(ordered, edges, 0, "Expense of $430")
    assert result["status"] == PAUSED
    assert result["paused_at_node_id"] == "appr"
    visited_ids = [log.node_id for log in result["logs"]]
    assert "n3" not in visited_ids
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_resume_after_approval_continues_from_correct_node():
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "appr", "type": "approval", "data": {"label": "Manager Approval", "role": "approval", "approver_email": "mgr@example.com"}},
        {"id": "n3", "type": "output", "data": {"label": "Output", "role": "output"}},
    ]
    edges = [{"source": "n1", "target": "appr"}, {"source": "appr", "target": "n3"}]
    ordered = _topo_sort(nodes, edges)
    appr_index = next(i for i, n in enumerate(ordered) if n["id"] == "appr")
    result = await _run_pipeline_from(ordered, edges, appr_index + 1, "Expense of $430")
    assert result["status"] == "completed"
    assert len(result["logs"]) == 1
    assert result["logs"][0].node_id == "n3"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/tests/test_builder_pause_resume.py -v`
Expected: FAIL with `ImportError: cannot import name '_run_pipeline_from'`

- [ ] **Step 3: Implement `_run_pipeline_from`, replacing `_run_pipeline`**

In `backend/app/api/builder.py`, add the import (near the top, after the `simpleeval` import added in Task 6):

```python
import secrets
from app.core.email import send_email
```

Add a module-level sentinel right before `_run_pipeline` was defined (before line 143):

```python
PAUSED = "waiting_approval"
```

Replace the entire `_run_pipeline` function (lines 143-219) with:

```python
async def _run_pipeline_from(
    ordered_nodes: list[dict],
    edges: list[dict],
    start_index: int,
    previous_output: str,
    run_id: str = "",
) -> dict:
    """Execute nodes starting at start_index in the given order. Returns a dict:
    {"status": "completed" | PAUSED, "logs": [...], "final_output": str,
     "paused_at_node_id": str | None}.
    Stops immediately (without executing later nodes) when it reaches an approval node.
    Follows only the matching labeled edge when it reaches a condition node.
    """
    client = AzureOpenAIClient()
    logs: list[WorkflowRunLog] = []
    node_by_id = {n["id"]: n for n in ordered_nodes}
    remaining = ordered_nodes[start_index:]

    i = 0
    while i < len(remaining):
        node = remaining[i]
        node_id = node.get("id", "unknown")
        node_label = node.get("data", {}).get("label") or node.get("label", node_id)
        node_role = node.get("data", {}).get("role") or node.get("role", "agent")
        node_description = node.get("data", {}).get("description") or node.get("description", "")

        if node.get("type") in ("input",):
            log = WorkflowRunLog(
                node_id=node_id, node_label=node_label, status="done",
                output=previous_output or "Pipeline started. Awaiting user input.", duration_ms=0,
            )
            logs.append(log)
            previous_output = log.output
            i += 1
            continue

        if node.get("type") in ("output",):
            log = WorkflowRunLog(
                node_id=node_id, node_label=node_label, status="done",
                output=f"Pipeline complete. Final output: {previous_output}", duration_ms=0,
            )
            logs.append(log)
            previous_output = log.output
            i += 1
            continue

        if node_role == "condition":
            rule = node.get("data", {}).get("rule") or node.get("rule", "")
            variables = await _extract_variables(previous_output, client)
            result = _evaluate_condition(rule, variables)
            branch_label = "true" if result else "false"
            log = WorkflowRunLog(
                node_id=node_id, node_label=node_label, status="done",
                output=f"Rule '{rule}' evaluated to {result} with variables {variables}. Taking '{branch_label}' branch.",
                duration_ms=0,
            )
            logs.append(log)
            next_edge = next(
                (e for e in edges if e.get("source") == node_id and e.get("label") == branch_label),
                None,
            )
            if next_edge is None:
                break  # no matching branch edge -- stop the run here
            next_node = node_by_id.get(next_edge.get("target"))
            if next_node is None:
                break
            # Jump remaining execution to the chosen branch's node, skipping the other branch entirely
            remaining = [next_node] + [
                n for n in ordered_nodes
                if n["id"] not in {node_id, next_edge.get("target")}
                and ordered_nodes.index(n) > ordered_nodes.index(next_node)
            ]
            i = 0
            continue

        if node_role == "approval":
            approver_email = node.get("data", {}).get("approver_email") or node.get("approver_email", "")
            approval_token = secrets.token_urlsafe(32)
            link = f"{settings.frontend_base_url}/approvals/{run_id}"
            send_email(
                approver_email,
                f"Approval required: {node_label}",
                f"<p>A workflow run requires your approval.</p><p>Context: {previous_output}</p>"
                f'<p><a href="{link}">Review and respond</a></p>',
            )
            return {
                "status": PAUSED,
                "logs": logs,
                "final_output": previous_output,
                "paused_at_node_id": node_id,
                "approval_token": approval_token,
            }

        # Agent node -- call LLM
        try:
            messages = [
                {
                    "role": "system",
                    "content": (
                        f"You are a {node_role} agent. "
                        f"{node_description}. "
                        "Process the input and return a brief output (2-3 sentences)."
                    ),
                },
                {"role": "user", "content": previous_output or "Start the pipeline."},
            ]
            start = time.time()
            output = await client.chat(messages, temperature=0.3)
            duration_ms = int((time.time() - start) * 1000)
            log = WorkflowRunLog(node_id=node_id, node_label=node_label, status="done", output=output, duration_ms=duration_ms)
            previous_output = output
        except Exception as exc:
            log = WorkflowRunLog(node_id=node_id, node_label=node_label, status="error", output=f"Error: {str(exc)}", duration_ms=0)
        logs.append(log)
        i += 1

    return {"status": "completed", "logs": logs, "final_output": previous_output, "paused_at_node_id": None}
```

Add the missing `from app.config import settings` import near the top of the file (after `from app.database import get_db, AsyncSessionLocal` on line 7):

```python
from app.config import settings
```

- [ ] **Step 4: Update all call sites of the old `_run_pipeline` to use `_run_pipeline_from`**

In `deploy_workflow` (around old line 365), replace:

```python
    logs, final_output = await _run_pipeline(wf["nodes"], wf["edges"])
    await _persist_run(db, workflow_id, "", logs, final_output)
    return {"logs": [log.model_dump() for log in logs]}
```

with:

```python
    ordered = _topo_sort(wf["nodes"], wf["edges"])
    result = await _run_pipeline_from(ordered, wf["edges"], 0, "")
    await _persist_run(db, workflow_id, "", result["logs"], result["final_output"])
    return {"logs": [log.model_dump() for log in result["logs"]]}
```

In `trigger_workflow` (around old line 382), this endpoint now needs to handle the `PAUSED` case and persist the pause state. Replace:

```python
    logs, final_output = await _run_pipeline(wf["nodes"], wf["edges"], initial_input=body.input)
    run = await _persist_run(db, workflow_id, body.input, logs, final_output)
    return {
        "run_id": run.id,
        "logs": [log.model_dump() for log in logs],
        "final_output": final_output,
    }
```

with:

```python
    ordered = _topo_sort(wf["nodes"], wf["edges"])
    run_id_placeholder = str(uuid.uuid4())
    result = await _run_pipeline_from(ordered, wf["edges"], 0, body.input, run_id=run_id_placeholder)

    if result["status"] == PAUSED:
        run = WorkflowRun(
            id=run_id_placeholder,
            workflow_id=workflow_id,
            trigger_input=body.input,
            final_output=result["final_output"],
            status=PAUSED,
            node_logs=[log.model_dump() for log in result["logs"]],
            total_duration_ms=float(sum(log.duration_ms for log in result["logs"])),
            paused_at_node_id=result["paused_at_node_id"],
            paused_context=json.dumps(result["final_output"]),
            approval_token=result["approval_token"],
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        return {
            "run_id": run.id,
            "logs": [log.model_dump() for log in result["logs"]],
            "final_output": result["final_output"],
            "status": PAUSED,
        }

    run = await _persist_run(db, workflow_id, body.input, result["logs"], result["final_output"])
    return {
        "run_id": run.id,
        "logs": [log.model_dump() for log in result["logs"]],
        "final_output": result["final_output"],
        "status": "completed",
    }
```

Note: `_persist_run` already generates its own `id=str(uuid.uuid4())` — the pause-path above builds the `WorkflowRun` directly instead of calling `_persist_run` so the same `run_id` used in the approval-link email matches the row actually persisted.

- [ ] **Step 5: Run the full pause/resume + regression test suite**

Run: `cd backend && python -m pytest app/tests/test_builder_pause_resume.py app/tests/test_builder_condition.py -v`
Expected: all pass (5 + 6 tests).

- [ ] **Step 6: Run the existing builder-adjacent tests to confirm no regression**

Run: `cd backend && python -m pytest app/tests/ -v -k "builder or sso"`
Expected: all pass, no failures introduced.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/builder.py backend/app/tests/test_builder_pause_resume.py
git commit -m "feat: restructure pipeline execution for condition branching and approval pause/resume"
```

---

### Task 8: Update the SSE streaming endpoint and node/edge models for condition/approval support

**Files:**
- Modify: `backend/app/api/builder.py`

The `trigger_workflow_stream` endpoint duplicates the execution loop for SSE. Update it to also recognize `condition`/`approval` roles so live-streamed runs don't silently treat them as plain agent nodes (which would call the LLM with a generic "condition agent" prompt and never actually branch or pause).

- [ ] **Step 1: Update the node-type checks inside `event_stream()`**

In `trigger_workflow_stream`'s inner `event_stream()` function, after the existing `if node.get("type") in ("output",):` block (around old line 511, now shifted from Task 7's edits — locate by searching for `event_stream` in the file), add condition/approval handling before the generic `try:` block that calls the LLM:

```python
            if node_role == "condition":
                rule = node.get("data", {}).get("rule") or node.get("rule", "")
                variables = await _extract_variables(previous_output, client)
                cond_result = _evaluate_condition(rule, variables)
                branch_label = "true" if cond_result else "false"
                log = WorkflowRunLog(
                    node_id=node_id, node_label=node_label, status="done",
                    output=f"Rule '{rule}' evaluated to {cond_result} with variables {variables}. Taking '{branch_label}' branch.",
                    duration_ms=0,
                )
                logs.append(log)
                yield f"data: {json.dumps({'event': 'node_done', 'node_id': node_id, 'node_label': node_label, 'output': log.output, 'duration_ms': 0})}\n\n"
                chosen_edge = next(
                    (e for e in edges if e.get("source") == node_id and e.get("label") == branch_label), None
                )
                if chosen_edge is None:
                    break
                skip_target = next(
                    (e.get("target") for e in edges if e.get("source") == node_id and e.get("label") != branch_label), None
                )
                if skip_target:
                    ordered = [n for n in ordered if n.get("id") != skip_target]
                continue

            if node_role == "approval":
                approver_email = node.get("data", {}).get("approver_email") or node.get("approver_email", "")
                approval_token = secrets.token_urlsafe(32)
                link = f"{settings.frontend_base_url}/approvals/{workflow_id}"
                send_email(
                    approver_email,
                    f"Approval required: {node_label}",
                    f"<p>A workflow run requires your approval.</p><p>Context: {previous_output}</p>"
                    f'<p><a href="{link}">Review and respond</a></p>',
                )
                yield f"data: {json.dumps({'event': 'pipeline_paused', 'node_id': node_id, 'node_label': node_label})}\n\n"
                try:
                    async with AsyncSessionLocal() as session:
                        run = WorkflowRun(
                            workflow_id=workflow_id, trigger_input=trigger_input,
                            final_output=previous_output, status=PAUSED,
                            node_logs=[log.model_dump() for log in logs],
                            total_duration_ms=float(sum(log.duration_ms for log in logs)),
                            paused_at_node_id=node_id,
                            paused_context=json.dumps(previous_output),
                            approval_token=approval_token,
                        )
                        session.add(run)
                        await session.commit()
                except Exception:
                    pass
                return
```

This block must be inserted after the node label/role/description extraction lines and before the existing `try:` LLM-call block within the `for node in ordered:` loop.

- [ ] **Step 2: Verify no Python syntax errors**

Run: `cd backend && python -c "import ast; ast.parse(open('app/api/builder.py').read())"`
Expected: no output (parses cleanly).

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/builder.py
git commit -m "feat: support condition/approval nodes in SSE streaming trigger"
```

---

### Task 9: Approval endpoints (`approval-info`, `approve`, `reject`)

**Files:**
- Modify: `backend/app/api/builder.py`
- Test: `backend/app/tests/test_builder_approval_endpoints.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/app/tests/test_builder_approval_endpoints.py
from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token


def _auth_header(user_id: str = "user-1") -> dict:
    token = create_access_token(user_id, "member")
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_approval_info_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/builder/runs/nonexistent-run/approval-info")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_approve_run_returns_409_if_already_resolved():
    with patch("app.api.builder.get_db") as _:
        pass  # exercised via live DB in Task 9 Step 6 integration check; unit-level 401 check above covers auth gating
```

Given `approve`/`reject`/`approval-info` all depend on a real DB session and a real authenticated user (via `get_current_user` which itself queries the `User` table), the deep pause/resume/409 behaviors are best verified as part of the Task 9 Step 6 live integration check below rather than fully mocked unit tests — mocking `AsyncSession` chains for this 3-endpoint flow would test the mocks more than the code. Keep the auth-gating test above (it needs no DB) and rely on Step 6's live check for the rest.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/tests/test_builder_approval_endpoints.py -v`
Expected: FAIL — `test_approval_info_requires_auth` fails with 404 (endpoint doesn't exist), `test_approve_run_returns_409_if_already_resolved` passes trivially (it's a no-op placeholder for now, replace its `pass` body once endpoints exist — see Step 4).

- [ ] **Step 3: Add the auth import and three endpoints**

In `backend/app/api/builder.py`, add the import (after `from app.config import settings`):

```python
from app.api.auth import get_current_user
from app.models.user import User
from datetime import datetime
```

Add the three endpoints at the end of the file, after `get_webhook_url`:

```python
@router.get("/runs/{run_id}/approval-info")
async def get_approval_info(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the run's paused node label + context, for the approval page to render."""
    result = await db.execute(select(WorkflowRun).where(WorkflowRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != PAUSED:
        raise HTTPException(status_code=409, detail=f"Run is not waiting for approval (status: {run.status})")
    return {
        "run_id": run.id,
        "workflow_id": run.workflow_id,
        "paused_at_node_id": run.paused_at_node_id,
        "context": json.loads(run.paused_context) if run.paused_context else "",
        "triggered_at": run.triggered_at.isoformat() if run.triggered_at else None,
    }


@router.post("/runs/{run_id}/approve")
async def approve_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Resume execution from the node after the paused approval node."""
    result = await db.execute(select(WorkflowRun).where(WorkflowRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != PAUSED:
        raise HTTPException(status_code=409, detail=f"Run already resolved (status: {run.status})")

    wf_result = await db.execute(select(Workflow).where(Workflow.id == run.workflow_id))
    wf = wf_result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Parent workflow not found")

    ordered = _topo_sort(wf.nodes, wf.edges)
    resume_index = next(
        (i + 1 for i, n in enumerate(ordered) if n.get("id") == run.paused_at_node_id), len(ordered)
    )
    previous_output = json.loads(run.paused_context) if run.paused_context else ""
    outcome = await _run_pipeline_from(ordered, wf.edges, resume_index, previous_output)

    run.approved_by = user.id
    run.resolved_at = datetime.utcnow()
    run.status = outcome["status"]
    run.final_output = outcome["final_output"]
    run.node_logs = (run.node_logs or []) + [log.model_dump() for log in outcome["logs"]]
    run.total_duration_ms = (run.total_duration_ms or 0.0) + float(sum(log.duration_ms for log in outcome["logs"]))
    await db.commit()
    await db.refresh(run)

    return {"run_id": run.id, "status": run.status, "final_output": run.final_output}


@router.post("/runs/{run_id}/reject")
async def reject_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark the run rejected; execution does not resume."""
    result = await db.execute(select(WorkflowRun).where(WorkflowRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != PAUSED:
        raise HTTPException(status_code=409, detail=f"Run already resolved (status: {run.status})")

    run.approved_by = user.id
    run.resolved_at = datetime.utcnow()
    run.status = "rejected"
    await db.commit()
    await db.refresh(run)

    return {"run_id": run.id, "status": run.status}
```

- [ ] **Step 4: Replace the placeholder test with a real auth-gating check for approve/reject too**

Replace `test_approve_run_returns_409_if_already_resolved`'s body in `backend/app/tests/test_builder_approval_endpoints.py` with real 401 checks (no DB needed since auth fails before any DB query):

```python
@pytest.mark.asyncio
async def test_approve_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/builder/runs/nonexistent-run/approve")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_reject_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/builder/runs/nonexistent-run/reject")
    assert res.status_code == 401
```

Remove the now-unused `_auth_header` helper and the `create_access_token` import if nothing else in the file uses them (they aren't used by the 401-only tests above).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest app/tests/test_builder_approval_endpoints.py -v`
Expected: `3 passed` (approval-info, approve, reject all correctly 401 without a token).

- [ ] **Step 6: Live integration check (real DB, mocked email)**

Start the backend (`cd backend && uvicorn app.main:app --reload`), register/login a real test user to get a real JWT, then:
1. Build a workflow via Auto-Build with a `condition` node (rule `amount < 25`) branching to an auto-approve `output` node vs. an `approval` node (approver_email set to any placeholder address) → manager `output` node.
2. Save it, then `POST /api/builder/workflows/{id}/trigger` with input describing a $10 expense — confirm response `status: "completed"` and the auto-approve branch's node appears in `logs`, the approval branch's node does not.
3. Re-trigger with input describing a $430 expense — confirm response `status: "waiting_approval"` and a `run_id`.
4. `GET /api/builder/runs/{run_id}/approval-info` with the real JWT — confirm 200 with the paused context.
5. `POST /api/builder/runs/{run_id}/approve` with the real JWT — confirm response `status: "completed"` and `final_output` reflects the manager-approval branch executing.
6. `POST /api/builder/runs/{run_id}/approve` again — confirm `409 Conflict`.

Note: since no real SMTP credentials exist in this environment, `send_email` will log a warning and return `False` — confirm the run still transitions to `waiting_approval` per the spec's error-handling requirement (email failure must not block the pause).

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/builder.py backend/app/tests/test_builder_approval_endpoints.py
git commit -m "feat: add approval-info, approve, and reject endpoints"
```

---

### Task 10: Frontend — condition/approval node UI + paused-run banner

**Files:**
- Modify: `frontend/src/pages/WorkflowBuilder.tsx`
- Modify: `frontend/src/components/canvas/AgentCanvas.tsx` (only if it hardcodes an allowed-role list — check first)

- [ ] **Step 1: Check whether `AgentCanvas.tsx` restricts node roles**

Run: `grep -n "role" "C:\Users\n.sureshmanikandan\Repo1\AgentForge\frontend\src\components\canvas\AgentCanvas.tsx" | head -30`

If it finds a hardcoded list of allowed roles (e.g. a `ROLE_OPTIONS` array used by a role `<select>`), add `"condition"` and `"approval"` to that list, following the exact same array-literal style already used there. If no such list exists (roles are freely typed), skip this step — no other node-role validation exists client-side, since the backend is permissive about `role` strings for known GPT-4o-friendly roles listed in `ROLE_COLORS`.

- [ ] **Step 2: Add `condition`/`approval` entries to `ROLE_ICONS` in `WorkflowBuilder.tsx`**

Update the `ROLE_ICONS` map (lines 12-21):

```tsx
const ROLE_ICONS: Record<string, string> = {
  input: "⬇️",
  output: "⬆️",
  classifier: "🏷️",
  router: "🔀",
  responder: "💬",
  guard: "🛡️",
  rag: "📚",
  agent: "🤖",
  condition: "❓",
  approval: "✉️",
};
```

- [ ] **Step 3: Handle the `waiting_approval` trigger response in `handleRunWithInput`**

The synchronous non-streaming path used by `handleRunWithInput` goes through `trigger-stream` (SSE), which Task 8 updated to emit a `pipeline_paused` event instead of `pipeline_done` when it hits an approval node. Update the SSE event-handling switch inside `handleRunWithInput` (around lines 198-224) to add a case:

```tsx
            } else if (evt.event === "pipeline_paused") {
              setRunLogs(collectedLogs);
              showToast(`⏸ Paused — waiting for email approval (node: ${evt.node_label as string})`);
            } else if (evt.event === "pipeline_done") {
```

(Insert the new `else if` branch immediately before the existing `else if (evt.event === "pipeline_done")` branch, keeping that branch unchanged.)

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WorkflowBuilder.tsx
git commit -m "feat: surface condition/approval nodes and paused-run state in Workflow Builder UI"
```

---

### Task 11: Approval page + route

**Files:**
- Create: `frontend/src/pages/ApprovalPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Check the auth-guard/layout wrapper pattern used by other authenticated routes**

Run: `sed -n '540,580p' "C:\Users\n.sureshmanikandan\Repo1\AgentForge\frontend\src\App.tsx"` (already read above — routes from line 554 to 578 sit inside the same guarded `<Route>` wrapper starting at line 550). Confirm the exact wrapper component name by reading lines 545-555 in full before editing, since the wrapper's name wasn't captured in the earlier partial read.

- [ ] **Step 2: Create `ApprovalPage.tsx`**

```tsx
// frontend/src/pages/ApprovalPage.tsx
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

const API_BASE = "http://localhost:8000/api";

interface ApprovalInfo {
  run_id: string;
  workflow_id: string;
  paused_at_node_id: string;
  context: string;
  triggered_at: string | null;
}

export default function ApprovalPage() {
  const { runId } = useParams<{ runId: string }>();
  const [info, setInfo] = useState<ApprovalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem("token") || localStorage.getItem("agentforge_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  useEffect(() => {
    if (!runId) return;
    axios
      .get(`${API_BASE}/builder/runs/${runId}/approval-info`, { headers: authHeaders() })
      .then((res) => setInfo(res.data as ApprovalInfo))
      .catch((err) => {
        const msg = axios.isAxiosError(err) ? err.response?.data?.detail || err.message : "Failed to load approval info";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [runId, authHeaders]);

  const handleDecision = async (decision: "approve" | "reject") => {
    if (!runId || acting) return;
    setActing(true);
    try {
      const res = await axios.post(`${API_BASE}/builder/runs/${runId}/${decision}`, {}, { headers: authHeaders() });
      const data = res.data as { status: string; final_output?: string };
      setActionResult(
        decision === "approve"
          ? `Approved. Run status: ${data.status}. Final output: ${data.final_output ?? ""}`
          : `Rejected. Run status: ${data.status}.`
      );
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail || err.message : "Action failed";
      setError(msg);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading approval details…</div>;
  }

  if (error && !actionResult) {
    return <div className="flex items-center justify-center h-full text-red-400">{error}</div>;
  }

  return (
    <div className="flex items-center justify-center h-full bg-gray-950">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4">
        <h1 className="text-white font-semibold text-lg">Workflow Approval</h1>
        {actionResult ? (
          <p className="text-emerald-300 text-sm">{actionResult}</p>
        ) : (
          <>
            <p className="text-gray-400 text-sm">
              Run <span className="text-white font-mono">{info?.run_id}</span> is paused at node{" "}
              <span className="text-white font-mono">{info?.paused_at_node_id}</span>.
            </p>
            <div className="bg-gray-800 rounded-lg p-3 text-gray-300 text-sm whitespace-pre-wrap">
              {info?.context}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => handleDecision("reject")}
                disabled={acting}
                className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Reject
              </button>
              <button
                onClick={() => handleDecision("approve")}
                disabled={acting}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Approve
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register the route**

In `frontend/src/App.tsx`, add the import near the other page imports (find the `import WorkflowBuilder from` line and add directly after it):

```tsx
import ApprovalPage from "./pages/ApprovalPage";
```

Add the route inside the same guarded block as `/builder` (directly after `<Route path="/builder" element={<WorkflowBuilder />} />` at line 563):

```tsx
                  <Route path="/approvals/:runId" element={<ApprovalPage />} />
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Live browser verification**

Using a real run paused at an approval node from Task 9 Step 6's live check, navigate to `/approvals/{run_id}` while logged in. Confirm the paused context renders and clicking Approve resolves the run (re-check via `GET /api/builder/runs/{run_id}`, confirm `status: "completed"`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ApprovalPage.tsx frontend/src/App.tsx
git commit -m "feat: add login-gated workflow approval page"
```

---

### Task 12: Full regression pass + finish

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && python -m pytest app/tests/ -v`
Expected: all tests pass, no failures in previously-passing suites (SSO, guardrails, orchestrator, etc.).

- [ ] **Step 2: Full frontend type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live regression check on the pre-existing linear "Expense Approval Pipeline" (no condition/approval nodes)**

Re-run the exact 6-node linear pipeline from this session's earlier live test (Auto-Build → trigger with a real input) and confirm identical behavior to before this plan's changes: all 6 nodes execute in order, `status: "completed"`, no unexpected `waiting_approval`.

- [ ] **Step 4: Dispatch a final holistic code reviewer**

Review `backend/app/api/builder.py`, `backend/app/core/email.py`, `backend/app/models/workflow.py`, `frontend/src/pages/WorkflowBuilder.tsx`, `frontend/src/pages/ApprovalPage.tsx` for spec compliance and code quality, matching this session's established end-of-feature review pattern.

- [ ] **Step 5: Finish the development branch**

Follow superpowers:finishing-a-development-branch.
