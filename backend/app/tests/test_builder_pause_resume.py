from unittest.mock import AsyncMock, patch
import pytest
from app.api.builder import _run_pipeline_from, _topo_sort, PAUSED


@pytest.mark.asyncio
async def test_linear_pipeline_still_runs_all_nodes_in_order():
    """Regression check: no condition/approval nodes -> identical behavior to before."""
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "n2", "type": "agent", "data": {"label": "Classifier", "role": "classifier", "description": "classify"}},
        {"id": "n3", "type": "output", "data": {"label": "Output", "role": "output"}},
    ]
    edges = [{"source": "n1", "target": "n2"}, {"source": "n2", "target": "n3"}]
    ordered = _topo_sort(nodes, edges)
    with patch("app.api.builder.AzureOpenAIClient") as MockClient:
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="Classified as travel expense.")
        result = await _run_pipeline_from(ordered, edges, 0, "")
    assert result["status"] == "completed"
    assert len(result["logs"]) == 3
    assert result["logs"][1].output == "Classified as travel expense."


@pytest.mark.asyncio
async def test_condition_node_routes_true_branch():
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "cond", "type": "condition", "data": {"label": "Amount Check", "role": "condition", "rule": "amount < 25"}},
        {"id": "auto", "type": "output", "data": {"label": "Auto-Approved", "role": "output"}},
        {"id": "manual", "type": "output", "data": {"label": "Manual Review", "role": "output"}},
    ]
    edges = [
        {"source": "n1", "target": "cond"},
        {"source": "cond", "target": "auto", "label": "true"},
        {"source": "cond", "target": "manual", "label": "false"},
    ]
    ordered = _topo_sort(nodes, edges)
    with patch("app.api.builder.AzureOpenAIClient") as MockClient, \
         patch("app.api.builder._extract_variables", new=AsyncMock(return_value={"amount": 10})):
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="ignored")
        result = await _run_pipeline_from(ordered, edges, 0, "Expense of $10")
    visited_ids = [log.node_id for log in result["logs"]]
    assert "auto" in visited_ids
    assert "manual" not in visited_ids


@pytest.mark.asyncio
async def test_condition_node_routes_false_branch():
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "cond", "type": "condition", "data": {"label": "Amount Check", "role": "condition", "rule": "amount < 25"}},
        {"id": "auto", "type": "output", "data": {"label": "Auto-Approved", "role": "output"}},
        {"id": "manual", "type": "output", "data": {"label": "Manual Review", "role": "output"}},
    ]
    edges = [
        {"source": "n1", "target": "cond"},
        {"source": "cond", "target": "auto", "label": "true"},
        {"source": "cond", "target": "manual", "label": "false"},
    ]
    ordered = _topo_sort(nodes, edges)
    with patch("app.api.builder.AzureOpenAIClient") as MockClient, \
         patch("app.api.builder._extract_variables", new=AsyncMock(return_value={"amount": 430})):
        instance = MockClient.return_value
        instance.chat = AsyncMock(return_value="ignored")
        result = await _run_pipeline_from(ordered, edges, 0, "Expense of $430")
    visited_ids = [log.node_id for log in result["logs"]]
    assert "manual" in visited_ids
    assert "auto" not in visited_ids


@pytest.mark.asyncio
async def test_approval_node_pauses_and_does_not_run_later_nodes():
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "appr", "type": "approval", "data": {"label": "Manager Approval", "role": "approval", "approver_email": "mgr@example.com"}},
        {"id": "n3", "type": "output", "data": {"label": "Output", "role": "output"}},
    ]
    edges = [{"source": "n1", "target": "appr"}, {"source": "appr", "target": "n3"}]
    ordered = _topo_sort(nodes, edges)
    with patch("app.api.builder.send_email", return_value=True) as mock_send:
        result = await _run_pipeline_from(ordered, edges, 0, "Expense of $430")
    assert result["status"] == PAUSED
    assert result["paused_at_node_id"] == "appr"
    visited_ids = [log.node_id for log in result["logs"]]
    assert "n3" not in visited_ids
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_resume_after_approval_continues_from_correct_node():
    nodes = [
        {"id": "n1", "type": "input", "data": {"label": "Input", "role": "input"}},
        {"id": "appr", "type": "approval", "data": {"label": "Manager Approval", "role": "approval", "approver_email": "mgr@example.com"}},
        {"id": "n3", "type": "output", "data": {"label": "Output", "role": "output"}},
    ]
    edges = [{"source": "n1", "target": "appr"}, {"source": "appr", "target": "n3"}]
    ordered = _topo_sort(nodes, edges)
    appr_index = next(i for i, n in enumerate(ordered) if n["id"] == "appr")
    result = await _run_pipeline_from(ordered, edges, appr_index + 1, "Expense of $430")
    assert result["status"] == "completed"
    assert len(result["logs"]) == 1
    assert result["logs"][0].node_id == "n3"
