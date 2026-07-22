# Browse & Load Saved Workflows — Design

## Context

Live testing this cycle found a real, user-facing gap in the Visual Builder (`frontend/src/pages/WorkflowBuilder.tsx`): the "Load" button (`handleLoad`, lines 634-650) only reads from browser `localStorage` (key `af_workflow_current`), completely disconnected from the backend. `POST /api/builder/workflows` (save) and `GET /api/builder/workflows` (list) both exist and work, but there is no UI path from "a workflow was saved to the backend" back to "open it in the canvas." After investigating, the `workflows` table has ~44 real rows (after separately cleaning up 77 rows of confirmed pytest test debris — `"SSE Approval Test"`, `"SSE Condition Test"`, `"Deploy Approval Test"`, created every time the backend test suite runs against the real dev DB) with zero way to browse or reopen any of them today.

This is unrelated to the "Templates" panel (`showTemplates`, `WORKFLOW_TEMPLATES` from `frontend/src/data/workflowTemplates.ts`), which is a separate, static, client-side-only starter gallery — not backend-connected, not part of this spec, not to be touched.

## Goal

Clicking "Load" opens a picker listing all backend-saved workflows (name, last updated, node count), searchable by name. Selecting one loads its `nodes`/`edges` into the canvas, replacing whatever is currently there — silent overwrite, consistent with how "Templates" already behaves (no unsaved-changes warning, since no such pattern exists anywhere else in this builder today).

## Non-goals (v1)

- **Delete/rename from the picker** — no `DELETE /api/builder/workflows/{id}` endpoint exists; adding one is out of scope. The 77 rows of confirmed pytest debris are cleaned up separately via direct DB `DELETE`, the same way the `agents` table was cleaned up earlier this session — not through a new UI feature.
- **Visual thumbnails of the node graph** — text-only rows (name, timestamp, node count) for v1.
- **Org/user-based filtering or ownership** — matches the current no-auth-scoping behavior of every `/api/builder/workflows*` endpoint; `created_by` on the `Workflow` model defaults to `"system"` today and isn't enforced anywhere. Every saved workflow is visible to every user, same as today's `GET /api/builder/workflows` behavior.
- **Unsaved-changes confirmation dialog** — explicitly decided against; matches existing Templates behavior.

## Design

### Backend

**No backend changes.** `GET /api/builder/workflows` (`backend/app/api/builder.py:661-666`) already returns exactly what's needed, one array of `_wf_to_dict()` objects:

```python
{
    "id": wf.id,
    "name": wf.name,
    "nodes": wf.nodes,
    "edges": wf.edges,
    "created_at": wf.created_at.isoformat() if wf.created_at else None,
    "updated_at": wf.updated_at.isoformat() if wf.updated_at else None,
}
```

already sorted by `Workflow.created_at.desc()`. Since each row already includes full `nodes`/`edges`, no second per-workflow fetch is needed when a row is selected — the list response itself has everything required to populate the canvas.

### Frontend (`frontend/src/pages/WorkflowBuilder.tsx`)

Mirrors the existing Templates panel pattern exactly (same slide-in panel styling, same search-box pattern) so the new picker feels native to this page rather than bolted on.

1. **New state**, added alongside the existing `showTemplates`/`templateCategory`/`templateSearch` block (~line 87-89):
   ```tsx
   const [showLoadPicker, setShowLoadPicker] = useState(false);
   const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
   const [loadSearch, setLoadSearch] = useState("");
   const [loadPickerError, setLoadPickerError] = useState<string | null>(null);
   ```
   where `SavedWorkflow` is a new local type:
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

2. **`handleLoad` rewritten** (currently lines 634-650, reads `localStorage`): now opens the picker and fetches the list.
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
   The old `localStorage`-based behavior is removed entirely — no dual-path fallback, since the backend is now the single source of truth (matches the plan's "Templates" precedent of one clear data source per panel).

3. **New `handleSelectSavedWorkflow(wf: SavedWorkflow)`**, mirroring `handleLoadTemplate` (lines 754-766):
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

4. **Filtered list**, mirroring `filteredTemplates` (lines 768-773):
   ```tsx
   const filteredSavedWorkflows = savedWorkflows.filter((wf) => {
     const q = loadSearch.toLowerCase();
     return !q || wf.name.toLowerCase().includes(q);
   });
   ```

5. **Relative-time helper** for "updated X ago" display (new, small, local to this file — no new dependency):
   ```tsx
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

6. **Picker JSX** — new slide-in panel, placed adjacent to the existing Templates panel block (~after line 1055, sibling to `{showTemplates && (...)}`), same visual chrome (`w-96 bg-gray-900 border-l border-gray-700`):
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

7. **Mutual exclusivity with Templates panel**: the existing "Templates" button handler already does `setShowTemplates((v) => !v); setShowAutoBuild(false);` — update the "Load" button's `onClick` similarly so opening one panel closes the others:
   ```tsx
   onClick={() => { handleLoad(); setShowTemplates(false); setShowAutoBuild(false); }}
   ```

### Error handling

- Fetch failure (backend down) → inline error message in the panel (`loadPickerError`), not a toast — keeps the picker open so the user can see why it's empty, rather than a transient toast they might miss.
- Empty list (no workflows saved yet) vs. empty *search results* get distinct messages, so a new user isn't confused into thinking search is broken.

### Testing

No backend changes, so no new backend tests. Frontend: manual live verification only (per this repo's established pattern — `WorkflowBuilder.tsx` has no existing frontend unit test suite to extend, and adding one now would be a scope expansion beyond this fix). Verification plan: open Visual Builder, click Load, confirm the real saved workflows appear (e.g. "IT Incident Triage & Escalation"), select one, confirm it renders correctly on canvas, confirm search filters correctly, confirm the panel closes and Templates panel closes if it was open.

## Spec self-review

- **Placeholders:** none — every function body and JSX block is concrete, copied from and consistent with existing patterns in this exact file.
- **Consistency:** deliberately reuses `handleLoadTemplate`'s exact reset-state sequence so both panels behave identically after a load, and reuses `filteredTemplates`'s exact filter-predicate shape.
- **Scope:** single frontend file, no backend changes, no new dependencies. Right-sized for one implementation plan.
- **Ambiguity resolved:** "silent overwrite" and "list + load only, no delete" were both explicitly decided during brainstorming, not left implicit.
