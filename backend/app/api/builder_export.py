"""
Multi-framework agent code export for the Visual Workflow Builder.

Translates the canvas's own {nodes, edges} JSON -- the same shape
`_run_pipeline_from` in builder.py executes live, and the same shape
Export JSON/Import JSON already round-trips losslessly -- into a full,
deployable project using each target framework's real SDK:

- LangGraph:                StateGraph + add_conditional_edges + interrupt()
- Microsoft Agent Framework: WorkflowBuilder + ChatAgent + conditional add_edge()
- CrewAI:                    Agent/Task/Crew + small custom glue for the two
                             node roles (condition/router branching, approval
                             pause) CrewAI has no native primitive for.

This is a deterministic, LLM-free translation: the canvas's node schema is a
small, fully-enumerated set of role types with well-known fields, so a
hand-written mapping is more reliable, cheaper, and more testable than an
LLM-generated one -- see
docs/superpowers/specs/2026-07-26-multi-framework-agent-export-design.md.

Every export defaults to STATELESS, single-run execution (no checkpointer /
no persistent memory store), matching the canvas's own current behavior --
see the design doc's Memory & State section for why, and for the documented
extension points each generated README points to instead.
"""
import json
import re


# ─── Shared helpers ─────────────────────────────────────────────────────────

_AGENT_LIKE_ROLES = {"agent", "classifier", "responder", "guard", "rag"}
_STRUCTURAL_ROLES = {"condition", "router", "http_request", "approval"}


def _safe_id(node_id: str) -> str:
    """A canvas node id (often a uuid or React-Flow-generated string) into a
    valid Python identifier."""
    ident = re.sub(r"[^a-zA-Z0-9_]", "_", node_id)
    if not ident or ident[0].isdigit():
        ident = f"n_{ident}"
    return ident


def _field(node: dict, key: str, default=""):
    """Read a node field from either the flat shape or the data={} shape --
    both are observed in practice (see builder.py's own identical pattern)."""
    data = node.get("data", {}) if isinstance(node.get("data"), dict) else {}
    return data.get(key) or node.get(key) or default


def _role(node: dict) -> str:
    return str(_field(node, "role", "agent"))


def _label(node: dict) -> str:
    return str(_field(node, "label", node.get("id", "node")))


def _topo_sort_export(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Python port of builder.py::_topo_sort -- same Kahn's-algorithm
    behavior (falls back to canvas order on a cycle), so exported execution
    order matches the live engine."""
    node_map = {n["id"]: n for n in nodes}
    adj: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}
    for e in edges:
        src, tgt = e.get("source", ""), e.get("target", "")
        if src in adj and tgt in in_degree:
            adj[src].append(tgt)
            in_degree[tgt] += 1
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    result = []
    while queue:
        nid = queue.pop(0)
        result.append(node_map[nid])
        for neighbor in adj[nid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    visited_ids = {n["id"] for n in result}
    for n in nodes:
        if n["id"] not in visited_ids:
            result.append(n)
    return result


def _outgoing(edges: list[dict], node_id: str) -> list[dict]:
    return [e for e in edges if e.get("source") == node_id]


def _normalize_nodes(nodes: list[dict]) -> list[dict]:
    """Flatten every node to a plain dict with all fields at the top level,
    so the rest of this module never has to branch on flat-vs-data shape."""
    out = []
    for n in nodes:
        out.append({
            "id": n["id"],
            "role": _role(n),
            "label": _label(n),
            "description": str(_field(n, "description", "")),
            "rule": str(_field(n, "rule", "")),
            "approver_email": str(_field(n, "approver_email", "")),
            "url": str(_field(n, "url", "")),
            "method": str(_field(n, "method", "GET")).upper(),
            "headers": str(_field(n, "headers", "")),
            "body": str(_field(n, "body", "")),
        })
    return out


def _env_example() -> str:
    return (
        "# Pick ONE provider -- matches AgentForge's own 3-way provider config.\n"
        "LLM_PROVIDER=azure\n"
        "\n"
        "# Azure OpenAI (used when LLM_PROVIDER=azure)\n"
        "AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/\n"
        "AZURE_OPENAI_API_KEY=your-key-here\n"
        "AZURE_OPENAI_DEPLOYMENT=gpt-4o\n"
        "AZURE_OPENAI_API_VERSION=2024-12-01-preview\n"
        "\n"
        "# Google Gemini (used when LLM_PROVIDER=gemini)\n"
        "GEMINI_API_KEY=\n"
        "GEMINI_MODEL=gemini-3.1-flash-lite\n"
        "\n"
        "# Local LM Studio (used when LLM_PROVIDER=lmstudio) -- LOCAL DEV ONLY.\n"
        "# A cloud-deployed container cannot reach a model server on your laptop;\n"
        "# switch to azure or gemini before deploying (e.g. to Azure AI Foundry\n"
        "# Hosted Agents).\n"
        "LMSTUDIO_BASE_URL=http://localhost:1234/v1\n"
        "LMSTUDIO_MODEL=qwen/qwen3.5-9b\n"
    )


def _gitignore() -> str:
    return (
        ".env\n"
        "!.env.example\n"
        "__pycache__/\n"
        "*.pyc\n"
        "*.db\n"
        ".pytest_cache/\n"
        ".venv/\n"
        "venv/\n"
    )


def _dockerignore() -> str:
    return (
        ".env\n"
        ".git/\n"
        "__pycache__/\n"
        "*.pyc\n"
        "*.db\n"
        ".pytest_cache/\n"
        "tests/\n"
        "requirements-dev.txt\n"
        "README.md\n"
    )


def _dockerfile(entry_module: str) -> str:
    return f'''FROM python:3.12.8-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12.8-slim
WORKDIR /app
ENV PATH="/opt/venv/bin:$PATH" \\
    PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends curl \\
    && rm -rf /var/lib/apt/lists/* \\
    && useradd --create-home --shell /bin/bash appuser
COPY --from=builder /opt/venv /opt/venv
COPY . .
RUN chown -R appuser:appuser /app
USER appuser
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
    CMD curl -f http://localhost:8088/readiness || exit 1
EXPOSE 8088
CMD ["python", "foundry_main.py"]
'''


def _readme(framework: str, workflow_name: str, extra_notes: str, memory_note: str) -> str:
    return (
        f"# {workflow_name} -- {framework} export\n\n"
        f"Generated by AgentForge's Visual Workflow Builder from the live canvas graph.\n\n"
        "## Setup\n\n"
        "```bash\n"
        "python -m venv venv && venv\\Scripts\\activate   # (or source venv/bin/activate on Mac/Linux)\n"
        "pip install --upgrade pip   # avoids a cryptic InvalidVersion error some older pip\n"
        "                            # versions raise resolving this project's dependencies\n"
        "cp .env.example .env   # fill in your chosen provider's credentials\n"
        "pip install -r requirements.txt\n"
        "python main.py \"your test input text here\"\n"
        "```\n\n"
        "## Deploying to Azure AI Foundry\n\n"
        "This project ships `foundry_main.py` (the Hosted Agent entrypoint) and a minimal "
        "`azure.yaml` + `infra/` -- verified end-to-end against a real Foundry resource. There "
        "are two ways to run the `azd` commands below; pick whichever fits:\n\n"
        "- **Option A -- locally**: if `azd`/`az` are already installed on your machine and can "
        "reach the internet. Just run the commands below directly.\n"
        "- **Option B -- Azure Cloud Shell**: no local install needed, and this is the one that "
        "works even if your machine's corporate security software blocks `azd`'s network calls "
        "(confirmed live: a `net/http: TLS handshake timeout` specific to `azd`, a Go binary, "
        "while `curl` and the browser reached the exact same host fine -- a common corporate-"
        "laptop pattern, not a one-off). For this option:\n\n"
        "  1. Zip this exported project folder (from one level above it, so the zip's root is "
        "this folder's contents, not the folder itself). On Windows: right-click the folder -> "
        "**Send to** -> **Compressed (zipped) folder**.\n"
        "  2. Open the [Azure Portal](https://portal.azure.com) and click the Cloud Shell icon "
        "(`>_`) in the top bar.\n"
        "  3. If Cloud Shell opens in PowerShell mode, click **Switch to Bash**.\n"
        "  4. Click the **Upload/download files** icon in the Cloud Shell toolbar and upload "
        "your zip.\n"
        "  5. Extract it, then run every command below from inside that folder, exactly as "
        "written:\n\n"
        "     ```bash\n"
        "     mkdir -p ~/my-agent && cd ~/my-agent\n"
        "     unzip ~/<your-zip-file>.zip\n"
        "     ```\n\n"
        "  Cloud Shell auto-authenticates `az`, but `azd` still needs its own separate "
        "`azd auth login` below -- it'll open a device-code flow (a URL + code to enter in a "
        "browser), which works fine even though Cloud Shell has no GUI of its own.\n\n"
        "Either way, the rest is identical from here:\n\n"
        "```bash\n"
        "azd auth login\n"
        "azd ext install azure.ai.agents\n"
        "azd ai agent init\n"
        "```\n\n"
        "`azd ai agent init` asks a series of questions -- answer them like this:\n\n"
        "- **How do you want to initialize your agent?** -> Use the code in the current directory\n"
        "- **Enter the file path for the entry point of the agent** -> type `foundry_main.py` "
        "(it auto-suggests `main.py` -- that's your local test-run script, NOT the Foundry "
        "server; using it here means the container never exposes a `/readiness` endpoint and "
        "the deployed agent never comes online)\n"
        "- **How should dependencies be resolved?** -> Remote build\n"
        "- **Which protocols does your agent support?** -> responses\n"
        "- **Select a Foundry project** -> your existing project (or create a new one)\n"
        "- **How would you like to configure model(s)?** -> Use an existing model deployment, "
        "then pick your deployment\n\n"
        "This appends a `services:` entry to `azure.yaml` for you -- don't hand-write one.\n\n"
        "Next, load your provider credentials as azd environment values (NOT literal values in "
        "`azure.yaml` -- `azd`'s env substitution only understands plain `${VAR}` references, "
        "not a Foundry connection placeholder):\n\n"
        "```bash\n"
        "azd env set --file .env   # loads your filled-in .env in one shot\n"
        "```\n\n"
        "Then open `azure.yaml`, find the `environmentVariables:` list under your agent's "
        "service block, and add an entry per credential your provider needs (matching "
        "`.env.example`'s names), e.g.:\n\n"
        "```yaml\n"
        "            - name: AZURE_OPENAI_ENDPOINT\n"
        "              value: ${AZURE_OPENAI_ENDPOINT}\n"
        "```\n\n"
        "Finally:\n\n"
        "```bash\n"
        "azd up\n"
        "```\n\n"
        "## Testing your deployed agent\n\n"
        "`azd up` prints two things once it finishes -- an **Agent Playground** link (opens a "
        "chat UI in the Foundry portal, no setup needed) and an **Agent endpoint** URL. Either "
        "one works for testing; the Playground is the fastest way to just try it.\n\n"
        "From a terminal instead:\n\n"
        "```bash\n"
        "azd ai agent invoke <agent-name> '{\"input\": \"your test message\"}'\n"
        "```\n\n"
        "If anything comes back looking like an error or an unreadable dump instead of a real "
        "answer, check the container's own logs (this is the single most useful debugging step "
        "for a Foundry Hosted Agent -- most failures never surface in the CLI output above):\n\n"
        "```bash\n"
        "azd ai agent monitor --tail 100\n"
        "```\n\n"
        f"{extra_notes}\n"
        "## Observability\n\n"
        "This export is instrumented with OpenTelemetry (`agentforge_runtime.py`'s "
        "`configure_observability()`): once deployed to Foundry, traces flow automatically to "
        "the project's Application Insights instance (Foundry injects "
        "`APPLICATIONINSIGHTS_CONNECTION_STRING`) -- view them under **Investigate -> "
        "Transaction search**. Locally, spans print to the console. Prompt/response content is "
        "excluded from spans and logs by default (PII/secrets safety); set `OTEL_LOG_PROMPTS=true` "
        "to include it for local debugging.\n\n"
        "## Memory & state\n\n"
        f"{memory_note}\n"
    )


def _azure_yaml(workflow_name: str) -> str:
    """A minimal azd project descriptor -- deliberately does NOT pre-populate
    a `services:` block. Confirmed live: the real deployment flow requires
    running `azd ai agent init` first (it's what actually creates and wires
    the Foundry project + agent service, discovering your real subscription/
    project/model interactively), and that command APPENDS its own service
    entry into this file rather than replacing one that's already there --
    a pre-filled block here just becomes a second, stale, conflicting entry
    that has to be deleted by hand. It also confirmed live that `azd`'s
    envsubst-based env substitution cannot parse the double-brace
    `${{connections.<name>.<path>}}` Foundry-secret-placeholder syntax this
    function used to emit ("unable to parse variable name") -- secrets are
    wired via `azd env set` + plain single-brace `${VAR}` references
    instead, which `azd ai agent init` sets up correctly on its own. See the
    README's Foundry deployment section for the full, verified step-by-step.
    """
    safe_name = "".join(c if c.isalnum() or c == "-" else "-" for c in workflow_name.lower())[:63].strip("-") or "agent"
    return f'''# yaml-language-server: $schema=https://raw.githubusercontent.com/Azure/azure-dev/main/schemas/v1.0/azure.yaml.json
name: {safe_name}
'''


def _infra_bicep() -> str:
    """A minimal placeholder Bicep template. `azd up`/`azd deploy` require
    infra/main.bicep to exist and declare at least one resource -- confirmed
    live ("ARM template contains no resources" on an empty/output-only
    template) -- even when the actual Foundry project + agent are entirely
    provisioned by the `azure.ai.agent`/`azure.ai.project` extension
    providers `azd ai agent init` wires up, not by this file. The tag
    resource below is harmless (it only labels the existing resource group)
    and satisfies that requirement without provisioning anything real."""
    return '''targetScope = 'resourceGroup'

@description('Name of the azd environment')
param environmentName string

@description('Location for resources')
param location string = resourceGroup().location

resource rgTags 'Microsoft.Resources/tags@2022-09-01' = {
  name: 'default'
  properties: {
    tags: {
      'azd-env-name': environmentName
    }
  }
}

output AZURE_LOCATION string = location
'''


def _infra_parameters() -> str:
    return '''{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "environmentName": { "value": "${AZURE_ENV_NAME}" },
    "location": { "value": "${AZURE_LOCATION}" }
  }
}
'''


def _foundry_wrapper_langgraph() -> str:
    """Uses langchain_azure_ai.agents.hosting.ResponsesHostServer, the real,
    documented pattern for hosting a LangGraph graph on Foundry -- see
    https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/langchain-hosted-agents
    (verified against current docs, not guessed).

    ResponsesHostServer's default request converter only supports graphs
    whose state declares a `messages` field (LangGraph's conventional
    MessagesState) -- confirmed live it raises ValueError at construction
    for this export's custom WorkflowState (input/output/context/_branch),
    REGARDLESS of whether build_input is overridden, because the schema
    check runs unconditionally in the base __init__. The documented fix
    ("subclass and override build_input") is real but incomplete on its
    own -- the private `_validate_graph_schema` staticmethod must also be
    overridden to skip that check. This is fragile (an underscore-prefixed
    method on an explicitly-preview API, "subject to change" per its own
    ExperimentalWarning) but is the only working option today -- confirmed
    live end-to-end, including a real Azure OpenAI call through it."""
    return '''"""
Foundry Hosted Agent entrypoint -- wraps this export's compiled LangGraph
graph (already checkpointed with SqliteSaver, see main.py) through the
Responses protocol so `azd up` can deploy it directly.

WorkflowResponsesHost overrides two things ResponsesHostServer needs for a
custom (non-`messages`-based) LangGraph state schema -- see this module's
own comment above for why both overrides are required, not just build_input.
"""
import os
from main import compiled
from langchain_azure_ai.agents.hosting import ResponsesHostServer


class WorkflowResponsesHost(ResponsesHostServer):
    @staticmethod
    def _validate_graph_schema(graph):
        pass  # custom WorkflowState schema, not messages-based -- see module docstring

    async def build_input(self, request, context, *, skip_call_ids=None):
        text = await context.get_input_text()
        return {"input": text, "output": "", "context": {}, "_branch": ""}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8088"))
    WorkflowResponsesHost(compiled).run(port=port)
'''


def _foundry_wrapper_ms_agent_framework() -> str:
    """Uses azure-ai-agentserver-responses' real API -- verified against the
    installed package directly (not guessed from C# docs, which use a
    differently-shaped IResponseHandler interface than the Python package
    actually exposes): ResponsesAgentServerHost() + the @app.response_handler
    decorator, returning a TextResponse built from an async callable.

    workflow.run() returns a WorkflowRunResult -- a list[WorkflowEvent]
    subclass containing every internal event of the run, confirmed live by
    the deployed agent answering every question with a multi-thousand-
    character dump of raw WorkflowEvent/AgentExecutorResponse reprs instead
    of an answer. get_outputs() (reads events the output node's
    ctx.yield_output() call produced -- see _export_ms_agent_framework) is
    the real accessor for the actual result, confirmed against the
    installed agent_framework SDK source directly.

    Also handles resuming a paused approval node THROUGH the deployed
    endpoint, not just main.py's local --resume CLI flag: send
    "RESUME: <run_id> <decision>" as the message text (the run_id and
    approver email are given back in the pause message below). Without
    this, main.py's approval-node pause was reachable over HTTP (nothing
    stopped WorkflowPaused from propagating out of workflow.run() here) but
    had no way to ever be resumed again once deployed -- and worse, every
    paused run was silently colliding under the same fallback run_id, since
    this file never set one at all before this fix (see main.py's _run_id
    ContextVar comment for why a plain module global wasn't safe for a
    concurrent HTTP handler)."""
    return '''"""
