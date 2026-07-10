import { useState } from "react";
import AgentCanvas from "../components/canvas/AgentCanvas";
import AgentConfigPanel from "../components/agents/AgentConfigPanel";

export default function WorkflowBuilder() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  return (
    <div className="flex h-full bg-gray-950">
      <div className="flex-1 relative">
        <AgentCanvas onNodeSelect={setSelectedNode} />
      </div>
      {selectedNode && (
        <AgentConfigPanel
          nodeId={selectedNode}
          onSave={() => setSelectedNode(null)}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
