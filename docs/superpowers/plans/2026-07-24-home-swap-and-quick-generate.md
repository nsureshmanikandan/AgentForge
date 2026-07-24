# Home/ArchitectHome Swap and Quick Generate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ArchitectHome` the main landing page at `/` (replacing `AgentStudioHome`), and relocate `AgentStudioHome`'s quick single-agent generation flow into Agent Studio itself, reachable via a new "Quick Generate" button next to the existing "New Agent" button.

**Architecture:** Swap the `/` route's element from `AgentStudioHome` to `ArchitectHome`, remove the now-redundant separate `/architect-home` route/nav-link, add a new `/studio/quick-generate` route rendering `AgentStudioHome` unchanged, and add a matching "Quick Generate" button in `AgentStudio.tsx` following the exact pattern of the existing "New Agent" button.

**Tech Stack:** React, TypeScript, react-router-dom.

---

### Task 1: Swap the "/" route and remove the redundant Architect Home nav entry

**Files:**
- Modify: `frontend/src/App.tsx:396-406` (sidebar nav), `frontend/src/App.tsx:566` and `:581` (routes)

- [ ] **Step 1: Confirm current line numbers**

Run: `grep -n "ArchitectHome\|AgentStudioHome\|path=\"/\"\|to=\"/architect-home\"\|path=\"/architect-home\"" frontend/src/App.tsx`
Expected output (adjust subsequent steps if line numbers have shifted):
```
5:import AgentStudioHome from "./pages/AgentStudioHome";
19:import ArchitectHome from "./pages/ArchitectHome";
396:        <NavLink to="/" end className={linkClass} title={collapsed ? "Home" : undefined}>
402:        <NavLink to="/architect-home" className={linkClass} title={collapsed ? "Architect Home" : undefined}>
566:                  <Route path="/" element={<AgentStudioHome />} />
581:                  <Route path="/architect-home" element={<ArchitectHome />} />
```

- [ ] **Step 2: Remove the separate "Architect Home" sidebar NavLink**

In `frontend/src/App.tsx`, delete this block (currently lines 402-404):

```tsx
        <NavLink to="/architect-home" className={linkClass} title={collapsed ? "Architect Home" : undefined}>
          <IconArchitect />{!collapsed && "Architect Home"}
        </NavLink>
```

The "Home" NavLink (lines 396-398, `to="/"`) stays exactly as-is — same label, same icon, same position. Only its destination page's content changes (via Step 3), not the link itself.

- [ ] **Step 3: Swap the "/" route's element**

In `frontend/src/App.tsx:566`, change:

```tsx
<Route path="/" element={<AgentStudioHome />} />
```

to:

```tsx
<Route path="/" element={<ArchitectHome />} />
```

- [ ] **Step 4: Remove the now-redundant "/architect-home" route**

In `frontend/src/App.tsx:581`, delete this line:

```tsx
<Route path="/architect-home" element={<ArchitectHome />} />
```

(`ArchitectHome` is still imported and used — just now only at `/`, not at two paths.)

- [ ] **Step 5: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: same pre-existing, unrelated TypeScript errors in `Architect.tsx` as before this work (confirmed in the prior navigation-restructure round); no new errors referencing `App.tsx`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "swap Home route to ArchitectHome, remove redundant /architect-home nav entry"
```

---

### Task 2: Add the /studio/quick-generate route for AgentStudioHome

**Files:**
- Modify: `frontend/src/App.tsx` (route table, near the `/studio/create` route)

- [ ] **Step 1: Locate the /studio/create route**

Run: `grep -n 'path="/studio' frontend/src/App.tsx`
Expected: a match for `<Route path="/studio" element={<AgentStudio />} />` and `<Route path="/studio/create" element={<CreateAgent />} />`.

- [ ] **Step 2: Add the new route immediately after /studio/create**

In `frontend/src/App.tsx`, immediately after the `<Route path="/studio/create" element={<CreateAgent />} />` line, add:

```tsx
<Route path="/studio/quick-generate" element={<AgentStudioHome />} />
```

`AgentStudioHome` is already imported (line 5, untouched by Task 1) — no new import needed.

- [ ] **Step 3: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: same pre-existing unrelated errors as before, nothing new.

- [ ] **Step 4: Manual check**

Run the dev server, navigate to `/studio/quick-generate` directly in the browser.
Expected: renders `AgentStudioHome`'s existing prompt+attach+clarify+generate UI, unchanged from how it looked at the old `/` route.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "add /studio/quick-generate route rendering AgentStudioHome"
```

---

### Task 3: Add the "Quick Generate" button in Agent Studio

**Files:**
- Modify: `frontend/src/pages/AgentStudio.tsx:480-500` (header buttons), `frontend/src/pages/AgentStudio.tsx:514-535` (empty-state button)

- [ ] **Step 1: Add the header "Quick Generate" button**

In `frontend/src/pages/AgentStudio.tsx`, the current header buttons block (lines 480-500) reads:

```tsx
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/builder")}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
            Visual Builder
          </button>
          <button
            onClick={() => navigate("/studio/create")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Agent
          </button>
        </div>
```

Add a new button between "Visual Builder" and "New Agent" (immediately before the "New Agent" button):

```tsx
          <button
            onClick={() => navigate("/studio/quick-generate")}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            Quick Generate
          </button>
```

(The path icon is the same lightning-bolt glyph `AgentStudioHome.tsx` already uses for its own "Enterprise AI Agent Platform" badge — keeps icon language consistent for the same underlying flow.)

- [ ] **Step 2: Add the empty-state "Quick Generate" button**

In `frontend/src/pages/AgentStudio.tsx`, the current empty-state block (lines 514-535) has one button:

```tsx
          <button
            onClick={() => navigate("/studio/create")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Agent
          </button>
```

Add a second button immediately after it (same row, so the empty state offers both paths):

```tsx
          <button
            onClick={() => navigate("/studio/quick-generate")}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors mt-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            Quick Generate
          </button>
```

(`mt-2` keeps a small gap since the empty-state buttons stack vertically rather than sitting side-by-side like the header ones — check the surrounding flex direction in the actual file and adjust spacing class only if needed to avoid crowding; do not change the "Create Agent" button itself.)

- [ ] **Step 3: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: same pre-existing unrelated errors, nothing new referencing `AgentStudio.tsx`.

- [ ] **Step 4: Manual check**

Run the dev server, navigate to `/studio`. Confirm both the header and (if no agents exist) empty-state now show a "Quick Generate" button alongside "New Agent"/"Create Agent", and clicking either navigates to `/studio/quick-generate`, rendering `AgentStudioHome`'s flow.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AgentStudio.tsx
git commit -m "add Quick Generate button in Agent Studio, linking to relocated AgentStudioHome flow"
```

---

## Self-Review Notes

- **Spec coverage:** Route swap (Task 1), relocation route (Task 2), and the entry-point button (Task 3) all covered, matching the three-part design agreed with the user in this conversation.
- **Placeholder scan:** No TODOs; every step has literal code or exact commands.
- **Type consistency:** No new types introduced — this plan only rearranges existing route/element wiring and adds plain `onClick={() => navigate(...)}` buttons matching the exact pattern already used twice in `AgentStudio.tsx`.
- **Regression note:** `AgentStudioHome.tsx` itself is untouched by this plan — its internal `navigate("/studio")` (post-save redirect) and `navigate("/studio/create")` ("Customize first" button) calls continue to work unchanged regardless of which route renders the component.
