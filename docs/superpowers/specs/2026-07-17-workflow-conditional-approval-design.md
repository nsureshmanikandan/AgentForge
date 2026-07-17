# Workflow Builder — Conditional Branching + Email Approval Gate — Design

## Context

Live testing this session built a real "Expense Approval Pipeline" via the Workflow Builder's
Auto-Build feature (GPT-4o) and ran it end-to-end. All 6 nodes executed correctly with real
per-node LLM calls and real timing — but the "Approval Router" node only *describes* a routing
decision in its text output; the execution engine (`_run_pipeline` in
`backend/app/api/builder.py`) always runs every node in the same fixed topological order,
regardless of any node's output content. There is no real conditional branching and no
human-in-the-loop pause/resume mechanism anywhere in the codebase — confirmed no email-sending
integration exists at all (`grep` for smtplib/SendGrid/SMTP/azure.communication.email returned
nothing).

This spec covers adding both capabilities together, since the target use case couples them:
auto-approve if an extracted amount is under a threshold, otherwise pause and wait for a human's
email-driven approval.

## Goals

- A `condition` node type that safely evaluates a user-authored boolean rule (e.g.
  `"amount < 25"`) against variables GPT-4o extracts from the previous node's output, and routes
  execution down one of two branches accordingly.
- An `approval` node type that sends a real SMTP email with a link to a login-gated approval
  page, genuinely pauses the workflow run (across HTTP requests, potentially for hours/days),
  and resumes execution from where it left off once an authenticated user approves or rejects.
- Rule evaluation must never use Python's `eval()` — a safe, restricted evaluator only.

## Non-Goals

- A general condition UI beyond a single free-text rule field (no visual rule builder).
- Multi-approver / approval-chain workflows (one `approver_email` per approval node only).
- Alternative approval channels (Slack, Teams) — SMTP email only for this pass.
- Real end-to-end email delivery testing — no real SMTP credentials are available in this
  environment; verification mocks the SMTP call specifically (see Testing section).

## Data Model Changes

**`backend/app/models/workflow.py`**

`WorkflowRun` gets 5 new nullable columns:
```python
paused_at_node_id: Mapped[str | None] = mapped_column(String, nullable=True)
paused_context: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON-encoded previous_output
approval_token: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
approved_by: Mapped[str | None] = mapped_column(String, nullable=True)    # user id who acted
resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```
`status` gains two new values: `"waiting_approval"`, `"rejected"` (existing values `"completed"` /
`"failed"` unchanged).

Node dicts (stored as JSON on `Workflow.nodes`, no schema migration needed since it's a JSON
column) gain two new optional keys depending on `role`:
- `role: "condition"` nodes get `rule: str` (e.g. `"amount < 25"`)
- `role: "approval"` nodes get `approver_email: str`

Edge dicts (`Workflow.edges`, also JSON) gain an optional `label: str` field, used only for
edges leaving a `condition` node: `"true"` or `"false"`. Edges leaving any other node type
ignore this field (unlabeled = normal linear flow, unchanged from today).

## Backend Changes

**New file: `backend/app/core/email.py`**
```python
import smtplib, logging
from email.mime.text import MIMEText
from app.config import settings

logger = logging.getLogger(__name__)

def send_email(to: str, subject: str, html_body: str) -> bool:
    if not settings.SMTP_HOST:
        logger.warning("SMTP_HOST not configured -- email not sent: %s", subject)
        return False
    msg = MIMEText(html_body, "html")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER or "noreply@agentforge.local"
    msg["To"] = to
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT or 587) as server:
            server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(msg["From"], [to], msg.as_string())
        return True
    except Exception:
        logger.exception("Failed to send approval email to %s", to)
        return False
```

**`backend/app/config.py`** additions (all optional, app boots fine without them set):
```python
SMTP_HOST: str = ""
SMTP_PORT: int = 587
SMTP_USER: str = ""
SMTP_PASSWORD: str = ""
FRONTEND_BASE_URL: str = "http://localhost:5173"   # used to build the approval link
```

**`backend/app/api/builder.py` — `_run_pipeline` rework**

Add `simpleeval` to `backend/requirements.txt`.

Restructure `_run_pipeline` so it can start execution at an arbitrary node in the ordered list
(needed for resume), and so it stops immediately (returning a special "paused" signal) when it
hits an `approval` node:

