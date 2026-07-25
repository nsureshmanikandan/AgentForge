# Agentic Code Reviewer Agent v2 — Verified Review Loop + Static Validator

## Problem

The v1 reviewer (`docs/superpowers/specs/2026-07-24-agentic-code-reviewer-agent-design.md`) added one LLM review-and-fix pass at the end of `generate_project()`. Its own Non-Goals section explicitly chose a single-shot design: *"An iterative review-fix-review loop... if issues remain after it, they surface on the next real-world test same as before."*

A real downloaded project (`build-an-internal-hr-custom-code`) was forensically tested end-to-end — extracted, dependencies installed, and actually executed, not just read — and confirmed broken in exactly the ways v1's reviewer prompt already names almost verbatim:

- `backend/app/api/documents.py` imports `Document` from `app.models`; `models.py` only defines `PolicyDocument`. (v1's own SCHEMA MISMATCH example literally reads `Document(name=..., content=...)`.)
- `backend/app/api/chat.py` constructs `ChatMessage(session_id=..., role=..., content=...)`; the real model's fields are `sender_type`/`message_text`/`answer_text`.
- `backend/app/main.py` imports `_rate_limit_exceeded_handler` from `slowapi.errors` (wrong submodule) and imports a `limiter` from `chat.py` that chat.py never defines.
- `backend/app/auth/security.py` references `settings.JWT_SECRET`/`JWT_EXPIRE_MINUTES`; `config.py` never declares them.
- A second, stray `backend/main.py` (importing modules — `app.api.decisions`, `app.api.tags` — that don't exist anywhere in the project) coexists with the real `backend/app/main.py`. Dockerfile's CMD (`uvicorn main:app`) runs the stray one, so `docker-compose up` — the project's own documented deploy path — crashes on container start even when everything else is fixed.

Root-cause investigation (reading `architect.py` directly, not guessing) found:

1. **All five of these bug shapes already had a purpose-built deterministic fixup function** (`_fix_slowapi_import_path`, `_strip_dead_imports`, `_ensure_jwt_settings`, etc.), each with a docstring describing the exact bug. They mostly didn't fire because four of them resolved "the" `main.py` via `next(p for p in all_files if p.endswith("main.py") and "backend" in p)` — which matches *both* `backend/main.py` and `backend/app/main.py`, and `next()` silently picks whichever the LLM happened to emit first in its own JSON. A fixup could patch the throwaway file while the real entrypoint stayed broken.
2. **Only 2 of ~10 deterministic fixups were re-run after the v1 reviewer's LLM pass** (`_enforce_agentic_structure`, `_strip_dead_imports`), even though the reviewer rewrites whole files and can regress an already-correct fix elsewhere in that same file (the original design's own comment already flagged this risk, but didn't close it).
3. **The reviewer's own failures were silently swallowed** (`except Exception: pass`) — "the reviewer ran and found nothing" and "the reviewer never ran at all" were indistinguishable from the outside.
4. `passlib[bcrypt]==1.7.4` ships with no paired `bcrypt` version pin; a fresh `pip install` resolves a modern bcrypt that crashes passlib's internal self-test on the very first password hash. This project's own `backend/requirements.txt` already pins `bcrypt==4.0.1` for this exact reason — the fix existed but was never propagated into what the generator produces.

## Non-Goals

- Rewriting the v1 reviewer's LLM-judgment checks (schema mismatch reasoning, frontend response rendering, SSO completeness) — those still need an LLM; this design only changes *when* it's called and *what ground truth it's given*.
- A fully general static type-checker. The validator below is a deliberately narrow, high-confidence heuristic checker (SQLAlchemy `Base`-subclass fields, `settings.X` attribute access, `app.*` import resolution, entrypoint/Docker consistency) — exactly the shapes already confirmed to recur, generalized past their specific examples, not an attempt at soundness.
- Frontend/TypeScript static analysis (Python's `ast` doesn't apply) — the existing `_ensure_msal_dependencies` deterministic fix and the reviewer's own frontend checks are unchanged.

## Design

### 1. Fix the shared root cause: `_resolve_primary_main_py`

A single helper, used everywhere "the" entrypoint is needed:

```python
def _resolve_primary_main_py(all_files: dict) -> str | None:
    canonical = next((p for p in all_files if p.endswith("backend/app/main.py")), None)
    stray = next((p for p in all_files if p.endswith("backend/main.py")), None)
    if canonical and stray:
        del all_files[stray]
        stray = None
    return canonical or stray
```

`backend/app/main.py` is always canonical: it's what the static scaffold's own `conftest.py` hardcodes (`from app.main import app`) and what `PROJECT_BACKEND_PROMPT`'s required file structure specifies. The four fixups that used the ambiguous `next()` lookup (`_fix_router_prefixes`, `_ensure_health_endpoint`, `_strip_dead_imports`, `_fix_slowapi_import_path`) now call this instead, and a stray duplicate is deleted outright rather than left as dead, possibly-deployed code.

### 2. New: `_fix_dockerfile_entrypoint`

Rewrites Dockerfile's `CMD ["uvicorn", "<module>:app", ...]` to reference whatever `_resolve_primary_main_py` resolves to. `PROJECT_BACKEND_PROMPT` never gave the LLM a worked CMD example, so it guessed this on every generation; a wrong guess means the documented one-command deploy path (`docker-compose up`) crashes immediately.

### 3. New: `_static_code_quality_report(all_files) -> list[str]`

Deterministic, `ast`-based, zero-cost, zero-latency. Builds a real symbol table across every backend `.py` file and reports, as plain-English strings:

- **Broken imports**: `from app.X import Y` where `Y` isn't actually defined in `X`'s top-level scope (classes, functions, assignments, re-exports).
- **Schema mismatches**: any call to a name matching a known `Base`-subclass whose keyword arguments aren't among that class's declared fields — generalizes v1's one hardcoded `Document(...)` example to any model, any field, any file.
- **Undeclared settings**: any `settings.FIELD` access where `FIELD` isn't declared on `config.py`'s `Settings` class — generalizes `_ensure_jwt_settings`'s fixed 5-field list to *any* field.
- **Entrypoint/Docker drift**: more than one `main.py`-like file, or a Dockerfile CMD that doesn't match the resolved canonical one.

Never raises (a bug in the checker degrades to a single reported string, never blocks a generation). Validated directly against the real confirmed-broken HR project (not synthetic-only): correctly found 11/11 of the issues within its scope, on the very first run, before any of this design's other fixes were applied.

### 4. Reviewer loop: `_run_verified_review_loop`

Replaces the single `await _review_and_fix_generated_code(...)` call with:

```python
issues = _static_code_quality_report(all_files)
if not issues:
    return all_files  # skip the LLM call entirely -- no cost for the clean case

for iteration in range(1, max_iterations + 1):        # max_iterations=2
    all_files = await _review_and_fix_generated_code(all_files, client, llm_model, tok_kwarg, known_issues=issues)
    all_files = _rerun_deterministic_fixups(all_files, app_name, summary)   # ALL ~10 fixups, not 2
    new_issues = _static_code_quality_report(all_files)
    if not new_issues:
        return all_files
    if new_issues == issues:      # no progress -- another identical call won't help
        logger.warning(...); return all_files
    issues = new_issues

logger.warning(...)  # exhausted iterations; still logged, never blocks the download
return all_files
```

`known_issues` are passed into `REVIEWER_PROMPT` as a new `{known_issues_section}`, framed explicitly as pre-confirmed facts ("a deterministic static analyzer already found these exact issues by parsing the code's own AST — this is NOT a guess"), turning the LLM's job from "notice a bug" into "fix this already-diagnosed bug", which is a substantially easier and more reliable task. The prompt's existing six numbered checks remain, unchanged, as a second layer for what the static checker structurally can't see (frontend rendering, SSO completeness, and any schema/import bug shape the heuristics don't cover).

Validated end-to-end against the real HR project: the deterministic layer alone (step before any LLM call) resolved 8 of the 11 confirmed issues at zero cost; the 3 remaining were exactly the SCHEMA MISMATCH cases requiring naming judgment — precisely the class of bug this loop hands to the LLM reviewer with full context, rather than asking it to find blind.

### 5. Observability

- `_review_and_fix_generated_code` now logs (`logger.info`/`logger.warning`) instead of silently swallowing exceptions — "reviewer failed" and "reviewer found nothing" are no longer indistinguishable.
- `generate_project`'s OTEL span gets a `review.remaining_issues` attribute (count) and `review.remaining_issues_detail` (JSON, if non-empty) after the loop, so a generation that ships with known-unresolved issues is visible in tracing even though it never blocks the download.

### 6. Fixed alongside: bcrypt/passlib pairing

`_ensure_requirements_complete` now checks, independently of the generic missing-import backfill: if `passlib` appears anywhere in `requirements.txt` (the common case — the LLM writes it directly, so the generic backfill never fires) but no `bcrypt==` line exists, add `bcrypt==4.0.1` — matching this project's own `backend/requirements.txt`.

## Testing

`backend/app/tests/test_architect_reviewer.py` — 22 tests, all passing against the real backend venv (plus the full existing 161-test suite re-run clean, no regressions):

- `_static_code_quality_report`: one test per bug shape above, each reproduced as a minimal synthetic fixture matching the real confirmed bug (not a hypothetical), plus a clean-project-reports-nothing case and a malformed-Python-never-raises case.
- `_resolve_primary_main_py`: dedup behavior, single-file fallback, none-exist case.
- `_fix_dockerfile_entrypoint`: rewrites a wrong CMD, idempotent on an already-correct one.
- bcrypt pairing: added when missing, not duplicated when present, not added when passlib isn't used at all.
- `_run_verified_review_loop`: skips the LLM call when already clean; calls the reviewer with the confirmed issues and stops once resolved; stops early (doesn't burn all `max_iterations`) when a reviewer pass makes no progress.
- `_review_and_fix_generated_code`: confirms `known_issues` actually reach the prompt sent to the LLM client; confirms an LLM failure returns `all_files` completely unchanged.

Additionally validated directly against the real downloaded HR project (extracted, not synthetic) at three points: the static validator alone, the deterministic-fixups-alone pass, and the resolved Dockerfile/entrypoint output — confirming the design closes the gap the forensic review found, not just the synthetic reproductions.
