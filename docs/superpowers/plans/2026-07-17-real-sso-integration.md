# Real SSO Integration in Generated Custom Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a generated app's plan summary mentions SSO/Azure AD/Entra ID/Okta, the downloadable Custom Code ZIP's backend and frontend include real, working Azure AD authentication code (JWT validation + MSAL login) instead of only mentioning SSO in descriptive text.

**Architecture:** A pure keyword-detection function (`_detect_sso_required`) checks the plan's `summary` text, mirroring the existing `_detect_domain` pattern. When true, an SSO-specific instruction block is appended to the shared `description` string already used by `generate_project` (the same append pattern used for the real-data fix), directing GPT-4o to generate real backend JWT-validation middleware (`python-jose`, JWKS lookup) and real frontend MSAL login code (`@azure/msal-browser`), both gated behind an `SSO_ENABLED` env var that defaults to `false` for local dev without real Azure credentials.

**Tech Stack:** FastAPI, `python-jose[cryptography]` (backend JWT validation), React + `@azure/msal-browser`/`@azure/msal-react` (frontend login), pytest (detection unit tests).

**Spec:** `docs/superpowers/specs/2026-07-17-real-sso-integration-design.md`

---

### Task 1: SSO keyword detection helper + unit tests

**Files:**
- Modify: `backend/app/api/architect.py` (add helper function near `_detect_domain`, or as a standalone function above `generate_project` at line 3612)
- Test: `backend/app/tests/test_sso_detection.py` (new file)

- [ ] **Step 1: Write the failing tests**

Create `backend/app/tests/test_sso_detection.py`:

```python
from app.api.architect import _detect_sso_required


def test_detects_sso_keyword():
    assert _detect_sso_required("Internal enterprise app with SSO for legal team") is True


def test_detects_azure_ad():
    assert _detect_sso_required("Deploy on Azure AD with Entra ID authentication") is True


def test_detects_entra_id_case_insensitive():
    assert _detect_sso_required("uses entra id for login") is True


def test_detects_okta():
    assert _detect_sso_required("Users authenticate via Okta single sign-on") is True


def test_detects_single_sign_on_variant():
    assert _detect_sso_required("supports single sign on for all employees") is True


def test_no_sso_keywords_returns_false():
    assert _detect_sso_required("Cloud-hosted SaaS for multiple teams and tenants") is False


def test_empty_summary_returns_false():
    assert _detect_sso_required("") is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && venv/Scripts/python.exe -m pytest app/tests/test_sso_detection.py -v`
Expected: FAIL with `ImportError: cannot import name '_detect_sso_required'`

- [ ] **Step 3: Implement the helper function**

In `backend/app/api/architect.py`, add this function directly above the `async def generate_project(req: GenerateProjectRequest):` line (currently line 3612):

```python
_SSO_KEYWORDS = ["sso", "azure ad", "entra id", "okta", "single sign-on", "single sign on"]


def _detect_sso_required(summary: str) -> bool:
    """Keyword-detect whether a plan's summary indicates real SSO auth is wanted."""
    summary_lower = summary.lower()
    return any(kw in summary_lower for kw in _SSO_KEYWORDS)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && venv/Scripts/python.exe -m pytest app/tests/test_sso_detection.py -v`
Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
cd C:/Users/n.sureshmanikandan/Repo1/AgentForge
git add backend/app/api/architect.py backend/app/tests/test_sso_detection.py
git commit -m "feat(sso): add keyword-detection helper for real SSO scaffold trigger"
```

---

### Task 2: Wire SSO instruction into generate_project's description

**Files:**
- Modify: `backend/app/api/architect.py:3629-3645` (the `description` construction block inside `generate_project`)

- [ ] **Step 1: Locate the exact current code**

The current code (added by the earlier real-data fix) reads:

```python
        description = f"App: {req.app_name}\nSummary: {req.summary}\nFeatures:\n" + "\n".join(f"- {f}" for f in req.features)

        # Real uploaded/sample document data (e.g. a Prompt Library sample CSV)
        # should seed the initial DB migration/seed data for both the frontend
        # mock data and the backend seed script -- not invented placeholder rows.
        real_docs = [d for d in (req.documents or []) if d.text and d.text.strip()]
        if real_docs:
            real_data_excerpt = "\n\n".join(
                f"=== {d.name} ===\n{d.text[:3000]}" for d in real_docs
            )
            description += (
                f"\n\nREAL UPLOADED DATA (use this to seed initial DB rows/mock data, "
                f"do not invent different numbers):\n{real_data_excerpt}\n\n"
                "Derive seed data, initial table rows, and any dashboard mock values from "
                "the real data above -- count/aggregate actual rows rather than fabricating "
                "different numbers. Only invent realistic data for parts the upload doesn't cover."
            )

        agents_text = json.dumps(req.agents or [], indent=2)
