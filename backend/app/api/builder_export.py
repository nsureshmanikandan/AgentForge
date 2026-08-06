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


def _dockerfile(entry_module: str) -> str:
    return (
        "FROM python:3.12-slim\n"
        "WORKDIR /app\n"
        "COPY requirements.txt .\n"
        "RUN pip install --no-cache-dir -r requirements.txt\n"
        "COPY . .\n"
        f'CMD ["python", "{entry_module}"]\n'
    )


def _readme(framework: str, workflow_name: str, extra_notes: str, memory_note: str) -> str:
    return (
        f"# {workflow_name} -- {framework} export\n\n"
        f"Generated by AgentForge's Visual Workflow Builder from the live canvas graph.\n\n"
        "## Setup\n\n"
        "```bash\n"
        "cp .env.example .env   # fill in your chosen provider's credentials\n"
        "pip install -r requirements.txt\n"
        "python main.py \"your test input text here\"\n"
        "```\n\n"
        "## Deploying\n\n"
        "This project ships with a `Dockerfile`, so it's ready for Azure AI Foundry's "
        "Hosted Agents (which natively support LangGraph, Microsoft Agent Framework, and "
        "CrewAI -- no migration required) or any other container host. Set the same "
        "environment variables from `.env.example` as the host's secrets/config, "
        "not as a shipped `.env` file.\n\n"
        f"{extra_notes}\n"
        "## Memory & state\n\n"
        f"{memory_note}\n"
    )


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
                f'    with Command(resume=...). Requires the MemorySaver checkpointer below to\n'
                f'    function at all -- that checkpointer is in-memory/process-local only (not\n'
                f'    a persistent store), so this does not contradict the stateless-by-default\n'
                f'    design: it just makes interrupt() work within one run.\n'
                f'    """\n'
                f'    decision = interrupt({{"node": {label_lit}, "approver_email": {approver_lit}, "context": state.get("output", state["input"])}})\n'
                f'    state["output"] = str(decision)\n'
                f'    return state\n'
            )

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
        "from langgraph.checkpoint.memory import MemorySaver\n"
        "compiled = graph.compile(checkpointer=MemorySaver())\n"
        if has_approval else
        "compiled = graph.compile()\n"
    )

    script = f'''"""
Auto-generated by AgentForge's Visual Workflow Builder -- LangGraph export.
Workflow: {workflow_name}

Real LangGraph StateGraph: every canvas node is a graph node, condition/router
nodes use add_conditional_edges(), and the approval node uses interrupt().

Run it:
    python main.py "your test input text here"
"""
import json
import sys
from typing import TypedDict, Any

from langgraph.graph import StateGraph
from langgraph.types import interrupt, Command
from simpleeval import simple_eval
import httpx

{_LANGGRAPH_LLM_SNIPPET}

def evaluate_condition(rule: str, variables: dict) -> str:
    """Same fail-closed simpleeval pattern as the live canvas engine
    (backend/app/api/builder.py::_evaluate_condition) -- never uses eval()."""
    try:
        return "true" if bool(simple_eval(rule, names=variables)) else "false"
    except Exception:
        return "false"


def call_http_request(url: str, method: str, headers_raw: str, body_raw: str, previous_output: str) -> str:
    url = url.replace("{{{{input}}}}", previous_output or "")
    body_raw = body_raw.replace("{{{{input}}}}", previous_output or "") if body_raw else body_raw
    headers = json.loads(headers_raw) if headers_raw else None
    json_body, data_body = None, None
    if body_raw:
        try:
            json_body = json.loads(body_raw)
        except json.JSONDecodeError:
            data_body = body_raw
    with httpx.Client(timeout=15.0) as client:
        response = client.request(method, url, headers=headers, json=json_body, content=data_body)
    response.raise_for_status()
    return response.text[:4000]


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
    test_input = sys.argv[1] if len(sys.argv) > 1 else "Hello, I need help"
    config = {{"configurable": {{"thread_id": "cli-run"}}}}
    result = compiled.invoke({{"input": test_input, "output": "", "context": {{}}, "_branch": ""}}, config=config)
    print(result.get("output", result))
'''

    requirements = (
        "langgraph==0.6.10\n"
        "langchain-openai==0.3.19\n"
        "langchain-google-genai==2.1.0\n"
        "simpleeval==1.0.3\n"
        "httpx==0.28.1\n"
        "python-dotenv==1.0.1\n"
    )

    memory_note = (
        "This export is **stateless by default** -- no persistent checkpointer or store, matching "
        "the canvas's own current behavior. " +
        ("An in-memory `MemorySaver` checkpointer is used because this workflow has an approval "
         "node -- LangGraph's `interrupt()` requires a checkpointer to pause/resume at all, but "
         "`MemorySaver` is process-local and does not persist across restarts. "
         if has_approval else "") +
        "To add real cross-session memory, swap in a `PostgresSaver` (thread-scoped) and/or the "
        "`langmem` package with a `PostgresStore` (cross-thread, semantic) -- see "
        "https://docs.langchain.com/oss/python/langgraph/persistence"
    )

    return {
        "main.py": script,
        "requirements.txt": requirements,
        ".env.example": _env_example(),
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
                f'async def {var}(text: str, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (input)."""\n'
                f'    await ctx.send_message(text)\n'
            )
        elif role == "output":
            executor_defs.append(
                f'@executor(id={json.dumps(var)})\n'
                f'async def {var}(message: Any, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (output)."""\n'
                f'    result = message.get("output") if isinstance(message, dict) else message\n'
                f'    await ctx.send_message(result)\n'
            )
        elif role in _AGENT_LIKE_ROLES:
            desc_lit = json.dumps(node["description"] or f'You are the {node["label"]} step in a workflow.')
            executor_defs.append(
                f'{var}_agent = Agent(get_chat_client(), instructions={desc_lit}, name={label_lit})\n'
                f'{var} = AgentExecutor({var}_agent, id={json.dumps(var)})\n'
            )
        elif role == "http_request":
            url_lit = json.dumps(node["url"])
            method_lit = json.dumps(node["method"] or "GET")
            headers_lit = json.dumps(node["headers"])
            body_lit = json.dumps(node["body"])
            executor_defs.append(
                f'@executor(id={json.dumps(var)})\n'
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
                f'async def {var}(message: Any, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (router)."""\n'
                f'    text = message.get("output") if isinstance(message, dict) else message\n'
                f'    labels = {labels_lit}\n'
                f'    agent = Agent(get_chat_client(), instructions="Choose exactly one of these labels that best matches the intent: " + ", ".join(labels) + ". Return ONLY the label.")\n'
                f'    reply = await agent.run(text)\n'
                f'    chosen = str(reply).strip().strip(\'"\').strip("\'")\n'
                f'    branch = chosen if chosen in labels else (labels[0] if labels else "")\n'
                f'    await ctx.send_message({{"output": text, "branch": branch}})\n'
            )
        elif role == "approval":
            has_approval = True
            approver_lit = json.dumps(node["approver_email"])
            executor_defs.append(
                f'@executor(id={json.dumps(var)})\n'
                f'async def {var}(message: Any, ctx: WorkflowContext) -> None:\n'
                f'    """{node["label"]} (approval) -- CUSTOM GLUE: Microsoft Agent Framework has\n'
                f'    no verified native long-running human-in-the-loop pause primitive at the\n'
                f'    time this was generated, so this raises WorkflowPaused the same way the\n'
                f'    LangGraph export uses interrupt() -- catch it, get a human decision (e.g.\n'
                f"    via the emailed link pattern AgentForge's own live canvas engine uses),\n"
                f'    then re-run with the decision appended to your input.\n'
                f'    """\n'
                f'    text = message.get("output") if isinstance(message, dict) else message\n'
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

Real agent-framework primitives: agent-like nodes are Agent + AgentExecutor,
condition/router/http_request are @executor-decorated functions, and edges use
WorkflowBuilder.add_edge(..., condition=lambda msg: ...) for branching.

Run it:
    python main.py "your test input text here"
"""
import json
import sys
from typing import Any

from agent_framework import Agent, AgentExecutor, WorkflowBuilder, WorkflowContext, executor
from simpleeval import simple_eval
import httpx

{_MSAF_LLM_SNIPPET}

class WorkflowPaused(Exception):
    """Raised by an approval node -- see its docstring above."""
    def __init__(self, node_label: str, approver_email: str, context: str):
        self.node_label = node_label
        self.approver_email = approver_email
        self.context = context
        super().__init__(f"Paused at '{{node_label}}' -- awaiting approval from {{approver_email}}")


def evaluate_condition(rule: str, variables: dict) -> str:
    """Same fail-closed simpleeval pattern as the live canvas engine
    (backend/app/api/builder.py::_evaluate_condition) -- never uses eval()."""
    try:
        return "true" if bool(simple_eval(rule, names=variables)) else "false"
    except Exception:
        return "false"


def call_http_request(url: str, method: str, headers_raw: str, body_raw: str, previous_output: str) -> str:
    url = url.replace("{{{{input}}}}", previous_output or "")
    body_raw = body_raw.replace("{{{{input}}}}", previous_output or "") if body_raw else body_raw
    headers = json.loads(headers_raw) if headers_raw else None
    json_body, data_body = None, None
    if body_raw:
        try:
            json_body = json.loads(body_raw)
        except json.JSONDecodeError:
            data_body = body_raw
    with httpx.Client(timeout=15.0) as client:
        response = client.request(method, url, headers=headers, json=json_body, content=data_body)
    response.raise_for_status()
    return response.text[:4000]


{chr(10).join(executor_defs)}

workflow_builder = WorkflowBuilder(start_executor={entry_var})
{chr(10).join(edge_lines)}
workflow = workflow_builder.build()


async def _main() -> None:
    test_input = sys.argv[1] if len(sys.argv) > 1 else "Hello, I need help"
    try:
        await workflow.run(test_input)
        print("Workflow complete.")
    except WorkflowPaused as p:
        print(f"Paused at '{{p.node_label}}' -- awaiting approval from {{p.approver_email}}. Context: {{p.context}}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(_main())
'''

    requirements = (
        "agent-framework-core==1.13.0\n"
        "simpleeval==1.0.3\n"
        "httpx==0.28.1\n"
        "python-dotenv==1.0.1\n"
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
        "primitives were still evolving at the time this was generated. This export uses a "
        "custom `WorkflowPaused` exception (the same pattern LangGraph's `interrupt()` "
        "achieves natively) -- verify against the current "
        "[Agent Framework docs](https://learn.microsoft.com/en-us/agent-framework/) before "
        "relying on it for a real production pause/resume flow.\n\n"
        if has_approval else ""
    )

    return {
        "main.py": script,
        "requirements.txt": requirements,
        ".env.example": _env_example(),
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
    step_fns: list[str] = []
    driver_lines: list[str] = ['    context: dict = {"output": workflow_input}']

    for node in ordered:
        nid = node["id"]
        var = _safe_id(nid)
        role = node["role"]
        label_lit = json.dumps(node["label"])

        if role == "input":
            continue  # handled by the driver's initial context, no step needed
        if role == "output":
            driver_lines.append(f'    # {node["label"]} (output)')
            driver_lines.append('    return context["output"]')
            continue

        if role in _AGENT_LIKE_ROLES:
            desc_lit = json.dumps(node["description"] or f'You are the {node["label"]} step in a workflow.')
            agent_defs.append(
                f'{var}_agent = Agent(role={label_lit}, goal={desc_lit}, backstory={desc_lit}, llm=get_llm(), verbose=False)'
            )
            step_fns.append(
                f'def run_{var}(context: dict) -> dict:\n'
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
            driver_lines.append(f'    context = run_{var}(context)  # {node["label"]}')
        elif role == "http_request":
            url_lit = json.dumps(node["url"])
            method_lit = json.dumps(node["method"] or "GET")
            headers_lit = json.dumps(node["headers"])
            body_lit = json.dumps(node["body"])
            step_fns.append(
                f'def run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (http_request) -- CUSTOM GLUE: CrewAI has no native\n'
                f'    HTTP tool node, so this is a plain function call, same approach as a\n'
                f'    CrewAI @tool would use internally."""\n'
                f'    context["output"] = call_http_request({url_lit}, {method_lit}, {headers_lit}, {body_lit}, context["output"])\n'
                f'    return context\n'
            )
            driver_lines.append(f'    context = run_{var}(context)  # {node["label"]}')
        elif role == "condition":
            rule_lit = json.dumps(node["rule"])
            step_fns.append(
                f'def run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (condition): {node["rule"]} -- CUSTOM GLUE: CrewAI has\n'
                f'    no native conditional-branching primitive between Tasks, so this is a\n'
                f'    plain function the driver below calls to decide which branch runs next."""\n'
                f'    context["branch"] = evaluate_condition({rule_lit}, context)\n'
                f'    return context\n'
            )
            driver_lines.append(f'    context = run_{var}(context)  # {node["label"]}')
            outs = _outgoing(edges, nid)
            for e in outs:
                branch = str(e.get("label") or "")
                target_var = _safe_id(e["target"])
                driver_lines.append(f'    if context.get("branch") == {json.dumps(branch)}:')
                driver_lines.append(f'        context = run_{target_var}(context)  # -> {branch}')
        elif role == "router":
            labels = sorted({e.get("label") for e in _outgoing(edges, nid) if e.get("label")})
            labels_lit = json.dumps(labels)
            step_fns.append(
                f'def run_{var}(context: dict) -> dict:\n'
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
            driver_lines.append(f'    context = run_{var}(context)  # {node["label"]}')
            outs = _outgoing(edges, nid)
            for e in outs:
                branch = str(e.get("label") or "")
                target_var = _safe_id(e["target"])
                driver_lines.append(f'    if context.get("branch") == {json.dumps(branch)}:')
                driver_lines.append(f'        context = run_{target_var}(context)  # -> {branch}')
        elif role == "approval":
            approver_lit = json.dumps(node["approver_email"])
            step_fns.append(
                f'def run_{var}(context: dict) -> dict:\n'
                f'    """{node["label"]} (approval) -- CUSTOM GLUE: CrewAI has no native\n'
                f'    human-in-the-loop primitive at all, so this raises WorkflowPaused the\n'
                f'    same way the LangGraph export uses interrupt() -- catch it, get a human\n'
                f"    decision (e.g. via the emailed link pattern AgentForge's own live canvas\n"
                f'    engine uses), then re-run with the decision appended to context["output"].\n'
                f'    """\n'
                f'    raise WorkflowPaused({label_lit}, {approver_lit}, context["output"])\n'
            )
            driver_lines.append(f'    context = run_{var}(context)  # {node["label"]}')

    branch_note = (
        "\n**Note on branching**: CrewAI has no native conditional/router primitive between "
        "Tasks -- this export uses a plain Python driver function to decide which step runs "
        "next, which is the documented, supported way to compose CrewAI with custom control "
        "flow (a `Crew` per step rather than one `Crew.kickoff()` for the whole graph).\n\n"
        if has_branching else ""
    )
    approval_note = (
        "\n**Note on the approval node**: CrewAI has no native human-in-the-loop pause "
        "primitive. This export uses a custom `WorkflowPaused` exception, the same pattern "
        "the LangGraph export achieves natively via `interrupt()`.\n\n"
        if has_approval else ""
    )
    memory_note = (
        "This export is **stateless by default** (`memory=False` on every `Crew`), matching "
        "the canvas's own current behavior. If you turn on `memory=True`, know that CrewAI's "
        "long-term and entity memory default to **local file storage** (SQLite/ChromaDB) -- "
        "this does not survive in a containerized deployment (e.g. Azure AI Foundry Hosted "
        "Agents) without swapping in a real backend first. See "
        "https://docs.crewai.com/en/concepts/memory\n\n"
        "**Known limitation with custom Azure deployment names**: CrewAI (via LiteLLM) decides "
        "whether to send a `stop` parameter by looking up `model=\"azure/<deployment>\"` in "
        "LiteLLM's model registry. A custom Azure deployment name/alias won't match any entry, "
        "so LiteLLM assumes `stop` is supported even when the underlying model is a reasoning "
        "model that rejects it (`Unsupported parameter: 'stop'`) -- confirmed live against a "
        "reasoning-family Azure deployment. If you hit this, either deploy/alias a "
        "non-reasoning model for CrewAI, or override `CrewAILLM.supports_stop_words()` to "
        "return `False` for your deployment."
    )

    script = f'''"""
Auto-generated by AgentForge's Visual Workflow Builder -- CrewAI export.
Workflow: {workflow_name}

Real CrewAI primitives: agent-like nodes are Agent + Task + Crew. CrewAI has
no native branching or human-in-the-loop primitive, so condition/router/
approval nodes use small, clearly-marked custom glue functions instead --
see each function's own docstring below.

Run it:
    python main.py "your test input text here"
"""
import json
import sys

from crewai import Agent, Task, Crew
from simpleeval import simple_eval
import httpx

{_CREWAI_LLM_SNIPPET}

class WorkflowPaused(Exception):
    """Raised by an approval node -- see its docstring below."""
    def __init__(self, node_label: str, approver_email: str, context: str):
        self.node_label = node_label
        self.approver_email = approver_email
        self.context = context
        super().__init__(f"Paused at '{{node_label}}' -- awaiting approval from {{approver_email}}")


def evaluate_condition(rule: str, variables: dict) -> str:
    """Same fail-closed simpleeval pattern as the live canvas engine
    (backend/app/api/builder.py::_evaluate_condition) -- never uses eval()."""
    try:
        return "true" if bool(simple_eval(rule, names=variables)) else "false"
    except Exception:
        return "false"


def call_http_request(url: str, method: str, headers_raw: str, body_raw: str, previous_output: str) -> str:
    url = url.replace("{{{{input}}}}", previous_output or "")
    body_raw = body_raw.replace("{{{{input}}}}", previous_output or "") if body_raw else body_raw
    headers = json.loads(headers_raw) if headers_raw else None
    json_body, data_body = None, None
    if body_raw:
        try:
            json_body = json.loads(body_raw)
        except json.JSONDecodeError:
            data_body = body_raw
    with httpx.Client(timeout=15.0) as client:
        response = client.request(method, url, headers=headers, json=json_body, content=data_body)
    response.raise_for_status()
    return response.text[:4000]


{chr(10).join(agent_defs)}

{chr(10).join(step_fns)}

def run_workflow(workflow_input: str) -> str:
{chr(10).join(driver_lines)}
    return context.get("output", workflow_input)


if __name__ == "__main__":
    test_input = sys.argv[1] if len(sys.argv) > 1 else "Hello, I need help"
    try:
        print(run_workflow(test_input))
    except WorkflowPaused as p:
        print(f"Paused at '{{p.node_label}}' -- awaiting approval from {{p.approver_email}}. Context: {{p.context}}")
'''

    requirements = (
        "crewai==0.130.0\n"
        "simpleeval==1.0.3\n"
        "httpx==0.28.1\n"
        "python-dotenv==1.0.1\n"
    )

    return {
        "main.py": script,
        "requirements.txt": requirements,
        ".env.example": _env_example(),
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
