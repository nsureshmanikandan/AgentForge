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
  [key: string]: unknown;
}

export default function RoleNode({ data }: NodeProps) {
  const d = data as RoleNodeData;
  const role = d.role || "responder";
  const icon = ROLE_ICONS[role] || "🤖";
  const borderColor = ROLE_BORDER_COLORS[role] || "#7c3aed";
  const textColor = ROLE_TEXT_COLORS[role] || "#c4b5fd";

  return (
    <div
      style={{
        width: 180,
        padding: "10px 12px",
        borderRadius: 10,
        border: `1.5px solid ${borderColor}`,
        background: "inherit",
        position: "relative",
      }}
    >
      {/* Target handle — top */}
      <Handle type="target" position={Position.Top} style={{ background: borderColor }} />

      {/* Role badge */}
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: borderColor,
          background: `${borderColor}22`,
          border: `1px solid ${borderColor}55`,
          borderRadius: 4,
          padding: "1px 5px",
        }}
      >
        {role}
      </div>

      {/* Icon + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: textColor, lineHeight: 1.2 }}>
          {d.label}
        </span>
      </div>

      {/* Description */}
      {d.description && (
        <p
          style={{
            fontSize: 10,
            color: "#9ca3af",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {d.description}
        </p>
      )}

      {/* Source handle — bottom */}
      <Handle type="source" position={Position.Bottom} style={{ background: borderColor }} />
    </div>
  );
}
