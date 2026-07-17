# Real SSO Integration in Generated Custom Code — Design

## Context

AgentForge's Architect flow asks clarifying questions during plan generation, including deployment/auth questions like *"Where should this be deployed and who will use it?"* with an option like *"Internal enterprise app on Azure with Entra ID SSO."*

Investigation during this session confirmed that answering this question today only affects **narrative text**: the plan's `summary` field mentions SSO, the sandbox preview shows an "SSO Active" badge, but the downloadable Custom Code ZIP's actual generated backend has:
- No `TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET` in `.env.example`
- No `msal`, `python-jose`, or Microsoft Graph packages in `requirements.txt`
- No auth middleware, no `auth.py`/`sso.py` file, anywhere in the generated project

So the user's answer to that clarifying question currently has **zero effect on generated code**. This spec covers making SSO the first proof-of-concept for closing that gap — real, working integration code (not a mock), gated behind configuration the user must supply, since AgentForge has no real Azure AD tenant of its own to integrate against.

This is explicitly the **narrow-first** slice of a larger goal (making third-party integrations mentioned in a plan actually real, not just descriptive text). Other integrations (Outlook reminders, Slack, Teams, etc.) are out of scope for this spec and will follow the same pattern once this one is proven.

## Goals

- When a generated plan's summary/answers indicate SSO is wanted (Azure AD / Entra ID / Okta / "single sign-on"), the Custom Code ZIP's backend and frontend include **real, correct** authentication code using the standard SPA + protected-API pattern.
- The generated code must be genuinely functional once the user supplies real Azure AD app registration values — not a stub, not decorative comments.
- The generated app must still be runnable locally without any real Azure AD tenant, via an explicit off switch.
- No new UI surface in AgentForge itself. Detection reuses the existing plan-summary text, consistent with how `_detect_domain` and app-type classification already work.

## Non-Goals (deferred to the "Broad" follow-up)

- Other integrations (Outlook, Slack, Teams, SharePoint, GitHub, Jira, etc.)
- An explicit toggle/checkbox UI in the Architect page for forcing SSO on/off independent of plan text
- Live end-to-end testing against a real Azure AD tenant (AgentForge has none; verification is code-correctness-based, see Testing section)

## Detection

In `backend/app/api/architect.py`'s `generate_project` function, add a lightweight keyword check against `req.summary` (mirrors the existing `_detect_domain` pattern):

```python
SSO_KEYWORDS = ["sso", "azure ad", "entra id", "okta", "single sign-on", "single sign on"]
sso_required = any(kw in req.summary.lower() for kw in SSO_KEYWORDS)
```

When `sso_required` is `True`, both `PROJECT_FRONTEND_PROMPT` and `PROJECT_BACKEND_PROMPT` receive an additional instruction block (appended the same way the real-data instruction was appended in the earlier fix) directing GPT-4o to generate the real SSO scaffold described below. When `False`, no SSO-related instruction is added and no SSO code/dependencies should appear in the generated project, keeping non-SSO apps free of unused auth complexity.

## Backend Implementation

Files added to the generated project when `sso_required`:

- **`backend/app/auth/sso.py`** — a FastAPI dependency (`get_current_user` or similar) that:
  - Reads `Authorization: Bearer <token>` from the request
  - Fetches and caches Azure AD's JWKS (`https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys`)
  - Verifies the JWT's signature, `aud` (matches `AZURE_CLIENT_ID`), and `iss` (matches the tenant's issuer URL) using `python-jose[cryptography]`
  - Raises `HTTPException(401)` on any verification failure (expired, bad signature, wrong audience, missing header)
  - Is a no-op pass-through (always authorizes) when `settings.SSO_ENABLED` is `False`
- **`.env.example`** additions: `SSO_ENABLED=false`, `AZURE_TENANT_ID=`, `AZURE_CLIENT_ID=`
- **`requirements.txt`** addition: the chosen JWT/crypto library
- The dependency is wired into protected routers via FastAPI's `Depends(get_current_user)`, applied to the app's core API routes (not `/health`, not static assets)

## Frontend Implementation

Files added to the generated project when `sso_required`:

- **`src/auth/msalConfig.ts`** — real `@azure/msal-browser` `PublicClientApplication` configuration reading `VITE_AZURE_CLIENT_ID` / `VITE_AZURE_TENANT_ID` from Vite env vars
- **`src/auth/useAuth.ts`** — a hook wrapping `loginRedirect` / `acquireTokenSilent`, exposing the current user and a function to get a fresh access token
- **`src/api/client.ts`** modification — an interceptor attaches the real MSAL access token as `Authorization: Bearer <token>` on outgoing API requests when SSO is configured
- **`package.json`** additions: `@azure/msal-browser`, `@azure/msal-react`

When `sso_required` is `False`, none of the above is generated — the project has no auth-related code at all, identical to today's behavior.

## Local Dev Without Real Azure Credentials

`SSO_ENABLED` (backend `.env`) defaults to `false`. With it `false`:
- The backend dependency always passes through (no 401s, no token checks)
- The frontend can still include the MSAL scaffold code, but the app should render/function without ever calling `loginRedirect` — e.g. gate the login-required UI behind a check of whether MSAL config values are present, not hard-require login

This lets a developer clone and run the generated project immediately, and only needs real Azure AD app registration values when they're ready to set `SSO_ENABLED=true` and actually enforce auth.

## Testing / Verification Plan

AgentForge has no real Azure AD tenant to log into, so end-to-end login cannot be verified live. Verification instead consists of:
1. Generated Python parses (`ast.parse`) and the FastAPI app still imports/starts with `SSO_ENABLED=false`.
2. Generated TypeScript type-checks (`tsc --noEmit`) with the new MSAL files present.
3. Manual code review confirming: JWKS fetch/caching is correct, JWT claim checks (aud/iss/exp) are present and correct, no bypass bugs (e.g., accidentally trusting an unverified token), and the `SSO_ENABLED=false` path never touches the network.
4. `README.md` in the generated project includes a clear, accurate section describing exactly which Azure AD app registration steps (redirect URI, API permissions, client secret) the user must complete before setting `SSO_ENABLED=true`.
5. Spot-check across 2-3 Prompt Library prompts whose answers include vs. exclude SSO keywords, confirming the scaffold is present only when expected (same regression-style verification used for the real-data fix earlier in this session).

## Rollback / Risk

This is purely additive (new files, new conditional prompt instructions) and gated by keyword detection — apps that don't mention SSO are completely unaffected. If the generated auth code has a bug, worst case is a broken generated project for SSO-flavored prompts specifically; it does not affect the sandbox preview, non-SSO Custom Code generation, or any other Plan A/B functionality already shipped.
