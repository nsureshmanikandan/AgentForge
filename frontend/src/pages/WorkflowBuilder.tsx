import { useState, useCallback, useRef } from "react";
import AgentCanvas from "../components/canvas/AgentCanvas";
import AgentConfigPanel from "../components/agents/AgentConfigPanel";
import type { Node, Edge } from "@xyflow/react";

export default function WorkflowBuilder() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [loadedNodes, setLoadedNodes] = useState<Node[] | undefined>(undefined);
  const [loadedEdges, setLoadedEdges] = useState<Edge[] | undefined>(undefined);
  const workflowRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleWorkflowChange = useCallback((nodes: Node[], edges: Edge[]) => {
    workflowRef.current = { nodes, edges };
  }, []);

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

  return (
    <div className="flex h-full bg-gray-950 flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 z-10">
        <span className="text-white font-semibold text-sm mr-auto">Workflow Builder</span>
        <button
          onClick={handleLoad}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow"
        >
          Load
        </button>
        <button
          onClick={handleSave}
          className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow"
        >
          Save Workflow
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute top-14 right-4 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg border border-gray-700 transition-opacity">
          {toast}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <AgentCanvas
            key={canvasKey}
            onNodeSelect={setSelectedNode}
            onWorkflowChange={handleWorkflowChange}
            initialNodes={loadedNodes}
            initialEdges={loadedEdges}
          />
        </div>
        {selectedNode && (
          <AgentConfigPanel
            nodeId={selectedNode}
            onSave={() => setSelectedNode(null)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
