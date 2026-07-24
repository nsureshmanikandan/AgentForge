# Agentic Code Reviewer Agent Design

## Problem

Across five rounds of full end-to-end testing of the Agentic Code download (`buildSourceZip()` in `frontend/src/pages/Architect.tsx` calling `/architect/generate-project`), a recurring class of bug kept surfacing that deterministic regex-based post-processing (`_dedupe_model_classes`, `_fix_router_prefixes`, `_strip_dead_imports`, etc. in `backend/app/api/architect.py`) cannot reliably generalize to:

- **Schema mismatches**: `documents.py` calling `Document(name=..., content=...)` while `models.py`'s actual `Document` class declared `title`/`file_name`/`storage_url` instead — a semantic incompatibility between two files, not a fixed string pattern.
- **Wrong import paths**: `_rate_limit_exceeded_handler` imported from `slowapi.errors` when it actually lives at the top-level `slowapi` package.
- **Missing config fields**: `security.py` referencing `settings.JWT_SECRET`/`settings.JWT_EXPIRE_MINUTES` that `config.py` never declared.
- **Dangling module references**: `from app import rag` with no `rag.py` anywhere in the generated file set.

Each of these was fixed with a new, narrowly-scoped deterministic function as it was discovered — effective, but reactive: every new bug shape requires writing new regex-matching code by hand, and there's no reason to believe the next generation won't produce a new shape of the same underlying problem (an LLM writing files independently across multiple prompt passes without a shared, enforced contract between them).

Separately, the Agentic Code download's frontend `App.tsx` is expected (per `PROJECT_FRONTEND_PROMPT`'s own existing, detailed instructions) to render the full rich chat response shape — step-by-step resolution, source + confidence badge, related-question chips, thumbs feedback — matching what the sandbox preview and RAG Template Code already show. The LLM doesn't always fully comply with its own prompt's rendering requirements.

## Non-Goals

- Replacing any existing deterministic fix. Those remain in place — they're free, instant, and 100% reliable for the specific patterns they cover. This reviewer pass is a complement for the class of bugs regex genuinely cannot generalize to.
- Reviewing frontend files other than `App.tsx` (e.g. `vite.config.ts`, `package.json`) — those are already covered by existing deterministic fixes and static templates.
- An iterative review-fix-review loop. This is a single review+fix pass; if issues remain after it, they surface on the next real-world test same as before, and get triaged the same way this session's bugs were.
- Modifying `PROJECT_FRONTEND_PROMPT`/`PROJECT_BACKEND_PROMPT` themselves to add more instructions — this design adds a separate downstream check instead, since prompt text alone has already proven insufficient for several of these exact bugs.

## Design

### Pipeline position

Added as the final step in `generate_project()`, after all existing deterministic post-processing calls (`_fix_env_asyncpg_driver`, `_fix_slowapi_import_path`, `_ensure_jwt_settings`, etc.) have already run:

```python
all_files = await _review_and_fix_generated_code(all_files, client, _llm_model, _tok_kwarg)
```

### Reviewer prompt

A new prompt constant, `REVIEWER_PROMPT`, built from the concrete bug list this session actually found (not hypothetical categories):

```
You are reviewing a generated FastAPI + React project for correctness bugs before it ships.
Check ONLY for these specific problems -- do not restyle, refactor, or "improve" anything else:

1. SCHEMA MISMATCH: for every SQLAlchemy model constructor call (e.g. `Document(name=..., content=...)`)
   in any backend .py file, confirm every keyword argument used is an actual field declared on
   that model in models.py. If a file constructs a model with fields that don't exist on it,
   fix the mismatch by editing models.py's field names to match how the model is actually
   constructed and used elsewhere (do NOT change the calling code -- the model definition is
   the one that's usually wrong when multiple files were generated independently). If different
   call sites disagree on field names for the same model, follow whichever naming the MAJORITY
   of call sites use.

2. BROKEN IMPORTS: for every `from X import Y` in any backend .py file, confirm Y is actually
   defined in module X. Fix any import that references a symbol which doesn't exist in its
   stated module (check the real Python package structure, e.g. slowapi's
   _rate_limit_exceeded_handler is a top-level export, not under slowapi.errors).

3. MISSING CONFIG FIELDS: for every `settings.SOME_FIELD` reference in any backend .py file,
   confirm SOME_FIELD is declared in config.py's Settings class. Add any missing field with a
   safe default value if referenced but undeclared.

4. DANGLING MODULE REFERENCES: for every `from app import X` or `from app.X import ...`, confirm
   a file for module X actually exists in this file set. If not, remove the dangling import and
   neutralize its call sites (turn a missing index/search call into a safe no-op or empty result,
   never leave a NameError).

5. FRONTEND RESPONSE RENDERING: src/App.tsx's chat message rendering MUST show, for every bot
   response: the step-by-step resolution list (if steps present), a source name + confidence
   badge (if source present), related-question chips (if related present), and helpful
   thumbs-up/down buttons -- matching the sandbox preview's own format. If any of these are
   missing from the bot message JSX, add them back using the same Tailwind classes already
   used elsewhere in the file for consistency.

Return ONLY valid JSON: {"files": {"path": "corrected full file content"}} containing ONLY the
files you changed. If you find no issues, return {"files": {}}.

FILES TO REVIEW:
{files_content}
```

