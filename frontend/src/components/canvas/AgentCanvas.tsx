import { useCallback, useEffect, type MutableRefObject } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  type DefaultEdgeOptions,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import RoleNode from "./RoleNode";
import { layoutWorkflow } from "../../utils/layoutWorkflow";

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
  style: { stroke: "#7c3aed", strokeWidth: 2.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed", width: 20, height: 20 },
};

const nodeTypes = { roleNode: RoleNode };

const defaultNodes: Node[] = [
  { id: "input", type: "input", position: { x: 80, y: 200 }, data: { label: "User Input" }, style: { background: "#1e1b4b", color: "#a5b4fc", border: "1px solid #4c1d95" } },
  { id: "agent-1", position: { x: 320, y: 200 }, data: { label: "Agent 1" }, style: { background: "#1e1b4b", color: "#c4b5fd", border: "1px solid #7c3aed" } },
  { id: "output", type: "output", position: { x: 560, y: 200 }, data: { label: "Response" }, style: { background: "#14532d", color: "#86efac", border: "1px solid #166534" } },
];

const defaultEdges: Edge[] = [
  { id: "e-input-agent1", source: "input", target: "agent-1", animated: true, style: { stroke: "#7c3aed", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed", width: 20, height: 20 } },
  { id: "e-agent1-output", source: "agent-1", target: "output", animated: true, style: { stroke: "#7c3aed", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed", width: 20, height: 20 } },
];

export type NodeUpdateData = {
  label?: string;
  role?: string;
  description?: string;
  executionState?: "idle" | "running" | "done" | "error";
};

export type EdgeUpdateData = {
  active?: boolean;
};

interface AgentCanvasProps {
  onNodeSelect: (nodeId: string) => void;
  onWorkflowChange?: (nodes: Node[], edges: Edge[]) => void;
  nodeUpdaterRef?: MutableRefObject<((nodeId: string, data: NodeUpdateData) => void) | null>;
  edgeUpdaterRef?: MutableRefObject<((source: string, target: string, data: EdgeUpdateData) => void) | null>;
  exportRef?: MutableRefObject<(() => { nodes: Node[]; edges: Edge[] }) | null>;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onNodeDelete?: (nodeId: string) => void;
}

export default function AgentCanvas({
  onNodeSelect, onWorkflowChange, nodeUpdaterRef, edgeUpdaterRef,
  exportRef, initialNodes, initialEdges, onNodeDelete,
}: AgentCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    layoutWorkflow(initialNodes ?? defaultNodes, initialEdges ?? defaultEdges)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges ?? defaultEdges);

  useEffect(() => {
    if (initialNodes !== undefined && initialEdges !== undefined) {
      setNodes(layoutWorkflow(initialNodes, initialEdges));
      setEdges(initialEdges);
    } else if (initialNodes !== undefined) {
      setNodes(layoutWorkflow(initialNodes, []));
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  useEffect(() => { onWorkflowChange?.(nodes, edges); }, [nodes, edges, onWorkflowChange]);

  const handleNodeUpdate = useCallback((nodeId: string, data: NodeUpdateData) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n));
  }, [setNodes]);

  const handleEdgeUpdate = useCallback((source: string, target: string, data: EdgeUpdateData) => {
    setEdges((eds) => eds.map((e) => {
      if (e.source === source && e.target === target) {
        return data.active
          ? { ...e, animated: true, style: { stroke: "#22c55e", strokeWidth: 3 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#22c55e", width: 20, height: 20 } }
          : { ...e, animated: true, style: { stroke: "#7c3aed", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed", width: 20, height: 20 } };
      }
      return e;
    }));
  }, [setEdges]);

  useEffect(() => { if (nodeUpdaterRef) nodeUpdaterRef.current = handleNodeUpdate; }, [handleNodeUpdate, nodeUpdaterRef]);
  useEffect(() => { if (edgeUpdaterRef) edgeUpdaterRef.current = handleEdgeUpdate; }, [handleEdgeUpdate, edgeUpdaterRef]);
  useEffect(() => { if (exportRef) exportRef.current = () => ({ nodes, edges }); }, [exportRef, nodes, edges]);

  const onConnect = useCallback((connection: Connection) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const isRouter = (sourceNode?.data as Record<string, unknown>)?.role === "router";
    let label = "";
    if (isRouter) label = window.prompt("Edge label (e.g. Yes/No, Priority):") ?? "";
    setEdges((eds) => addEdge(
      label
        ? { ...connection, animated: true, label, labelStyle: { fill: "#e5e7eb", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "#4c1d95" }, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 4, style: { stroke: "#7c3aed", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed", width: 20, height: 20 } }
        : { ...connection, animated: true, style: { stroke: "#7c3aed", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed", width: 20, height: 20 } },
      eds
    ));
  }, [setEdges, nodes]);

  const handleNodesDelete = useCallback((deletedNodes: Node[]) => {
    const deletedIds = new Set(deletedNodes.map((n) => n.id));
    setEdges((eds) => eds.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)));
    deletedNodes.forEach((n) => onNodeDelete?.(n.id));
  }, [setEdges, onNodeDelete]);

  const addAgentNode = () => {
    const id = `agent-${Date.now()}`;
    setNodes((nds) => [...nds, {
      id, position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 150 },
      data: { label: "New Agent" },
      style: { background: "#1e1b4b", color: "#c4b5fd", border: "1px solid #7c3aed" },
    }]);
  };

  return (
    <div className="w-full h-full relative bg-gray-950">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button onClick={addAgentNode} className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow">
          + Add Agent
        </button>
      </div>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeSelect(node.id)}
        onNodesDelete={handleNodesDelete}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        deleteKeyCode={["Delete", "Backspace"]}
        fitView colorMode="dark"
      >
        <Controls />
        <MiniMap nodeStrokeWidth={3} />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#374151" />
      </ReactFlow>
    </div>
  );
}
