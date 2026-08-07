"""
Tests for multi-framework agent code export (LangGraph / Microsoft Agent
Framework / CrewAI) -- backend/app/api/builder_export.py. See
docs/superpowers/specs/2026-07-26-multi-framework-agent-export-design.md.

Fixtures reproduce the real patterns from the 8 live demo workflows built in
Workflow Builder during design of this feature (fraud triage, chargeback
dispute, retail order exception, KYC onboarding, travel & expense multi-agent,
wire transfer human-in-the-loop, merchant/address API chain, support
supervisor/specialist), not arbitrary hypothetical graphs.
"""
import ast

import pytest

from app.api.builder_export import export_workflow

FRAMEWORKS = ["langgraph", "ms_agent_framework", "crewai"]


# ─── Fixtures matching the 8 real demo workflow patterns ───────────────────

def _fraud_triage():
    """#1: Classifier -> Router -> HTTP -> Human Approval -> Output."""
    nodes = [
        {"id": "n1", "role": "input", "label": "Transaction Input"},
        {"id": "n2", "role": "classifier", "label": "Risk Classifier",
         "description": "Classify risk as low/medium/high, return JSON with risk_level."},
        {"id": "n3", "role": "router", "label": "Risk Router"},
        {"id": "n4", "role": "http_request", "label": "Merchant Check",
         "url": "https://postman-echo.com/post", "method": "POST"},
        {"id": "n5", "role": "approval", "label": "Fraud Ops Approval", "approver_email": "manager@company.com"},
        {"id": "n6", "role": "output", "label": "Final Disposition"},
    ]
    edges = [
        {"source": "n1", "target": "n2"},
        {"source": "n2", "target": "n3"},
        {"source": "n3", "target": "n4", "label": "high"},
        {"source": "n3", "target": "n6", "label": "low"},
        {"source": "n4", "target": "n5"},
        {"source": "n5", "target": "n6"},
    ]
    return nodes, edges


def _chargeback_dispute():
    """#2: HTTP -> Numeric Condition -> Auto-Agent OR Human Approval -> Output."""
    nodes = [
        {"id": "c1", "role": "input", "label": "Dispute Details"},
        {"id": "c2", "role": "http_request", "label": "Transaction Lookup",
         "url": "https://postman-echo.com/post", "method": "POST"},
        {"id": "c3", "role": "condition", "label": "Amount Check", "rule": "disputed_amount < 500"},
        {"id": "c4", "role": "agent", "label": "Auto Refund Agent", "description": "Process and confirm a refund."},
        {"id": "c5", "role": "approval", "label": "Fraud Manager Approval", "approver_email": "fraud@company.com"},
        {"id": "c6", "role": "output", "label": "Resolution"},
    ]
    edges = [
        {"source": "c1", "target": "c2"},
        {"source": "c2", "target": "c3"},
        {"source": "c3", "target": "c4", "label": "true"},
        {"source": "c3", "target": "c5", "label": "false"},
        {"source": "c4", "target": "c6"},
        {"source": "c5", "target": "c6"},
    ]
    return nodes, edges


def _travel_expense_multi_agent():
    """#5: 4 chained, distinct agents."""
    nodes = [
        {"id": "t1", "role": "input", "label": "Expense Report"},
        {"id": "t2", "role": "agent", "label": "Policy Checker", "description": "Check spending limits."},
        {"id": "t3", "role": "agent", "label": "Receipt Analyzer", "description": "Extract line items."},
        {"id": "t4", "role": "agent", "label": "Expense Categorizer", "description": "Categorize and flag items."},
        {"id": "t5", "role": "agent", "label": "Summary Writer", "description": "Synthesize one recommendation."},
        {"id": "t6", "role": "output", "label": "Recommendation"},
    ]
    edges = [{"source": f"t{i}", "target": f"t{i+1}"} for i in range(1, 6)]
    return nodes, edges