Foundry Hosted Agent entrypoint -- wraps this export's WorkflowBuilder-based
workflow (see main.py) through the Responses protocol.

Supports resuming a paused approval node directly through this deployed
endpoint: send "RESUME: <run_id> <decision>" as the message text -- the
run_id and approver email are given back to you in the pause message.
"""
import os
import re

from main import workflow, WorkflowPaused, _run_id, new_run_id, load_pause, clear_pause
from azure.ai.agentserver.responses import ResponsesAgentServerHost, TextResponse

app = ResponsesAgentServerHost()

_RESUME_PATTERN = re.compile(r"^\\s*RESUME:\\s*(\\S+)\\s+(.+)$", re.IGNORECASE)


@app.response_handler
async def handle(request, context, cancellation_signal):
    user_text = await context.get_input_text()

    async def _run_and_extract(workflow_input: str) -> str:
        try:
            result = await workflow.run(workflow_input)
            # get_outputs() reads events the output node's ctx.yield_output()
            # call produced (see main.py's output-node executor +
            # _extract_text) -- already a plain string by the time it
            # reaches here.
            outputs = result.get_outputs()
            return str(outputs[-1]) if outputs else "Workflow completed with no output yielded."
        except WorkflowPaused as p:
            return (
                f"Paused at '{p.node_label}' -- awaiting approval from {p.approver_email}. "
                f"Context: {p.context}. To resume, send: RESUME: {_run_id.get()} approved"
            )

    async def _get_text() -> str:
        resume_match = _RESUME_PATTERN.match(user_text)
        if resume_match:
            run_id, decision = resume_match.group(1), resume_match.group(2)
            paused = load_pause(run_id)
            if paused is None:
                return f"No paused run found for run_id={run_id!r}."
            clear_pause(run_id)
            _run_id.set(run_id)
            return await _run_and_extract(decision)

        _run_id.set(new_run_id())
        return await _run_and_extract(user_text)

    return TextResponse(context, request, text=_get_text)


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", "8088")))
'''


def _foundry_wrapper_crewai() -> str:
    """Uses azure-ai-agentserver-responses' real API -- verified against the
    installed package directly (see _foundry_wrapper_ms_agent_framework)."""
    return '''"""
Foundry Hosted Agent entrypoint -- wraps this export's run_graph()-driven
workflow (see main.py) through the Responses protocol.
"""
import os

from main import NODES, EDGES, HANDLERS
from agentforge_runtime import run_graph, new_run_id, load_settings, configure_observability
from azure.ai.agentserver.responses import ResponsesAgentServerHost, TextResponse

app = ResponsesAgentServerHost()


@app.response_handler
async def handle(request, context, cancellation_signal):
    load_settings()
    user_text = await context.get_input_text()

    def _get_text() -> str:
        return run_graph(NODES, EDGES, HANDLERS, user_text, new_run_id())

    return TextResponse(context, request, text=_get_text)


if __name__ == "__main__":
    configure_observability()
    app.run(port=int(os.environ.get("PORT", "8088")))
'''


_COMMON_TEST_BODY = '''"""
Generated tests for this workflow export. Mocks the LLM/HTTP layer entirely --
no network calls or API keys required to run this suite.

