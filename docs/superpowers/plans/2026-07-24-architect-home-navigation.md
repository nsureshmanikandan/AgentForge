# Architect Home Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split AgentForge's single Home page into two: `AgentStudioHome` (the existing quick single-agent flow, renamed but unchanged) and a new `ArchitectHome` landing page that hands prompt+attached files off to Architect's existing chat flow, auto-submitting them exactly as Prompt Library already does.

**Architecture:** Rename `Home.tsx` → `AgentStudioHome.tsx` with no behavior changes. Add a new `ArchitectHome.tsx` page (prompt textarea + file attach, reusing the existing `extractFileText` helper) that navigates to `/architect` with `{ prompt, files }` in router state. Extend Architect's existing router-state effect to recognize the new `files` array and auto-submit through the same `send()` path Prompt Library's handoff already uses.

**Tech Stack:** React, TypeScript, react-router-dom, `mammoth` (docx text extraction, already a dependency), existing `architectApi`/`agentsApi` clients.

---

### Task 1: Rename Home.tsx to AgentStudioHome.tsx

**Files:**
- Create: `frontend/src/pages/AgentStudioHome.tsx`
- Delete: `frontend/src/pages/Home.tsx`
- Modify: `frontend/src/App.tsx:5` (import), `frontend/src/App.tsx:562` (route element)

- [ ] **Step 1: Copy Home.tsx to AgentStudioHome.tsx with renamed export**

Read the full current contents of `frontend/src/pages/Home.tsx` (734 lines) and write them to `frontend/src/pages/AgentStudioHome.tsx`, changing only line 108 from:

```tsx
export default function Home() {
```

to:

```tsx
export default function AgentStudioHome() {
```

No other lines change — every helper (`extractFileText`, `IntegrationIcon`, `TOOL_INTEGRATIONS`, `SUGGESTIONS`, `THEMES`), every piece of state, and the whole clarify-question/generate/save flow stays exactly as it is today.

- [ ] **Step 2: Delete the old Home.tsx**

```bash
rm frontend/src/pages/Home.tsx
```

- [ ] **Step 3: Update the import in App.tsx**

In `frontend/src/App.tsx:5`, change:

```tsx
import Home from "./pages/Home";
```

to:

```tsx
import AgentStudioHome from "./pages/AgentStudioHome";
```

- [ ] **Step 4: Update the route element in App.tsx**

In `frontend/src/App.tsx:562`, change:

```tsx
<Route path="/" element={<Home />} />
```

to:

```tsx
<Route path="/" element={<AgentStudioHome />} />
```

The route path (`/`) and the sidebar `NavLink to="/"` at `App.tsx:395-397` are unchanged — only the component name changed, so the "Home" nav label and behavior stay identical.

- [ ] **Step 5: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: build succeeds with no TypeScript errors (no remaining references to the old `Home` export anywhere).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AgentStudioHome.tsx frontend/src/App.tsx
git rm frontend/src/pages/Home.tsx
git commit -m "rename Home page to AgentStudioHome (no behavior change)"
```

---

### Task 2: Add the ArchitectHome page component

**Files:**
- Create: `frontend/src/pages/ArchitectHome.tsx`

- [ ] **Step 1: Write ArchitectHome.tsx**

```tsx
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import mammoth from "mammoth";

async function extractFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "docx") {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.slice(0, 3000);
  }
  if (ext === "txt" || ext === "md" || ext === "csv" || ext === "json") {
    return (await file.text()).slice(0, 3000);
  }
  if (ext === "pdf") {
    return `[PDF text extraction not supported in browser — please copy-paste the text content instead]`;
  }
  return `[Binary file: ${file.name}]`;
}