```

- [ ] **Step 2: Add the SSO instruction block**

Replace it with (adding the new SSO block between the real-data block and `agents_text = ...`):

```python
        description = f"App: {req.app_name}\nSummary: {req.summary}\nFeatures:\n" + "\n".join(f"- {f}" for f in req.features)

        # Real uploaded/sample document data (e.g. a Prompt Library sample CSV)
        # should seed the initial DB migration/seed data for both the frontend
        # mock data and the backend seed script -- not invented placeholder rows.
        real_docs = [d for d in (req.documents or []) if d.text and d.text.strip()]
        if real_docs:
            real_data_excerpt = "\n\n".join(
                f"=== {d.name} ===\n{d.text[:3000]}" for d in real_docs
            )
            description += (
                f"\n\nREAL UPLOADED DATA (use this to seed initial DB rows/mock data, "
                f"do not invent different numbers):\n{real_data_excerpt}\n\n"
                "Derive seed data, initial table rows, and any dashboard mock values from "
                "the real data above -- count/aggregate actual rows rather than fabricating "
                "different numbers. Only invent realistic data for parts the upload doesn't cover."
            )

        # Real SSO auth scaffold -- only when the plan's summary indicates SSO
        # was requested (Azure AD / Entra ID / Okta / single sign-on). Narrow
        # first proof-of-concept: real JWT validation + MSAL login, not a mock.
        if _detect_sso_required(req.summary):
            description += """

REAL SSO AUTHENTICATION REQUIRED (Azure AD / Entra ID):
This app must include GENUINE, WORKING Azure AD single sign-on code -- not a
mock login screen, not decorative comments. Generate exactly this:

BACKEND:
- Create backend/app/auth/sso.py: a FastAPI dependency function (e.g.
  get_current_user) that reads the "Authorization: Bearer <token>" header,
  fetches and caches Azure AD's JWKS from
  https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys, and
  verifies the JWT's signature, "aud" claim (must match AZURE_CLIENT_ID from
  settings), and "iss" claim (must match the tenant's issuer URL) using the
  python-jose library. Raise HTTPException(401) on any verification failure
  (expired token, bad signature, wrong audience, missing header).
- This dependency MUST be a no-op pass-through (always authorize, skip all
  token checks) when settings.SSO_ENABLED is False -- so the app is runnable
  locally without any real Azure AD tenant.
- Add SSO_ENABLED=false, AZURE_TENANT_ID=, AZURE_CLIENT_ID= to .env.example.
- Add python-jose[cryptography] to requirements.txt.
- Apply the dependency via Depends(get_current_user) to the app's core
  business API routes (not /health, not static assets).

FRONTEND:
- Create src/auth/msalConfig.ts: a real @azure/msal-browser
  PublicClientApplication configuration reading VITE_AZURE_CLIENT_ID and
  VITE_AZURE_TENANT_ID from Vite environment variables.
- Create src/auth/useAuth.ts: a hook wrapping loginRedirect and
  acquireTokenSilent, exposing the current user and a function to get a
  fresh access token.
- Modify the API client so outgoing requests attach the real MSAL access
  token as an Authorization: Bearer header.
- Add "@azure/msal-browser" and "@azure/msal-react" to package.json
  dependencies.
- The app must still render and function without ever calling
  loginRedirect if the MSAL config values are absent/empty -- do not
  hard-require login to view the app locally.

Do NOT fabricate a fake login form, do NOT skip the JWKS/JWT verification
logic, do NOT add SSO code paths if this section is absent from the
requirements."""

        agents_text = json.dumps(req.agents or [], indent=2)
