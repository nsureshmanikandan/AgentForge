# AgentForge Marketplace (Agentlets-style) Design

## Problem

AgentForge's existing `/marketplace` page is a gallery of **tool integrations** (Gmail, Slack, GitHub, etc.), explicitly marked "not yet active" — connecting a tool there doesn't grant any agent real access. It doesn't help a user discover or start from a pre-built app idea.

Lyzr AI's Marketplace ("Agentlets") solves a different, more valuable problem: a searchable, filterable gallery of pre-built AI apps, where clicking one shows details (About, Created by, Tags, stats) and offers "View App" (see it running) and "Clone App" (start your own copy). This is exactly the kind of "I don't know what to build, show me an example" entry point AgentForge's Architect flow currently lacks.

Note: only Lyzr's *UX pattern* (layout, category taxonomy, card fields, interaction flow) is being reused. All copy, thumbnails, and template content are original AgentForge material — no text or images are copied from Lyzr's marketplace.

## Non-Goals

- A real third-party/community marketplace where arbitrary users publish templates (v1 uses a curated, hand-written list; wiring in AgentForge's own Published Projects feature is a natural future phase, not part of this spec).
- Real backend-tracked view/clone/rating counts (v1 uses localStorage-based counters, matching the existing Marketplace.tsx's `af_installed_integrations` pattern — good enough to make the UI feel alive without new backend work).
- Removing or changing the tool-integrations concept's underlying idea — it's simply removed from `/marketplace` since it was already marked non-functional; nothing else in the app depended on it.
- Live-generating a fresh preview on every "View App" click (cost/latency-prohibitive at gallery-browsing scale) — previews are pre-generated once per template.

## Design

### Architecture

Replace the contents of `frontend/src/pages/Marketplace.tsx` in place (same route `/marketplace`, same nav entry, same file). No backend routes or database changes for v1 — this is a frontend-only feature reading a static, hand-authored data file.

### Data model

A new file, `frontend/src/data/marketplaceTemplates.ts`, exporting:

```ts
interface MarketplaceTemplate {
  id: string;
  name: string;
  category: string;               // one of CATEGORIES below
  shortDescription: string;        // shown on the card
  about: string;                   // shown in the detail modal
  tags: string[];
  prompt: string;                  // the real Architect prompt used to generate this app
  previewImagePath: string;        // static asset, pre-generated once (see below)
  createdBy: string;               // "AgentForge Team" for all v1 entries
  publishedDate: string;           // ISO date string
}

const CATEGORIES = [
  "Automation", "Analytics & Insights", "Communication", "Content Creation",
  "Customer Support", "Data Processing", "Developer Tools",
  "Finance & Accounting", "HR & Recruiting", "Marketing", "Productivity",
  "Sales & CRM", "Other",
];
```

10-15 curated templates spanning most categories, each with an original name/description/prompt (e.g. "HR Policy FAQ Assistant" / HR & Recruiting, "Sales Lead Scorer" / Sales & CRM, "Support Ticket Triage" / Customer Support).

### Components

- **`Marketplace.tsx`** (page): search input (matches name/description/tags), sort control (Popular/Recent/Top Rated — Popular sorts by localStorage view count, Recent by `publishedDate`, Top Rated is a static placeholder ordering for v1 since there's no real rating data), category checkbox sidebar with active-filter chips + `Results (N)` count, responsive card grid.
- **`TemplateCard`** (new component, `frontend/src/components/TemplateCard.tsx`): thumbnail (`previewImagePath`), name, `shortDescription`, category badge, view count (read from localStorage), click opens the detail modal.
- **`TemplateDetailModal`** (new component, `frontend/src/components/TemplateDetailModal.tsx`): About, Created by, Tags, "View App" button, "Use This Template" button, Views/Clones/Rating stat tiles, Published/Updated dates.

### Interaction flow

- **"Use This Template"**: navigates to `/architect` via `react-router`'s `navigate(..., { state: { handoffPrompt: template.prompt } })`, reusing the existing handoff-and-auto-submit mechanism already built for file handoff into Architect (per this repo's own task history: "Auto-submit handed-off files in Architect.tsx"). Architect.tsx picks up `location.state.handoffPrompt` on mount and auto-sends it as the first chat message, triggering a real live generation. Increments the localStorage clone counter for that template's `id` before navigating.
- **"View App"**: opens `previewImagePath` in a lightbox/new tab — a static PNG screenshot (not a live embedded page, to avoid iframe-sandboxing complexity). These are pre-generated once, offline, by manually running each template's `prompt` through Architect's real sandbox generation and saving a screenshot of the resulting preview into `frontend/public/marketplace-previews/`. This is a one-time content-creation step per template, not runtime behavior. Increments the localStorage view counter for that template's `id`.

### Error handling

- If a template's `previewImagePath` fails to load, `TemplateCard`/`TemplateDetailModal` show a neutral placeholder icon (matching the existing Marketplace.tsx's icon-avatar fallback pattern) rather than a broken image.
- If `handoffPrompt` state is missing when Architect.tsx loads normally (i.e., user navigated there directly, not via a template), existing behavior is unchanged.

### Testing

- Manual: click through search, each category filter, each sort tab, open a detail modal, click "Use This Template" and confirm Architect auto-generates from the prompt, click "View App" and confirm the static preview opens.
- No new backend tests needed (frontend-only, no new endpoints).

## Content plan

10-15 templates will be authored covering at least: HR & Recruiting, Sales & CRM, Customer Support, Analytics & Insights, Automation, Productivity, Developer Tools, Marketing. Each template's prompt will be run once through Architect's real Agentic Code/RAG Template Code pipeline to confirm it generates cleanly (reusing this session's established verification pattern) before being added to the curated list, and to produce its stored preview asset.
