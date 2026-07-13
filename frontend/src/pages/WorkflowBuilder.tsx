import { useState, useCallback, useRef } from "react";
import axios from "axios";
import AgentCanvas from "../components/canvas/AgentCanvas";
import AgentConfigPanel from "../components/agents/AgentConfigPanel";
import type { Node, Edge } from "@xyflow/react";
import type { NodeUpdateData } from "../components/canvas/AgentCanvas";
import { WORKFLOW_TEMPLATES, TEMPLATE_CATEGORIES } from "../data/workflowTemplates";
import type { WorkflowTemplate } from "../data/workflowTemplates";

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
  const [selectedNodeData, setSelectedNodeData] = useState<{ label?: string; role?: string; description?: string } | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [loadedNodes, setLoadedNodes] = useState<Node[] | undefined>(undefined);
  const [loadedEdges, setLoadedEdges] = useState<Edge[] | undefined>(undefined);
  const workflowRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
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

  // Resizable left panel
  const [panelWidth, setPanelWidth] = useState(288);
  const isResizing = useRef(false);

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

  // Auto-Build panel state
  const [showAutoBuild, setShowAutoBuild] = useState(false);
  const [abDescription, setAbDescription] = useState("");
  const [abName, setAbName] = useState("");
  const [abLoading, setAbLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleWorkflowChange = useCallback((nodes: Node[], edges: Edge[]) => {
    workflowRef.current = { nodes, edges };
  }, []);

  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNode(nodeId);
    const node = workflowRef.current?.nodes.find((n) => n.id === nodeId);
    if (node) {
      setSelectedNodeData({
        label: String(node.data?.label ?? ""),
        role: String((node.data as Record<string, unknown>)?.role ?? "agent"),
        description: String((node.data as Record<string, unknown>)?.description ?? ""),
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
      const { logs } = await deployRes.json() as { logs: RunLog[] };
      setRunLogs(logs);
      setWebhookUrl(`http://localhost:8000/api/builder/workflows/${workflow_id}/trigger`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleRunWithInput = async () => {
    if (!workflowRef.current || running) return;
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

    const nodeList = nodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      return `#   - ${String(d.label ?? n.id)} (id: ${n.id}, role: ${String(d.role ?? "agent")})`;
    }).join("\n");

    const nodeFunctions = nodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      const label = String(d.label ?? n.id);
      const role = String(d.role ?? "agent");
      const description = String(d.description ?? "");
      const safeId = n.id.replace(/[^a-zA-Z0-9_]/g, "_");
      return `    # Node: ${label} (role: ${role})\n    # ${description}\n    async def node_${safeId}(input: str) -> str:\n        # TODO: Implement ${label} logic\n        # Role: ${role}\n        # Description: ${description}\n        return input`;
    }).join("\n\n");

    const pipeline = nodes.map((n) => {
      const safeId = n.id.replace(/[^a-zA-Z0-9_]/g, "_");
      const label = String((n.data as Record<string, unknown>).label ?? n.id);
      const edgesFrom = edges.filter((e) => e.source === n.id);
      const edgeNote = edgesFrom.length > 0
        ? ` -> [${edgesFrom.map((e) => e.target).join(", ")}]`
        : "";
      return `    output = await node_${safeId}(output)  # ${label}${edgeNote}`;
    }).join("\n");

    const code = `"""
Auto-generated AgentForge workflow: ${workflowName}
Generated: ${date}
"""
import asyncio

# Workflow nodes:
${nodeList}

async def run_pipeline(user_input: str) -> str:
    """Execute the ${workflowName} pipeline."""
    output = user_input

${nodeFunctions}

    # Pipeline execution
${pipeline}

    return output

if __name__ == "__main__":
    result = asyncio.run(run_pipeline("Hello, I need help"))
    print(result)
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

  const handleLoad = () => {
    const raw = localStorage.getItem("af_workflow_current");
    if (!raw) {
      showToast("No saved workflow found.");
      return;
    }
    try {
      const { nodes, edges } = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] };
      setLoadedNodes(nodes);
      setLoadedEdges(edges);
      setCanvasKey((k) => k + 1);
      showToast("Workflow loaded!");
    } catch {
      showToast("Failed to load workflow.");
    }
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

  return (
    <div className="flex h-full bg-gray-950 flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 z-10 overflow-x-auto flex-shrink-0">
        <span className="text-white font-semibold text-sm flex-shrink-0 mr-2 whitespace-nowrap">Workflow Builder</span>
        <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleLoad}
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
          onClick={() => { setShowRunModal(true); setRunInput(lastLoadedTemplate?.sampleInput ?? ""); }}
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

        {/* Auto-Build slide-in panel */}
        {showAutoBuild && (
          <div className="absolute top-0 right-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl z-20 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <span className="text-white font-semibold text-sm">Auto-Build Workflow</span>
              <button
                onClick={() => setShowAutoBuild(false)}
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
            <textarea
              rows={5}
              value={runInput}
              onChange={(e) => setRunInput(e.target.value)}
              placeholder="e.g. Analyse Q3 sales trends for APAC region and flag anomalies..."
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