Run: pytest tests/test_workflow.py -v
"""
import pytest


def test_evaluate_condition_fails_closed_on_malformed_rule():
    from agentforge_runtime import evaluate_condition
    assert evaluate_condition("not a valid ) expression (", {}) == "false"


def test_evaluate_condition_true_and_false_paths():
    from agentforge_runtime import evaluate_condition
    assert evaluate_condition("risk_score >= 50", {"risk_score": 80}) == "true"
    assert evaluate_condition("risk_score >= 50", {"risk_score": 10}) == "false"


def test_call_http_request_retries_then_raises_on_persistent_5xx(monkeypatch):
    import httpx
    from agentforge_runtime import call_http_request, HTTPStepError

    class FakeResponse:
        status_code = 503
        text = "server error"
        def raise_for_status(self):
            raise httpx.HTTPStatusError("503", request=None, response=self)

    class FakeClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def request(self, *a, **kw): return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)
    with pytest.raises(HTTPStepError):
        call_http_request("https://example.test", "GET", "", "", "")


def test_call_http_request_does_not_retry_on_4xx(monkeypatch):
    import httpx
    from agentforge_runtime import call_http_request, HTTPStepError

    call_count = {"n": 0}

    class FakeResponse:
        status_code = 400
        text = "bad request"

    class FakeClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def request(self, *a, **kw):
            call_count["n"] += 1
            return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)
    with pytest.raises(HTTPStepError):
        call_http_request("https://example.test", "GET", "", "", "")
    assert call_count["n"] == 1  # no retry on a 4xx
'''

_PERSISTENCE_TEST_BODY = '''

def test_pause_resume_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("CHECKPOINT_DB_PATH", str(tmp_path / "test_checkpoints.db"))
    import importlib
    import agentforge_runtime
    importlib.reload(agentforge_runtime)
    agentforge_runtime.save_pause("test-run-1", "node_x", {"output": "hello"}, approver_email="a@b.com", node_label="Approve")
    loaded = agentforge_runtime.load_pause("test-run-1")
    assert loaded is not None
    assert loaded["node_id"] == "node_x"
    assert loaded["context"] == {"output": "hello"}
    pending = agentforge_runtime.list_pending()
    assert any(p["run_id"] == "test-run-1" for p in pending)
    agentforge_runtime.clear_pause("test-run-1")
    assert agentforge_runtime.load_pause("test-run-1") is None
'''


def _langgraph_test_suite() -> str:
    return _COMMON_TEST_BODY + '''

def test_langgraph_graph_builds():
    import main
    assert main.compiled is not None
    assert main.graph is not None
'''


def _ms_agent_framework_test_suite() -> str:
    return _COMMON_TEST_BODY + _PERSISTENCE_TEST_BODY + '''

def test_ms_agent_framework_workflow_builds():
    import main
    assert main.workflow is not None
'''


def _crewai_test_suite(flat_nodes: list[dict], edges: list[dict]) -> str:
    condition_nodes = [n for n in flat_nodes if n["role"] in ("condition", "router")]
    branch_assertions: list[str] = []
    for cnode in condition_nodes:
        outs = _outgoing(edges, cnode["id"])
        for e in outs:
            target_var = _safe_id(e["target"])
            branch_lit = json.dumps(str(e.get("label") or ""))
            test_name = f'test_branch_{_safe_id(cnode["id"])}_to_{target_var}'
            branch_assertions.append(
                f'def {test_name}():\n'
                f'    """Reaching branch {branch_lit} from {json.dumps(cnode["id"])} must route to '
                f'{json.dumps(e["target"])} -- this is the exact assertion shape that would have caught '
                f'the branch-dispatch double-execution bug fixed in this export generator (see agentforge_runtime.py\'s '
                f'run_graph()/_next_node_after())."""\n'
                f'    import main\n'
                f'    from agentforge_runtime import _next_node_after\n'
                f'    context = {{"output": "test input", "branch": {branch_lit}}}\n'
                f'    result = _next_node_after(main.NODES, main.EDGES, {json.dumps(cnode["id"])}, context)\n'
                f'    assert result == {json.dumps(e["target"])}\n'
            )
    return _COMMON_TEST_BODY + _PERSISTENCE_TEST_BODY + '''

def test_crewai_workflow_data_builds():
    import main
    assert main.NODES
    assert main.EDGES
    assert main.HANDLERS
''' + "\n\n" + "\n\n".join(branch_assertions)


# ─── Shared agentforge_runtime.py content (settings, retry, OTel, persistence) ──
#
# Every export ships a `agentforge_runtime.py` alongside its workflow-specific `main.py`.
# agentforge_runtime.py's content is per-FRAMEWORK (LangGraph doesn't need the generic
# SQLite pause/resume helpers or the CrewAI graph engine; LangGraph gets its
# own native SqliteSaver instead -- see _export_langgraph) but never
# per-WORKFLOW: the same agentforge_runtime.py is correct for every LangGraph export
# regardless of which canvas graph produced it. This keeps the enterprise-
# readiness infrastructure (retries, tracing, persistence) as fixed,
# reviewable code rather than something regenerated -- and therefore
# potentially reintroduced-with-a-bug -- on every export.

_RUNTIME_SETTINGS_SNIPPET = '''
import os
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ConfigError(ValueError):
    """Raised when required environment variables are missing or invalid."""


class _AzureSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    azure_openai_endpoint: str = Field(default="")
    azure_openai_api_key: str = Field(default="")
    azure_openai_deployment: str = Field(default="gpt-4o")
    azure_openai_api_version: str = Field(default="2024-12-01-preview")


class _GeminiSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    gemini_api_key: str = Field(default="")
    gemini_model: str = Field(default="gemini-3.1-flash-lite")


class _LmStudioSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    lmstudio_base_url: str = Field(default="http://localhost:1234/v1")
    lmstudio_model: str = Field(default="qwen/qwen3.5-9b")


def load_settings() -> dict:
    """Validates the env vars required by LLM_PROVIDER and raises one clear
    ConfigError listing everything missing, instead of letting a misconfigured
    deployment fail deep inside an HTTP call with a cryptic auth error."""
    provider = os.getenv("LLM_PROVIDER", "azure").lower()
    missing: list[str] = []
    if provider == "azure":
        settings = _AzureSettings()
        if not settings.azure_openai_endpoint:
            missing.append("AZURE_OPENAI_ENDPOINT")
        if not settings.azure_openai_api_key:
            missing.append("AZURE_OPENAI_API_KEY")
    elif provider == "gemini":
        settings = _GeminiSettings()
        if not settings.gemini_api_key:
            missing.append("GEMINI_API_KEY")
    elif provider == "lmstudio":
        settings = _LmStudioSettings()
    else:
        raise ConfigError(f"Unknown LLM_PROVIDER={provider!r}. Expected azure, gemini, or lmstudio.")
    if missing:
        raise ConfigError(
            f"Missing required environment variable(s) for LLM_PROVIDER={provider!r}: "
            + ", ".join(missing)
            + ". Copy .env.example to .env and fill them in, or set them in your deployment's secrets/config."
        )
    return settings.model_dump()
'''

_RUNTIME_RETRY_SNIPPET = '''
import logging
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_not_exception_type

logger = logging.getLogger("agentforge_export")


class LLMCallError(Exception):
    """Raised when an LLM call fails after all retries are exhausted."""


class HTTPStepError(Exception):
    """Raised when an http_request step fails after all retries are exhausted,
    or immediately on a 4xx client error (never retried -- a bad request or
    auth failure won't succeed by trying again)."""


llm_retry = retry(
    reraise=True,
    stop=stop_after_attempt(int(os.getenv("LLM_MAX_RETRIES", "3"))),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)

http_retry = retry(
    reraise=True,
    stop=stop_after_attempt(int(os.getenv("HTTP_MAX_RETRIES", "3"))),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    # Retry any transient failure EXCEPT HTTPStepError -- that's raised
    # deliberately for 4xx client errors, which won't succeed by retrying.
    # (retry_if_exception_type(Exception) would match HTTPStepError too,
    # since it's an Exception subclass -- confirmed live via the generated
    # test suite's test_call_http_request_does_not_retry_on_4xx, which
    # caught this retrying 3x on a 400 before this fix.)
    retry=retry_if_not_exception_type(HTTPStepError),
)


def call_http_request(url: str, method: str, headers_raw: str, body_raw: str, previous_output: str) -> str:
    import json as _json_mod
    import httpx
    from urllib.parse import quote as _quote
    # Percent-encode the substituted value -- previous_output is free-text LLM
    # output and can contain newlines or other characters that are never valid
    # unescaped in a URL. The request body has no such restriction.
    url = url.replace("{{input}}", _quote(previous_output or "", safe=""))
    body_raw = body_raw.replace("{{input}}", previous_output or "") if body_raw else body_raw
    headers = _json_mod.loads(headers_raw) if headers_raw else None
    json_body, data_body = None, None
    if body_raw:
        try:
            json_body = _json_mod.loads(body_raw)
        except _json_mod.JSONDecodeError:
            data_body = body_raw

    @http_retry
    def _do_request():
        timeout = float(os.getenv("HTTP_TIMEOUT_SECONDS", "15.0"))
        with httpx.Client(timeout=timeout) as client:
            response = client.request(method, url, headers=headers, json=json_body, content=data_body)
        if 400 <= response.status_code < 500:
            raise HTTPStepError(f"{method} {url} failed with client error {response.status_code}: {response.text[:500]}")
        response.raise_for_status()
        return response.text[:4000]

    try:
        return _do_request()
    except HTTPStepError:
        raise
    except Exception as e:
        raise HTTPStepError(f"{method} {url} failed after retries: {e}") from e


def evaluate_condition(rule: str, variables: dict) -> str:
    """Same fail-closed simpleeval pattern as the live canvas engine
    (backend/app/api/builder.py::_evaluate_condition) -- never uses eval().
    A failed evaluation is logged (not silent) so a mis-routing condition is
    visible in logs/traces instead of mute."""
    from simpleeval import simple_eval
    try:
        return "true" if bool(simple_eval(rule, names=variables)) else "false"
    except Exception as e:
        logger.warning(f"condition {rule!r} failed to evaluate: {e}; defaulting to false")
        return "false"
'''

