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
    assert set(files.keys()) == {"main.py", "requirements.txt", ".env.example", "Dockerfile", "README.md"}
    assert files["requirements.txt"].strip()
    assert "FROM python" in files["Dockerfile"]
    assert "LLM_PROVIDER" in files[".env.example"]


# ─── Per-framework: real SDK constructs actually appear ────────────────────

def test_langgraph_uses_real_stategraph():
    nodes, edges = _fraud_triage()
    files = export_workflow(nodes, edges, "Fraud Triage", "langgraph")
    src = files["main.py"]
    assert "from langgraph.graph import StateGraph" in src
    assert "StateGraph(WorkflowState)" in src
    assert "add_conditional_edges(" in src  # router node present
    assert "interrupt(" in src  # approval node present
    assert "MemorySaver" in src  # required for interrupt() to function at all
    assert "langgraph==" in files["requirements.txt"]


def test_langgraph_no_checkpointer_without_approval():
    """Stateless-by-default: only add the MemorySaver when an approval node
    actually needs interrupt() to work -- never persist by default otherwise."""
    nodes, edges = _travel_expense_multi_agent()
    files = export_workflow(nodes, edges, "Travel Expense", "langgraph")
    assert "MemorySaver" not in files["main.py"]
    assert "compiled = graph.compile()" in files["main.py"]


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


def test_crewai_memory_warning_present_in_readme():
    nodes, edges = _wire_transfer_approval()
    files = export_workflow(nodes, edges, "Wire Transfer", "crewai")
    assert "local file storage" in files["README.md"]
    assert "does not survive in a containerized deployment" in files["README.md"]


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


def test_azure_is_default_provider_in_env_example():
    nodes, edges = _wire_transfer_approval()
    for framework in FRAMEWORKS:
        files = export_workflow(nodes, edges, "Test", framework)
        assert "LLM_PROVIDER=azure" in files[".env.example"]
        assert "LOCAL DEV ONLY" in files[".env.example"]  # LM Studio caveat