```python
from simpleeval import simple_eval

def _evaluate_condition(rule: str, variables: dict) -> bool:
    """Safely evaluate a boolean rule string against extracted variables. Never uses eval()."""
    try:
        return bool(simple_eval(rule, names=variables))
    except Exception:
        return False  # fail closed -- an unparseable rule takes the false branch

async def _extract_variables(text: str, client: AzureOpenAIClient) -> dict:
    """Ask GPT-4o to extract a flat JSON object of named numeric/string variables from text."""
    messages = [
        {"role": "system", "content": (
            "Extract all named numeric and short string values mentioned in the text below as "
            "a flat JSON object (e.g. {\"amount\": 430, \"department\": \"Sales\"}). "
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

`_run_pipeline` is split into `_run_pipeline_from(ordered_nodes, edges, start_index, previous_output)`
so both the initial trigger and the resume-after-approval path share the same execution loop.
When the loop reaches a `condition` node: call `_extract_variables`, then `_evaluate_condition`,
then follow only the edge labeled `"true"` or `"false"` matching the result (the other branch's
nodes are never added to the remaining execution list). When it reaches an `approval` node:
call `send_email(...)` with a link `f"{settings.FRONTEND_BASE_URL}/approvals/{run_id}"`, persist
`status="waiting_approval"`, `paused_at_node_id`, `paused_context=json.dumps(previous_output)`,
`approval_token=secrets.token_urlsafe(32)`, and return a `PAUSED` sentinel so the calling
endpoint responds immediately instead of blocking.

**New endpoints:**
```python
@router.get("/runs/{run_id}/approval-info")
async def get_approval_info(run_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Returns the run's paused node label + context, for the approval page to render."""
    ...

@router.post("/runs/{run_id}/approve")
async def approve_run(run_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Resume execution from the node after the paused approval node."""
    ...

@router.post("/runs/{run_id}/reject")
async def reject_run(run_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Mark the run rejected; execution does not resume."""
    ...
```
Both `approve`/`reject` require `Depends(get_current_user)` (existing JWT auth dependency,
already used elsewhere in the codebase) — an unauthenticated request is rejected with 401. On
approve, the endpoint records `approved_by=user.id`, `resolved_at=now()`, then calls
`_run_pipeline_from(...)` starting immediately after the paused node, using the saved
`paused_context` as the new `previous_output`, and updates `node_logs`/`final_output`/`status`
exactly as the original synchronous run does.

## Frontend Changes

**`frontend/src/pages/WorkflowBuilder.tsx`**
- Add two new node-type options in the node-creation UI: "Condition" (shows a `rule` text
  input, e.g. placeholder `"amount < 25"`) and "Approval" (shows an `approver_email` text input).
- When a `condition` node is selected, allow drawing two outgoing edges and labeling them
  True/False (reuse the existing edge-drawing interaction, add a small label picker).
- After triggering a run, if the response is `{"status": "waiting_approval", "run_id": ...}`,
  show that state in the Pipeline Run panel ("Paused — waiting for email approval") instead of
  treating it as an error or silently doing nothing.

**New page: `frontend/src/pages/ApprovalPage.tsx`** (route `/approvals/:runId`)
- Behind the existing auth guard (same pattern as other authenticated routes).
- Fetches `GET /api/builder/runs/{runId}/approval-info`, shows the paused context (e.g. the
  extracted expense details) and two buttons: Approve / Reject, calling the corresponding
  POST endpoints.

## Error Handling

- `_evaluate_condition` fails closed (false branch) on any rule-parsing error — never crashes
  the run or silently takes the "true"/auto-approve path on a malformed rule.
- `send_email` returns `False` on any SMTP error (bad credentials, host unreachable) rather than
  raising — the run still transitions to `waiting_approval` and persists the token, so the
  approval page still works even if the email itself failed to send (the person doing the demo
  can share the approval link manually).
- Approving/rejecting an already-resolved run (double-click, stale page) returns a 409 Conflict,
  not a silent no-op or a crash.

## Testing / Verification Plan

Given no real SMTP credentials exist in this environment:
1. Unit tests for `_evaluate_condition`: valid rules evaluate correctly (`"amount < 25"` with
   `{"amount": 10}` → True, `{"amount": 430}` → False), and confirm a rule attempting code
   injection (e.g. `"__import__('os').system('ls')"`) raises/fails closed rather than executing.
2. Unit tests for the pause/resume state machine using a mocked `send_email` (patched to return
   `True` without a real network call) — confirm a run reaching an `approval` node persists the
   correct `paused_at_node_id`/`paused_context`/`approval_token` and returns the `PAUSED` sentinel
   without executing subsequent nodes, and confirm `approve_run` resumes correctly from that
   exact node with the correct `previous_output`.
3. Live test (real GPT-4o calls, mocked email only): build a pipeline with a `condition` node
   (amount < 25) → two branches (auto-approve output node vs. `approval` node → manager output
   node), run it once with a $10 input (expect auto-approve path, no email attempt) and once with
   a $430 input (expect pause + mocked "email sent" log + persisted token), then call the
   `/approve` endpoint directly and confirm the run completes with the correct final output.
4. `ast.parse` / `tsc --noEmit` on all touched files.

## Risks

- This is a larger change than the SSO/upload passes — it restructures the core execution loop
  (`_run_pipeline` → `_run_pipeline_from`), not just an additive instruction/endpoint. Existing
  linear (non-conditional, non-approval) workflows must continue to run exactly as before; this
  needs an explicit regression check against the existing 6-node "Expense Approval Pipeline"
  style linear pipeline (no condition/approval nodes) to confirm no behavior change.
- `simpleeval` is a new third-party dependency — confirm it's compatible with the pinned
  Python/dependency versions already required elsewhere in this codebase before relying on it.
