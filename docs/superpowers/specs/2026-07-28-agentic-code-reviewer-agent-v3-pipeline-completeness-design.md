# Agentic Code Reviewer Agent v3 — Pipeline Completeness, DB Init, Observability, Docker

## Problem

The v2 reviewer (`docs/superpowers/specs/2026-07-26-agentic-code-reviewer-agent-v2-design.md`) added `_static_code_quality_report`, a deterministic AST-based validator covering broken imports, schema mismatches, undeclared settings, and entrypoint/Docker drift. It works well for those four bug shapes.

Forensic end-to-end testing this session (extracting, installing, and actually running three separately downloaded projects — not reading code, running it) surfaced a fifth bug shape the v2 validator doesn't check at all:

- A downloaded "Multi-agent Research Engine" app's backend correctly defined all 5 agent classes described in the plan (`ResearchCoordinatorAgent`, web search, synthesis, citation validator, report writer) and all 5 corresponding DB tables (`sources`, `perspective_findings`, `synthesized_reports`, `claims`, `citation_flags`). The route that creates a new run instantiated and called only the first agent, then returned — the other four agents and their tables were never touched by any code path. Report View correctly fetched from the (empty) tables and rendered its own "no data yet" placeholder copy, which looked enough like real UI text that the gap wasn't obvious from the screen alone; it only surfaced by reading `research_runs.py` directly.

Root cause: `PROJECT_BACKEND_PROMPT`'s only orchestration mandate is built around a single-entry-point chat model (`answer_question(question, history) -> dict`, "the ONLY entry point"). A prompt instruction was already added this session addressing this for future generations, but — same lesson as v2's fixups — a prompt instruction alone is not reliably followed, and there was no deterministic or reviewer-visible check to catch it when it isn't.

Three further, smaller-but-related gaps surfaced from the same live testing, requested to be covered in the same pass:

- **DB init**: two *differently-named* SQLAlchemy classes sharing the same `__tablename__` (only identical-class-name duplicates are currently deduped by `_dedupe_model_classes`); `DATABASE_URL` scheme drift between `config.py`'s coded default and `.env.example`.
- **Observability**: some downloads configure no logging at all in `main.py`; `telemetry.py` is generated but `setup_telemetry()` is never called from `main.py`, so OTEL is dead code.
- **Docker**: v2 already fixed CMD/entrypoint drift; not yet checked: `EXPOSE`'s port vs. the CMD's actual `--port`/uvicorn default, and `docker-compose.yml` environment values vs. `config.py`'s real field defaults.

## Non-Goals

- Re-litigating v1/v2's existing checks (schema mismatch, undeclared settings, broken imports, entrypoint resolution) — those are unchanged.
- A general dataflow/execution-tracing analyzer. The pipeline-completeness check below is a targeted heuristic (agent class defined → is it instantiated and called from the route that owns the pipeline?), not an attempt to model runtime behavior.
- Auto-implementing an agent's actual domain logic when it's found unwired. That's real feature code the LLM reviewer must write with real context (what should the Web Search agent actually do); this design's job is to *detect and report* the gap precisely enough for the existing `_review_and_fix_generated_code` LLM pass to fix it, not to write agent bodies deterministically.
- Frontend/TypeScript equivalents of these checks — out of scope for this pass, same boundary v2 drew.

## Design

All four additions are new sub-checks inside `_static_code_quality_report`, so they flow through the existing `_run_verified_review_loop` unchanged: deterministic-fixable issues get fixed by (new, small) deterministic fixups re-run every iteration via `_rerun_deterministic_fixups`; everything else is handed to the LLM reviewer as a pre-diagnosed `known_issues` fact, exactly like v2's existing four checks.

### 1. Agent-pipeline completeness

New sub-check function `_check_agent_pipeline_completeness(all_files, symbol_table) -> list[str]`:

1. Collect every class defined under `backend/app/agents/*.py` (already-built AST symbol table from the existing report).
2. Collect every route file under `backend/app/api/*.py`. For each agent class, search all route file ASTs for an instantiation (`ClassName(...)`) followed by any method call on that instance, anywhere in the file.
3. Any agent class with zero instantiations across all route files is reported: `"Agent class {ClassName} in {path} is defined but never instantiated or called from any API route — its logic never runs."`
4. For agent classes that *are* called: match the agent's file/class name against `models.py` table names using simple substring/stem matching (`SynthesisAgent` ~ `synthesized_reports`, `CitationValidatorAgent` ~ `citation_flags`) — the same lightweight fuzzy matching already used elsewhere in this codebase for domain detection, not a new dependency. If a plausible match exists and no `db.add(<matching-model>(...))` call appears anywhere in the same route file, report: `"Agent class {ClassName} appears to run but its output is never persisted to the {table} table it exists for."`