_RUNTIME_OBSERVABILITY_SNIPPET = '''
import json as _json
import logging as _logging
import uuid
from contextlib import contextmanager

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

_tracer = trace.get_tracer("agentforge.export")
_ALLOWED_ATTRS = {"node_id", "role", "model", "branch", "http_status", "duration_ms", "workflow_run_id"}


class _JsonLogFormatter(_logging.Formatter):
    def format(self, record: _logging.LogRecord) -> str:
        span = trace.get_current_span()
        ctx = span.get_span_context()
        payload = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "trace_id": format(ctx.trace_id, "032x") if ctx.trace_id else None,
            "span_id": format(ctx.span_id, "016x") if ctx.span_id else None,
        }
        return _json.dumps(payload)


def configure_observability() -> None:
    """Sets up OpenTelemetry: Azure Monitor exporter when Foundry (or any
    Azure Monitor-backed host) has injected APPLICATIONINSIGHTS_CONNECTION_STRING,
    otherwise a local console exporter. Also configures JSON structured
    logging correlated to the active trace/span."""
    handler = _logging.StreamHandler()
    handler.setFormatter(_JsonLogFormatter())
    root = _logging.getLogger()
    root.handlers = [handler]
    root.setLevel(_logging.INFO)

    if os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING"):
        from azure.monitor.opentelemetry import configure_azure_monitor
        configure_azure_monitor()
    else:
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        trace.set_tracer_provider(provider)


def new_run_id() -> str:
    return uuid.uuid4().hex[:12]


@contextmanager
def traced_step(name: str, **attrs):
    """Wraps one node/LLM/HTTP/condition step in a span. Only allow-listed
    attribute keys are ever attached (see _ALLOWED_ATTRS) -- prompt/response
    content is excluded unless OTEL_LOG_PROMPTS=true, to avoid leaking
    business data or secrets into traces by default."""
    with _tracer.start_as_current_span(name) as span:
        for k, v in attrs.items():
            if k in _ALLOWED_ATTRS:
                span.set_attribute(k, v)
        try:
            yield span
        except Exception as e:
            span.set_status(Status(StatusCode.ERROR, str(e)))
            span.record_exception(e)
            raise


def node_span(node_id: str, role: str):
    """Decorator wrapping a generated node/executor function in a
    traced_step span -- works for both sync (LangGraph/CrewAI) and async
    (Microsoft Agent Framework @executor) functions without requiring the
    decorated function's own body to be re-indented."""
    import asyncio
    import functools

    def decorator(fn):
        if asyncio.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def async_wrapper(*args, **kwargs):
                with traced_step(f"node.{node_id}", node_id=node_id, role=role):
                    return await fn(*args, **kwargs)
            return async_wrapper

        @functools.wraps(fn)
        def sync_wrapper(*args, **kwargs):
            with traced_step(f"node.{node_id}", node_id=node_id, role=role):
                return fn(*args, **kwargs)
        return sync_wrapper
    return decorator
'''

_RUNTIME_PERSISTENCE_SNIPPET = '''
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

_DB_PATH = Path(os.getenv("CHECKPOINT_DB_PATH", "./data/checkpoints.db"))


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.execute(
        """CREATE TABLE IF NOT EXISTS paused_runs (
            run_id TEXT PRIMARY KEY,
            node_id TEXT NOT NULL,
            context_json TEXT NOT NULL,
            approver_email TEXT,
            node_label TEXT,
            paused_at TEXT NOT NULL
        )"""
    )
    return conn


def save_pause(run_id: str, node_id: str, context: dict, approver_email: str = "", node_label: str = "") -> None:
    conn = _connect()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO paused_runs (run_id, node_id, context_json, approver_email, node_label, paused_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (run_id, node_id, _json.dumps(context), approver_email, node_label, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    finally:
        conn.close()


def load_pause(run_id: str):
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT node_id, context_json, approver_email, node_label, paused_at FROM paused_runs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "node_id": row[0],
            "context": _json.loads(row[1]),
            "approver_email": row[2],
            "node_label": row[3],
            "paused_at": row[4],
        }
    finally:
        conn.close()


def clear_pause(run_id: str) -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM paused_runs WHERE run_id = ?", (run_id,))
        conn.commit()
    finally:
        conn.close()


def list_pending() -> list:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT run_id, node_id, node_label, approver_email, paused_at FROM paused_runs ORDER BY paused_at DESC"
        ).fetchall()
        return [
            {"run_id": r[0], "node_id": r[1], "node_label": r[2], "approver_email": r[3], "paused_at": r[4]}
            for r in rows
        ]
    finally:
        conn.close()
'''

_CREWAI_GRAPH_ENGINE_SNIPPET = '''

class WorkflowPaused(Exception):
    """Raised by an approval node handler."""
    def __init__(self, run_id: str, node_id: str, node_label: str, approver_email: str, context: dict):
        self.run_id = run_id
        self.node_id = node_id
        self.node_label = node_label
        self.approver_email = approver_email
        self.context = context
        super().__init__(f"Paused at '{node_label}' (run {run_id}) -- awaiting approval from {approver_email}")


def _next_node_after(nodes: dict, edges: list, node_id: str, context: dict):
    outs = [e for e in edges if e["source"] == node_id]
    if not outs:
        return None
    role = nodes[node_id]["role"]
    if role in ("condition", "router"):
        branch = context.get("branch")
        for e in outs:
            if e.get("label") == branch:
                return e["target"]
        return None
    return outs[0]["target"]


def run_graph(nodes: dict, edges: list, handlers: dict, workflow_input: str, run_id: str, resume_from: str | None = None) -> str:
    """Walks the node/edge graph defined as plain data, dispatching each node
    to its handler function. Checkpoints (run_id, node_id, context) to SQLite
    after every node so a crash or an approval pause can be resumed from
    exactly where it left off, instead of restarting the whole workflow.

    `handlers` maps node_id -> callable(context: dict) -> dict. Handlers for
    condition/router nodes additionally set context["branch"], which this
    engine uses (via the node's outgoing edges) to pick the next node."""
    if resume_from is not None:
        paused = load_pause(run_id)
        if paused is None:
            raise ValueError(f"No paused run found for run_id={run_id!r}")
        context = paused["context"]
        current = _next_node_after(nodes, edges, resume_from, context)
    else:
        context = {"output": workflow_input}
        start = next(n["id"] for n in nodes.values() if n["role"] == "input")
        current = _next_node_after(nodes, edges, start, context)

    while current is not None:
        node = nodes[current]
        if node["role"] == "output":
            clear_pause(run_id)
            return context["output"]
        try:
            context = handlers[current](context)
        except WorkflowPaused:
            save_pause(run_id, current, context, approver_email=node.get("approver_email", ""), node_label=node.get("label", current))
            raise
        save_pause(run_id, current, context)
        current = _next_node_after(nodes, edges, current, context)
    return context.get("output", workflow_input)
'''


# ─── LangGraph ──────────────────────────────────────────────────────────────

_LANGGRAPH_LLM_SNIPPET = '''
import os

_PROVIDER = os.getenv("LLM_PROVIDER", "azure").lower()


def get_chat_model():
    """Returns a LangChain-compatible chat model per LLM_PROVIDER -- the same
    3-way provider choice (azure / gemini / lmstudio) AgentForge itself uses."""
    if _PROVIDER == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
            google_api_key=os.getenv("GEMINI_API_KEY"),
        )
    if _PROVIDER == "lmstudio":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=os.getenv("LMSTUDIO_MODEL", "qwen/qwen3.5-9b"),
            base_url=os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
            api_key="lm-studio",  # LM Studio ignores the key but the client requires one
        )
    from langchain_openai import AzureChatOpenAI
    # `model=` (not `azure_deployment=`) -- newer Azure AI Foundry resources
    # (endpoint like https://<resource>.services.ai.azure.com/) route by
    # model name at the API level and 404 on the classic
    # /openai/deployments/{name}/... path azure_deployment= would build.
    # Confirmed against a live Foundry resource; matches how AgentForge's
    # own AzureOpenAIClient (backend/app/core/azure_openai.py) calls Azure.
    return AzureChatOpenAI(
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        model=os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o"),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"),
    )
'''


