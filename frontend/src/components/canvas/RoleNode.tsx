import { Handle, Position, type NodeProps } from "@xyflow/react";

const ROLE_ICONS: Record<string, string> = {
  input: "📥",
  classifier: "🔍",
  router: "🔀",
  responder: "💬",
  guard: "🛡️",
  rag: "📚",
  output: "📤",
};

const ROLE_BORDER_COLORS: Record<string, string> = {
  input: "#3b82f6",
  classifier: "#8b5cf6",
  router: "#06b6d4",
  responder: "#22c55e",
  guard: "#ef4444",
  rag: "#f59e0b",
  output: "#166534",
};

const ROLE_TEXT_COLORS: Record<string, string> = {
  input: "#93c5fd",
  classifier: "#c4b5fd",
  router: "#67e8f9",
  responder: "#86efac",
  guard: "#fca5a5",
  rag: "#fcd34d",
  output: "#86efac",
};

interface RoleNodeData {
  label: string;
  role: string;
  description?: string;
  executionState?: "idle" | "running" | "done" | "error";
  [key: string]: unknown;
}

export default function RoleNode({ data }: NodeProps) {
  const d = data as RoleNodeData;
  const role = d.role || "responder";
  const icon = ROLE_ICONS[role] || "🤖";
  const execState = d.executionState ?? "idle";

  // Execution state overrides role color
  let borderColor = ROLE_BORDER_COLORS[role] || "#7c3aed";
  let textColor = ROLE_TEXT_COLORS[role] || "#c4b5fd";
  let bgColor = "transparent";
  let boxShadow = "none";
  let borderWidth = "1.5px";

  if (execState === "running") {
    borderColor = "#f59e0b";
    textColor = "#fcd34d";
    bgColor = "rgba(245,158,11,0.08)";
    boxShadow = "0 0 0 3px rgba(245,158,11,0.25), 0 0 20px rgba(245,158,11,0.3)";
    borderWidth = "2px";
  } else if (execState === "done") {
    borderColor = "#22c55e";
    textColor = "#86efac";
    bgColor = "rgba(34,197,94,0.08)";
    boxShadow = "0 0 0 2px rgba(34,197,94,0.2), 0 0 12px rgba(34,197,94,0.2)";
    borderWidth = "2px";
  } else if (execState === "error") {
    borderColor = "#ef4444";
    textColor = "#fca5a5";
    bgColor = "rgba(239,68,68,0.08)";
    boxShadow = "0 0 0 2px rgba(239,68,68,0.2)";
    borderWidth = "2px";
  }

  return (
    <div
      className={execState === "running" ? "af-node-running" : undefined}
      style={{
        width: 180,
        padding: "10px 12px",
        borderRadius: 10,
        border: `${borderWidth} solid ${borderColor}`,
        background: bgColor,
        position: "relative",
        transition: "border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease",
        boxShadow,
      }}
    >
      {/* CSS keyframe for running pulse — injected inline */}
      {execState === "running" && (
        <style>{`
          @keyframes af-pulse-ring {
            0% { box-shadow: 0 0 0 0 rgba(245,158,11,0.5), 0 0 20px rgba(245,158,11,0.3); }
            70% { box-shadow: 0 0 0 8px rgba(245,158,11,0), 0 0 20px rgba(245,158,11,0.1); }
            100% { box-shadow: 0 0 0 0 rgba(245,158,11,0), 0 0 20px rgba(245,158,11,0.3); }
          }
          .af-node-running { animation: af-pulse-ring 1.4s ease-out infinite; }
        `}</style>
      )}

      {/* Target handle */}
      <Handle type="target" position={Position.Top} style={{ background: borderColor }} />

      {/* Execution state badge (top-left) */}
      {execState !== "idle" && (
        <div style={{
          position: "absolute", top: 6, left: 8,
          fontSize: 10, display: "flex", alignItems: "center", gap: 3,
        }}>
          {execState === "running" && (
            <span style={{
              display: "inline-block", width: 8, height: 8,
              border: "2px solid #f59e0b", borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }} />
          )}
          {execState === "done" && <span style={{ color: "#22c55e", fontSize: 12 }}>✓</span>}
          {execState === "error" && <span style={{ color: "#ef4444", fontSize: 12 }}>✗</span>}
        </div>
      )}

      {/* Role badge (top-right) */}
      <div style={{
        position: "absolute", top: 6, right: 8,
        fontSize: 9, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.06em", color: borderColor,
        background: `${borderColor}22`, border: `1px solid ${borderColor}55`,
        borderRadius: 4, padding: "1px 5px",
      }}>
        {role}
      </div>

      {/* Icon + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: execState !== "idle" ? 6 : 0, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: textColor, lineHeight: 1.2 }}>
          {d.label}
        </span>
      </div>

      {/* Description */}
      {d.description && (
        <p style={{ fontSize: 10, color: "#9ca3af", margin: 0, lineHeight: 1.4 }}>
          {d.description}
        </p>
      )}

      {/* Source handle */}
      <Handle type="source" position={Position.Bottom} style={{ background: borderColor }} />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