`{files_content}` is built by concatenating every `backend/**/*.py` file and `src/App.tsx`, each prefixed with a `# FILE: <path>` marker, truncated to a safe total token budget (e.g. 40,000 chars) to control cost — if the file set is large, the model.py/config.py/security.py/documents.py/chat.py/agent files are prioritized first since those are where every observed bug lived, then App.tsx, then remaining files only if budget allows.

### Implementation

```python
async def _review_and_fix_generated_code(
    all_files: dict, client, llm_model: str, tok_kwarg: str
) -> dict:
    """
    Final semantic review pass: catches the class of bugs deterministic
    regex fixes can't generalize to (schema mismatches, wrong import paths,
    missing config fields, dangling module references, incomplete frontend
    response rendering) -- see docs/superpowers/specs/2026-07-24-agentic-code-reviewer-agent-design.md
    for the concrete bugs this addresses. Runs after all existing
    deterministic fixes; failures here are non-fatal (return all_files
    unchanged) since a broken review pass must never break a working
    generation.
    """
    review_targets = {
        p: c for p, c in all_files.items()
        if (p.endswith(".py") and "backend" in p) or p.endswith("src/App.tsx")
    }
    if not review_targets:
        return all_files

    # Prioritize files most likely to contain the known bug patterns within
    # the token budget: models/config/security/documents/chat/agents first,
    # then App.tsx, then anything else.
    priority = ("models.py", "config.py", "security.py", "documents.py", "chat.py", "Agent.py", "App.tsx")
    ordered_paths = sorted(review_targets, key=lambda p: next((i for i, kw in enumerate(priority) if kw in p), len(priority)))

    files_content = ""
    budget = 40_000
    for path in ordered_paths:
        chunk = f"# FILE: {path}\n{review_targets[path]}\n\n"
        if len(files_content) + len(chunk) > budget:
            break
        files_content += chunk

    prompt = REVIEWER_PROMPT.replace("{files_content}", files_content)

    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"},
            **{tok_kwarg: 14000},
        )
        data = json.loads(_strip_json_fences(response.choices[0].message.content or "{}"))
        fixed_files = data.get("files", {})
        for path, content in fixed_files.items():
            if path in all_files:
                all_files[path] = content
    except Exception:
        pass  # reviewer failure must never break a working generation

    return all_files
```

### Cost/latency

One additional LLM call per Agentic Code generation (~10-30s depending on file count, low temperature for consistency, `response_format: json_object` for reliable parsing matching the existing two generation passes' pattern). Acceptable given Agentic Code generation already takes ~40s per the existing "Generating… (~40s)" button label — this doesn't meaningfully change the user's expectation of wait time for this button.

## Testing

- Unit: call `_review_and_fix_generated_code` with a synthetic `all_files` containing a known schema mismatch (`Document(name=...)` vs a model declaring `title`/`file_name`) and confirm the mocked LLM response's corrected `models.py` gets merged back correctly.
- Unit: confirm a reviewer call that raises an exception (simulated) returns `all_files` completely unchanged, never partially modified.
- Unit: confirm `review_targets` correctly excludes frontend files other than `App.tsx`, and correctly excludes non-backend .py files (e.g. nothing under `frontend/`).
- Manual: generate a fresh Agentic Code download and confirm the resulting project runs end-to-end (backend starts, upload works, chat works) without needing any of the manual patches applied during this session's testing rounds.
- Manual: confirm the downloaded App.tsx's chat bubble renders steps/source+confidence/related chips/thumbs matching the sandbox preview's visual format.
