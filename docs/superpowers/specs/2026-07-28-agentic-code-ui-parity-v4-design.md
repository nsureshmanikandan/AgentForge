# Agentic Code Reviewer Agent v4 — Sandbox/Agentic-Code UI Parity

## Problem

`PROJECT_FRONTEND_PROMPT_SANDBOX_GROUNDED` (added this session) instructs the LLM to reproduce the already-approved sandbox HTML pixel-for-pixel when generating Agentic Code's `App.tsx` — but it's a prompt instruction, not a verified guarantee. Same lesson as every other fixup in v2/v3: an instruction can be ignored or partially followed, and there was no check that actually confirms the generated frontend's pages/sections match what the user already saw and approved in the sandbox.

Confirmed live this session on the "Multi-agent Research Engine" prompt: before the sandbox-grounded prompt existed, Agentic Code's `App.tsx` rendered a forced chat interface with fake "Filter by Topic" chips (Obligations/Rights/Benefits/Compliance) that had nothing to do with the actual app — a total page/section mismatch from the sandbox. The new prompt fixes the common case, but nothing yet *verifies* it, the same gap v2 closed for schema mismatches and v3 closes for pipeline completeness.

## Non-Goals

- **RAG Template Code scaffold parity** (the static `ragAppTsx` template vs. the sandbox's CHATBOT prompt). Deliberately dropped from this design after SME review: the frontend has no test infrastructure at all (no vitest/jest, no `test` script in `package.json`), and standing one up solely to guard a two-file manual-sync problem that has caused zero confirmed bugs (only caught pre-emptively during live testing) is disproportionate. `isRagPlan()` gates this path to RAG-flagged plans only — most apps, including every custom multi-agent pipeline app, never touch it. Revisit only if this specific drift causes a real, reported bug.
- Pixel-perfect visual regression testing (screenshot diffing, CSS computed-style comparison). This design checks *structural* parity (which pages/sections exist, by name) — a coarser, cheaper, deterministic check, not a rendering-level one.
- Any change to `PROJECT_FRONTEND_PROMPT_SANDBOX_GROUNDED` itself — this design only adds verification on top of the existing instruction.

## Design

New sub-check inside `_static_code_quality_report`, following the exact pattern v3 established (deterministic, AST/regex-based, reports pre-diagnosed facts into the same `_run_verified_review_loop`):

### `_check_sandbox_ui_parity(all_files, sandbox_html) -> list[str]`

Only runs when `sandbox_html` was actually supplied to `generate_project` (the common Agentic Code case; skipped entirely — returns `[]` — when absent, e.g. RAG-flagged plans that don't go through this path, or the rare no-sandbox fallback).

1. **Page/section fingerprint extraction**: from `sandbox_html`, extract the set of page/nav labels and top-level section headings using the same lightweight text-pattern the rest of this codebase already uses for structural checks (e.g. nav `<button>`/`<div>` labels, section `<p>`/`<h2>`-style headings with the bold/uppercase-label styling this prompt itself mandates). Do the same extraction against the generated `App.tsx`.
2. **Compare the two label sets**:
   - Any sandbox label with no reasonably-matching label in `App.tsx` (exact or high-similarity string match, to tolerate minor copy differences) is reported: `"Sandbox page/section '{label}' has no corresponding page/section in the generated App.tsx — Agentic Code is missing something the user already approved."`
   - Any `App.tsx` label with no match in the sandbox is reported: `"Generated App.tsx has page/section '{label}' that doesn't appear in the approved sandbox — Agentic Code introduced something the user didn't see or approve."`
   - This directly generalizes the confirmed bug: the sandbox never had "Filter by Topic"/"Obligations", so that would have been flagged as an extra, unapproved section.
3. **Font consistency** (folded into this same check, not a separate mechanism): extract the `font-family` value from the sandbox HTML's inline styles/`<style>` block and from the generated `index.css`/`index.html`. Mismatch reported: `"Generated app's font-family ({found}) doesn't match the approved sandbox's ({expected})."` This is a single string comparison added to the same function — not enough surface area to justify its own check.

All three are report-only (LLM-fixed via the existing reviewer loop), not deterministically auto-fixed — closing a "missing page" or "extra unapproved section" requires writing or removing real page code, exactly the class of fix v3 already hands to `_review_and_fix_generated_code` for pipeline-completeness gaps, not a mechanical rewrite. The font mismatch is the one sub-case simple enough to auto-fix deterministically (a single CSS property value swap), so it's fixed directly rather than reported, mirroring how v3 auto-fixes the mechanical EXPOSE/port and tablename-collision cases but hands judgment calls to the LLM.

## Testing

Extends `backend/app/tests/test_architect_reviewer.py`:

- Matching fixture (sandbox and `App.tsx` have identical page/section labels, same font) — reports nothing.
- Missing-page fixture (sandbox has a page `App.tsx` lacks) — reports exactly one "missing" issue naming that page.
- Extra-section fixture (`App.tsx` has a section the sandbox doesn't, reproducing the confirmed "Filter by Topic"/"Obligations" bug as the literal test fixture) — reports exactly one "extra, unapproved" issue.
- Font mismatch fixture — deterministically fixed in place (CSS value swapped to match sandbox), not merely reported; re-running the check on the fixed output reports nothing (idempotent).
- No-`sandbox_html` case (RAG-flagged plan, or sandbox generation failed upstream) — check returns `[]` immediately, confirmed it never fires without a sandbox to compare against.

Additionally, re-run this check directly against the actual pre-fix "Multi-agent Research Engine" Agentic Code download captured earlier this session (the one with the Council/chat contamination) paired with its real sandbox HTML, confirming it would have caught the "Filter by Topic"/"Obligations" mismatch and the wrong-font case, if either had still been present after the prompt fix — same validation discipline as v2/v3 against real, not synthetic-only, data.