def _wire_transfer_approval():
    """#6: minimal human-in-the-loop -- Agent -> Human Approval -> Output."""
    nodes = [
        {"id": "w1", "role": "input", "label": "Wire Transfer Request"},
        {"id": "w2", "role": "agent", "label": "Transfer Risk Summary", "description": "Write a short risk summary."},
        {"id": "w3", "role": "approval", "label": "Treasury Manager Approval", "approver_email": "treasury@company.com"},
        {"id": "w4", "role": "output", "label": "Transfer Decision"},
    ]
    edges = [
        {"source": "w1", "target": "w2"},
        {"source": "w2", "target": "w3"},
        {"source": "w3", "target": "w4"},
    ]
    return nodes, edges


def _merchant_address_api_chain():
    """#7: two chained HTTP calls -> Agent -> Output."""
    nodes = [
        {"id": "m1", "role": "input", "label": "Merchant Onboarding Request"},
        {"id": "m2", "role": "http_request", "label": "Business Registry Check",
         "url": "https://postman-echo.com/post", "method": "POST"},
        {"id": "m3", "role": "http_request", "label": "Address Verification Call",
         "url": "https://postman-echo.com/post", "method": "POST"},
        {"id": "m4", "role": "agent", "label": "Verification Summary", "description": "Review both API responses."},
        {"id": "m5", "role": "output", "label": "Onboarding Decision"},
    ]
    edges = [
        {"source": "m1", "target": "m2"},
        {"source": "m2", "target": "m3"},
        {"source": "m3", "target": "m4"},
        {"source": "m4", "target": "m5"},
    ]
    return nodes, edges


def _support_supervisor():
    """#8: Classifier -> numeric Condition -> Human Approval OR Auto-Agent -> Output."""
    nodes = [
        {"id": "s1", "role": "input", "label": "Support Message"},
        {"id": "s2", "role": "classifier", "label": "Support Supervisor",
         "description": "Output a fraud_score from 0-100."},
        {"id": "s3", "role": "condition", "label": "Case Router", "rule": "fraud_score >= 50"},
        {"id": "s4", "role": "approval", "label": "Fraud Specialist Escalation", "approver_email": "specialist@company.com"},
        {"id": "s5", "role": "agent", "label": "Billing Specialist Agent", "description": "Resolve the billing question."},
        {"id": "s6", "role": "output", "label": "Support Resolution"},
    ]
    edges = [
        {"source": "s1", "target": "s2"},
        {"source": "s2", "target": "s3"},
        {"source": "s3", "target": "s4", "label": "true"},
        {"source": "s3", "target": "s5", "label": "false"},
        {"source": "s4", "target": "s6"},
        {"source": "s5", "target": "s6"},
    ]
    return nodes, edges


ALL_FIXTURES = {
    "fraud_triage": _fraud_triage,
    "chargeback_dispute": _chargeback_dispute,
    "travel_expense_multi_agent": _travel_expense_multi_agent,
    "wire_transfer_approval": _wire_transfer_approval,
    "merchant_address_api_chain": _merchant_address_api_chain,
    "support_supervisor": _support_supervisor,
}


# ─── Cross-cutting: every fixture x every framework produces valid Python ──

@pytest.mark.parametrize("fixture_name", ALL_FIXTURES)
@pytest.mark.parametrize("framework", FRAMEWORKS)
def test_generated_main_py_is_valid_python(fixture_name, framework):
    nodes, edges = ALL_FIXTURES[fixture_name]()
    files = export_workflow(nodes, edges, fixture_name, framework)
    try:
        ast.parse(files["main.py"])
    except SyntaxError as e:
        pytest.fail(f"{fixture_name}/{framework} generated invalid Python: {e}\n\n{files['main.py']}")


@pytest.mark.parametrize("fixture_name", ALL_FIXTURES)
@pytest.mark.parametrize("framework", FRAMEWORKS)
def test_full_project_shape(fixture_name, framework):
    """Every export is a full downloadable project, not just a bare script."""
    nodes, edges = ALL_FIXTURES[fixture_name]()
    files = export_workflow(nodes, edges, fixture_name, framework)
    assert set(files.keys()) == {
        "main.py", "agentforge_runtime.py", "foundry_main.py", "azure.yaml", "tests/test_workflow.py",
        "requirements.txt", "requirements-dev.txt",
        ".env.example", ".gitignore", ".dockerignore", "Dockerfile", "README.md",
    }
    assert files["requirements.txt"].strip()
    assert "FROM python" in files["Dockerfile"]
    assert "LLM_PROVIDER" in files[".env.example"]
    ast.parse(files["agentforge_runtime.py"])
    ast.parse(files["foundry_main.py"])
    ast.parse(files["tests/test_workflow.py"])
    assert "codeConfiguration" in files["azure.yaml"]


