import { useCallback } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const initialNodes: Node[] = [
  {
    id: "input",
    type: "input",
    position: { x: 80, y: 200 },
    data: { label: "User Input" },
    style: { background: "#1e1b4b", color: "#a5b4fc", border: "1px solid #4c1d95" },
  },
  {
    id: "agent-1",
    position: { x: 320, y: 200 },
    data: { label: "Agent 1" },
    style: { background: "#1e1b4b", color: "#c4b5fd", border: "1px solid #7c3aed" },
  },
  {
    id: "output",
    type: "output",
    position: { x: 560, y: 200 },
    data: { label: "Response" },
    style: { background: "#14532d", color: "#86efac", border: "1px solid #166534" },
  },
];

const initialEdges: Edge[] = [
  { id: "e-input-agent1", source: "input", target: "agent-1", animated: true },
  { id: "e-agent1-output", source: "agent-1", target: "output", animated: true },
];

interface AgentCanvasProps {
  onNodeSelect: (nodeId: string) => void;
}

export default function AgentCanvas({ onNodeSelect }: AgentCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true }, eds)),
    [setEdges]
  );

  const addAgentNode = () => {
    const id = `agent-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 150 },
        data: { label: "New Agent" },
        style: { background: "#1e1b4b", color: "#c4b5fd", border: "1px solid #7c3aed" },
      },
    ]);
  };

  return (
    <div className="w-full h-full relative bg-gray-950">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={addAgentNode}
          className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow"
        >
          + Add Agent
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeSelect(node.id)}
        fitView
        colorMode="dark"
      >
        <Controls />
        <MiniMap nodeStrokeWidth={3} />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#374151" />
      </ReactFlow>
    </div>
  );
}