def _export_langgraph(nodes: list[dict], edges: list[dict], workflow_name: str) -> dict[str, str]:
    flat = _normalize_nodes(nodes)
    ordered = _topo_sort_export(flat, edges)
    by_id = {n["id"]: n for n in flat}

    node_fn_lines: list[str] = []
    add_node_lines: list[str] = []
    add_edge_lines: list[str] = []
    has_approval = False

    for node in ordered:
        nid = node["id"]
        var = _safe_id(nid)
        role = node["role"]
        label_lit = json.dumps(node["label"])
        desc_lit = json.dumps(node["description"])

        if role == "input":
            node_fn_lines.append(
                f'def node_{var}(state: WorkflowState) -> WorkflowState:\n'
                f'    """{node["label"]} (input)."""\n'
                f'    return state\n'
            )
        elif role == "output":
            node_fn_lines.append(
                f'def node_{var}(state: WorkflowState) -> WorkflowState:\n'
                f'    """{node["label"]} (output)."""\n'
                f'    state["output"] = state.get("output", state["input"])\n'
                f'    return state\n'
            )
        elif role in _AGENT_LIKE_ROLES:
            default_prompt_lit = json.dumps(f'You are the {node["label"]} step in a workflow.')
            node_fn_lines.append(
                f'def node_{var}(state: WorkflowState) -> WorkflowState:\n'
                f'    """{node["label"]} (role: {role})."""\n'
                f'    system_prompt = {desc_lit} or {default_prompt_lit}\n'
                f'    text = state.get("output", state["input"])\n'
                f'    response = get_chat_model().invoke([("system", system_prompt), ("human", text)])\n'
                f'    result = response.content\n'
                f'    state["output"] = result\n'
                f'    # If the model returned JSON, merge its keys into context so a\n'
                f'    # downstream condition/router node can reference them by name in its\n'
                f'    # rule (e.g. a classifier returning {{"fraud_score": 82}}).\n'
                f'    try:\n'
                f'        parsed = json.loads(result)\n'
                f'        if isinstance(parsed, dict):\n'
                f'            state["context"].update(parsed)\n'
                f'    except (json.JSONDecodeError, TypeError):\n'
                f'        pass\n'
                f'    return state\n'
            )
        elif role == "http_request":
            url_lit = json.dumps(node["url"])
            method_lit = json.dumps(node["method"] or "GET")
            headers_lit = json.dumps(node["headers"])
            body_lit = json.dumps(node["body"])
            node_fn_lines.append(
                f'def node_{var}(state: WorkflowState) -> WorkflowState:\n'
                f'    """{node["label"]} (http_request)."""\n'
                f'    state["output"] = call_http_request({url_lit}, {method_lit}, {headers_lit}, {body_lit}, state.get("output", state["input"]))\n'
                f'    return state\n'
            )
        elif role == "condition":
            rule_lit = json.dumps(node["rule"])
            node_fn_lines.append(
                f'def node_{var}(state: WorkflowState) -> WorkflowState:\n'
                f'    """{node["label"]} (condition): {node["rule"]}"""\n'
                f'    state["_branch"] = evaluate_condition({rule_lit}, state["context"])\n'
                f'    return state\n'
            )
        elif role == "router":
            labels = sorted({e.get("label") for e in _outgoing(edges, nid) if e.get("label")})
            labels_lit = json.dumps(labels)
            node_fn_lines.append(
                f'def node_{var}(state: WorkflowState) -> WorkflowState:\n'
                f'    """{node["label"]} (router)."""\n'
                f'    text = state.get("output", state["input"])\n'
                f'    labels = {labels_lit}\n'
                f'    response = get_chat_model().invoke([\n'
                f'        ("system", "Choose exactly one of these labels that best matches the intent: " + ", ".join(labels) + ". Return ONLY the label."),\n'
                f'        ("human", text),\n'
                f'    ])\n'
                f'    chosen = response.content.strip().strip(\'"\').strip("\'")\n'
                f'    state["_branch"] = chosen if chosen in labels else (labels[0] if labels else "")\n'
                f'    return state\n'
            )
        elif role == "approval":
            has_approval = True
            approver_lit = json.dumps(node["approver_email"])
            node_fn_lines.append(
                f'def node_{var}(state: WorkflowState) -> WorkflowState:\n'
                f'    """{node["label"]} (approval) -- pauses via interrupt() until a human resumes\n'
                f'    with Command(resume=...). Requires the SqliteSaver checkpointer below to\n'
                f'    function at all -- and (unlike the default in-memory MemorySaver) that\n'
                f'    checkpointer is durable, so this pause survives a container restart.\n'
                f'    """\n'
                f'    decision = interrupt({{"node": {label_lit}, "approver_email": {approver_lit}, "context": state.get("output", state["input"])}})\n'
                f'    state["output"] = str(decision)\n'
                f'    return state\n'
            )

        node_fn_lines[-1] = f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n' + node_fn_lines[-1]
        add_node_lines.append(f'graph.add_node({json.dumps(nid)}, node_{var})')

    # Edges: plain edges vs. conditional edges (from a condition/router node)
    for node in ordered:
        nid = node["id"]
        outs = _outgoing(edges, nid)
        if not outs:
            continue
        if node["role"] in ("condition", "router"):
            mapping = {str(e.get("label") or ""): e["target"] for e in outs}
            mapping_lit = json.dumps(mapping)
            add_edge_lines.append(
                f'graph.add_conditional_edges({json.dumps(nid)}, lambda state: state["_branch"], {mapping_lit})'
            )
        else:
            for e in outs:
                add_edge_lines.append(f'graph.add_edge({json.dumps(nid)}, {json.dumps(e["target"])})')

    entry_id = ordered[0]["id"] if ordered else None
    end_ids = [n["id"] for n in ordered if n["role"] == "output"]

    checkpointer_block = (
        "import sqlite3\n"
        "from langgraph.checkpoint.sqlite import SqliteSaver\n"
        '_checkpoint_path = os.getenv("CHECKPOINT_DB_PATH", "./data/checkpoints.db")\n'
        "os.makedirs(os.path.dirname(_checkpoint_path) or \".\", exist_ok=True)\n"
        "_checkpointer = SqliteSaver(sqlite3.connect(_checkpoint_path, check_same_thread=False))\n"
        "compiled = graph.compile(checkpointer=_checkpointer)\n"
        if has_approval else
        "compiled = graph.compile()\n"
    )

    script = f'''"""
Auto-generated by AgentForge's Visual Workflow Builder -- LangGraph export.
Workflow: {workflow_name}

Real LangGraph StateGraph: every canvas node is a graph node, condition/router
nodes use add_conditional_edges(), and the approval node uses interrupt().
Enterprise infrastructure (settings validation, retries, OpenTelemetry
tracing, HTTP/condition helpers) lives in agentforge_runtime.py, shared verbatim across
every LangGraph export.

Run it:
    python main.py "your test input text here"
"""
import json
import os
import sys
from typing import TypedDict, Any

from langgraph.graph import StateGraph
from langgraph.types import interrupt, Command

from agentforge_runtime import load_settings, configure_observability, new_run_id, node_span, evaluate_condition, call_http_request

{_LANGGRAPH_LLM_SNIPPET}

class WorkflowState(TypedDict):
    input: str
    output: str
    context: dict[str, Any]
    _branch: str


graph = StateGraph(WorkflowState)

{chr(10).join(node_fn_lines)}

{chr(10).join(add_node_lines)}

{chr(10).join(add_edge_lines)}

graph.set_entry_point({json.dumps(entry_id)})
{chr(10).join(f'graph.set_finish_point({json.dumps(eid)})' for eid in end_ids)}

{checkpointer_block}

if __name__ == "__main__":
    load_settings()
    configure_observability()
    test_input = sys.argv[1] if len(sys.argv) > 1 else "Hello, I need help"
    run_id = new_run_id()
    config = {{"configurable": {{"thread_id": run_id}}}}
    result = compiled.invoke({{"input": test_input, "output": "", "context": {{}}, "_branch": ""}}, config=config)
    print(result.get("output", result))
'''

    requirements = (
        # langgraph/langchain-openai/langchain-google-genai are pinned to
        # versions compatible with langchain-azure-ai[hosting] (needed for
        # the Foundry deployment wrapper) -- langchain-azure-ai>=1.2.5
        # requires langgraph>=1.1.1,<3.0 and langchain-openai>=1.0.0,<2.0.0.
        # Confirmed live: AzureChatOpenAI/ChatOpenAI/ChatGoogleGenerativeAI's
        # constructor kwargs (azure_endpoint=, api_key=, model=,
        # api_version=, base_url=, google_api_key=) are unchanged at these
        # versions despite internal field-name changes in LangChain's 1.x
        # reorg (they're aliases) -- StateGraph/add_conditional_edges/
        # interrupt()/Command/SqliteSaver are also confirmed unchanged.
        "langgraph==1.2.10\n"
        "langchain-openai==1.4.1\n"
        "langchain-google-genai==4.3.2\n"
        "simpleeval==1.0.3\n"
        "httpx==0.28.1\n"
        "python-dotenv==1.0.1\n"
        "pydantic-settings==2.7.1\n"
        "tenacity==9.0.0\n"
        "azure-monitor-opentelemetry==1.6.4\n"
        "opentelemetry-api==1.29.0\n"
        + ("langgraph-checkpoint-sqlite==3.1.1\n" if has_approval else "")
        + "langchain-azure-ai[hosting]==1.2.8\n"
        + "azure-identity==1.25.3\n"
    )

    runtime_py = (
        _RUNTIME_SETTINGS_SNIPPET + "\n"
        + _RUNTIME_RETRY_SNIPPET + "\n"
        + _RUNTIME_OBSERVABILITY_SNIPPET
    )

    memory_note = (
        ("This export uses a **durable SQLite checkpointer** (`SqliteSaver`, see main.py) because "
         "this workflow has an approval node -- LangGraph's `interrupt()` requires a checkpointer "
         "to pause/resume at all, and SqliteSaver (unlike the default in-memory `MemorySaver`) "
         "survives a container restart. Set `CHECKPOINT_DB_PATH` to control where the .db file "
         "lives. "
         if has_approval else
         "This export is **stateless by default** -- no persistent checkpointer, matching the "
         "canvas's own current behavior (no approval node in this workflow, so none is needed). ") +
        "To add real cross-session conversational memory (not workflow-run persistence), swap in "
        "a `PostgresSaver` (thread-scoped) and/or the `langmem` package with a `PostgresStore` "
        "(cross-thread, semantic) -- see https://docs.langchain.com/oss/python/langgraph/persistence"
    )

    return {
        "main.py": script,
        "agentforge_runtime.py": runtime_py,
        "foundry_main.py": _foundry_wrapper_langgraph(),
        "azure.yaml": _azure_yaml(workflow_name),
        "infra/main.bicep": _infra_bicep(),
        "infra/main.parameters.json": _infra_parameters(),
        "tests/test_workflow.py": _langgraph_test_suite(),
        "requirements.txt": requirements,
        "requirements-dev.txt": "pytest==8.3.4\npytest-asyncio==0.25.2\n",
        ".env.example": _env_example(),
        ".gitignore": _gitignore(),
        ".dockerignore": _dockerignore(),
        "Dockerfile": _dockerfile("main.py"),
        "README.md": _readme(
            "LangGraph", workflow_name,
            "LangGraph is Azure AI Foundry's most directly-supported export target -- Foundry's "
            "Hosted Agents documentation names it explicitly.\n\n",
            memory_note,
        ),
    }


# ─── Microsoft Agent Framework ─────────────────────────────────────────────

_MSAF_LLM_SNIPPET = '''
import os


def get_chat_client():
    """Returns a Microsoft Agent Framework chat client per LLM_PROVIDER -- the
    same 3-way provider choice (azure / gemini / lmstudio) AgentForge itself
    uses. MS Agent Framework is itself LLM-agnostic -- it orchestrates agents,
    it does not pick a model for you."""
    provider = os.getenv("LLM_PROVIDER", "azure").lower()
    if provider == "gemini":
        # Microsoft Agent Framework has no first-party Gemini client at the
        # time this was generated; route through its OpenAI-compatible client
        # against Gemini's OpenAI-compatible endpoint instead.
        from agent_framework.openai import OpenAIChatClient
        return OpenAIChatClient(
            model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=os.getenv("GEMINI_API_KEY"),
        )
    if provider == "lmstudio":
        from agent_framework.openai import OpenAIChatClient
        return OpenAIChatClient(
            model=os.getenv("LMSTUDIO_MODEL", "qwen/qwen3.5-9b"),
            base_url=os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
            api_key="lm-studio",
        )
    # `agent_framework.azure.AzureOpenAIChatClient` does not exist in any
    # currently published agent-framework-core release (confirmed against
    # 1.0.0 and 1.13.0) -- Azure OpenAI is reached through the unified
    # `OpenAIChatClient`, which auto-detects Azure routing from
    # `azure_endpoint=`. `api_version` is intentionally NOT read from
    # AZURE_OPENAI_API_VERSION here: this client calls the newer Responses
    # API under the hood, and the Chat-Completions-era version string this
    # project's other exports use (e.g. "2024-12-01-preview") is rejected
    # with "API version not supported" -- confirmed live. This client's own
    # built-in default is correct for the Responses API; only override it
    # by passing api_version= explicitly below if your resource needs one.
    from agent_framework.openai import OpenAIChatClient
    return OpenAIChatClient(
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        model=os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o"),
    )
'''


