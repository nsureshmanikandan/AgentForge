# Browse & Load Saved Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking "Load" in Visual Builder opens a picker over all backend-saved workflows (searchable by name) instead of silently reading browser localStorage; selecting one loads it into the canvas.

**Architecture:** Pure frontend change to `frontend/src/pages/WorkflowBuilder.tsx`. No backend changes — `GET /api/builder/workflows` already returns everything needed (id, name, nodes, edges, timestamps). The new picker panel mirrors the existing "Templates" panel's exact visual/filter pattern already in this file.

**Tech Stack:** React + TypeScript, existing `fetch`/`API_BASE` pattern already used elsewhere in this file (no new HTTP client).

---

## File Structure

- Modify: `frontend/src/pages/WorkflowBuilder.tsx` — the only file touched. New state, a rewritten `handleLoad`, a new `handleSelectSavedWorkflow`, a new `timeAgo` helper, a new `filteredSavedWorkflows` derived list, and a new picker panel JSX block, all colocated with the existing analogous Templates-panel code they mirror.

No test files — this repo has no frontend test runner configured (`frontend/package.json` has no `test` script), so verification is live-browser only, per the spec.

---

### Task 1: Add saved-workflows state and type

**Files:**
- Modify: `frontend/src/pages/WorkflowBuilder.tsx:87-89`

- [ ] **Step 1: Add the `SavedWorkflow` type and new state**

Find this block (lines 87-89):

```tsx
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateCategory, setTemplateCategory] = useState("All");
  const [templateSearch, setTemplateSearch] = useState("");
```

Add immediately after it:

```tsx
  const [showLoadPicker, setShowLoadPicker] = useState(false);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [loadSearch, setLoadSearch] = useState("");
  const [loadPickerError, setLoadPickerError] = useState<string | null>(null);
```

Then add the `SavedWorkflow` type definition near the top of the file, immediately after the existing `import type { WorkflowTemplate } from "../data/workflowTemplates";` (line 8):

```tsx
type SavedWorkflow = {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  created_at: string | null;
  updated_at: string | null;
};
```

`Node` and `Edge` are already imported/used elsewhere in this file (React Flow types) — do not re-import them, just confirm they're in scope at the top of the file where you're adding this type.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: no errors (the new state/type aren't used yet, so this just confirms no syntax mistakes)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/WorkflowBuilder.tsx
git commit -m "feat: add saved-workflows picker state to WorkflowBuilder"
```

---

### Task 2: Rewrite `handleLoad` to fetch from the backend

**Files:**
- Modify: `frontend/src/pages/WorkflowBuilder.tsx:634-650`

- [ ] **Step 1: Replace the existing `handleLoad` function**

Find (lines 634-650):

```tsx
  const handleLoad = () => {
    const raw = localStorage.getItem("af_workflow_current");
    if (!raw) {
      showToast("No saved workflow found.");
      return;
    }
    try {
      const { nodes, edges } = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] };
      setLoadedNodes(nodes);
      setLoadedEdges(edges);
      setCanvasKey((k) => k + 1);
      setLastLoadedTemplate(null);
      showToast("Workflow loaded!");
    } catch {
      showToast("Failed to load workflow.");
    }
  };