@pytest.mark.parametrize("framework", FRAMEWORKS)
def test_shared_infra_module_is_not_named_runtime(framework):
    # Regression test: this file used to be named runtime.py. Confirmed live
    # that langgraph>=1.1.1 ships its own internal `langgraph.runtime`
    # submodule (Runtime/DEFAULT_RUNTIME/ExecutionInfo) -- once the export's
    # own directory is on sys.path (exactly what happens when you run
    # `python main.py` from inside the export folder, and what the
    # AzureLive verification harness does), this caused
    # "ImportError: cannot import name 'DEFAULT_RUNTIME' from 'langgraph.runtime'"
    # resolving to the EXPORT's own file instead of the real langgraph
    # submodule. Renamed to agentforge_runtime.py, which can't collide with
    # any dependency's own internal module names.
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "x", framework)
    assert "runtime.py" not in files
    assert "agentforge_runtime.py" in files
    assert "from runtime import" not in files["main.py"]


# ─── Per-framework: real SDK constructs actually appear ────────────────────

def test_langgraph_uses_real_stategraph():
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "Fraud Triage", "langgraph")
    src = files["main.py"]
    assert "from langgraph.graph import StateGraph" in src
    assert "StateGraph(WorkflowState)" in src
    assert "add_conditional_edges(" in src  # router node present
    assert "interrupt(" in src  # approval node present
    assert "SqliteSaver" in src  # durable checkpointer, required for interrupt() to survive a restart
    assert "langgraph==" in files["requirements.txt"]
    assert "langgraph-checkpoint-sqlite==" in files["requirements.txt"]


def test_langgraph_no_checkpointer_without_approval():
    """Stateless-by-default: only add a checkpointer when an approval node
    actually needs interrupt() to work -- never persist by default otherwise."""
    nodes, edges = _travel_expense_multi_agent()
    files = export_workflow(nodes, edges, "Travel Expense", "langgraph")
    assert "SqliteSaver" not in files["main.py"]
    assert "compiled = graph.compile()" in files["main.py"]
    assert "langgraph-checkpoint-sqlite==" not in files["requirements.txt"]


def test_ms_agent_framework_uses_real_chatagent_and_workflowbuilder():
    # NOTE: `ChatAgent` does not exist in any currently published
    # agent-framework-core release (confirmed live against 1.0.0 and
    # 1.13.0) -- the real class is `Agent`. Asserting the class this
    # project actually exports and has run live, not the SDK docs site's
    # "latest" moniker, which tracks an unreleased version ahead of PyPI.
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "Fraud Triage", "ms_agent_framework")
    src = files["main.py"]
    assert "from agent_framework import Agent, AgentExecutor, WorkflowBuilder" in src
    assert "Agent(get_chat_client()," in src
    assert "AgentExecutor(" in src
    assert "WorkflowBuilder(start_executor=" in src
    assert "@executor(id=" in src
    assert 'condition=lambda msg' in src  # router branching present
    assert "agent-framework-core==" in files["requirements.txt"]


def test_ms_agent_framework_approval_uses_documented_custom_glue():
    nodes, edges = _wire_transfer_approval()
    files = export_workflow(nodes, edges, "Wire Transfer", "ms_agent_framework")
    assert "WorkflowPaused" in files["main.py"]
    assert "CUSTOM GLUE" in files["main.py"]
    assert "still evolving" in files["README.md"] or "verify against the current" in files["README.md"]