def _export_ms_agent_framework(nodes: list[dict], edges: list[dict], workflow_name: str) -> dict[str, str]:
    flat = _normalize_nodes(nodes)
    ordered = _topo_sort_export(flat, edges)

    executor_defs: list[str] = []
    executor_vars: dict[str, str] = {}
    has_approval = False

    for node in ordered:
        nid = node["id"]
        var = _safe_id(nid)
        executor_vars[nid] = var
        role = node["role"]
        label_lit = json.dumps(node["label"])

        if role == "input":
            executor_defs.append(
                f'@executor(id={json.dumps(var)})\n'
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'async def {var}(text: str, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (input)."""\n'
                f'    await ctx.send_message(text)\n'
            )
        elif role == "output":
            executor_defs.append(
                f'@executor(id={json.dumps(var)})\n'
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'async def {var}(message: Any, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (output) -- yield_output(), NOT send_message(): this is the\n'
                f'    workflow\'s terminal node, and send_message() (which only routes to a downstream\n'
                f'    executor) has none to route to. yield_output() is the framework\'s real\n'
                f'    "this is a result" signal -- it\'s what WorkflowRunResult.get_outputs() (used by\n'
                f'    _main() and foundry_main.py below to get the actual answer text) reads, confirmed\n'
                f'    live: send_message() here left get_outputs() always empty, and printing the raw\n'
                f'    WorkflowRunResult (a list[WorkflowEvent] subclass) dumped every internal event\n'
                f'    instead of an answer.\n'
                f'    """\n'
                f'    result = _extract_text(message)\n'
                f'    await ctx.yield_output(result)\n'
            )
        elif role in _AGENT_LIKE_ROLES:
            desc_lit = json.dumps(node["description"] or f'You are the {node["label"]} step in a workflow.')
            executor_defs.append(
                f'{var}_agent = Agent(get_chat_client(), instructions={desc_lit}, name={label_lit})\n\n'
                f'@executor(id={json.dumps(var)})\n'
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'async def {var}(message: Any, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (role: {role})."""\n'
                f'    text = _extract_text(message)\n'
                f'    response = await {var}_agent.run(text)\n'
                f'    result = response.text\n'
                f'    context = {{"output": result}}\n'
                f'    # If the model returned JSON, merge its keys into context so a\n'
                f'    # downstream condition/router node can reference them by name in its\n'
                f'    # rule (e.g. a classifier returning {{"fraud_score": 82}}) -- confirmed\n'
                f'    # live this is required: the SDK\'s own AgentExecutor wrapper (used here\n'
                f'    # originally) hands back an opaque AgentExecutorResponse with no such\n'
                f'    # structured fields, so a condition/router node immediately downstream of\n'
                f'    # an agent-like node always failed closed to the same branch regardless of\n'
                f'    # what the agent actually said.\n'
                f'    try:\n'
                f'        parsed = json.loads(result)\n'
                f'        if isinstance(parsed, dict):\n'
                f'            context.update(parsed)\n'
                f'    except (json.JSONDecodeError, TypeError):\n'
                f'        pass\n'
                f'    await ctx.send_message(context)\n'
            )
        elif role == "http_request":
            url_lit = json.dumps(node["url"])
            method_lit = json.dumps(node["method"] or "GET")
            headers_lit = json.dumps(node["headers"])
            body_lit = json.dumps(node["body"])
            executor_defs.append(
                f'@executor(id={json.dumps(var)})\n'
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'async def {var}(message: Any, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (http_request)."""\n'
                f'    text = message.get("output") if isinstance(message, dict) else message\n'
                f'    result = call_http_request({url_lit}, {method_lit}, {headers_lit}, {body_lit}, text)\n'
                f'    await ctx.send_message({{"output": result}})\n'
            )
        elif role == "condition":
            rule_lit = json.dumps(node["rule"])
            executor_defs.append(
                f'@executor(id={json.dumps(var)})\n'
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'async def {var}(message: Any, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (condition): {node["rule"]}"""\n'
                f'    context = message if isinstance(message, dict) else {{"output": message}}\n'
                f'    branch = evaluate_condition({rule_lit}, context)\n'
                f'    context["branch"] = branch\n'
                f'    await ctx.send_message(context)\n'
            )
        elif role == "router":
            labels = sorted({e.get("label") for e in _outgoing(edges, nid) if e.get("label")})
            labels_lit = json.dumps(labels)
            executor_defs.append(
                f'@executor(id={json.dumps(var)})\n'
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'async def {var}(message: Any, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (router)."""\n'
                f'    text = message.get("output") if isinstance(message, dict) else message\n'
                f'    labels = {labels_lit}\n'
                f'    agent = Agent(get_chat_client(), instructions="Choose exactly one of these labels that best matches the intent: " + ", ".join(labels) + ". Return ONLY the label.")\n'
                f'    reply = await agent.run(text)\n'
                f'    chosen = reply.text.strip().strip(\'"\').strip("\'")\n'
                f'    branch = chosen if chosen in labels else (labels[0] if labels else "")\n'
                f'    await ctx.send_message({{"output": text, "branch": branch}})\n'
            )
        elif role == "approval":
            has_approval = True
            approver_lit = json.dumps(node["approver_email"])
            executor_defs.append(
                f'@executor(id={json.dumps(var)})\n'
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'async def {var}(message: Any, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (approval) -- CUSTOM GLUE: Microsoft Agent Framework has\n'
                f'    no verified native long-running human-in-the-loop pause primitive at the\n'
                f'    time this was generated, so this persists (run_id, node, context) to\n'
                f'    SQLite via agentforge_runtime.save_pause before raising WorkflowPaused -- the same\n'
                f'    pattern the LangGraph export achieves natively via interrupt(), but manual\n'
                f'    here. Resume with: python main.py --resume <run_id> --decision "approved"\n'
                f'    """\n'
                f'    text = _extract_text(message)\n'
                f'    save_pause(_run_id.get(), {json.dumps(nid)}, {{"output": text}}, approver_email={approver_lit}, node_label={json.dumps(node["label"])})\n'
                f'    raise WorkflowPaused({json.dumps(node["label"])}, {approver_lit}, text)\n'
            )

    # Edges: plain add_edge(a, b) vs. conditional add_edge(a, b, condition=lambda msg: ...)
    edge_lines: list[str] = []
    for node in ordered:
        nid = node["id"]
        outs = _outgoing(edges, nid)
        var = executor_vars[nid]
        if node["role"] in ("condition", "router"):
            for e in outs:
                target_var = executor_vars.get(e["target"])
                branch_lit = json.dumps(str(e.get("label") or ""))
                edge_lines.append(
                    f'workflow_builder.add_edge({var}, {target_var}, '
                    f'condition=lambda msg, _b={branch_lit}: isinstance(msg, dict) and msg.get("branch") == _b)'
                )
        else:
            for e in outs:
                target_var = executor_vars.get(e["target"])
                if target_var:
                    edge_lines.append(f'workflow_builder.add_edge({var}, {target_var})')

    entry_var = executor_vars[ordered[0]["id"]] if ordered else None

    script = f'''"""
Auto-generated by AgentForge's Visual Workflow Builder -- Microsoft Agent
Framework export.
Workflow: {workflow_name}

Real agent-framework primitives: every node (including agent-like ones) is a
plain @executor-decorated function that calls Agent(...).run() directly --
NOT the SDK's own AgentExecutor wrapper, whose opaque AgentExecutorResponse
has no structured fields a downstream condition/router node could read
(confirmed live: this silently made every conditional branch after a
classifier/agent node fail closed to the same default path regardless of
what the agent actually said). Edges use
WorkflowBuilder.add_edge(..., condition=lambda msg: ...) for branching.
Enterprise infrastructure (settings validation, retries, OpenTelemetry
tracing, SQLite pause/resume, HTTP/condition helpers) lives in agentforge_runtime.py,
shared verbatim across every Microsoft Agent Framework export.

Run it:
    python main.py "your test input text here"
    python main.py --resume <run_id> --decision "approved"
    python main.py --list-pending
"""
import argparse
import asyncio
import json
import sys
from contextvars import ContextVar
from typing import Any

from agent_framework import Agent, WorkflowBuilder, WorkflowContext, executor
from agentforge_runtime import (
    load_settings, configure_observability, new_run_id, node_span,
    evaluate_condition, call_http_request,
    save_pause, load_pause, clear_pause, list_pending,
)

{_MSAF_LLM_SNIPPET}

def _extract_text(message: Any) -> str:
    """Normalizes the message shapes a node can receive in this export:
    this export's own {{"output": ..., "branch": ...}} dict convention
    (produced by every node type after the input node), or a plain string
    (the input node's own output)."""
    if isinstance(message, dict):
        return str(message.get("output", ""))
    return str(message)


class WorkflowPaused(Exception):
    """Raised by an approval node -- see its docstring above."""
    def __init__(self, node_label: str, approver_email: str, context: str):
        self.node_label = node_label
        self.approver_email = approver_email
        self.context = context
        super().__init__(f"Paused at '{{node_label}}' -- awaiting approval from {{approver_email}}")


# ContextVar, not a plain module global: foundry_main.py's HTTP handler runs
# each request as its own asyncio Task, and a plain global would let two
# concurrent requests clobber each other's run_id mid-flight (confirmed as a
# real, not hypothetical, bug: foundry_main.py never set this at all before,
# so every paused run over the deployed endpoint was already saving under
# the same fallback run_id and silently overwriting each other in SQLite,
# even without true concurrency). ContextVar gives each asyncio Task -- and
# therefore each request -- its own isolated value.
_run_id: ContextVar[str] = ContextVar("run_id", default="")


{chr(10).join(executor_defs)}

workflow_builder = WorkflowBuilder(start_executor={entry_var})
{chr(10).join(edge_lines)}
workflow = workflow_builder.build()


async def _main(workflow_input: str) -> None:
    try:
        result = await workflow.run(workflow_input)
        # workflow.run() returns a WorkflowRunResult -- a list[WorkflowEvent]
        # subclass containing every internal event of the run, NOT the final
        # answer (confirmed live: printing it directly dumps the raw event
        # trace). get_outputs() is the framework's real accessor for what
        # the output-node's yield_output() call above actually surfaced.
        outputs = result.get_outputs()
        print(outputs[-1] if outputs else "Workflow completed with no output yielded.")
    except WorkflowPaused as p:
        print(f"Paused at '{{p.node_label}}' (run {{_run_id.get()}}) -- awaiting approval from {{p.approver_email}}. "
              f"Context: {{p.context}}. Resume with: python main.py --resume {{_run_id.get()}} --decision \\"approved\\"")


def _resume_run(run_id: str, decision: str) -> None:
    """Reconstructs a run starting from the persisted approval node's
    decision. MS Agent Framework has no native sub-graph-from-node
    entrypoint, so this re-runs workflow.run(decision) from the top with the
    human decision as input -- correct as long as upstream nodes are safe to
    re-run (e.g. no side-effecting http_request before the approval node);
    for a workflow where that's not true, use paused["context"] to skip
    already-completed steps manually instead of relying on this default."""
    paused = load_pause(run_id)
    if paused is None:
        print(f"No paused run found for run_id={{run_id}}")
        return
    print(f"Resuming node '{{paused['node_id']}}' (run {{run_id}}) with decision: {{decision}}")
    clear_pause(run_id)
    _run_id.set(run_id)
    asyncio.run(_main(decision))


if __name__ == "__main__":
    load_settings()
    configure_observability()
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", default="Hello, I need help")
    parser.add_argument("--resume", metavar="RUN_ID")
    parser.add_argument("--decision", default="approved")
    parser.add_argument("--list-pending", action="store_true")
    args = parser.parse_args()

    if args.list_pending:
        for p in list_pending():
            print(p)
    elif args.resume:
        _resume_run(args.resume, args.decision)
    else:
        _run_id.set(new_run_id())
        asyncio.run(_main(args.input))
'''

    requirements = (
        "agent-framework-core==1.13.0\n"
        # agent_framework.openai.OpenAIChatClient (used by _MSAF_LLM_SNIPPET
        # above for every provider) lives in this separate package --
        # agent-framework-core alone raises ModuleNotFoundError at runtime,
        # confirmed live (import succeeds, only fails when the client class
        # is actually constructed, so this was invisible to import-only checks).
        "agent-framework-openai\n"
        "simpleeval==1.0.3\n"
        "httpx==0.28.1\n"
        "python-dotenv==1.0.1\n"
        "pydantic-settings==2.7.1\n"
        "tenacity==9.0.0\n"
        "azure-monitor-opentelemetry==1.6.4\n"
        # agent-framework-core==1.13.0 requires opentelemetry-api>=1.39.0,<2 --
        # confirmed live via a remote-build pip ResolutionImpossible naming
        # this exact constraint (azure-monitor-opentelemetry==1.6.4 is NOT a
        # source of the conflict, so it already tolerates this range).
        "opentelemetry-api>=1.39.0,<2\n"
        "azure-ai-agentserver-responses==2.0.0b1\n"
    )

    runtime_py = (
        _RUNTIME_SETTINGS_SNIPPET + "\n"
        + _RUNTIME_RETRY_SNIPPET + "\n"
        + _RUNTIME_OBSERVABILITY_SNIPPET + "\n"
        + _RUNTIME_PERSISTENCE_SNIPPET
    )

    memory_note = (
        "This export is **stateless by default** -- no persistent context provider, matching "
        "the canvas's own current behavior. To add real cross-session memory, wire a "
        "`CosmosMemoryContextProvider` (Azure Cosmos DB-backed, first-party) or the built-in "
        "`InMemoryHistoryProvider` for in-process-only history -- see "
        "https://learn.microsoft.com/en-us/agent-framework/agents/conversations/context-providers"
    )
    approval_note = (
        "\n**Note on the approval node**: Microsoft Agent Framework's human-in-the-loop pause "
        "primitives were still evolving at the time this was generated. This export persists "
        "(run_id, node, context) to SQLite via agentforge_runtime.py's save_pause before raising a custom "
        "`WorkflowPaused` exception. Verify against the current "
        "[Agent Framework docs](https://learn.microsoft.com/en-us/agent-framework/) before "
        "relying on this for a real production pause/resume flow.\n\n"
        "**Resuming a paused run:**\n\n"
        "- **Locally**: `python main.py --resume <run_id> --decision \"approved\"`\n"
        "- **Once deployed to Foundry**: the pause message gives you a run_id -- send it back "
        "as a new message in the same format, either in the Agent Playground chat box or via "
        "`azd ai agent invoke <agent-name> '{\"input\": \"RESUME: <run_id> approved\"}'`:\n\n"
        "  ```\n"
        "  RESUME: <run_id> approved\n"
        "  ```\n\n"
        "  (`foundry_main.py` recognizes this exact `RESUME: <run_id> <decision>` pattern in the "
        "incoming message text and completes the paused run -- this only works for this "
        "Microsoft Agent Framework export; the LangGraph and CrewAI exports don't yet support "
        "resuming a paused run through the deployed endpoint, only via their own local CLI.)\n\n"
        if has_approval else ""
    )

    return {
        "main.py": script,
        "agentforge_runtime.py": runtime_py,
        "foundry_main.py": _foundry_wrapper_ms_agent_framework(),
        "azure.yaml": _azure_yaml(workflow_name),
        "infra/main.bicep": _infra_bicep(),
        "infra/main.parameters.json": _infra_parameters(),
        "tests/test_workflow.py": _ms_agent_framework_test_suite(),
        "requirements.txt": requirements,
        "requirements-dev.txt": "pytest==8.3.4\npytest-asyncio==0.25.2\n",
        ".env.example": _env_example(),
        ".gitignore": _gitignore(),
        ".dockerignore": _dockerignore(),
        "Dockerfile": _dockerfile("main.py"),
        "README.md": _readme(
            "Microsoft Agent Framework", workflow_name,
            "Microsoft Agent Framework has the deepest native Azure AI Foundry integration of "
            "the three export options (it's Microsoft's own SDK) -- see "
            "https://learn.microsoft.com/en-us/agent-framework/integrations/\n" + approval_note,
            memory_note,
        ),
    }


