# Persist Architect Projects — Design

**Goal:** Give Architect-generated projects a real backend home instead of browser-only `localStorage`, so they show up in My Projects / Published Projects / Shared Projects, can be reopened exactly as left, and can be deleted (with a recoverable Trash).

**Problem today:** Architect's session list (plan, agent configs, generated app files, chat history) lives entirely in `localStorage`. It is not tied to a user account in the database, invisible to teammates, lost if the browser's storage is cleared, and structurally disconnected from "My Projects" — which today actually lists *Agents*, not Architect projects, because no `projects` table exists.

---

## 1. Data model

New table `projects` (real Alembic migration — the repo's migration tooling was wired in during the previous hardening pass):

| Column | Type | Notes |
|---|---|---|
| `id` | str (UUID PK) | |
| `owner_id` | FK → `users.id` | |
| `name` | str | |
| `summary` | str | short description for project cards |
| `original_prompt` | text | the first user prompt that started the session |
| `plan` | JSON | architecture, tech stack, agents, features, api_endpoints, database_schema |
| `files` | JSON | generated file tree `{path: content}` — full artifact, so ZIP re-download needs no recomputation |
| `chat_history` | JSON | Architect chat messages, so reopening shows the full conversation |
| `app_type` | str | `"rag"` \| `"custom_code"` |
| `visibility` | str | `"private"` (default) \| `"published"` \| `"shared"` |
| `shared_with` | JSON | list of user ids, only meaningful when `visibility="shared"` |
| `deleted_at` | datetime, nullable | soft-delete marker; `null` = active, set = in Trash |
| `created_at` / `updated_at` | datetime | |

## 2. Backend — new `/api/projects` router

- `POST /api/projects` — create (first auto-save of a new Architect session)
- `PUT /api/projects/{id}` — update (every subsequent auto-save; also handles visibility/share changes)
- `GET /api/projects?visibility=private&mine=true` — My Projects (owner-scoped, excludes soft-deleted)
- `GET /api/projects?visibility=published` — org-wide, for Published Projects
- `GET /api/projects?visibility=shared` — where the current user is in `shared_with`, for Shared Projects
- `GET /api/projects/trash` — the current user's own soft-deleted projects
- `DELETE /api/projects/{id}` — soft delete (sets `deleted_at`)
- `POST /api/projects/{id}/restore` — clears `deleted_at`
- `DELETE /api/projects/{id}/permanent` — hard delete, only valid on an already-soft-deleted project (Trash's "Delete Forever")

All endpoints authorization-scoped: a user can only read/write their own private projects, published projects are readable by anyone authenticated, shared projects are readable by the owner and anyone in `shared_with`. Only the owner may update, delete, restore, or change visibility.

## 3. Frontend changes

- **Architect.tsx** — replace the `localStorage`-only session persistence with debounced auto-save calls to the new API (each Architect session maps 1:1 to a project row via a `projectId` alongside the existing session id). `localStorage` remains as a local offline cache; the backend becomes the source of truth. On load, if a project id is present, fetch full detail (`plan` + `files` + `chat_history`) from the API and hydrate the session instead of relying solely on `localStorage`.
- **MyProjects.tsx** — currently lists Agents; rewritten to fetch `/api/projects?visibility=private&mine=true`. Cards show name/summary/last-updated/app type with actions: **Open in Architect**, **Download ZIP** (reuses existing zip-building logic against the saved `files`), **Publish**/**Share** (modal → visibility + teammate picker, reusing Team Members' existing user list), **Delete** (→ Trash). A **Trash** tab lists soft-deleted projects with **Restore** / **Delete Forever**.
- **PublishedProjects** and **SharedProjects** — currently alias to `MyProjects`; become their own thin pages hitting the same table filtered by `visibility=published` / `visibility=shared`.

## 4. Error handling

- Auto-save failures retry with backoff and surface a small non-blocking toast ("failed to save, retrying…") — never blocks the user from continuing to chat or build.
- Deleting, restoring, or permanently deleting a project that no longer exists (already purged, or never existed) returns a 404 the frontend handles gracefully (toast + refresh the list) rather than crashing.
- Attempting to update/delete/restore a project you don't own returns 403.

## 5. Testing

- Backend: CRUD tests, visibility-scoping tests (private→owner only, published→any authenticated user, shared→owner + `shared_with` list), soft-delete → restore → permanent-delete lifecycle, 403 on non-owner mutation attempts.
- Frontend: My Projects renders real saved projects (not agents); Open-in-Architect round-trips plan/files/chat correctly; Delete moves a project out of the main list and into Trash; Restore brings it back.

## Out of scope (for this pass)

- Concurrent-edit conflict resolution (last-write-wins on auto-save `PUT` is acceptable for a single-user-per-project assumption).
- Scheduled auto-purge of Trash after N days (manual "Delete Forever" only, for now).
