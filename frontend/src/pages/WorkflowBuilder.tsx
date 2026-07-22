import { useState, useCallback, useRef, useEffect } from "react";
import axios from "axios";
import AgentCanvas from "../components/canvas/AgentCanvas";
import AgentConfigPanel from "../components/agents/AgentConfigPanel";
import type { Node, Edge } from "@xyflow/react";
import type { NodeUpdateData } from "../components/canvas/AgentCanvas";
import { WORKFLOW_TEMPLATES, TEMPLATE_CATEGORIES } from "../data/workflowTemplates";
import type { WorkflowTemplate } from "../data/workflowTemplates";

type SavedWorkflow = {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  created_at: string | null;
  updated_at: string | null;
};

const API_BASE = "http://localhost:8000/api";

const ROLE_ICONS: Record<string, string> = {
  input: "⬇️",
  output: "⬆️",
  classifier: "🏷️",
  router: "🔀",
  responder: "💬",
  guard: "🛡️",
  rag: "📚",
  agent: "🤖",
  condition: "❓",
  approval: "✉️",
  http_request: "🌐",
};

interface RunLog {
  node_id: string;
  node_label: string;
  status: "running" | "done" | "error";
  output: string;
  duration_ms: number;
}

export default function WorkflowBuilder() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<{
    label?: string; role?: string; description?: string; rule?: string; approver_email?: string;
    url?: string; method?: string; headers?: string; body?: string;
  } | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [loadedNodes, setLoadedNodes] = useState<Node[] | undefined>(undefined);
  const [loadedEdges, setLoadedEdges] = useState<Edge[] | undefined>(undefined);
  const workflowRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const ideaRequestIdRef = useRef(0);
  // True once the user has typed into the Run modal's textarea themselves --
  // guards against the auto-fill suggestion arriving late and clobbering
  // whatever they've already started typing.
  const userEditedRunInputRef = useRef(false);
  const nodeUpdaterRef = useRef<((nodeId: string, data: NodeUpdateData) => void) | null>(null);
  const edgeUpdaterRef = useRef<((source: string, target: string, data: import("../components/canvas/AgentCanvas").EdgeUpdateData) => void) | null>(null);

  // Deploy state
  const [deploying, setDeploying] = useState(false);
  const [runLogs, setRunLogs] = useState<RunLog[] | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  // Run with Input modal state
  const [showRunModal, setShowRunModal] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [lastLoadedTemplate, setLastLoadedTemplate] = useState<WorkflowTemplate | null>(null);
  const [running, setRunning] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const suggestAbortRef = useRef<AbortController | null>(null);

  // Resizable left panel
  const [panelWidth, setPanelWidth] = useState(288);
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    let startWidth = 0;
    setPanelWidth((w) => { startWidth = w; return w; });
    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setPanelWidth(Math.min(520, Math.max(200, startWidth + delta)));
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  // Templates panel state
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateCategory, setTemplateCategory] = useState("All");
  const [templateSearch, setTemplateSearch] = useState("");

  const [showLoadPicker, setShowLoadPicker] = useState(false);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [loadSearch, setLoadSearch] = useState("");
  const [loadPickerError, setLoadPickerError] = useState<string | null>(null);

  // Auto-Build panel state
  const [showAutoBuild, setShowAutoBuild] = useState(false);
  const [abDescription, setAbDescription] = useState("");
  const [abName, setAbName] = useState("");
  const [abLoading, setAbLoading] = useState(false);
  interface IdeaSuggestion { title: string; description: string }
  const [ideaSuggestions, setIdeaSuggestions] = useState<IdeaSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  // If we arrived with ?workflowId=..., load that saved workflow into the canvas
  // (e.g. coming back from the approval page for a specific run's workflow).
  useEffect(() => {
    const workflowId = new URLSearchParams(window.location.search).get("workflowId");
    if (!workflowId) return;
    axios
      .get(`${API_BASE}/builder/workflows/${workflowId}`)
      .then((res) => {
        const data = res.data as { nodes: Node[]; edges: Edge[] };
        // Older saved workflows predate the roleNode renderer and were stored
        // with no type, or the old built-in "input"/"output" types — normalize
        // all of them to roleNode so icons/colors render consistently.
        const nodes = data.nodes.map((n) => (n.type === "roleNode" ? n : { ...n, type: "roleNode" }));
        setLoadedNodes(nodes);
        setLoadedEdges(data.edges);
        setCanvasKey((k) => k + 1);
        setLastLoadedTemplate(null);
        showToast("Loaded workflow from approval link.");
      })
      .catch(() => showToast("Could not load that workflow."));
  }, []);

  const handleWorkflowChange = useCallback((nodes: Node[], edges: Edge[]) => {
    workflowRef.current = { nodes, edges };
  }, []);

  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNode(nodeId);
    const node = workflowRef.current?.nodes.find((n) => n.id === nodeId);
    if (node) {
      const nodeData = node.data as Record<string, unknown>;
      setSelectedNodeData({
        label: String(node.data?.label ?? ""),
        role: String(nodeData?.role ?? "agent"),
        description: String(nodeData?.description ?? ""),
        rule: nodeData?.rule ? String(nodeData.rule) : undefined,
        approver_email: nodeData?.approver_email ? String(nodeData.approver_email) : undefined,
        url: nodeData?.url ? String(nodeData.url) : undefined,
        method: nodeData?.method ? String(nodeData.method) : undefined,
        headers: nodeData?.headers ? String(nodeData.headers) : undefined,
        body: nodeData?.body ? String(nodeData.body) : undefined,
      });
    }
  }, []);

  const handleNodeUpdate = useCallback((nodeId: string, data: NodeUpdateData) => {
    if (nodeUpdaterRef.current) {
      nodeUpdaterRef.current(nodeId, data);
    }
  }, []);

  const handleDeploy = async () => {
    if (!workflowRef.current || deploying) return;
    setDeploying(true);
    setRunLogs(null);
    const token = localStorage.getItem("token") || localStorage.getItem("agentforge_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const saveRes = await fetch(`${API_BASE}/builder/workflows`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Workflow " + new Date().toLocaleTimeString(),
          nodes: workflowRef.current.nodes,
          edges: workflowRef.current.edges,
        }),
      });
      if (!saveRes.ok) throw new Error("Failed to save workflow");
      const { workflow_id } = await saveRes.json() as { workflow_id: string };
      const deployRes = await fetch(`${API_BASE}/builder/workflows/${workflow_id}/deploy`, {
        method: "POST",
        headers,
      });
      if (!deployRes.ok) throw new Error("Deploy failed");
      const deployData = await deployRes.json() as { logs: RunLog[]; status?: string };
      const logs = deployData.logs;
      setRunLogs(logs);
      if (deployData.status === "waiting_approval") {
        showToast("⏸ Paused — waiting for email approval");
      }
      setWebhookUrl(`http://localhost:8000/api/builder/workflows/${workflow_id}/trigger`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const fetchSuggestedInput = useCallback(async () => {
    if (!workflowRef.current || lastLoadedTemplate || autoFillLoading) return;
    setAutoFillLoading(true);
    const controller = new AbortController();
    suggestAbortRef.current = controller;
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("agentforge_token");
      const res = await axios.post(
        `${API_BASE}/builder/suggest-input`,
        { nodes: workflowRef.current.nodes },
        { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
      );
      const suggested = (res.data as { suggested_input: string }).suggested_input;
      if (suggested && !userEditedRunInputRef.current) setRunInput(suggested);
    } catch {
      // leave textarea as-is; user can still type their own input, or the
      // request was aborted because the user hit Execute early -- either way,
      // no need to surface an error.
    } finally {
      setAutoFillLoading(false);
    }
  }, [lastLoadedTemplate, autoFillLoading]);

  const handleRunWithInput = async () => {
    if (!workflowRef.current || running) return;
    // The AI-suggested-input call may still be in flight (same LM Studio /
    // Azure model). Running both concurrently competes for the same
    // single-threaded local-model inference slot, so cancel it before
    // starting the real execution.
    suggestAbortRef.current?.abort();
    setAutoFillLoading(false);
    setRunning(true);
    setRunLogs(null);
    const token = localStorage.getItem("token") || localStorage.getItem("agentforge_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      // Save workflow first
      const saveRes = await fetch(`${API_BASE}/builder/workflows`, {
        method: "POST", headers,
        body: JSON.stringify({
          name: "Workflow " + new Date().toLocaleTimeString(),
          nodes: workflowRef.current.nodes,
          edges: workflowRef.current.edges,
        }),
      });
      if (!saveRes.ok) throw new Error("Failed to save workflow");
      const { workflow_id } = await saveRes.json() as { workflow_id: string };

      // Reset all nodes to idle before starting
      workflowRef.current.nodes.forEach((n) => {
        nodeUpdaterRef.current?.(n.id, { executionState: "idle" });
      });

      setWebhookUrl(`http://localhost:8000/api/builder/workflows/${workflow_id}/trigger`);
      setShowRunModal(false);

      // Start SSE stream
      const streamRes = await fetch(`${API_BASE}/builder/workflows/${workflow_id}/trigger-stream`, {
        method: "POST", headers,
        body: JSON.stringify({ input: runInput }),
      });
      if (!streamRes.ok) throw new Error("Stream failed");

      const reader = streamRes.body!.getReader();
      const decoder = new TextDecoder();
      const collectedLogs: RunLog[] = [];

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as Record<string, unknown>;

            if (evt.event === "node_start") {
              nodeUpdaterRef.current?.(evt.node_id as string, { executionState: "running" });
            } else if (evt.event === "node_done") {
              nodeUpdaterRef.current?.(evt.node_id as string, { executionState: "done" });
              collectedLogs.push({
                node_id: evt.node_id as string,
                node_label: evt.node_label as string,
                status: "done",
                output: evt.output as string,
                duration_ms: evt.duration_ms as number,
              });
            } else if (evt.event === "node_error") {
              nodeUpdaterRef.current?.(evt.node_id as string, { executionState: "error" });
              collectedLogs.push({
                node_id: evt.node_id as string,
                node_label: evt.node_label as string,
                status: "error",
                output: evt.error as string,
                duration_ms: 0,
              });
            } else if (evt.event === "edge_activate") {
              const edgeList = evt.edges as Array<{ source: string; target: string }>;
              edgeList.forEach((e) => edgeUpdaterRef.current?.(e.source, e.target, { active: true }));
            } else if (evt.event === "pipeline_paused") {
              setRunLogs(collectedLogs);
              showToast(`⏸ Paused — waiting for email approval (node: ${evt.node_label as string})`);
            } else if (evt.event === "pipeline_done") {
              setRunLogs(collectedLogs);
              showToast(`✅ Run complete — ${collectedLogs.length} nodes executed`);
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const handleNodeDelete = useCallback((nodeId: string) => {
    setSelectedNode((prev) => (prev === nodeId ? null : prev));
  }, []);

  const handleExportCode = () => {
    if (!workflowRef.current) return;
    const { nodes, edges } = workflowRef.current;
    const workflowName = "AgentForge Workflow";
    const date = new Date().toISOString();
    const py = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const safe = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, "_");

    const nodeList = nodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      return `#   - ${String(d.label ?? n.id)} (id: ${n.id}, role: ${String(d.role ?? "agent")})`;
    }).join("\n");

    // NODES/EDGES are exported as plain data so the engine below can walk the
    // exact same graph shape the visual canvas ran, instead of guessing at
    // control flow — this keeps branching/approval semantics faithful to the
    // live pipeline (see backend/app/api/builder.py::_run_pipeline_from).
    const nodesDict = nodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      const rule = d.rule ? `"${py(String(d.rule))}"` : "None";
      const approverEmail = d.approver_email ? `"${py(String(d.approver_email))}"` : "None";
      const url = d.url ? `"${py(String(d.url))}"` : "None";
      const method = d.method ? `"${py(String(d.method))}"` : "None";
      const headers = d.headers ? `"${py(String(d.headers))}"` : "None";
      const body = d.body ? `"${py(String(d.body))}"` : "None";
      return `    "${n.id}": {"label": "${py(String(d.label ?? n.id))}", "role": "${py(String(d.role ?? "agent"))}", "rule": ${rule}, "approver_email": ${approverEmail}, "url": ${url}, "method": ${method}, "headers": ${headers}, "body": ${body}},`;
    }).join("\n");

    const edgesList = edges.map((e) => {
      const label = e.label ? `"${py(String(e.label))}"` : "None";
      return `    {"source": "${e.source}", "target": "${e.target}", "label": ${label}},`;
    }).join("\n");

    // Only agent/input/output/etc. nodes get a real function body to implement;
    // condition/approval/http_request nodes are structural and handled by the engine itself.
    const STRUCTURAL_ROLES = ["condition", "approval", "http_request"];
    const workNodes = nodes.filter((n) => {
      const role = String((n.data as Record<string, unknown>).role ?? "agent");
      return !STRUCTURAL_ROLES.includes(role);
    });

    const systemPrompts = workNodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      const label = String(d.label ?? n.id);
      const role = String(d.role ?? "agent");
      const description = String(d.description ?? "");
      const prompt = `You are the "${label}" step (role: ${role}) in a workflow.${description ? ` ${description}` : ""} Process the input you're given and return your response as plain text.`;
      return `    "${n.id}": "${py(prompt)}",`;
    }).join("\n");

    const nodeFunctions = workNodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      const label = String(d.label ?? n.id);
      const role = String(d.role ?? "agent");
      const description = String(d.description ?? "");
      return `async def node_${safe(n.id)}(input: str) -> str:\n    """${label} (role: ${role}). ${description}"""\n    return await call_llm(SYSTEM_PROMPTS["${n.id}"], input)`;
    }).join("\n\n");

    const nodeFuncMap = workNodes.map((n) => `    "${n.id}": node_${safe(n.id)},`).join("\n");

    const code = `"""
Auto-generated AgentForge workflow: ${workflowName}
Generated: ${date}

This mirrors the same graph the Visual Builder ran: NODES/EDGES describe the
exact shape (including condition rules and approval gates), and run_pipeline()
below walks them the same way backend/app/api/builder.py::_run_pipeline_from
does — evaluating condition rules to pick a branch, and pausing at approval
nodes instead of running every node unconditionally.

Requires: pip install simpleeval httpx
Optional (for real LLM calls instead of pass-through stubs): pip install openai
                                                              set OPENAI_API_KEY=sk-...

Run it with:
    python workflow.py "your test input text here"                 # stub nodes (free, offline)
    python workflow.py "your test input text here" --openai        # real LLM calls (needs OPENAI_API_KEY)
(falls back to a generic sample input if you don't pass any text)
"""
import asyncio
import re
import sys
import httpx
from simpleeval import simple_eval

USE_OPENAI = "--openai" in sys.argv
_openai_client = None
if USE_OPENAI:
    from openai import AsyncOpenAI
    _openai_client = AsyncOpenAI()  # reads OPENAI_API_KEY from the environment


async def call_llm(system_prompt: str, input: str) -> str:
    """Runs a node's step through a real LLM when --openai is passed and
    OPENAI_API_KEY is set; otherwise returns the input unchanged (free,
    offline stub — same default behavior as before this flag existed)."""
    if not USE_OPENAI or _openai_client is None:
        return input
    response = await _openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": input},
        ],
        temperature=0.3,
    )
    return response.choices[0].message.content or input


# Workflow nodes:
${nodeList}

NODES = {
${nodesDict}
}

SYSTEM_PROMPTS = {
${systemPrompts}
}

# Canvas creation order — only used as a cycle-fallback / tiebreaker; actual
# execution order comes from _topo_sort(), same as the live engine.
CANVAS_ORDER = [${nodes.map((n) => `"${n.id}"`).join(", ")}]

EDGES = [
${edgesList}
]


def _topo_sort() -> list:
    """Kahn's-algorithm topological sort, ported from
    backend/app/api/builder.py::_topo_sort so branch/dependency order matches
    the live engine exactly (falls back to canvas order on a cycle)."""
    adj: dict = {node_id: [] for node_id in NODES}
    in_degree: dict = {node_id: 0 for node_id in NODES}
    for e in EDGES:
        src, tgt = e["source"], e["target"]
        if src in adj and tgt in in_degree:
            adj[src].append(tgt)
            in_degree[tgt] += 1

    queue = [node_id for node_id in CANVAS_ORDER if in_degree[node_id] == 0]
    result = []
    while queue:
        node_id = queue.pop(0)
        result.append(node_id)
        for neighbor in adj[node_id]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    visited = set(result)
    for node_id in CANVAS_ORDER:
        if node_id not in visited:
            result.append(node_id)
    return result


class PipelinePaused(Exception):
    """Raised when execution reaches an approval node awaiting a human decision."""
    def __init__(self, node_id: str, context: str):
        self.node_id = node_id
        self.context = context
        super().__init__(f"Paused at '{node_id}' — waiting for approval")


def extract_variables(text: str) -> dict:
    """Naive 'key: value' extractor used to evaluate condition rules below.
    TODO: replace with a real LLM-based extraction call for production use —
    this regex fallback only understands simple 'label: value' patterns
    (e.g. 'days: 5'), same test inputs used against the live pipeline."""
    variables: dict = {}
    pattern = r"([A-Za-z_][A-Za-z0-9_ ]{0,20}?):\\s*(.+?)(?=(?:\\s+[A-Za-z_][A-Za-z0-9_ ]{0,20}?:)|$)"
    for match in re.finditer(pattern, text):
        key = match.group(1).strip().replace(" ", "_")
        value = match.group(2).strip().rstrip(".")
        try:
            variables[key] = int(value)
        except ValueError:
            try:
                variables[key] = float(value)
            except ValueError:
                variables[key] = value
    return variables


def evaluate_condition(rule: str, variables: dict) -> bool:
    """Safely evaluate a condition rule — never uses eval(), fails closed."""
    try:
        return bool(simple_eval(rule, names=variables))
    except Exception:
        return False


def _reachable_from(start_id: str) -> set:
    seen = {start_id}
    queue = [start_id]
    while queue:
        current = queue.pop(0)
        for e in EDGES:
            if e["source"] == current and e["target"] not in seen:
                seen.add(e["target"])
                queue.append(e["target"])
    return seen


async def _call_http_request(node: dict, previous_output: str) -> str:
    """Executes an http_request node's outbound API call, ported from
    backend/app/api/builder.py::_call_http_request. Use the literal text
    "{{input}}" in the URL or body to insert the previous node's output."""
    url = (node.get("url") or "").replace("{{input}}", previous_output or "")
    if not url:
        raise ValueError("http_request node has no URL configured")
    method = (node.get("method") or "GET").upper()
    headers_raw = node.get("headers") or ""
    body_raw = (node.get("body") or "").replace("{{input}}", previous_output or "")

    import json as _json
    headers = _json.loads(headers_raw) if headers_raw else None
    json_body, data_body = None, None
    if body_raw:
        try:
            json_body = _json.loads(body_raw)
        except _json.JSONDecodeError:
            data_body = body_raw

    async with httpx.AsyncClient(timeout=15.0) as http_client:
        response = await http_client.request(method, url, headers=headers, json=json_body, content=data_body)
    response.raise_for_status()
    return response.text[:4000]


${nodeFunctions}

NODE_FUNCS = {
${nodeFuncMap}
}


async def run_pipeline(user_input: str) -> str:
    """Execute the ${workflowName} pipeline, following the same branching/
    approval-pause rules as the live Visual Builder run."""
    output = user_input
    excluded: set = set()
    order = _topo_sort()
    i = 0
    while i < len(order):
        node_id = order[i]
        i += 1
        if node_id in excluded:
            continue
        node = NODES[node_id]
        role = node["role"]

        if role == "condition":
            variables = extract_variables(output)
            result = evaluate_condition(node["rule"], variables)
            branch_label = "true" if result else "false"
            chosen_edge = next((e for e in EDGES if e["source"] == node_id and e["label"] == branch_label), None)
            if chosen_edge is None:
                break  # no matching branch edge -- stop here, same as the live engine
            other_label = "false" if branch_label == "true" else "true"
            other_edge = next((e for e in EDGES if e["source"] == node_id and e["label"] == other_label), None)
            if other_edge is not None:
                chosen_reachable = _reachable_from(chosen_edge["target"])
                other_reachable = _reachable_from(other_edge["target"]) - chosen_reachable
                excluded |= other_reachable
            continue

        if role == "approval":
            raise PipelinePaused(node_id, output)
            # In production: send an approval email/Slack message here, persist
            # the pause point, and resume run_pipeline from the node *after*
            # this one once a human approves (mirrors approve_run in builder.py).

        if role == "http_request":
            output = await _call_http_request(node, output)
            continue

        node_fn = NODE_FUNCS.get(node_id)
        if node_fn is not None:
            output = await node_fn(output)

    return output


if __name__ == "__main__":
    text_args = [a for a in sys.argv[1:] if a != "--openai"]
    test_input = text_args[0] if text_args else "Hello, I need help"
    try:
        result = asyncio.run(run_pipeline(test_input))
        print(result)
    except PipelinePaused as p:
        print(f"Paused at node '{p.node_id}' — awaiting approval. Context: {p.context}")
`;

    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "workflow.py";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Python code exported!");
  };

  const handleSave = () => {
    if (!workflowRef.current) return;
    const payload = JSON.stringify(workflowRef.current);
    localStorage.setItem("af_workflow_current", payload);
    showToast("Saved!");
  };

  const handleLoad = async () => {
    setShowLoadPicker(true);
    setLoadPickerError(null);
    try {
      const res = await fetch(`${API_BASE}/builder/workflows`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as SavedWorkflow[];
      setSavedWorkflows(data);
    } catch {
      setLoadPickerError("Failed to load saved workflows. Is the backend running?");
    }
  };

  // Download the canvas graph as a portable .json file — this (unlike
  // Export Code's Python scaffold) is the actual round-trippable format,
  // importable back via handleImportJson below.
  const handleExportJson = () => {
    if (!workflowRef.current) return;
    const { nodes, edges } = workflowRef.current;
    const payload = JSON.stringify({ nodes, edges }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "workflow.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Workflow JSON exported!");
  };

  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportJsonClick = () => importFileInputRef.current?.click();

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { nodes, edges } = JSON.parse(String(reader.result)) as { nodes: Node[]; edges: Edge[] };
        if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new Error("invalid shape");
        setLoadedNodes(nodes);
        setLoadedEdges(edges);
        setCanvasKey((k) => k + 1);
        setLastLoadedTemplate(null);
        showToast(`Imported "${file.name}"!`);
      } catch {
        showToast("Could not import — not a valid workflow JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const handleAutoBuild = async () => {
    if (!abDescription.trim()) {
      showToast("Please enter a pipeline description.");
      return;
    }
    setAbLoading(true);
    try {
      const token =
        localStorage.getItem("token") || localStorage.getItem("agentforge_token");
      const res = await axios.post(
        `${API_BASE}/builder/auto-build`,
        { description: abDescription, name: abName || "My Workflow" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { nodes, edges } = res.data as { nodes: Node[]; edges: Edge[] };
      setLoadedNodes(nodes);
      setLoadedEdges(edges);
      setCanvasKey((k) => k + 1);
      setLastLoadedTemplate(null);
      setShowAutoBuild(false);
      setAbDescription("");
      setAbName("");
      showToast("Workflow generated!");
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err)
          ? err.response?.data?.detail || err.message
          : "Generation failed";
      showToast(`Error: ${msg}`);
    } finally {
      setAbLoading(false);
    }
  };

  useEffect(() => {
    if (!showAutoBuild || abName.trim().length < 3) {
      setIdeaSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const requestId = ++ideaRequestIdRef.current;
      setSuggestLoading(true);
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("agentforge_token");
        const res = await axios.post(
          `${API_BASE}/builder/suggest-ideas`,
          { partial_name: abName },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (requestId === ideaRequestIdRef.current) {
          setIdeaSuggestions((res.data as { ideas: IdeaSuggestion[] }).ideas ?? []);
        }
      } catch {
        if (requestId === ideaRequestIdRef.current) setIdeaSuggestions([]);
      } finally {
        if (requestId === ideaRequestIdRef.current) setSuggestLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [abName, showAutoBuild]);

  const handleSelectSavedWorkflow = (wf: SavedWorkflow) => {
    setLoadedNodes(wf.nodes);
    setLoadedEdges(wf.edges);
    setCanvasKey((k) => k + 1);
    setShowLoadPicker(false);
    setSelectedNode(null);
    setSelectedNodeData(undefined);
    setRunLogs(null);
    setWebhookUrl(null);
    showToast(`Loaded: ${wf.name}`);
  };

  const handleLoadTemplate = (tpl: WorkflowTemplate) => {
    setLoadedNodes(tpl.nodes);
    setLoadedEdges(tpl.edges);
    setCanvasKey((k) => k + 1);
    setShowTemplates(false);
    setLastLoadedTemplate(tpl);
    // Close any open panels so the fresh canvas isn't obscured
    setSelectedNode(null);
    setSelectedNodeData(undefined);
    setRunLogs(null);
    setWebhookUrl(null);
    showToast(`Loaded: ${tpl.name}`);
  };

  const filteredTemplates = WORKFLOW_TEMPLATES.filter((t) => {
    const matchCat = templateCategory === "All" || t.category === templateCategory;
    const q = templateSearch.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q));
    return matchCat && matchSearch;
  });

  const filteredSavedWorkflows = savedWorkflows.filter((wf) => {
    const q = loadSearch.toLowerCase();
    return !q || wf.name.toLowerCase().includes(q);
  });

  function timeAgo(iso: string | null): string {
    if (!iso) return "unknown";
    const diffMs = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(diffMs)) return "unknown";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div className="flex h-full bg-gray-950 flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 z-10 overflow-x-auto flex-shrink-0">
        <span className="text-white font-semibold text-sm flex-shrink-0 mr-2 whitespace-nowrap">Workflow Builder</span>
        <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => { handleLoad(); setShowTemplates(false); setShowAutoBuild(false); }}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow whitespace-nowrap"
        >
          Load
        </button>
        <button
          onClick={handleSave}
          className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow"
        >
          Save Workflow
        </button>
        <button
          onClick={() => { setShowTemplates((v) => !v); setShowAutoBuild(false); }}
          className="bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow flex items-center gap-1"
        >
          📋 Templates
        </button>
        <button
          onClick={() => { setShowAutoBuild((v) => !v); setShowTemplates(false); }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow flex items-center gap-1"
        >
          ✨ Auto-Build
        </button>
        <button
          onClick={handleExportCode}
          className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow"
        >
          Export Code
        </button>
        <button
          onClick={handleExportJson}
          title="Download this canvas graph as workflow.json — the round-trippable format, unlike Export Code"
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow whitespace-nowrap"
        >
          Export JSON
        </button>
        <button
          onClick={handleImportJsonClick}
          title="Browse for a workflow.json file and load it into the canvas"
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow whitespace-nowrap"
        >
          📂 Import JSON
        </button>
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportJsonFile}
          className="hidden"
        />
        <button
          onClick={() => { userEditedRunInputRef.current = false; setShowRunModal(true); setRunInput(lastLoadedTemplate?.sampleInput ?? ""); void fetchSuggestedInput(); }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow flex items-center gap-1.5"
        >
          ▶ Run
        </button>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow flex items-center gap-1.5"
        >
          {deploying ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Deploying...
            </>
          ) : (
            "🚀 Deploy"
          )}
        </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute top-14 right-4 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg border border-gray-700 transition-opacity">
          {toast}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">

        {/* Run Log slide-in panel (left) */}
        {runLogs && (
          <div
            className="bg-gray-900 border-r border-gray-800 flex flex-col h-full z-20 flex-shrink-0 relative"
            style={{ width: panelWidth }}
          >
            {/* Resize handle */}
            <div
              onMouseDown={startResize}
              className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-30 hover:bg-violet-500 transition-colors group"
              title="Drag to resize"
            >
              <div className="absolute inset-y-0 right-0 w-px bg-gray-700 group-hover:bg-violet-500" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-white font-semibold text-sm">Pipeline Run</span>
              <button
                onClick={() => { setRunLogs(null); setWebhookUrl(null); }}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
              >
                Close
              </button>
            </div>
            {webhookUrl && (
              <div className="px-3 py-2 border-b border-gray-800 bg-gray-950">
                <p className="text-gray-400 text-xs mb-1">Webhook URL</p>
                <div className="flex items-center gap-1">
                  <code className="flex-1 text-green-400 text-xs bg-gray-800 px-2 py-1 rounded truncate">{webhookUrl}</code>
                  <button
                    onClick={() => { void navigator.clipboard.writeText(webhookUrl); showToast("Copied!"); }}
                    className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 flex-shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {runLogs.map((log) => {
                const roleKey = log.node_label?.toLowerCase?.() ?? "";
                const icon = ROLE_ICONS[roleKey] ?? "🤖";
                const isExpanded = expandedLog === log.node_id;
                const statusColor =
                  log.status === "done"
                    ? "bg-green-800 text-green-300"
                    : log.status === "error"
                    ? "bg-red-800 text-red-300"
                    : "bg-yellow-800 text-yellow-300";
                return (
                  <div key={log.node_id} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{icon}</span>
                      <span className="text-white text-xs font-medium flex-1 truncate">{log.node_label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColor}`}>
                        {log.status === "running" ? (
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-2 h-2 border border-yellow-300 border-t-transparent rounded-full animate-spin" />
                            Running
                          </span>
                        ) : log.status}
                      </span>
                    </div>
                    {log.duration_ms > 0 && (
                      <span className="text-gray-500 text-xs">{log.duration_ms}ms</span>
                    )}
                    <button
                      onClick={() => setExpandedLog(isExpanded ? null : log.node_id)}
                      className="mt-1 text-violet-400 hover:text-violet-300 text-xs"
                    >
                      {isExpanded ? "Hide output" : "Show output"}
                    </button>
                    {isExpanded && (
                      <p className="mt-1 text-gray-300 text-xs leading-relaxed whitespace-pre-wrap border-t border-gray-700 pt-2">
                        {log.output}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 relative">
          <AgentCanvas
            key={canvasKey}
            onNodeSelect={handleNodeSelect}
            onWorkflowChange={handleWorkflowChange}
            nodeUpdaterRef={nodeUpdaterRef}
            edgeUpdaterRef={edgeUpdaterRef}
            initialNodes={loadedNodes}
            initialEdges={loadedEdges}
            onNodeDelete={handleNodeDelete}
          />
        </div>

        {/* Templates slide-in panel */}
        {showTemplates && (
          <div className="absolute top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-700 shadow-2xl z-20 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <div>
                <span className="text-white font-semibold text-sm">Workflow Templates</span>
                <p className="text-gray-400 text-xs mt-0.5">Select a template to load it into the canvas</p>
              </div>
              <button
                onClick={() => setShowTemplates(false)}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Search */}
            <div className="px-3 pt-3 pb-2 flex-shrink-0">
              <input
                type="text"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full bg-gray-800 text-white text-sm border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-500"
              />
            </div>

            {/* Category pills */}
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap flex-shrink-0">
              {TEMPLATE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setTemplateCategory(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    templateCategory === cat
                      ? "bg-violet-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Template cards */}
            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
              {filteredTemplates.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No templates found.</p>
              ) : (
                filteredTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-violet-600 rounded-xl p-3 cursor-pointer transition-all group"
                    onClick={() => handleLoadTemplate(tpl)}
                  >
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className="text-xl flex-shrink-0">{tpl.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold leading-tight">{tpl.name}</p>
                        <p className="text-violet-400 text-xs mt-0.5">{tpl.category}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-gray-500 text-xs">{tpl.nodes.length} nodes</span>
                      </div>
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed mb-2">{tpl.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {tpl.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-violet-400 text-xs font-medium">Click to load →</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {showLoadPicker && (
          <div className="absolute top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-700 shadow-2xl z-20 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <div>
                <span className="text-white font-semibold text-sm">Saved Workflows</span>
                <p className="text-gray-400 text-xs mt-0.5">Select a workflow to load it into the canvas</p>
              </div>
              <button
                onClick={() => setShowLoadPicker(false)}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="px-3 pt-3 pb-2 flex-shrink-0">
              <input
                type="text"
                value={loadSearch}
                onChange={(e) => setLoadSearch(e.target.value)}
                placeholder="Search saved workflows..."
                className="w-full bg-gray-800 text-white text-sm border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
              {loadPickerError ? (
                <p className="text-red-400 text-sm text-center py-8">{loadPickerError}</p>
              ) : filteredSavedWorkflows.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  {savedWorkflows.length === 0 ? "No saved workflows yet." : "No workflows match your search."}
                </p>
              ) : (
                filteredSavedWorkflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-violet-600 rounded-xl p-3 cursor-pointer transition-all group"
                    onClick={() => handleSelectSavedWorkflow(wf)}
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold leading-tight truncate">{wf.name}</p>
                      </div>
                      <span className="text-gray-500 text-xs flex-shrink-0">{wf.nodes.length} nodes</span>
                    </div>
                    <p className="text-gray-500 text-xs">Updated {timeAgo(wf.updated_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Auto-Build slide-in panel */}
        {showAutoBuild && (
          <div className="absolute top-0 right-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl z-20 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <span className="text-white font-semibold text-sm">Auto-Build Workflow</span>
              <button
                onClick={() => { setShowAutoBuild(false); setIdeaSuggestions([]); }}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 font-medium">Workflow Name</label>
                <input
                  type="text"
                  value={abName}
                  onChange={(e) => setAbName(e.target.value)}
                  placeholder="e.g. Customer Support Bot"
                  className="bg-gray-800 text-white text-sm border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>
              {suggestLoading && (
                <p className="text-xs text-gray-500">Thinking of ideas…</p>
              )}
              {ideaSuggestions.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 font-medium">Suggested ideas</label>
                  {ideaSuggestions.map((idea, i) => (
                    <button
                      key={i}
                      onClick={() => setAbDescription(idea.description)}
                      className="text-left bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-500 rounded-lg p-2 transition-colors"
                    >
                      <p className="text-white text-xs font-semibold">{idea.title}</p>
                      <p className="text-gray-400 text-xs mt-0.5 leading-snug">{idea.description}</p>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 font-medium">Describe your pipeline</label>
                <textarea
                  rows={5}
                  value={abDescription}
                  onChange={(e) => setAbDescription(e.target.value)}
                  placeholder="e.g. A customer support pipeline that classifies incoming queries, routes to the right responder, checks for policy violations, and sends a formatted reply."
                  className="bg-gray-800 text-white text-sm border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              <button
                onClick={handleAutoBuild}
                disabled={abLoading}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {abLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  "Generate Workflow"
                )}
              </button>
              <p className="text-xs text-gray-500 text-center">
                Powered by GPT-4o · Uses 3–6 role-typed nodes
              </p>
            </div>
          </div>
        )}

        {selectedNode && (
          <AgentConfigPanel
            key={selectedNode}
            nodeId={selectedNode}
            nodeData={selectedNodeData}
            onUpdate={handleNodeUpdate}
            onSave={() => setSelectedNode(null)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Run with Input Modal */}
      {showRunModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold text-base">▶ Run Workflow</h2>
              <button onClick={() => setShowRunModal(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <p className="text-gray-400 text-sm">Enter a real-world input to trigger this workflow. The execution trace will be saved to Observability.</p>
            {lastLoadedTemplate && (
              <div className="flex items-start gap-2 bg-emerald-950/50 border border-emerald-800/60 rounded-lg px-3 py-2">
                <span className="text-emerald-400 text-sm mt-0.5">📋</span>
                <p className="text-emerald-300 text-xs leading-relaxed">
                  Sample input loaded from <span className="font-semibold text-emerald-200">{lastLoadedTemplate.name}</span>. Edit it or run as-is.
                </p>
              </div>
            )}
            {autoFillLoading && (
              <div className="flex items-center gap-2 bg-indigo-950/50 border border-indigo-800/60 rounded-lg px-3 py-2">
                <span className="inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-indigo-300 text-xs leading-relaxed">
                  Generating a realistic example input… feel free to start typing your own now — it won't be overwritten.
                </p>
              </div>
            )}
            <textarea
              rows={5}
              value={runInput}
              onChange={(e) => { userEditedRunInputRef.current = true; setRunInput(e.target.value); }}
              placeholder={autoFillLoading ? "Generating a realistic example input…" : "e.g. Analyse Q3 sales trends for APAC region and flag anomalies..."}
              className="bg-gray-800 text-white text-sm border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 resize-none"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRunModal(false)}
                className="text-gray-400 hover:text-white px-4 py-2 rounded-lg text-sm border border-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRunWithInput}
                disabled={running || !runInput.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                {running ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Running...
                  </>
                ) : "▶ Execute & Save Trace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