```

- [ ] **Step 3: Verify the file still parses**

Run: `cd backend && venv/Scripts/python.exe -c "import ast; ast.parse(open('app/api/architect.py', encoding='utf-8-sig').read()); print('PARSE_OK')"`
Expected: `PARSE_OK`

- [ ] **Step 4: Run the full backend test suite**

Run: `cd backend && venv/Scripts/python.exe -m pytest -q`
Expected: all tests pass (32 existing + 7 new from Task 1 = 39 passed)

- [ ] **Step 5: Commit**

```bash
cd C:/Users/n.sureshmanikandan/Repo1/AgentForge
git add backend/app/api/architect.py
git commit -m "feat(sso): inject real SSO auth scaffold instruction into generate_project when detected"
```

---

### Task 3: Live verification — SSO-flavored prompt generates real scaffold

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Confirm the backend is running**

Run: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs`
Expected: `200`
(If not running, start it per the project's existing `backend/start.ps1`.)

- [ ] **Step 2: Generate a project for an SSO-flavored prompt**

Run this Python script (adjust python path to the repo's venv):

```python
import json, urllib.request

def chat(messages):
    payload = json.dumps({"messages": messages}).encode('utf-8')
    req = urllib.request.Request("http://127.0.0.1:8000/api/architect/chat", data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode('utf-8'))

def generate_project(app_name, summary, features, agents, api_endpoints, database_schema, tech_stack):
    payload = json.dumps({
        "app_name": app_name, "summary": summary, "features": features,
        "agents": agents, "api_endpoints": api_endpoints,
        "database_schema": database_schema, "tech_stack": tech_stack,
    }).encode('utf-8')
    req = urllib.request.Request("http://127.0.0.1:8000/api/architect/generate-project", data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode('utf-8'))

text = "Build a Contract Review Assistant that ingests contracts, flags risk, and drafts redlines against a standard legal playbook."
messages = [{"role": "user", "content": text}]
r1 = chat(messages)
messages.append({"role": "assistant", "content": r1.get("message", "")})
qs = r1.get("questions", [])
# Pick the SSO-flavored answer explicitly for the deployment question
answers = []
for q in qs:
    opts = q.get("options", [])
    sso_opt = next((o for o in opts if "sso" in o.lower() or "entra" in o.lower() or "azure ad" in o.lower()), opts[0] if opts else None)
    if sso_opt:
        answers.append(sso_opt)
messages.append({"role": "user", "content": " - ".join(answers)})
r2 = chat(messages)
plan = r2["plan"]
print("PLAN SUMMARY:", plan["summary"][:300])

r3 = generate_project("Contract Review Assistant", plan["summary"], plan["features"],
                       plan.get("agents", []), plan.get("api_endpoints", []),
                       plan.get("database_schema", ""), plan.get("tech_stack", {}))
files = r3.get("files", {})
print("file_count:", len(files))
print("has auth/sso.py:", "backend/app/auth/sso.py" in files)
print("has msalConfig.ts:", "src/auth/msalConfig.ts" in files)
print("python-jose in requirements.txt:", "python-jose" in files.get("backend/requirements.txt", ""))
print("msal-browser in package.json:", "@azure/msal-browser" in files.get("package.json", ""))
print("SSO_ENABLED in .env.example:", "SSO_ENABLED" in files.get(".env.example", ""))
```

Expected output: `PLAN SUMMARY` mentions SSO/Entra ID, and all 5 boolean checks print `True`.

- [ ] **Step 3: Generate a project for a non-SSO prompt (negative case)**

Re-run the same script but with:
```python
text = "Build a Content Marketing Team — a coordinated group of agents that plan, write, optimize, and schedule brand content."
```
and skip the SSO-answer-picking logic (just join the first option of each question).

Expected output: all 5 boolean checks print `False` — no SSO scaffold, no unused auth dependencies, for an app that never asked for SSO.

- [ ] **Step 4: Manually review the generated `backend/app/auth/sso.py` content**

Read the file content from the Step 2 response's `files["backend/app/auth/sso.py"]` and confirm:
- It fetches JWKS from the correct Azure AD discovery URL pattern
- It checks `aud` and `iss` claims
- It raises `HTTPException(401)` on failure
- It has a `SSO_ENABLED` check that bypasses validation when false

If any of these are missing or wrong, that is a prompt-engineering issue to fix in Task 2's instruction text, not a new task — go back and refine the instruction block, then re-run Step 2.

---

### Task 4: Update README instruction requirement for SSO setup

**Files:**
- Modify: `backend/app/api/architect.py` — locate the `PROJECT_BACKEND_PROMPT` or wherever the generated `README.md` content instructions live

- [ ] **Step 1: Find where README generation is instructed**

Run: `grep -n "README.md" backend/app/api/architect.py` from the repo root and identify which prompt (`PROJECT_BACKEND_PROMPT` or `PROJECT_FRONTEND_PROMPT`) already instructs README generation.

- [ ] **Step 2: Add an SSO setup section requirement**

Add this to the `_detect_sso_required` block from Task 2 (append to the same `description +=` block, after the FRONTEND section and before the final "Do NOT fabricate..." line):

```
README REQUIREMENT:
The generated README.md MUST include a "Setting Up Azure AD SSO" section
listing the exact steps: registering an app in Azure AD, configuring the
redirect URI, noting the Tenant ID and Client ID into .env, and setting
SSO_ENABLED=true once configured. Without this section, a user has no way
to know how to actually turn SSO on.
```

- [ ] **Step 3: Verify the file still parses**

Run: `cd backend && venv/Scripts/python.exe -c "import ast; ast.parse(open('app/api/architect.py', encoding='utf-8-sig').read()); print('PARSE_OK')"`
Expected: `PARSE_OK`

- [ ] **Step 4: Re-run Task 3's Step 2 script and confirm the generated README.md contains a "Setting Up Azure AD SSO" (or equivalent) section**

Check: `"SSO" in files.get("README.md", "") or "Azure AD" in files.get("README.md", "")`
Expected: `True`

- [ ] **Step 5: Commit**

```bash
cd C:/Users/n.sureshmanikandan/Repo1/AgentForge
git add backend/app/api/architect.py
git commit -m "feat(sso): require README setup instructions for the generated SSO scaffold"
```

---

### Task 5: Final regression check

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && venv/Scripts/python.exe -m pytest -q`
Expected: all pass, no regressions (39 tests: 32 original + 7 new from Task 1)

- [ ] **Step 2: Run the frontend type-check** (no frontend files changed in this plan, but confirm no drift)

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Confirm git status is clean**

Run: `git status --short`
Expected: empty (everything committed across Tasks 1, 2, 4)
