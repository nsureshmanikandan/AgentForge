# Workflow Builder — AI-Assisted Suggestions — Design

## Context

Two small, additive UX improvements to the Auto-Build and Run flows in the Workflow Builder,
approved in chat alongside the larger conditional-branching/approval-gate feature
(`2026-07-17-workflow-conditional-approval-design.md`). Both reuse the existing
`AzureOpenAIClient` (already model-agnostic, reads deployment from settings) — no new
model-specific code.

## Goals

**1. Auto-Build idea suggestions**
- As the user types a workflow name, show 3-4 realistic, distinct agentic workflow idea
  suggestions (title + short description) related to what they've typed so far.
- Clicking a suggestion fills the Description textarea with that idea's description.
- Purely additive — if the user never engages with suggestions, today's behavior is unchanged.

**2. Auto-generated Run input**
- When the "Run Workflow" dialog opens, automatically call GPT-4o with the workflow's node
  labels/roles/descriptions and pre-fill the input textarea with one realistic example input
  matching what this specific pipeline expects, instead of leaving it blank.
- User can still edit the pre-filled text before clicking Execute.

## Non-Goals

- Caching/deduplicating repeated suggestion requests (acceptable to call GPT-4o fresh each time
  for this narrow pass).
- Suggestions for the Description field's *content* beyond the initial idea-fill (no live
  as-you-type description autocomplete).

## Backend Changes

**`backend/app/api/builder.py`** — two new endpoints, same file as everything else Workflow
Builder related (already has `AutoBuildRequest`, `AzureOpenAIClient` imported).

```python
class SuggestIdeasRequest(BaseModel):
    partial_name: str

@router.post("/suggest-ideas")
async def suggest_ideas(body: SuggestIdeasRequest):
    """Return 3-4 realistic agentic workflow ideas related to the partial name typed so far."""
    client = AzureOpenAIClient()
    messages = [
        {"role": "system", "content": (
            "You are helping a user brainstorm an AI agent workflow. Given a partial workflow "
            "name/topic, return 3-4 distinct, realistic agentic pipeline ideas as a JSON array. "
            'Each item: {"title": "<short title>", "description": "<1-2 sentence pipeline '
            'description suitable for an Auto-Build description field>"}. Return ONLY the JSON '
            "array, no markdown fences, no explanation."
        )},
        {"role": "user", "content": f"Partial workflow name/topic: {body.partial_name}"},
    ]
    raw = await client.chat(messages, temperature=0.6)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        ideas = json.loads(raw.strip())
    except Exception:
        return {"ideas": []}
    return {"ideas": ideas[:4]}


class SuggestInputRequest(BaseModel):
    nodes: list[dict]

@router.post("/suggest-input")
async def suggest_input(body: SuggestInputRequest):
    """Given a workflow's nodes, generate one realistic example input to trigger it with."""
    client = AzureOpenAIClient()
    node_summary = "\n".join(
        f"- {n.get('data', {}).get('label', n.get('id'))} "
        f"({n.get('data', {}).get('role', 'agent')}): "
        f"{n.get('data', {}).get('description', '')}"
        for n in body.nodes
    )
    messages = [
        {"role": "system", "content": (
            "You are helping a user test an AI agent pipeline. Given the pipeline's nodes below, "
            "write ONE realistic, specific example input a real user might submit to trigger this "
            "exact pipeline. Return ONLY the example input text, no quotes, no explanation, no "
            "markdown."
        )},
        {"role": "user", "content": f"Pipeline nodes:\n{node_summary}"},
    ]
    raw = await client.chat(messages, temperature=0.5)
    return {"suggested_input": raw.strip()}
```

Both endpoints are unauthenticated, matching the existing (pre-existing, out of scope to change
here) lack of auth on the rest of `builder.py`'s endpoints.

## Frontend Changes

**`frontend/src/pages/WorkflowBuilder.tsx`**

Auto-Build panel:
- Add debounced (500ms) `useEffect` on the Name input's value — once it has 3+ characters, call
  `POST /api/builder/suggest-ideas` with `{partial_name: name}`, store results in a new
  `ideaSuggestions` state array.
- Render up to 4 suggestion cards below the Name field (title + description), each with an
  `onClick` that sets the Description textarea's value to that idea's `description`.
- Clear suggestions when the Auto-Build panel closes or the user clears the Name field.

Run dialog:
- On dialog open (`useEffect` keyed on the dialog's open state), immediately call
  `POST /api/builder/suggest-input` with `{nodes: currentWorkflowNodes}`, show a brief loading
  indicator in the textarea placeholder, then set the textarea's value to `suggested_input` once
  the response arrives.
- If the call fails (network error, malformed response), leave the textarea blank with today's
  existing placeholder text — never block the user from typing their own input manually.

## Error Handling

- `suggest_ideas` returns `{"ideas": []}` on any parse failure rather than a 500 — the frontend
  simply shows no suggestion cards, no error toast (this is a nice-to-have, not core functionality).
- `suggest_input` failures are caught client-side; the Run dialog still opens and functions
  normally with an empty textarea, exactly as it does today.

## Testing / Verification Plan

Both are live-testable end-to-end against the real running backend (no external credentials
needed, unlike the email-approval feature) — same pattern as this session's earlier live tests:
1. Call `POST /api/builder/suggest-ideas` with a real partial name (e.g. `"Expense"`) and confirm
   3-4 distinct, relevant ideas come back with real titles/descriptions.
2. Call `POST /api/builder/suggest-input` with the real "Expense Approval Pipeline" nodes from
   this session's live test and confirm a realistic, pipeline-specific input string comes back
   (not a generic placeholder).
3. Live browser test: type a partial name in Auto-Build, confirm suggestion cards render and
   clicking one fills the Description field; open the Run dialog on a saved workflow and confirm
   the textarea auto-fills with a real generated input.