Both are report-only (LLM-fixed), since actually wiring a call site requires writing real code the LLM must construct with context (what arguments the next stage needs, what the persisted row should contain) — this is exactly the "hand the reviewer a pre-diagnosed fact" pattern v2 established for schema mismatches.

### 2. DB init / first-run correctness

Two additions to the existing DB-related checks:

- **Cross-class tablename collision**: build a `__tablename__ -> [ClassName, ...]` map across all of `models.py`; any table name mapping to more than one *distinct* class name is reported (`_dedupe_model_classes` already handles the identical-class-name case; this catches the same underlying `InvalidRequestError` crash when the two definitions have different names but the same table). Deterministically fixable: keep the class that's actually imported/used elsewhere in the codebase (mirrors `_dedupe_model_classes`'s existing "which duplicate to keep" logic), drop the other.
- **DATABASE_URL scheme drift**: compare the DB driver scheme (`sqlite`, `postgresql`) between `config.py`'s coded default and `.env.example`'s value. Mismatch reported and deterministically fixed by making `.env.example` match `config.py`'s default (the value actually used when no `.env` is present, which is the common first-run case this bug class breaks).

### 3. Observability

- **No logging configured**: if no file under `backend/app/` calls `logging.basicConfig` or constructs a named `logging.getLogger(...)`, report it. Deterministic fixup: inject a minimal `logging.basicConfig(level=logging.INFO, ...)` call into `main.py` right after `load_dotenv()` — a safe, mechanical default, not a design decision the LLM needs to make.
- **Dead telemetry**: if `telemetry.py` exists (defines `setup_telemetry`) but `main.py` never calls it, report and deterministically fix by inserting the call in `main.py`'s startup path, mirroring how `_ensure_health_endpoint` already inserts code at a known location.

### 4. Docker validity

Extends the existing entrypoint/CMD check (already fixed in v2):

- **EXPOSE/port mismatch**: parse the Dockerfile's `EXPOSE <port>` and the CMD's `--port <port>` (or uvicorn's coded default if `--port` is absent); mismatch is reported and deterministically fixed by rewriting `EXPOSE` to match the CMD's actual port.
- **docker-compose env drift**: for each `environment:` key in `docker-compose.yml` that matches a `config.py` Settings field name, compare values; report (not auto-fixed — picking the "right" value here is a judgment call, e.g. a real Postgres host in compose vs. sqlite for bare `uvicorn`, so this one is LLM-reviewed) any that materially conflict (e.g., compose sets a Postgres URL while `config.py`'s default and `.env.example` both use sqlite, which is a **DB backend choice** the LLM should resolve consistently, not paper over).

## Testing

Extends `backend/app/tests/test_architect_reviewer.py`:

- `_check_agent_pipeline_completeness`: minimal fixture with 5 agent classes + 5 tables, 1 wired/persisted, 4 unwired — asserts exactly 4 "never instantiated" issues (or "never persisted" if a partial wiring fixture is added) are reported; a fully-wired fixture reports nothing; a single-agent chat-style app (no multi-stage tables) reports nothing (this check must not fire on the common chatbot case).
- Tablename collision: two distinct classes sharing `__tablename__="documents"` — reported, and the deterministic fixup keeps whichever class is actually imported elsewhere, drops the other; identical-name case continues to route through the existing `_dedupe_model_classes` unchanged.
- DATABASE_URL drift: sqlite default + postgres `.env.example` fixture — reported and fixed; matching schemes — no issue, no fixup applied (idempotent).
- No-logging fixture — reported and fixed by inserting `logging.basicConfig`; already-logging fixture — no issue, no duplicate insert.
- Dead telemetry fixture (telemetry.py present, main.py doesn't call it) — reported and fixed; already-wired fixture — no issue.
- EXPOSE/port mismatch fixture — reported and fixed; matching case — no issue, idempotent.
- docker-compose env drift fixture (compose Postgres URL vs. sqlite config default) — reported, NOT auto-fixed (goes to LLM reviewer); matching case — no issue.

Additionally, re-run all three of this session's real downloaded projects (research engine variants) through the extended `_static_code_quality_report` directly (not synthetic-only) to confirm the pipeline-completeness check actually flags the confirmed-live gap (Coordinator wired, 4 agents unwired) before any other change is applied — the same validation discipline v2 used against the real HR project.