def test_crewai_uses_real_agent_task_crew():
    nodes, edges = _travel_expense_multi_agent()
    files = export_workflow(nodes, edges, "Travel Expense", "crewai")
    src = files["main.py"]
    assert "from crewai import Agent, Task, Crew" in src
    assert src.count("Agent(role=") == 4  # one per real agent node
    assert "Task(description=" in src
    assert "Crew(agents=" in src
    assert "memory=False" in src  # stateless by default
    assert "crewai==" in files["requirements.txt"]


def test_crewai_branching_and_approval_use_documented_custom_glue():
    nodes, edges = _support_supervisor()
    files = export_workflow(nodes, edges, "Support Supervisor", "crewai")
    src = files["main.py"]
    assert "CUSTOM GLUE" in src  # both the condition node and the approval node
    assert "WorkflowPaused" in src
    assert "no native conditional/router primitive" in files["README.md"]
    assert "no native human-in-the-loop pause primitive" in files["README.md"]


def test_crewai_graph_engine_resumes_correctly():
    # Regression test: the driver's main loop used to append an unconditional
    # `run_{var}(context)` call for EVERY node in topological order, even
    # nodes only reachable via a condition/router's branch dispatch -- e.g.
    # the "false"/billing branch would complete successfully and then
    # immediately hit the "true"/approval branch's unconditional call, which
    # unconditionally raises WorkflowPaused regardless of which branch was
    # actually taken. Confirmed live against a real Azure OpenAI deployment
    # before the fix. The fix replaces that bespoke per-workflow control flow
    # with a fixed, shared run_graph() engine (agentforge_runtime.py) walking NODES/EDGES
    # data -- so this class of bug can't be reintroduced by a future export.
    nodes, edges = _support_supervisor()
    files = export_workflow(nodes, edges, "Support Supervisor", "crewai")
    src = files["main.py"]
    ast.parse(src)
    assert "NODES = {" in src
    assert "EDGES = [" in src
    assert "from agentforge_runtime import (" in src and "run_graph" in src
    assert "def _run_s2(context: dict) -> dict:" in src  # per-node handler still generated
    # No bespoke if/elif branch dispatch left in main.py -- that logic now
    # lives once in agentforge_runtime.py's run_graph()/_next_node_after(), not
    # regenerated per workflow.
    assert 'if context.get("branch") ==' not in src
    assert "null" not in src  # JSON `null` is a Python NameError, not None -- regression guard
    rt = files["agentforge_runtime.py"]
    assert "def run_graph(" in rt
    assert "def _next_node_after(" in rt
    assert "resume_from" in rt
    assert "class WorkflowPaused" in rt


def test_crewai_memory_warning_present_in_readme():
    nodes, edges = _wire_transfer_approval()
    files = export_workflow(nodes, edges, "Wire Transfer", "crewai")
    assert "local file storage" in files["README.md"]
    assert "SQLite-backed durable checkpointing" in files["README.md"]


def test_two_chained_http_calls_both_present():
    """#7's pattern: two independent http_request nodes must both appear,
    not get deduplicated or dropped."""
    nodes, edges = _merchant_address_api_chain()
    for framework in FRAMEWORKS:
        files = export_workflow(nodes, edges, "Merchant Verification", framework)
        assert files["main.py"].count("postman-echo.com/post") == 2


# ─── Dispatch / error handling ──────────────────────────────────────────────

def test_unknown_framework_raises():
    nodes, edges = _wire_transfer_approval()
    with pytest.raises(ValueError, match="Unknown export framework"):
        export_workflow(nodes, edges, "Test", "autogpt")


def test_empty_nodes_raises():
    with pytest.raises(ValueError, match="empty workflow"):
        export_workflow([], [], "Test", "langgraph")


def test_gitignore_and_dockerignore_present_and_correct():
    nodes, edges = _fraud_triage()
    for fw in FRAMEWORKS:
        files = export_workflow(nodes, edges, "x", fw)
        assert ".env" in files[".gitignore"]
        assert "!.env.example" in files[".gitignore"]
        assert "*.db" in files[".gitignore"]
        assert ".env" in files[".dockerignore"]
        assert "tests/" in files[".dockerignore"]