# ─── CrewAI ─────────────────────────────────────────────────────────────────

_CREWAI_LLM_SNIPPET = '''
import os


def get_llm():
    """Returns a value for CrewAI Agent(llm=...) per LLM_PROVIDER -- the same
    3-way provider choice (azure / gemini / lmstudio) AgentForge itself uses.
    CrewAI's `llm` accepts a LiteLLM-style model string."""
    provider = os.getenv("LLM_PROVIDER", "azure").lower()
    if provider == "gemini":
        return f"gemini/{os.getenv('GEMINI_MODEL', 'gemini-3.1-flash-lite')}"
    if provider == "lmstudio":
        from crewai import LLM
        return LLM(
            model=f"openai/{os.getenv('LMSTUDIO_MODEL', 'qwen/qwen3.5-9b')}",
            base_url=os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
            api_key="lm-studio",
        )
    # CrewAI's `llm=` string routes through LiteLLM, which reads its own
    # AZURE_API_BASE/AZURE_API_KEY/AZURE_API_VERSION env vars -- not the
    # AZURE_OPENAI_* names this project's .env.example uses (shared across
    # all 3 framework exports for a consistent setup experience). Bridge
    # them here so one .env works for every export. Confirmed live against
    # a real Azure AI Foundry resource.
    os.environ.setdefault("AZURE_API_BASE", os.getenv("AZURE_OPENAI_ENDPOINT", ""))
    os.environ.setdefault("AZURE_API_KEY", os.getenv("AZURE_OPENAI_API_KEY", ""))
    os.environ.setdefault("AZURE_API_VERSION", os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"))
    return f"azure/{os.getenv('AZURE_OPENAI_DEPLOYMENT', 'gpt-4o')}"
'''


