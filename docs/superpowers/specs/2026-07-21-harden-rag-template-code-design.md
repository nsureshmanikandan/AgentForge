# Harden RAG Template Code — Design

**Goal:** Raise RAG Template Code's production-readiness score (currently ~18/100) without losing its core value proposition — instant, zero-LLM-call delivery — by adding the same deterministic hardening Agentic Code gets, as hardcoded template additions in `buildRagScaffoldZip()`.

**Context:** RAG Template Code (`buildRagScaffoldZip()` in `Architect.tsx`) is a pure client-side template function — no backend call, no LLM call, just static strings assembled into a zip. That's why it downloads instantly ("Packaging…") versus Agentic Code's ~40s LLM generation. Its current score is low because it has none of the hardening Agentic Code gets via `_ensure_scaffold_files` on the backend: no tests, no CI, no auth (wide-open CORS), no rate limiting, no telemetry, no resilience handling.

## Scope

Add, as static hardcoded strings (zero LLM calls, stays instant):

1. **Tests** — `backend/tests/conftest.py`, `test_smoke.py`, `test_chat.py`, `test_documents.py`.
2. **CI/CD** — `.github/workflows/ci.yml`.
3. **Auth** — plan-aware: detect SSO the same way Agentic Code's backend does (`_detect_sso_required` keyword heuristic), applied client-side against the `Plan` object already available in `buildRagScaffoldZip(_html, plan)`.
   - If the plan's answers indicate SSO (e.g. this session's HR FAQ project, which answered "Company SSO (Entra ID / Okta)") → generate the real SSO scaffold: `backend/app/auth/sso.py` (JWKS validation) + `src/auth/msalConfig.ts` + `src/auth/useAuth.ts`.
   - Otherwise → default JWT auth: `backend/app/auth/security.py` (bcrypt + python-jose) + `/register`/`/login` endpoints.
   - Either way, applied to the `/api/chat` and `/api/documents` routes via `Depends(get_current_user)`, replacing today's wide-open `Access-Control-Allow-Origin: *` free-for-all.
4. **Rate limiting** — `slowapi` `Limiter`, `default_limits=["100/minute"]`.
5. **Observability** — `backend/telemetry.py` + `setup_telemetry(app)` call, default `OTEL_EXPORTER=console`.
6. **Resilience** — global exception handler for clean JSON 500s. No DB-retry loop (nothing to retry against — FAISS is in-memory), but add a startup guard around FAISS/embedding-client init so a missing/corrupt index fails with a clear log message instead of a raw crash.
7. **requirements.txt / .env.example** — add `slowapi`, `python-jose[cryptography]`, `passlib[bcrypt]` (only when default auth is used), `pytest`/`pytest-asyncio`/`httpx`, the OpenTelemetry packages, plus `JWT_SECRET` and `OTEL_EXPORTER` in `.env.example`.

**Out of scope:** Real Migrations stays N/A — no persistence layer is added; this scaffold remains deliberately DB-less (FAISS in-memory only), per explicit decision during brainstorming.

## Separately reported bugs (sandbox preview interactivity)

While reviewing this session's actual generated app (`HR Internal FAQ Chatbot`), the following gaps were found in the sandbox preview's "Suggested Questions" / department-filter feature and must also be fixed as part of this pass:

- Department filter chips show a count (e.g. "Pay & Benefits · 10") but clicking one does not display the actual list of 10 questions.
- No "Clear filter" control once a department is selected.
- Clicking a suggested question does not populate it into the chat input (or auto-send it) and show the answer — the whole point of a "suggested questions" list.

These affect the sandbox/App.tsx template shared by both scaffold paths and must be fixed so the generated app actually works end-to-end, independent of the scoring work above.

## Testing

- Manual verification: download RAG Template Code for a plan with SSO detected and one without; confirm the correct auth scaffold appears in each case, `/api/chat` and `/api/documents` reject unauthenticated requests, and `pytest` passes against the generated `tests/`.
- Live verification in the sandbox preview: select a department filter → confirm its questions render; click a question → confirm it populates and answers; confirm a "Clear filter" control appears once a department is selected.
