# Multi-Framework Agent Code Export (LangGraph / Microsoft Agent Framework / CrewAI)

## Problem

Visual Workflow Builder's "Export Code" today generates one thing: a from-scratch Python
script (client-side, `WorkflowBuilder.tsx::handleExportCode`) that mirrors the live canvas
engine's own hand-rolled topological-sort executor (`backend/app/api/builder.py`). It uses no
agent framework at all — no LangGraph, no LangChain graph constructs, nothing. Confirmed by
direct code inspection: zero `langgraph`/`crewai`/`Microsoft Agent Framework` imports or
dependencies exist anywhere in the repo today.

The user wants a UI choice — LangGraph (default) / Microsoft Agent Framework / CrewAI — each
producing a real, idiomatic, deployable project in that framework's own SDK shape, as a
step toward eventually deploying exported agents into Azure AI Foundry Agents (a separate,
later spec — Foundry's Hosted Agents already natively support all three frameworks, confirmed
via Microsoft's own docs, so nothing about this export design needs to special-case any one
framework for Foundry-compatibility reasons).

## Non-Goals

- Azure AI Foundry deployment itself (CI/CD pipeline or UI-driven deploy) — a separate
  follow-on spec, once real exported projects exist to deploy.
- A "memory" node type on the canvas. The canvas has no memory/persistence concept today and
  neither does today's Export Code; this design keeps that parity (see Memory & State below).
- LLM-assisted code generation. The canvas's node schema is a small, fully-enumerated set of
  ~8-11 role types with well-known fields (confirmed: `input`, `agent`, `classifier`,
  `condition`, `router`, `http_request`, `approval`, `output`, `responder`, `guard`, `rag`) —
  this is a bounded structural translation problem, not open-ended generation, so it's solved
  deterministically. (Contrast with Architect's Custom Code Export, which legitimately needs
  an LLM because it translates open-ended natural language into arbitrary business logic.)

## Design

### Where the translation happens

New backend module `backend/app/api/builder_export.py`, three pure functions:

```python
def _export_langgraph(nodes: list[dict], edges: list[dict], workflow_name: str) -> dict[str, str]: ...
def _export_ms_agent_framework(nodes: list[dict], edges: list[dict], workflow_name: str) -> dict[str, str]: ...
def _export_crewai(nodes: list[dict], edges: list[dict], workflow_name: str) -> dict[str, str]: ...
```

Each returns `{"path": "content"}` for a full downloadable project: the framework-native
script, a pinned `requirements.txt`, a `Dockerfile`, and a `README.md` with run + deploy
notes — matching the shape Architect's Custom Code Export already produces, so the frontend
reuses the exact same "backend returns `{files: {...}}`, frontend zips with jszip and
downloads" pattern already in the codebase.

New endpoint, `backend/app/api/builder.py`:

```python
@router.post("/export-code")
async def export_workflow_code(req: ExportCodeRequest):
    # req: {nodes, edges, workflow_name, framework: "langgraph" | "ms_agent_framework" | "crewai"}
    ...
```

### Frontend change

`WorkflowBuilder.tsx`: a `<select>` next to the existing "Export Code" button (LangGraph
default / Microsoft Agent Framework / CrewAI). Clicking Export Code now POSTs
`{nodes, edges, workflow_name, framework}` to the new endpoint instead of building the string
client-side, and zips the returned `files` dict for download — the toolbar UX is otherwise
unchanged (one click, one download).

### Per-framework node mapping

Translation target for each of the canvas's node roles, using each framework's real,
idiomatic primitives — filling native gaps with small, clearly-commented custom glue rather
than forcing identical control-flow shapes across all three (confirmed direction from user):

