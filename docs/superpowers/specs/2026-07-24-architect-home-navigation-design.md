# Architect Home Navigation Design

## Problem

Today, `Home.tsx` ("quick generate agent") is the only prompt+attachment entry point on the app's landing area, and it has its own lightweight clarify-question → single-agent-generation flow. That flow saves an `Agent` with only `name/description/system_prompt/model/tools/guardrails` — it has no way to produce a real multi-file RAG app, and its `tools` field never reflects real document retrieval (confirmed via a live test: a Loblaw support agent built through this flow returned `tools: ['web_search']` with no document ingestion at all).

Architect (`Architect.tsx`) already has a real prompt+document flow: it extracts text from uploaded files (`architectApi.extractDocText`), asks its own clarifying questions, and generates a full downloadable app (React UI + Python backend + FAISS-backed RAG), which is what users actually need for document-based agent requests.

Following Lyzr AI Studio's pattern of two separate landing surfaces (`studio.lyzr.ai` Home for Agent Studio vs `architect.new` for their Architect product), AgentForge should have the same split: keep the existing Home page for Agent Studio's own simple-agent creation, and add a new, separate minimal landing page whose only job is to capture a prompt + attachments and hand off into Architect's existing flow.

## Non-Goals

- No changes to Architect's own clarifying-question logic, generation logic, or UI beyond accepting one new router-state field.
- No changes to the existing Prompt Library → Architect, Blueprints → Architect, MyProjects → Architect, or WhatShouldIBuild → Architect handoffs.
- No removal of Home's/AgentStudioHome's own simple single-agent creation flow (clarify questions, preview card, Save & Open) — it stays as-is for Agent Studio's use case.

## Design

### 1. Rename `Home.tsx` → `AgentStudioHome.tsx`

Pure rename of the component file and its export; same route (`/`), same behavior, same simple single-agent generation flow it has today (clarify questions → preview card → Save & Open in Agent Studio). No functional changes.

### 2. New page: `ArchitectHome.tsx`

A new, minimal landing page styled after `architect.new`: a centered heading, a single prompt textarea, and an attach-file button (reusing Home's existing `extractFileText` helper to build `{name, text}[]` pairs from selected files). No clarify-question UI of its own — clarifying questions remain Architect's job.

New route added to the router (e.g. `/architect-home`), linked from the sidebar/nav alongside the existing Architect entry.

### 3. Handoff into Architect

On submit, `ArchitectHome` calls:

```tsx
navigate("/architect", {
  state: {
    prompt: promptText,
    files: attachedFiles.map(f => ({ name: f.name, text: fileContents[f.name] })),
  },
});
```

### 4. Architect.tsx changes (~line 5190-5267)

The existing router-state effect already handles `prompt` (auto-submits into a new session) and `sampleFile` (fetches a single sample CSV before submitting). Add a new branch for the plural `files` array, distinct from `sampleFile` so there's no key collision with Prompt Library's existing handoff:

```tsx
const incomingFiles = (location.state as any)?.files as { name: string; text: string }[] | undefined;
```

Inside the `if (queued)` block, check `incomingFiles` before the existing `sampleFile` branch:

```tsx
if (incomingFiles && incomingFiles.length > 0) {
  setFiles(incomingFiles);
  setTimeout(() => send(queued + QUESTIONS_SUFFIX, incomingFiles, newSid), 80);
} else if (sampleFile) {
  // ...existing sampleFile CSV-fetch logic, unchanged
} else {
  setTimeout(() => send(queued + QUESTIONS_SUFFIX, undefined, newSid), 80);
}
```

This reuses the exact `{name, text}[]` shape Architect's own `files` state and `send()` signature already expect — no new data shape, no re-extraction of text (Home/ArchitectHome already has it via `extractFileText`).

## Testing

- Manual: submit a prompt with 2-3 attached `.docx` files on the new Architect Home page; confirm Architect opens a new session, shows the files in its file list, and auto-submits the prompt (clarifying questions appear as normal).
- Manual regression: confirm Prompt Library's "Use this prompt" and MyProjects'/PublishedProjects'/SharedProjects' "Open in Architect" buttons still behave exactly as before (no `files` in their state, so the new branch is never taken for them).
- Manual regression: confirm `AgentStudioHome` (renamed from Home) still creates a simple agent via its existing clarify → preview → save flow, unaffected by the rename.