def _export_crewai(nodes: list[dict], edges: list[dict], workflow_name: str) -> dict[str, str]:
    flat = _normalize_nodes(nodes)
    ordered = _topo_sort_export(flat, edges)
    has_approval = any(n["role"] == "approval" for n in flat)
    has_branching = any(n["role"] in ("condition", "router") for n in flat)

    agent_defs: list[str] = []
    handler_defs: list[str] = []
    nodes_data_lines: list[str] = []
    handlers_map_lines: list[str] = []

    for node in ordered:
        nid = node["id"]
        var = _safe_id(nid)
        role = node["role"]
        label_lit = json.dumps(node["label"])
        nodes_data_lines.append(
            f'    {json.dumps(nid)}: {{"id": {json.dumps(nid)}, "role": {json.dumps(role)}, '
            f'"label": {label_lit}, "approver_email": {json.dumps(node["approver_email"])}}},'
        )

        if role in ("input", "output"):
            continue  # run_graph() handles these roles structurally, no handler needed

        if role in _AGENT_LIKE_ROLES:
            desc_lit = json.dumps(node["description"] or f'You are the {node["label"]} step in a workflow.')
            agent_defs.append(
                f'{var}_agent = Agent(role={label_lit}, goal={desc_lit}, backstory={desc_lit}, llm=get_llm(), verbose=False)'
            )
            handler_defs.append(
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (role: {role})."""\n'
                f'    task = Task(description=context["output"], expected_output="A helpful response.", agent={var}_agent)\n'
                f'    crew = Crew(agents=[{var}_agent], tasks=[task], memory=False)\n'
                f'    result = str(crew.kickoff())\n'
                f'    context["output"] = result\n'
                f'    try:\n'
                f'        parsed = json.loads(result)\n'
                f'        if isinstance(parsed, dict):\n'
                f'            context.update(parsed)\n'
                f'    except (json.JSONDecodeError, TypeError):\n'
                f'        pass\n'
                f'    return context\n'
            )
        elif role == "http_request":
            url_lit = json.dumps(node["url"])
            method_lit = json.dumps(node["method"] or "GET")
            headers_lit = json.dumps(node["headers"])
            body_lit = json.dumps(node["body"])
            handler_defs.append(
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (http_request) -- CUSTOM GLUE: CrewAI has no native\n'
                f'    HTTP tool node, so this is a plain function call, same approach as a\n'
                f'    CrewAI @tool would use internally."""\n'
                f'    context["output"] = call_http_request({url_lit}, {method_lit}, {headers_lit}, {body_lit}, context["output"])\n'
                f'    return context\n'
            )
        elif role == "condition":
            rule_lit = json.dumps(node["rule"])
            handler_defs.append(
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (condition): {node["rule"]} -- CUSTOM GLUE: CrewAI has\n'
                f'    no native conditional-branching primitive between Tasks, so run_graph()\n'
                f'    (agentforge_runtime.py) reads context["branch"] set here to pick the next node via\n'
                f'    the EDGES data below, instead of hand-written if/elif dispatch."""\n'
                f'    context["branch"] = evaluate_condition({rule_lit}, context)\n'
                f'    return context\n'
            )
        elif role == "router":
            labels = sorted({e.get("label") for e in _outgoing(edges, nid) if e.get("label")})
            labels_lit = json.dumps(labels)
            handler_defs.append(
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (router) -- CUSTOM GLUE: CrewAI has no native router\n'
                f'    primitive, so a small classification Agent picks a branch label\n'
                f'    explicitly."""\n'
                f'    labels = {labels_lit}\n'
                f'    router_agent = Agent(role="Router", goal="Classify text into exactly one label", backstory="", llm=get_llm(), verbose=False)\n'
                f'    task = Task(description="Choose exactly one of these labels that best matches the intent: " + ", ".join(labels) + ". Return ONLY the label. Text: " + context["output"], expected_output="One label, nothing else.", agent=router_agent)\n'
                f'    crew = Crew(agents=[router_agent], tasks=[task], memory=False)\n'
                f'    chosen = str(crew.kickoff()).strip().strip(\'"\').strip("\'")\n'
                f'    context["branch"] = chosen if chosen in labels else (labels[0] if labels else "")\n'
                f'    return context\n'
            )
        elif role == "approval":
            approver_lit = json.dumps(node["approver_email"])
            handler_defs.append(
                f'@node_span({json.dumps(nid)}, {json.dumps(role)})\n'
                f'def _run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (approval) -- CUSTOM GLUE: CrewAI has no native\n'
                f'    human-in-the-loop primitive. run_graph() (agentforge_runtime.py) persists\n'
                f'    (run_id, node_id, context) to SQLite via save_pause before this\n'
                f'    WorkflowPaused propagates -- resume with:\n'
                f'    python main.py --resume <run_id> --decision "approved"\n'
                f'    """\n'
                f'    raise WorkflowPaused(context.get("_run_id", ""), {json.dumps(nid)}, {label_lit}, {approver_lit}, context)\n'
            )
        handlers_map_lines.append(f'    {json.dumps(nid)}: _run_{var},')

    branch_note = (
        "\n**Note on branching**: CrewAI has no native conditional/router primitive -- this "
        "export represents the workflow as data (NODES/EDGES in main.py) walked by the shared, "
        "unit-tested `run_graph()` engine in agentforge_runtime.py, which is identical code for every "
        "CrewAI export regardless of workflow shape (rather than bespoke per-workflow control "
        "flow).\n\n"
        if has_branching else ""
    )
    approval_note = (
        "\n**Note on the approval node**: CrewAI has no native human-in-the-loop pause "
        "primitive. `run_graph()` persists `(run_id, node_id, context)` to SQLite before the "
        "`WorkflowPaused` exception propagates -- resume with "
        "`python main.py --resume <run_id> --decision \"approved\"`.\n\n"
        if has_approval else ""
    )
    memory_note = (
        "This export uses **SQLite-backed durable checkpointing** (see agentforge_runtime.py's "
        "save_pause/load_pause/run_graph) so a paused approval or a crash mid-run survives a "
        "container restart -- set `CHECKPOINT_DB_PATH` to control where the .db file lives. "
        "CrewAI's own `Crew(memory=True)` long-term/entity memory (separate from this "
        "workflow-level checkpointing) still defaults to **local file storage** (SQLite/"
        "ChromaDB) if you turn it on -- see https://docs.crewai.com/en/concepts/memory\n\n"
        "**Known limitation with custom Azure deployment names**: CrewAI (via LiteLLM) decides "
        "whether to send a `stop` parameter by looking up `model=\"azure/<deployment>\"` in "
        "LiteLLM's model registry. A custom Azure deployment name/alias won't match any entry, "
        "so LiteLLM assumes `stop` is supported even when the underlying model is a reasoning "
        "model that rejects it (`Unsupported parameter: 'stop'`) -- confirmed live against a "
        "reasoning-family Azure deployment. If you hit this, either deploy/alias a "
        "non-reasoning model for CrewAI, or override `CrewAILLM.supports_stop_words()` to "
        "return `False` for your deployment."
    )

    # NOTE: deliberately NOT json.dumps()'d as one blob -- JSON's `null` is a
    # valid Python *identifier* (not the same as `None`), so a naive
    # json.dumps(edges) embedded into Python source parses fine with ast.parse
    # but raises NameError at runtime for any edge without a label. Each
    # field is dumped individually instead, using json.dumps(None) -> "null"
    # replaced by the literal text "None" only for the label field specifically.
    edges_data_lines = [
        '    {"source": %s, "target": %s, "label": %s},' % (
            json.dumps(e.get("source")),
            json.dumps(e.get("target")),
            json.dumps(e.get("label")) if e.get("label") is not None else "None",
        )
        for e in edges
    ]
    edges_data = "[\n" + "\n".join(edges_data_lines) + "\n]"

    script = f'''"""
Auto-generated by AgentForge's Visual Workflow Builder -- CrewAI export.
Workflow: {workflow_name}

Real CrewAI primitives: agent-like nodes are Agent + Task + Crew. The graph
itself (NODES/EDGES below) is plain data, walked by agentforge_runtime.py's shared
run_graph() engine -- see each node handler's own docstring for per-role
custom glue. Enterprise infrastructure (settings validation, retries,
OpenTelemetry tracing, SQLite pause/resume, HTTP/condition helpers) also
lives in agentforge_runtime.py, shared verbatim across every CrewAI export.

Run it:
    python main.py "your test input text here"
    python main.py --resume <run_id> --decision "approved"
    python main.py --list-pending
"""
import argparse
import json

from crewai import Agent, Task, Crew
from agentforge_runtime import (
    load_settings, configure_observability, new_run_id, node_span,
    evaluate_condition, call_http_request,
    save_pause, load_pause, clear_pause, list_pending,
    run_graph, WorkflowPaused,
)

{_CREWAI_LLM_SNIPPET}

{chr(10).join(agent_defs)}

{chr(10).join(handler_defs)}

NODES = {{
{chr(10).join(nodes_data_lines)}
}}

EDGES = {edges_data}

HANDLERS = {{
{chr(10).join(handlers_map_lines)}
}}


def main() -> None:
    load_settings()
    configure_observability()
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", default="Hello, I need help")
    parser.add_argument("--resume", metavar="RUN_ID")
    parser.add_argument("--decision", default="approved")
    parser.add_argument("--list-pending", action="store_true")
    args = parser.parse_args()

    if args.list_pending:
        for p in list_pending():
            print(p)
        return

    run_id = args.resume or new_run_id()
    workflow_input = args.decision if args.resume else args.input
    try:
        result = run_graph(NODES, EDGES, HANDLERS, workflow_input, run_id, resume_from=args.resume)
        print(result)
    except WorkflowPaused as p:
        # Use our own `run_id` (known correct), not p.run_id -- the node
        # handler that raises WorkflowPaused doesn't have access to the
        # run_id itself (run_graph() injects it into persistence, not into
        # the handler's context), so p.run_id is always empty.
        print(f"Paused at '{{p.node_label}}' (run {{run_id}}) -- awaiting approval from {{p.approver_email}}. "
              f"Resume with: python main.py --resume {{run_id}} --decision \\"approved\\"")


if __name__ == "__main__":
    main()
'''

    requirements = (
        "crewai==0.130.0\n"
        "simpleeval==1.0.3\n"
        "httpx==0.28.1\n"
        "python-dotenv==1.0.1\n"
        "pydantic-settings==2.7.1\n"
        "tenacity==9.0.0\n"
        "azure-monitor-opentelemetry==1.6.4\n"
        "opentelemetry-api==1.29.0\n"
        "azure-ai-agentserver-responses==2.0.0b1\n"
    )

    runtime_py = (
        _RUNTIME_SETTINGS_SNIPPET + "\n"
        + _RUNTIME_RETRY_SNIPPET + "\n"
        + _RUNTIME_OBSERVABILITY_SNIPPET + "\n"
        + _RUNTIME_PERSISTENCE_SNIPPET + "\n"
        + _CREWAI_GRAPH_ENGINE_SNIPPET
    )

    return {
        "main.py": script,
        "agentforge_runtime.py": runtime_py,
        "foundry_main.py": _foundry_wrapper_crewai(),
        "azure.yaml": _azure_yaml(workflow_name),
        "infra/main.bicep": _infra_bicep(),
        "infra/main.parameters.json": _infra_parameters(),
        "tests/test_workflow.py": _crewai_test_suite(flat, edges),
        "requirements.txt": requirements,
        "requirements-dev.txt": "pytest==8.3.4\npytest-asyncio==0.25.2\n",
        ".env.example": _env_example(),
        ".gitignore": _gitignore(),
        ".dockerignore": _dockerignore(),
        "Dockerfile": _dockerfile("main.py"),
        "README.md": _readme(
            "CrewAI", workflow_name,
            "Azure AI Foundry Hosted Agents supports CrewAI natively -- \"if you are already on "
            "LangGraph or CrewAI, Hosted Agents supports them natively; no migration required.\"\n"
            + branch_note + approval_note,
            memory_note,
        ),
    }


# ─── Dispatch ───────────────────────────────────────────────────────────────

_EXPORTERS = {
    "langgraph": _export_langgraph,
    "ms_agent_framework": _export_ms_agent_framework,
    "crewai": _export_crewai,
}


def export_workflow(nodes: list[dict], edges: list[dict], workflow_name: str, framework: str) -> dict[str, str]:
    """Translate the canvas's {nodes, edges} into a full downloadable project
    for the given framework ("langgraph" | "ms_agent_framework" | "crewai").
    Raises ValueError for an unknown framework."""
    exporter = _EXPORTERS.get(framework)
    if exporter is None:
        raise ValueError(f"Unknown export framework: {framework!r} (expected one of {sorted(_EXPORTERS)})")
    if not nodes:
        raise ValueError("Cannot export an empty workflow (no nodes)")
    return exporter(nodes, edges, workflow_name or "AgentForge Workflow")