| Canvas role | LangGraph | Microsoft Agent Framework | CrewAI |
|---|---|---|---|
| `input` / `output` | graph entry/exit state keys | workflow input/output | `Task` input / final `Crew` result |
| `agent` / `classifier` / `responder` / `guard` | a node function calling a bound chat model | a `ChatAgent` | an `Agent` with a `Task` |
| `condition` / `router` | `add_conditional_edges` keyed on the rule / router output | native conditional workflow edges | custom glue: a small dispatcher function reading the upstream `Task` output, since CrewAI has no native branching primitive |
| `http_request` | a plain async tool function (`httpx`), bound as a graph node | a native function tool | a custom `@tool`-decorated function passed to the relevant `Agent` |
| `approval` | `interrupt()` inside the node, resumed via `Command(resume=...)` | native context-provider-based pause where available, else custom glue | custom glue: a pause/resume helper (CrewAI has no native human-in-the-loop primitive), documented clearly as a gap filled by AgentForge, not the framework |

Multi-agent/supervisor canvas patterns (today's demo workflows #5 and #8) map to: a linear
chain of nodes in LangGraph, a chain of `ChatAgent`s in Microsoft Agent Framework, and
CrewAI's own multi-`Agent` `Crew` — the pattern CrewAI is natively strongest at.

### LLM wiring

Every export reads the same three env-var groups AgentForge's own backend already uses
(`AZURE_OPENAI_*` / `GEMINI_*` / `LMSTUDIO_*`) and wires them into that framework's native
model-client class:

- **LangGraph**: `AzureChatOpenAI` / `ChatGoogleGenerativeAI` / an OpenAI-compatible client for
  LM Studio, bound per node.
- **Microsoft Agent Framework**: its Azure OpenAI chat client, passed into each `ChatAgent`.
- **CrewAI**: the `llm=` parameter on each `Agent`.

Each generated `README.md` documents that LM Studio is local-dev-only — a cloud-deployed
container can't reach a local model server, so Azure OpenAI or Gemini are the real options
once deployed.

### Memory & state

The canvas has no memory node today, and neither does today's Export Code — this design keeps
that parity. **Every export defaults to stateless, single-run execution**, matching current
behavior exactly:

- LangGraph: no `checkpointer=` configured by default.
- Microsoft Agent Framework: `InMemoryHistoryProvider` (in-process, ephemeral) if a history
  provider is wired at all.
- CrewAI: `memory=False` (omitted).

Each `README.md` includes a clearly-commented extension point showing how to add real
persistence later per framework (LangGraph `PostgresSaver`/`PostgresStore` + LangMem;
Microsoft Agent Framework's `CosmosMemoryContextProvider`; CrewAI's `memory=True`) — with an
explicit warning on CrewAI specifically, since its long-term/entity memory defaults to local
file storage (SQLite/ChromaDB) that does not survive in a containerized deployment without a
real backend swapped in first. Turning on real memory is out of scope for this pass; the
canvas has no first-class way to express it yet.

### Testing

- `backend/app/tests/test_builder_export.py`: one pytest module per framework, each with
  synthetic `{nodes, edges}` fixtures reproducing the real patterns already exercised in the
  user's 8 live demo workflows (classifier → router → http_request → approval; the 4-agent
  chain; the condition-gated auto-vs-human branch; the supervisor/specialist split) — asserting
  the generated code contains the right real constructs (`StateGraph(`, `add_conditional_edges(`,
  `ChatAgent(`, `Crew(`, etc.), not just that something was returned.
- For LangGraph specifically (the default): an additional smoke-level check that actually
  `pip install`s `langgraph` and imports/instantiates a generated project's graph, for a real
  run-it-and-see guarantee beyond string matching.
- Manual verification pass (this build): actually install each framework's SDK in an isolated
  venv, generate a project from a real synthetic workflow per framework, and confirm it
  imports and runs against a real configured LLM provider before calling this done.

## Testing (self-review)

- Placeholder scan: none found — every section above is a concrete decision, not a TBD.
- Internal consistency: node-mapping table matches the "best native equivalent, fill gaps
  with glue" decision; memory section matches the "stateless by default" decision; both were
  explicit user answers, not assumptions.
- Scope: focused enough for one implementation pass — three translator modules + one endpoint
  + one frontend dropdown + tests. Foundry deployment deliberately excluded as a separate spec.
- Ambiguity check: "idiomatic" is defined concretely per framework in the mapping table rather
  than left to interpretation.