def test_runtime_settings_validates_provider_env_vars():
    nodes, edges = _fraud_triage()
    for fw in FRAMEWORKS:
        files = export_workflow(nodes, edges, "x", fw)
        rt = files["agentforge_runtime.py"]
        ast.parse(rt)
        assert "class ConfigError" in rt
        assert "pydantic_settings" in rt
        assert "def load_settings" in rt
        assert "pydantic-settings==" in files["requirements.txt"]


def test_runtime_has_retry_and_typed_exceptions():
    nodes, edges = _fraud_triage()
    for fw in FRAMEWORKS:
        files = export_workflow(nodes, edges, "x", fw)
        rt = files["agentforge_runtime.py"]
        assert "class LLMCallError" in rt
        assert "class HTTPStepError" in rt
        assert "from tenacity import" in rt
        assert "def call_http_request" in rt
        assert "tenacity==" in files["requirements.txt"]
        # call_http_request/evaluate_condition must live in agentforge_runtime.py only --
        # main.py should import them, not redefine them.
        assert "def call_http_request" not in files["main.py"]
        assert "def evaluate_condition" not in files["main.py"]
        assert "call_http_request" in files["main.py"]
        assert "evaluate_condition" in files["main.py"]


def test_http_client_error_is_not_retried_server_error_is():
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "x", "langgraph")
    rt = files["agentforge_runtime.py"]
    assert "400 <= response.status_code < 500" in rt
    assert "raise HTTPStepError" in rt


def test_http_4xx_is_not_actually_retried_at_runtime(tmp_path, monkeypatch):
    # Regression test: string-only assertions (like the test above) can't
    # catch this class of bug -- retry_if_exception_type(Exception) matches
    # HTTPStepError too (it's an Exception subclass), so the OLD code
    # retried a 4xx three times despite raising HTTPStepError specifically
    # to signal "don't retry this." Confirmed live via the generated
    # tests/test_workflow.py::test_call_http_request_does_not_retry_on_4xx,
    # which failed with call_count == 3 before this fix. This test actually
    # imports and executes the generated agentforge_runtime.py, not just greps its
    # source, so it can't be fooled by matching text with wrong behavior.
    import sys
    import httpx
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "x", "langgraph")
    runtime_path = tmp_path / "agentforge_runtime.py"
    runtime_path.write_text(files["agentforge_runtime.py"], encoding="utf-8")
    monkeypatch.syspath_prepend(str(tmp_path))
    sys.modules.pop("runtime", None)
    import agentforge_runtime as generated_runtime

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
    with pytest.raises(generated_runtime.HTTPStepError):
        generated_runtime.call_http_request("https://example.test", "GET", "", "", "")
    assert call_count["n"] == 1  # must NOT retry a 4xx
    sys.modules.pop("runtime", None)


def test_runtime_has_opentelemetry_observability():
    nodes, edges = _fraud_triage()
    for fw in FRAMEWORKS:
        files = export_workflow(nodes, edges, "x", fw)
        rt = files["agentforge_runtime.py"]
        assert "def configure_observability" in rt
        assert "configure_azure_monitor" in rt
        assert "APPLICATIONINSIGHTS_CONNECTION_STRING" in rt
        assert "def traced_step" in rt
        assert "def node_span" in rt
        assert "workflow_run_id" in rt
        assert "azure-monitor-opentelemetry==" in files["requirements.txt"]
        assert "opentelemetry-api==" in files["requirements.txt"]
        assert "@node_span(" in files["main.py"]


def test_dockerfile_is_hardened():
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "x", "langgraph")
    dockerfile = files["Dockerfile"]
    assert "FROM python:3.12.8-slim AS builder" in dockerfile
    assert "useradd" in dockerfile
    assert "USER appuser" in dockerfile
    assert "HEALTHCHECK" in dockerfile
    assert "PYTHONDONTWRITEBYTECODE" in dockerfile
    assert "PYTHONUNBUFFERED" in dockerfile


