# Agents & Database Plan-Completeness + Database Tab Readability — Design

## Problem

Live testing against `gpt-5-mini` (see session notes, 2026-07-29) surfaced a real,
reproducible gap: the Architect plan for a prompt can promise 5 agents (shown
correctly in the "Agents (5)" tab, sourced from `plan.agents`), but the
downloaded code sometimes implements only 3 or 4 of that agent class's domain
methods. Nothing in the pipeline catches this — the existing v3
agent-pipeline-completeness check (`architect.py`) only verifies that methods
*present in the code* are wired to a route; it never checks the methods
*promised by the plan* actually exist at all. A user has no way to know their
download is missing agent logic until they click a feature and it silently
does nothing (no backend route exists to call).

Separately, the Database tab is a single free-text blob rendered verbatim
(`Users table: id, name, email...`) — hard to scan, no indication of what each
table is *for*, and structurally different from the Agents tab's card layout
the rest of the UI already uses.

Build Phases (`plan.phases`) already renders every phase with no truncation,
so there's no display bug there — but the same "plan promised it, code should
deliver it" gap applies: nothing verifies a phase's tasks actually show up in
the generated code.

## Goals

1. Whatever `plan.agents` promises, the generated code must implement and
   wire all of it — enforced automatically, not just reported.
2. Same completeness guarantee extended to `plan.phases` tasks, using the
   existing reviewer loop rather than a new brittle text-matcher (phase tasks
   are free text, not named symbols like agent methods).
3. Database tab redesigned as one card per table (name, plain-English
   purpose, column list) — same visual language as the Agents tab.
4. `database_schema` becomes structured data (not a flat string) so the UI
   can actually render per-table descriptions; existing prompts that need
   the schema as text get a formatter, so code-generation behavior for
   `models.py`/migrations is unaffected.

## Non-Goals

- No changes to how many agents/phases a plan generates in the first place —
  only to guaranteeing the *code* matches whatever the *plan* already says.
- No ER-diagram / visual relationship view for the Database tab (out of scope
  per user decision — cards only, no diagram).
- No client-side parsing of the old free-text `database_schema` shape — the
  backend prompt changes so the structured shape is emitted directly.

## Design

### 1. `database_schema`: string → structured array

`architect.py`'s plan-generation prompt (around line 1025) changes:

```json
"database_schema": [
  { "table": "Users", "description": "Registered accounts and their career-target metadata", "columns": ["id", "name", "email", "current_role", "target_role", "target_timeline", "created_at"] }
]
```

replacing:

```json
"database_schema": "Tables and their key fields as a text description"
```

`GenerateProjectRequest.database_schema` (currently `Optional[str]`) becomes
`Optional[List[dict]]`. Three call sites interpolate `{database_schema}` as
flat text into code-generation prompts (`architect.py:5682`, `5825`, `6262`).
A small helper, `_format_database_schema_for_prompt(schema: list[dict]) -> str`,
renders the structured array back into the same kind of text those prompts
already expect (`"Users: id, name, email, ... -- Registered accounts..."`), so
code-generation behavior is unchanged — only the Plan JSON shape and the UI
change. `req.database_schema or "Design appropriate tables for the
application"` (line 6792) also routes through this helper when a schema is
present.

The frontend `Plan` interface's `database_schema: string` becomes
`database_schema: { table: string; description: string; columns: string[] }[]`.

### 2. Database tab: card-per-table UI

`DatabaseTab` (`Architect.tsx:5136`) is rewritten to mirror `AgentsTab`'s
existing layout: one card per table with its name, description, and a
column chip list, instead of one text blob. Empty/missing schema still falls
back to the existing `EmptyState`.

### 3. Agent completeness: plan vs. generated code

New static check added to `_static_code_quality_report`: `GenerateProjectRequest.agents`
already exists and is already sent by the frontend (`Architect.tsx:3297`,
`agents: plan.agents ?? []`) — no new field needed here. Compare
`len(req.agents)` against the number of non-`__init__`/non-private,
non-`answer_question` methods defined on the (single, per existing
convention) agent class. If the generated agent class has fewer domain
methods than `req.agents` has entries, that's a new confirmed issue:

```
"Plan promised {N} agents but the generated agent class only implements
{M} domain methods -- {N - M} agent(s) worth of logic is missing."
```

This flows into the existing `_run_verified_review_loop` exactly like every
other v3 issue: the confirmed gap is handed to the LLM reviewer pass with an
explicit instruction to add the missing method(s) (using the plan's agent
`role` descriptions as the spec for what each missing method should do) and
wire each into a route, then `_rerun_deterministic_fixups` and the static
check run again to confirm.

This directly closes the gap that let `career_result2.json` ship with only 4
of the 5 promised methods earlier today.

### 4. Phase completeness: reviewer-loop input, not a static check

Phase tasks are free text ("Set up auth", "Build profile intake page") —
not named symbols, so they can't be reliably checked with an AST-based static
rule the way agent methods can. Instead, a new optional field `phases:
Optional[List[dict]] = None` is added to `GenerateProjectRequest` (mirroring
`plan.phases`'s `{phase, name, tasks}` shape), and the frontend's
`generateProject(...)` call (`Architect.tsx:3293`) is updated to pass
`phases: plan.phases ?? []` alongside the existing `agents` field. When
`req.phases` is present, the existing reviewer LLM call
(`_review_and_fix_generated_code`) gets an
additional instruction appended to its prompt: list every phase and its
tasks, and ask the reviewer to confirm each is reflected in the generated
files, filling in anything genuinely missing before returning fixed files.
This reuses the existing verify → fix → reverify loop rather than adding a
new brittle heuristic.

## Testing

- `test_static_code_quality_report` gains cases for: plan promises 5 agents,
  code implements 3 → issue reported; plan promises 3, code implements 3 (or
  more) → no issue.
- `test_format_database_schema_for_prompt`: structured array → readable text
  matching the shape existing prompts expect.
- Existing `_run_verified_review_loop` tests get a case where the initial
  static report includes the new agent-count issue, confirming it flows
  through the loop like any other issue (mocked LLM fix, verify it re-checks).
- Frontend: no new automated test (this codebase's existing pattern doesn't
  unit-test Architect.tsx tab components); manually verified via the
  Browser-pane preview workflow before considering this done.

## Rollout

Implemented directly against `feature/AgentForge1.1` (matching how v3 landed
today) — no separate worktree, since this is additive to already-shipped v3
mechanics and the reviewer loop's existing bounded-iteration safety net
(`max_iterations=2`) already protects against runaway fix attempts.