export default function ArchitectHome() {
  const [prompt, setPrompt] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files]);
    for (const file of files) {
      const text = await extractFileText(file);
      setFileContents((prev) => ({ ...prev, [file.name]: text }));
    }
  };

  const removeFile = (name: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name));
    setFileContents((prev) => { const n = { ...prev }; delete n[name]; return n; });
  };

  const handleSubmit = () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    const files = attachedFiles.map((f) => ({ name: f.name, text: fileContents[f.name] || "" }));
    navigate("/architect", { state: { prompt: prompt.trim(), files } });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-semibold text-slate-900 mb-3 tracking-tight">Architect</h1>
        <p className="text-gray-500 text-lg max-w-md mx-auto">
          The agent builder platform for business executives &amp; consultants.
        </p>
      </div>

      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-md p-5">
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachedFiles.map((f) => (
              <span key={f.name} className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full">
                {f.name}
                {fileContents[f.name] ? (
                  <span className="text-indigo-400 ml-0.5">✓</span>
                ) : (
                  <svg className="w-2.5 h-2.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <button onClick={() => removeFile(f.name)} className="ml-0.5 hover:text-indigo-900">×</button>
              </span>
            ))}
          </div>
        )}

        <textarea
          className="w-full text-gray-800 text-base outline-none resize-none placeholder-gray-400 min-h-[72px] leading-relaxed"
          placeholder="Build me a customer support chatbot using RAG..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
          }}
          rows={3}
        />

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium text-lg transition-colors"
            title="Attach files"
          >
            +
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.pdf,.md,.docx,.csv,.json"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !prompt.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {submitting ? "Opening Architect..." : "Build it"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: build succeeds (new file has no unresolved imports — `mammoth` is already a dependency used by `AgentStudioHome.tsx`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ArchitectHome.tsx
git commit -m "add ArchitectHome landing page for prompt+attachment entry into Architect"
```

---

### Task 3: Wire the ArchitectHome route and sidebar link

**Files:**
- Modify: `frontend/src/App.tsx:18` (import), `frontend/src/App.tsx:401-403` (sidebar nav), `frontend/src/App.tsx:577` (route)

- [ ] **Step 1: Import ArchitectHome in App.tsx**

In `frontend/src/App.tsx`, after line 18 (`import Architect from "./pages/Architect";`), add:

```tsx
import ArchitectHome from "./pages/ArchitectHome";
```

- [ ] **Step 2: Add the sidebar nav link**

In `frontend/src/App.tsx`, immediately before the existing Architect `NavLink` at line 401-403:

```tsx
<NavLink to="/architect" className={linkClass} title={collapsed ? "Architect" : undefined}>
  <IconArchitect />{!collapsed && "Architect"}
</NavLink>
```

add a new link for the landing page:

```tsx
<NavLink to="/architect-home" className={linkClass} title={collapsed ? "Architect Home" : undefined}>
  <IconArchitect />{!collapsed && "Architect Home"}
</NavLink>
```

- [ ] **Step 3: Add the route**

In `frontend/src/App.tsx`, immediately before line 577 (`<Route path="/architect" element={<Architect />} />`), add:

```tsx
<Route path="/architect-home" element={<ArchitectHome />} />
```

- [ ] **Step 4: Verify the frontend builds and the route is reachable**

Run: `cd frontend && npm run build`
Expected: build succeeds.

Run: `cd frontend && npm run dev` (or use the project's existing dev-server workflow), then navigate to `http://localhost:<port>/architect-home` in a browser.
Expected: the new landing page renders with the prompt box and attach button; the sidebar shows both "Architect Home" and "Architect" links.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "wire ArchitectHome route and sidebar link"
```

---

### Task 4: Extend Architect.tsx to accept and auto-submit handed-off files

**Files:**
- Modify: `frontend/src/pages/Architect.tsx:5194-5265`

- [ ] **Step 1: Read the current effect to confirm line numbers haven't shifted**

Run: `grep -n "processedLocationKey.current === location.key" frontend/src/pages/Architect.tsx`
Expected: a match near line 5192 (adjust the following edits' line numbers if it has shifted since this plan was written).

- [ ] **Step 2: Add the `incomingFiles` extraction**

In `frontend/src/pages/Architect.tsx`, immediately after line 5197 (`const autoDownload = (location.state as any)?.autoDownload as boolean | undefined;`), add:

```tsx
const incomingFiles = (location.state as any)?.files as { name: string; text: string }[] | undefined;
```

- [ ] **Step 3: Branch on `incomingFiles` before the existing `sampleFile` branch**

In `frontend/src/pages/Architect.tsx`, the current code (lines 5245-5264) reads:

```tsx
      const newSid = newSession();
      setInput(queued);
      if (sampleFile) {
        const csvUrl = sampleFile.url.replace(/\.xlsx$/, ".csv");
        const csvName = sampleFile.name.replace(/\.xlsx$/, ".csv");
        fetch(csvUrl)
          .then((r) => r.text())
          .then((text) => {
            if (text.trim()) {
              const preloaded = [{ name: csvName, text }];
              setFiles(preloaded);
              setTimeout(() => send(queued + QUESTIONS_SUFFIX, preloaded, newSid), 80);
            } else {
              setTimeout(() => send(queued + QUESTIONS_SUFFIX, undefined, newSid), 80);
            }
          })
          .catch(() => setTimeout(() => send(queued + QUESTIONS_SUFFIX, undefined, newSid), 80));
      } else {
        setTimeout(() => send(queued + QUESTIONS_SUFFIX, undefined, newSid), 80);
      }