def test_runtime_has_sqlite_persistence_helpers():
    nodes, edges = _support_supervisor()
    for fw in ("ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        rt = files["agentforge_runtime.py"]
        assert "def save_pause" in rt
        assert "def load_pause" in rt
        assert "def list_pending" in rt
        assert "CHECKPOINT_DB_PATH" in rt
        assert "CREATE TABLE IF NOT EXISTS" in rt


def test_ms_agent_framework_persists_and_resumes_approval():
    nodes, edges = _support_supervisor()
    files = export_workflow(nodes, edges, "x", "ms_agent_framework")
    src = files["main.py"]
    ast.parse(src)
    assert "from agentforge_runtime import (" in src
    assert "save_pause(" in src
    assert "--resume" in src
    assert "def _resume_run" in src


def test_azure_yaml_generated_for_all_frameworks():
    nodes, edges = _fraud_triage()
    for fw in FRAMEWORKS:
        files = export_workflow(nodes, edges, "x", fw)
        yaml_src = files["azure.yaml"]
        assert "host: azure.ai.agent" in yaml_src
        assert "foundry_main.py" in yaml_src
        assert "${{connections." in yaml_src  # Foundry secret placeholder, not a literal key


def test_langgraph_foundry_wrapper_present():
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "x", "langgraph")
    fm = files["foundry_main.py"]
    ast.parse(fm)
    assert "ResponsesHostServer" in fm
    assert "from main import compiled" in fm
    assert "langchain-azure-ai" in files["requirements.txt"]


def test_langgraph_foundry_wrapper_overrides_schema_validation():
    # Regression test: confirmed live that ResponsesHostServer(compiled)
    # raises ValueError at CONSTRUCTION time (not just import time) for any
    # graph whose state schema isn't messages-based -- this export's
    # WorkflowState (input/output/context/_branch) always trips that check.
    # The class's own docstring says "subclass and override build_input",
    # but that alone doesn't help: the private _validate_graph_schema
    # staticmethod runs unconditionally in the base __init__ regardless of
    # subclassing. Both must be overridden -- confirmed live end-to-end,
    # including a real Azure OpenAI call through the resulting server.
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "x", "langgraph")
    fm = files["foundry_main.py"]
    assert "class WorkflowResponsesHost(ResponsesHostServer):" in fm
    assert "_validate_graph_schema" in fm
    assert "def build_input(self, request, context" in fm
    assert "WorkflowResponsesHost(compiled)" in fm


def test_msaf_and_crewai_foundry_wrapper_present():
    # Verified against the real installed azure-ai-agentserver-responses
    # package (VERSION 2.0.0b1) rather than guessed from the C#
    # IResponseHandler docs, which use a differently-shaped interface than
    # the Python package's decorator-based ResponsesAgentServerHost API.
    nodes, edges = _fraud_triage()
    for fw in ("ms_agent_framework", "crewai"):
        files = export_workflow(nodes, edges, "x", fw)
        fm = files["foundry_main.py"]
        ast.parse(fm)
        assert "ResponsesAgentServerHost" in fm
        assert "@app.response_handler" in fm
        assert "TextResponse" in fm
        assert "azure-ai-agentserver-responses==" in files["requirements.txt"]


def test_generated_test_suite_present_and_valid():
    nodes, edges = _support_supervisor()
    for fw in FRAMEWORKS:
        files = export_workflow(nodes, edges, "x", fw)
        key = "tests/test_workflow.py"
        assert key in files
        ast.parse(files[key])
        assert "def test_" in files[key]
        assert "monkeypatch" in files[key]
        assert "pytest==" in files["requirements-dev.txt"]


def test_crewai_generated_tests_cover_every_branch():
    nodes, edges = _support_supervisor()
    files = export_workflow(nodes, edges, "x", "crewai")
    src = files["tests/test_workflow.py"]
    # s3 (Case Router) has two outgoing edges: true->s4, false->s5.
    assert "def test_branch_s3_to_s4():" in src
    assert "def test_branch_s3_to_s5():" in src


def test_azure_is_default_provider_in_env_example():
    nodes, edges = _wire_transfer_approval()
    for framework in FRAMEWORKS:
        files = export_workflow(nodes, edges, "Test", framework)
        assert "LLM_PROVIDER=azure" in files[".env.example"]
        assert "LOCAL DEV ONLY" in files[".env.example"]  # LM Studio caveat