```

Replace with:

```tsx
  const handleLoad = async () => {
    setShowLoadPicker(true);
    setLoadPickerError(null);
    try {
      const res = await fetch(`${API_BASE}/builder/workflows`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as SavedWorkflow[];
      setSavedWorkflows(data);
    } catch {
      setLoadPickerError("Failed to load saved workflows. Is the backend running?");
    }
  };
```

This removes the `localStorage` code path entirely — the backend is now the single source of truth for "Load."

- [ ] **Step 2: Add `handleSelectSavedWorkflow`**

Add this new function immediately after `handleLoadTemplate` (which ends at line 766, right before the blank line preceding `const filteredTemplates = ...` at line 768):

```tsx
  const handleSelectSavedWorkflow = (wf: SavedWorkflow) => {
    setLoadedNodes(wf.nodes);
    setLoadedEdges(wf.edges);
    setCanvasKey((k) => k + 1);
    setShowLoadPicker(false);
    setSelectedNode(null);
    setSelectedNodeData(undefined);
    setRunLogs(null);
    setWebhookUrl(null);
    showToast(`Loaded: ${wf.name}`);
  };
```

- [ ] **Step 3: Add `filteredSavedWorkflows` and `timeAgo`**

Add immediately after the existing `filteredTemplates` block (lines 768-773):

```tsx
  const filteredSavedWorkflows = savedWorkflows.filter((wf) => {
    const q = loadSearch.toLowerCase();
    return !q || wf.name.toLowerCase().includes(q);
  });

  function timeAgo(iso: string | null): string {
    if (!iso) return "unknown";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. If you see "unused variable" warnings for `handleSelectSavedWorkflow`/`filteredSavedWorkflows`/`timeAgo`, that's expected at this point — Task 3 wires them into JSX.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WorkflowBuilder.tsx
git commit -m "feat: fetch saved workflows from backend in handleLoad"
```

---

### Task 3: Add the picker panel JSX and wire up the Load button

**Files:**
- Modify: `frontend/src/pages/WorkflowBuilder.tsx:782, ~1055`

- [ ] **Step 1: Update the Load button's `onClick` to also close sibling panels**

Find (line 782, inside the button whose visible text is "Load"):

```tsx
          onClick={handleLoad}
```

Replace with:

```tsx
          onClick={() => { handleLoad(); setShowTemplates(false); setShowAutoBuild(false); }}
```

- [ ] **Step 2: Add the picker panel JSX**

Find the closing of the Templates panel block. It starts at line 961 with `{showTemplates && (` and is a single JSX block ending with its own closing `)}`. Add the new picker panel as a sibling immediately after that entire block closes (i.e., right after the Templates panel's closing `)}`, before the next unrelated JSX in the file):

```tsx
        {showLoadPicker && (
          <div className="absolute top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-700 shadow-2xl z-20 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <div>
                <span className="text-white font-semibold text-sm">Saved Workflows</span>
                <p className="text-gray-400 text-xs mt-0.5">Select a workflow to load it into the canvas</p>
              </div>
              <button
                onClick={() => setShowLoadPicker(false)}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="px-3 pt-3 pb-2 flex-shrink-0">
              <input
                type="text"
                value={loadSearch}
                onChange={(e) => setLoadSearch(e.target.value)}
                placeholder="Search saved workflows..."
                className="w-full bg-gray-800 text-white text-sm border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
              {loadPickerError ? (
                <p className="text-red-400 text-sm text-center py-8">{loadPickerError}</p>
              ) : filteredSavedWorkflows.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  {savedWorkflows.length === 0 ? "No saved workflows yet." : "No workflows match your search."}
                </p>
              ) : (
                filteredSavedWorkflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-violet-600 rounded-xl p-3 cursor-pointer transition-all group"
                    onClick={() => handleSelectSavedWorkflow(wf)}
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold leading-tight truncate">{wf.name}</p>
                      </div>
                      <span className="text-gray-500 text-xs flex-shrink-0">{wf.nodes.length} nodes</span>
                    </div>
                    <p className="text-gray-500 text-xs">Updated {timeAgo(wf.updated_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: no errors, no unused-variable warnings (everything from Task 2 is now referenced).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/WorkflowBuilder.tsx
git commit -m "feat: add saved-workflows picker panel to Visual Builder Load button"
```

---

### Task 4: Live verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm a dev server is running**

Use the preview tools to confirm the frontend dev server is up (or start it), and confirm the backend + Postgres are reachable (`Test-NetConnection localhost -Port 5432` should show `TcpTestSucceeded: True`).

- [ ] **Step 2: Open Visual Builder and click Load**

Navigate to `/builder`. Click the "Load" button. Confirm:
- The picker panel slides in on the right, titled "Saved Workflows"
- Real saved workflows appear in the list (e.g. "IT Incident Triage & Escalation"), each showing a node count and an "Updated X ago" line
- No console errors

- [ ] **Step 3: Confirm search filters correctly**

Type a partial name (e.g. "Incident") into the search box. Confirm the list narrows to only matching workflows. Clear the search and confirm the full list returns.

- [ ] **Step 4: Confirm selecting a workflow loads it onto the canvas**

Click "IT Incident Triage & Escalation" (or whichever real workflow exists). Confirm:
- The picker panel closes
- The canvas now shows that workflow's actual nodes (Incident Report → Severity Classifier → branches → Resolution Summary), not the default 3-node starter graph
- A toast appears saying "Loaded: IT Incident Triage & Escalation"

- [ ] **Step 5: Confirm mutual exclusivity with the Templates panel**

Open the Templates panel (click "📋 Templates"), then click "Load" without closing Templates first. Confirm the Templates panel closes and only the Saved Workflows picker is visible. Repeat in the other order (open Load picker, then click Templates) and confirm the same mutual-exclusivity behavior.

- [ ] **Step 6: Confirm the empty/error states**

If feasible, temporarily stop the backend and click Load again — confirm the picker shows the "Failed to load saved workflows. Is the backend running?" message rather than a blank panel or an uncaught error. Restart the backend afterward.