```

Replace it with:

```tsx
      const newSid = newSession();
      setInput(queued);
      if (incomingFiles && incomingFiles.length > 0) {
        setFiles(incomingFiles);
        setTimeout(() => send(queued + QUESTIONS_SUFFIX, incomingFiles, newSid), 80);
      } else if (sampleFile) {
        const csvUrl = sampleFile.url.replace(/\.xlsx$/, ".csv");
        const csvName = sampleFile.name.replace(/\.xlsx$/, ".csv");
        fetch(csvUrl)
          .then((r) => r.text())
          .then((text) => {
            if (text.trim()) {
              const preloaded = [{ name: csvName, text }];
              setFiles(preloaded);
              setTimeout(() => send(queued + QUESTIONS_SUFFIX, preloaded, newSid), 80);
            } else {
              setTimeout(() => send(queued + QUESTIONS_SUFFIX, undefined, newSid), 80);
            }
          })
          .catch(() => setTimeout(() => send(queued + QUESTIONS_SUFFIX, undefined, newSid), 80));
      } else {
        setTimeout(() => send(queued + QUESTIONS_SUFFIX, undefined, newSid), 80);
      }
```

This adds the `incomingFiles` branch first, leaves the `sampleFile` branch (Prompt Library's mechanism) and the plain-prompt fallback completely intact and unreachable-order-wise unaffected — `sampleFile` and `incomingFiles` are never both set by any existing caller, so there's no ambiguity in which branch fires.

- [ ] **Step 4: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Manual regression test — Prompt Library still works**

Run the dev server, navigate to `/prompts`, click "Use this prompt" (or equivalent) on any existing prompt entry.
Expected: Architect opens a new session and auto-submits that prompt exactly as before (unaffected — `incomingFiles` is `undefined` for this path, so the `else if (sampleFile)` / final `else` branches are unchanged).

- [ ] **Step 6: Manual test — ArchitectHome handoff works end-to-end**

Navigate to `/architect-home`, type a prompt (e.g. "Build a customer support chatbot"), attach 1-2 `.docx`/`.txt` files, click "Build it".
Expected: browser navigates to `/architect`, a new chat session starts, the attached files appear in Architect's file list, and the prompt auto-submits (Architect's own clarifying questions, if any, appear as normal — no changes were made to that logic).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Architect.tsx
git commit -m "auto-submit prompt+files handed off from ArchitectHome into Architect's chat flow"
```

---

## Self-Review Notes

- **Spec coverage:** All four numbered design points from `2026-07-24-architect-home-navigation-design.md` are covered — rename (Task 1), new page (Task 2), route/nav wiring (Task 3), and the `incomingFiles` branch in Architect.tsx (Task 4). The spec's testing section (regression on Prompt Library, manual end-to-end test) is covered in Task 4 Steps 5-6.
- **Placeholder scan:** No TODOs/TBDs; every step has literal code or an exact command.
- **Type consistency:** `{name: string; text: string}[]` is used identically in `ArchitectHome.tsx`'s `handleSubmit`, the `navigate` call's `state.files`, and `Architect.tsx`'s `incomingFiles` type annotation — matches the existing `files`/`setFiles` state shape in `Architect.tsx` (confirmed via the pre-existing `sampleFile` branch's `preloaded = [{name, text}]` usage at the same call site).
