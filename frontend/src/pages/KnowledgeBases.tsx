import { useEffect, useMemo, useRef, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type NodeProps,
} from "@xyflow/react";
import { ragApi } from "../api/client";
import { KBAnswerCard, type SourceChunk } from "../components/KBAnswerCard";

// ── Entity colour palette ─────────────────────────────────────────────────────
const ENTITY_PALETTE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  CONCEPT:    { bg: "#eef2ff", border: "#818cf8", text: "#4338ca", dot: "#6366f1" },
  TECHNOLOGY: { bg: "#ecfeff", border: "#67e8f9", text: "#0e7490", dot: "#06b6d4" },
  PERSON:     { bg: "#f0fdf4", border: "#86efac", text: "#15803d", dot: "#22c55e" },
  ORG:        { bg: "#fffbeb", border: "#fcd34d", text: "#b45309", dot: "#f59e0b" },
  PROCESS:    { bg: "#fff1f2", border: "#fda4af", text: "#be123c", dot: "#f43f5e" },
  TOOL:       { bg: "#faf5ff", border: "#c4b5fd", text: "#7c3aed", dot: "#8b5cf6" },
};

// ── Custom React Flow node ────────────────────────────────────────────────────
type EntityNodeData = { name: string; entityType: string; description: string };

function EntityNode({ data, selected }: NodeProps) {
  const d = data as EntityNodeData;
  const p = ENTITY_PALETTE[d.entityType] || ENTITY_PALETTE.CONCEPT;
  return (
    <div style={{
      background: p.bg,
      border: `1.5px solid ${selected ? p.dot : p.border}`,
      borderRadius: 10,
      padding: "8px 14px",
      minWidth: 130,
      maxWidth: 200,
      boxShadow: selected ? `0 0 0 2.5px ${p.dot}50` : "0 1px 4px rgba(0,0,0,0.06)",
      cursor: "pointer",
      userSelect: "none",
    }}>
      <Handle type="target" position={Position.Left}
        style={{ background: p.border, width: 8, height: 8, border: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.dot, flexShrink: 0 }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 148 }}>
          {d.name}
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, color: p.text, marginTop: 2, marginLeft: 15 }}>
        {d.entityType}
      </div>
      <Handle type="source" position={Position.Right}
        style={{ background: p.border, width: 8, height: 8, border: "none" }} />
    </div>
  );
}

const NODE_TYPES = { entityNode: EntityNode };

function applyDagreLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 110, nodesep: 70, marginx: 50, marginy: 50 });
  nodes.forEach(n => g.setNode(n.id, { width: 190, height: 62 }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 95, y: pos.y - 31 } };
  });
}

// ── Shared types ──────────────────────────────────────────────────────────────
interface KB {
  id: string;
  name: string;
  description: string;
  kb_type: "basic" | "graph" | "semantic";
  documentCount: number;
  createdAt: string;
  schemaTableCount?: number;
  retrievalStrategy?: "default" | "mmr" | "hyde";
  retrievalTopK?: number;
  retrievalThreshold?: number;
}

const RETRIEVAL_STRATEGY_OPTIONS: { value: "default" | "mmr" | "hyde"; label: string; sub: string }[] = [
  { value: "default", label: "Default", sub: "Plain top-K similarity search" },
  { value: "mmr", label: "MMR", sub: "Diverse results, less redundancy between chunks" },
  { value: "hyde", label: "HyDE", sub: "Better for short or vaguely-worded questions" },
];

interface KBDocument {
  id: string;
  filename: string;
  chunk_count: number;
  status: string;
}

interface GraphData {
  entities: Array<{ id: string; name: string; type: string; description: string }>;
  relationships: Array<{
    id: string; source_id: string; target_id: string; relation: string; context: string;
  }>;
}

// ── KB type definitions for create modal ─────────────────────────────────────
const KB_TYPE_OPTIONS = [
  {
    key: "basic" as const,
    label: "Basic",
    sub: "Simple vector-based retrieval with embeddings",
    disabled: false,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25 4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    key: "graph" as const,
    label: "Graph",
    sub: "Knowledge graph with entity relationships",
    disabled: false,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="2" strokeWidth={1.5} />
        <circle cx="19" cy="6" r="2" strokeWidth={1.5} />
        <circle cx="19" cy="18" r="2" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M7 11.5l10-4.5M7 12.5l10 4.5" />
      </svg>
    ),
  },
  {
    key: "semantic" as const,
    label: "Semantic Data Model",
    sub: "NL-to-SQL with live database schema discovery",
    disabled: false,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25" />
      </svg>
    ),
  },
];

// ── Modal: Create KB ──────────────────────────────────────────────────────────
interface CreateModalProps {
  onClose: () => void;
  onCreate: (kb: KB) => void;
}

function CreateModal({ onClose, onCreate }: CreateModalProps) {
  const [kbType, setKbType] = useState<"basic" | "graph" | "semantic">("basic");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dbHost, setDbHost] = useState("localhost");
  const [dbPort, setDbPort] = useState("5432");
  const [dbName, setDbName] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");

  async function handleCreate() {
    if (!name.trim()) { setError("Name is required."); return; }
    if (kbType === "semantic" && (!dbName.trim() || !dbUser.trim())) {
      setError("Database name and username are required for Semantic KB.");
      return;
    }
    setLoading(true); setError("");
    try {
      const res = await ragApi.createKB(name.trim(), description.trim(), kbType);
      const data = res.data as { id: string; name: string; description: string; kb_type?: string };
      let schemaTableCount: number | undefined;
      if (kbType === "semantic") {
        try {
          const connRes = await ragApi.connectSemantic(data.id, {
            host: dbHost.trim(),
            port: parseInt(dbPort) || 5432,
            database: dbName.trim(),
            username: dbUser.trim(),
            password: dbPassword,
          });
          const connData = connRes.data as { table_count: number };
          schemaTableCount = connData.table_count;
        } catch (connErr: unknown) {
          const msg = (connErr as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          setError(msg || "KB created but DB connection failed. Connect from the card.");
        }
      }
      onCreate({
        id: data.id,
        name: data.name,
        description: data.description,
        kb_type: (data.kb_type as "basic" | "graph" | "semantic") || "basic",
        documentCount: 0,
        createdAt: new Date().toISOString(),
        schemaTableCount,
        retrievalStrategy: "default",
        retrievalTopK: 6,
        retrievalThreshold: 0.3,
      });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to create knowledge base.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Knowledge Base</h2>
            <p className="text-xs text-gray-400 mt-0.5">Configure a new knowledge base for your agent</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Type selector cards */}
        <div className="mb-6">
          <p className="text-sm font-medium text-slate-700 mb-3">Knowledge Base Type</p>
          <div className="grid grid-cols-3 gap-3">
            {KB_TYPE_OPTIONS.map((t) => {
              const active = !t.disabled && kbType === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { if (!t.disabled) setKbType(t.key as "basic" | "graph" | "semantic"); }}
                  disabled={t.disabled}
                  className={`relative flex flex-col items-center text-center p-4 rounded-xl border-2 transition-all ${
                    t.disabled
                      ? "opacity-45 cursor-not-allowed border-gray-100 bg-gray-50"
                      : active
                      ? "border-indigo-500 bg-indigo-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40 cursor-pointer"
                  }`}
                >
                  {t.disabled && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 leading-tight">
                      Soon
                    </span>
                  )}
                  <div className={`mb-2 ${active ? "text-indigo-600" : "text-gray-400"}`}>
                    {t.icon}
                  </div>
                  <p className={`text-xs font-semibold mb-1 ${active ? "text-indigo-700" : "text-slate-700"}`}>
                    {t.label}
                  </p>
                  <p className="text-[10px] text-gray-400 leading-tight">{t.sub}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. Product Documentation"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this KB contains…"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>
          {kbType === "semantic" && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25 4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
                Database Connection
              </p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Host</label>
                  <input type="text" value={dbHost} onChange={(e) => setDbHost(e.target.value)}
                    placeholder="localhost"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Port</label>
                  <input type="text" value={dbPort} onChange={(e) => setDbPort(e.target.value)}
                    placeholder="5432"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="mb-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Database <span className="text-red-400">*</span></label>
                <input type="text" value={dbName} onChange={(e) => setDbName(e.target.value)}
                  placeholder="my_database"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Username <span className="text-red-400">*</span></label>
                  <input type="text" value={dbUser} onChange={(e) => setDbUser(e.target.value)}
                    placeholder="postgres"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
                  <input type="password" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creating…" : kbType === "semantic" ? "Create & Connect" : "Create Knowledge Base"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Connect Semantic DB ────────────────────────────────────────────────
interface ConnectModalProps {
  kb: KB;
  onClose: () => void;
  onConnected: (tableCount: number) => void;
}

function ConnectModal({ kb, onClose, onConnected }: ConnectModalProps) {
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    if (!database.trim() || !username.trim()) { setError("Database and username are required."); return; }
    setLoading(true); setError("");
    try {
      const res = await ragApi.connectSemantic(kb.id, {
        host: host.trim(), port: parseInt(port) || 5432,
        database: database.trim(), username: username.trim(), password,
      });
      const data = res.data as { table_count: number };
      onConnected(data.table_count);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Connection failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Connect Database</h2>
            <p className="text-xs text-gray-400 mt-0.5">{kb.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Host</label>
              <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Port</label>
              <input type="text" value={port} onChange={(e) => setPort(e.target.value)} placeholder="5432"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Database <span className="text-red-400">*</span></label>
            <input type="text" value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="my_database"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Username <span className="text-red-400">*</span></label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="postgres"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleConnect} disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {loading ? "Connecting…" : "Connect & Discover Schema"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Retrieval Settings ────────────────────────────────────────────────
interface SettingsModalProps {
  kb: KB;
  onClose: () => void;
  onUpdated: (settings: { retrievalStrategy: "default" | "mmr" | "hyde"; retrievalTopK: number; retrievalThreshold: number }) => void;
}

function SettingsModal({ kb, onClose, onUpdated }: SettingsModalProps) {
  const [strategy, setStrategy] = useState<"default" | "mmr" | "hyde">(kb.retrievalStrategy || "default");
  const [topK, setTopK] = useState(String(kb.retrievalTopK ?? 6));
  const [threshold, setThreshold] = useState(String(kb.retrievalThreshold ?? 0.3));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const parsedTopK = parseInt(topK, 10);
    const parsedThreshold = parseFloat(threshold);
    if (!Number.isFinite(parsedTopK) || parsedTopK < 1 || parsedTopK > 20) {
      setError("Top-K must be a number between 1 and 20."); return;
    }
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 1) {
      setError("Similarity threshold must be between 0.0 and 1.0."); return;
    }
    setLoading(true); setError("");
    try {
      await ragApi.updateSettings(kb.id, {
        retrieval_strategy: strategy,
        retrieval_top_k: parsedTopK,
        retrieval_threshold: parsedThreshold,
      });
      onUpdated({ retrievalStrategy: strategy, retrievalTopK: parsedTopK, retrievalThreshold: parsedThreshold });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to save settings.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Retrieval Settings</h2>
            <p className="text-xs text-gray-400 mt-0.5">{kb.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Retrieval strategy</label>
            <div className="space-y-1.5">
              {RETRIEVAL_STRATEGY_OPTIONS.map((opt) => (
                <label key={opt.value}
                  className={`flex items-start gap-2 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    strategy === opt.value ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"
                  }`}>
                  <input type="radio" name="retrieval-strategy" checked={strategy === opt.value}
                    onChange={() => setStrategy(opt.value)} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.sub}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Top-K results</label>
              <input type="number" min={1} max={20} value={topK} onChange={(e) => setTopK(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Similarity threshold</label>
              <input type="number" min={0} max={1} step={0.05} value={threshold} onChange={(e) => setThreshold(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {loading ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Query KB ───────────────────────────────────────────────────────────
interface QueryModalProps {
  kb: KB;
  onClose: () => void;
}

function QueryModal({ kb, onClose }: QueryModalProps) {
  const isSemantic = kb.kb_type === "semantic";
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceChunk[]>([]);
  const [graphEntities, setGraphEntities] = useState<{ name: string; type: string }[] | undefined>(undefined);
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([]);
  const [groundingScore, setGroundingScore] = useState<number | null>(null);
  const [sqlQuery, setSqlQuery] = useState<string | undefined>();
  const [queryColumns, setQueryColumns] = useState<string[] | undefined>();
  const [queryRows, setQueryRows] = useState<string[][] | undefined>();
  const [rowCount, setRowCount] = useState<number | undefined>();
  const [sqlError, setSqlError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(!isSemantic);

  useEffect(() => {
    if (isSemantic) return;
    let cancelled = false;
    ragApi.suggestedQuestions(kb.id)
      .then((res) => {
        if (cancelled) return;
        const data = res.data as { questions: string[] };
        setSuggestions(data.questions || []);
      })
      .catch(() => { if (!cancelled) setSuggestions([]); })
      .finally(() => { if (!cancelled) setSuggestionsLoading(false); });
    return () => { cancelled = true; };
  }, [kb.id, isSemantic]);

  async function runQuery(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setAnswer(""); setSources([]); setGraphEntities(undefined);
    setRelatedQuestions([]); setGroundingScore(null);
    setSqlQuery(undefined); setQueryColumns(undefined); setQueryRows(undefined);
    setRowCount(undefined); setSqlError(undefined);
    setError(""); setAskedQuestion(q.trim());
    try {
      const res = await ragApi.query(kb.id, q.trim());
      const data = res.data as {
        answer: string;
        sources: SourceChunk[];
        graph_entities?: { name: string; type: string }[];
        related_questions: string[];
        grounding_score: number | null;
        sql_query?: string;
        columns?: string[];
        rows?: string[][];
        row_count?: number;
        sql_error?: string;
      };
      setAnswer(data.answer);
      setSources(data.sources ?? []);
      setGraphEntities(data.graph_entities ?? undefined);
      setRelatedQuestions(data.related_questions ?? []);
      setGroundingScore(data.grounding_score ?? null);
      setSqlQuery(data.sql_query ?? undefined);
      setQueryColumns(data.columns ?? undefined);
      setQueryRows(data.rows ?? undefined);
      setRowCount(data.row_count ?? undefined);
      setSqlError(data.sql_error ?? undefined);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Query failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function clearQuery() {
    setQuestion(""); setAskedQuestion(""); setAnswer("");
    setSources([]); setGraphEntities(undefined);
    setRelatedQuestions([]); setGroundingScore(null); setError("");
    setSqlQuery(undefined); setQueryColumns(undefined); setQueryRows(undefined);
    setRowCount(undefined); setSqlError(undefined);
  }

  function handleQuestionChange(value: string) {
    setQuestion(value);
    if (value.trim() === "" && (answer || error)) {
      setAskedQuestion(""); setAnswer(""); setError("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Query Knowledge Base</h2>
              <p className="text-xs text-gray-400 mt-0.5">{kb.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 pt-5 flex-shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={question}
                onChange={(e) => handleQuestionChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runQuery(question)}
                placeholder="Ask a question…"
                className="w-full border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {question && (
                <button onClick={clearQuery} title="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => runQuery(question)}
              disabled={loading || !question.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : "Ask"}
            </button>
          </div>

          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

          {isSemantic && !answer && !loading && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-400 mb-2">Example queries</p>
              <div className="flex flex-wrap gap-2">
                {["Show all tables", "How many rows are in each table?", "List columns in the largest table"].map((q, i) => (
                  <button key={i} onClick={() => { setQuestion(q); runQuery(q); }} disabled={loading}
                    className="text-left text-xs text-slate-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 hover:bg-emerald-100 hover:text-emerald-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!isSemantic && !suggestionsLoading && suggestions.length > 0 && !answer && !loading && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-400 mb-2">Suggested questions</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((q, i) => (
                  <button key={i} onClick={() => { setQuestion(q); runQuery(q); }} disabled={loading}
                    className="text-left text-xs text-slate-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-indigo-400">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Thinking…
            </div>
          )}

          {answer && !loading && (
            <div className="mt-4">
              {askedQuestion && (
                <p className="text-xs text-slate-400 italic mb-2">"{askedQuestion}"</p>
              )}
              <KBAnswerCard
                kbId={kb.id}
                question={askedQuestion}
                answer={answer}
                sources={sources}
                graphEntities={graphEntities}
                relatedQuestions={relatedQuestions}
                groundingScore={groundingScore}
                sqlQuery={sqlQuery}
                queryColumns={queryColumns}
                queryRows={queryRows}
                rowCount={rowCount}
                sqlError={sqlError}
                onRelatedClick={(q) => { setQuestion(q); runQuery(q); }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline Upload Panel ───────────────────────────────────────────────────────
interface UploadStatus {
  name: string;
  status: "uploading" | "done" | "replaced" | "error";
  error?: string;
}

interface UploadPanelProps {
  kb: KB;
  onDocAdded: () => void;
  onClose: () => void;
}

function UploadPanel({ kb, onDocAdded, onClose }: UploadPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadStatus[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      setUploads((prev) => [...prev, { name: file.name, status: "uploading" }]);
      try {
        const res = await ragApi.upload(kb.id, file);
        const data = res.data as { replaced_existing?: boolean };
        const finalStatus = data.replaced_existing ? "replaced" : "done";
        setUploads((prev) => prev.map((u) => u.name === file.name ? { ...u, status: finalStatus } : u));
        onDocAdded();
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setUploads((prev) => prev.map((u) =>
          u.name === file.name ? { ...u, status: "error", error: msg || "Upload failed" } : u
        ));
      }
    }
  }

  return (
    <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-slate-700">Upload Documents</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-xs">Close</button>
      </div>

      {kb.kb_type === "graph" && (
        <div className="mb-3 flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg p-2.5">
          <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[10px] text-purple-700 leading-relaxed">
            Graph extraction runs LLM entity recognition per chunk. Processing may take longer than Basic KB.
          </p>
        </div>
      )}

      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <svg className="w-7 h-7 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-xs text-gray-500">Drop files here or <span className="text-indigo-600 font-medium">browse</span></p>
        <p className="text-xs text-gray-400 mt-0.5">PDF, DOCX, TXT, CSV</p>
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.csv" className="hidden"
          onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center gap-2">
              {u.status === "uploading" && (
                <svg className="w-3.5 h-3.5 animate-spin text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {(u.status === "done" || u.status === "replaced") && (
                <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {u.status === "error" && (
                <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="text-xs text-slate-700 truncate flex-1">{u.name}</span>
              {u.status === "uploading" && <span className="text-xs text-gray-400">Uploading…</span>}
              {u.status === "done" && <span className="text-xs text-emerald-600">Done</span>}
              {u.status === "replaced" && (
                <span className="text-xs text-emerald-600" title="An existing document with this name was replaced">Replaced</span>
              )}
              {u.status === "error" && <span className="text-xs text-red-600">{u.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Graph Explorer Modal ──────────────────────────────────────────────────────
interface GraphExplorerProps {
  kb: KB;
  onClose: () => void;
}

function GraphExplorerModal({ kb, onClose }: GraphExplorerProps) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<GraphData["entities"][0] | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  useEffect(() => {
    ragApi.getGraph(kb.id)
      .then((res) => setGraphData(res.data as GraphData))
      .catch(() => setError("Failed to load graph data."))
      .finally(() => setLoading(false));
  }, [kb.id]);

  const entityTypes = useMemo(
    () => [...new Set((graphData?.entities || []).map((e) => e.type))].sort(),
    [graphData]
  );

  const { nodes, edges } = useMemo(() => {
    if (!graphData) return { nodes: [] as FlowNode[], edges: [] as FlowEdge[] };

    const filtered = filterType
      ? graphData.entities.filter((e) => e.type === filterType)
      : graphData.entities;
    const idSet = new Set(filtered.map((e) => e.id));

    const rawNodes: FlowNode[] = filtered.map((e) => ({
      id: e.id,
      type: "entityNode",
      data: { name: e.name, entityType: e.type, description: e.description } as unknown as Record<string, unknown>,
      position: { x: 0, y: 0 },
    }));

    const rawEdges: FlowEdge[] = graphData.relationships
      .filter((r) => idSet.has(r.source_id) && idSet.has(r.target_id))
      .map((r) => ({
        id: r.id,
        source: r.source_id,
        target: r.target_id,
        label: r.relation,
        type: "smoothstep",
        labelStyle: { fontSize: 10, fill: "#64748b", fontWeight: 500 },
        labelBgStyle: { fill: "#f8fafc", fillOpacity: 0.9 },
        labelBgPadding: [4, 3] as [number, number],
        labelBgBorderRadius: 3,
        style: { stroke: "#cbd5e1", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 14, height: 14 },
      }));

    return { nodes: applyDagreLayout(rawNodes, rawEdges), edges: rawEdges };
  }, [graphData, filterType]);

  const entityRelationships = useMemo(() => {
    if (!selectedEntity || !graphData) return [];
    const byId = new Map(graphData.entities.map((e) => [e.id, e]));
    return graphData.relationships
      .filter((r) => r.source_id === selectedEntity.id || r.target_id === selectedEntity.id)
      .map((r) => ({
        direction: r.source_id === selectedEntity.id ? "out" : "in",
        relation: r.relation,
        other: byId.get(r.source_id === selectedEntity.id ? r.target_id : r.source_id),
        context: r.context,
      }));
  }, [selectedEntity, graphData]);

  const palette = selectedEntity
    ? ENTITY_PALETTE[selectedEntity.type] || ENTITY_PALETTE.CONCEPT
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-200 flex-shrink-0 bg-white">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4.5 h-4.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="2.5" strokeWidth={1.5} />
              <circle cx="20" cy="5" r="2.5" strokeWidth={1.5} />
              <circle cx="20" cy="19" r="2.5" strokeWidth={1.5} />
              <path strokeLinecap="round" strokeWidth={1.5} d="M7.5 11.2L17.5 6.3M7.5 12.8L17.5 17.7" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 truncate">{kb.name}</h2>
            <p className="text-[11px] text-gray-400">
              {graphData?.entities.length ?? "—"} entities · {graphData?.relationships.length ?? "—"} relationships
            </p>
          </div>
        </div>

        {/* Type filter chips */}
        {entityTypes.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterType(null)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
                filterType === null
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              All
            </button>
            {entityTypes.map((t) => {
              const p = ENTITY_PALETTE[t] || ENTITY_PALETTE.CONCEPT;
              const active = filterType === t;
              return (
                <button
                  key={t}
                  onClick={() => setFilterType(active ? null : t)}
                  style={active ? { background: p.bg, color: p.text, borderColor: p.border } : undefined}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
                    active
                      ? ""
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        )}

        <button onClick={onClose}
          className="ml-auto flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Canvas + Side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div className="flex-1" style={{ position: "relative" }}>
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
              <svg className="w-7 h-7 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm">Loading knowledge graph…</p>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500">{error}</div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center">
                <svg className="w-7 h-7 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="2.5" strokeWidth={1.5} />
                  <circle cx="20" cy="5" r="2.5" strokeWidth={1.5} />
                  <circle cx="20" cy="19" r="2.5" strokeWidth={1.5} />
                  <path strokeLinecap="round" strokeWidth={1.5} d="M7.5 11.2L17.5 6.3M7.5 12.8L17.5 17.7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700">No graph data yet</p>
              <p className="text-xs text-gray-400 max-w-xs">
                Upload documents to extract entities and relationships automatically.
              </p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              onNodeClick={(_, node) => {
                const e = graphData?.entities.find((e) => e.id === node.id);
                setSelectedEntity(e || null);
              }}
              onPaneClick={() => setSelectedEntity(null)}
              style={{ width: "100%", height: "100%" }}
            >
              <Background color="#e2e8f0" gap={20} />
              <Controls />
              <MiniMap
                nodeColor={(n) => {
                  const d = n.data as EntityNodeData;
                  return ENTITY_PALETTE[d?.entityType]?.dot || "#94a3b8";
                }}
                style={{ borderRadius: 8 }}
              />
            </ReactFlow>
          )}
        </div>

        {/* Entity detail side panel */}
        {selectedEntity && palette && (
          <div className="w-64 border-l border-gray-200 flex flex-col overflow-hidden bg-gray-50 flex-shrink-0">
            {/* Entity header */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: palette.dot, flexShrink: 0 }} />
                    <span style={{ color: palette.text }}
                      className="text-[10px] font-semibold uppercase tracking-wider">
                      {selectedEntity.type}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 leading-tight">{selectedEntity.name}</h3>
                </div>
                <button
                  onClick={() => setSelectedEntity(null)}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {selectedEntity.description && (
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">{selectedEntity.description}</p>
              )}
            </div>

            {/* Relationships */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Relationships ({entityRelationships.length})
              </p>
              {entityRelationships.length === 0 ? (
                <p className="text-xs text-gray-400">No relationships found.</p>
              ) : (
                <div className="space-y-3">
                  {entityRelationships.map((r, i) => (
                    <div key={i} className="bg-white rounded-lg border border-gray-200 p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          r.direction === "out"
                            ? "bg-indigo-50 text-indigo-600"
                            : "bg-amber-50 text-amber-600"
                        }`}>
                          {r.direction === "out" ? "→" : "←"} {r.relation}
                        </span>
                      </div>
                      {r.other && (
                        <p className="text-xs font-medium text-slate-700 truncate">{r.other.name}</p>
                      )}
                      {r.context && (
                        <p className="text-[10px] text-gray-400 mt-1 leading-relaxed line-clamp-2">{r.context}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend footer */}
      {nodes.length > 0 && (
        <div className="flex items-center gap-4 px-5 py-2.5 border-t border-gray-100 bg-white flex-shrink-0">
          <span className="text-[11px] text-gray-400 font-medium">Entity types:</span>
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(ENTITY_PALETTE).map(([type, p]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.dot }} />
                <span style={{ color: p.text }} className="text-[11px] font-medium">{type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── KB Card ───────────────────────────────────────────────────────────────────
interface KBCardProps {
  kb: KB;
  onDelete: (id: string) => void;
  onQuery: (kb: KB) => void;
  onExploreGraph: (kb: KB) => void;
  onConnect: (kb: KB) => void;
  onSettings: (kb: KB) => void;
}

function KBCard({ kb, onDelete, onQuery, onExploreGraph, onConnect, onSettings }: KBCardProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const isGraph = kb.kb_type === "graph";
  const isSemantic = kb.kb_type === "semantic";

  useEffect(() => {
    let cancelled = false;
    ragApi.get(kb.id).then((res) => {
      if (cancelled) return;
      const data = res.data as { documents: KBDocument[] };
      setDocs(data.documents || []);
    }).catch(() => { if (!cancelled) setDocs([]); });
    return () => { cancelled = true; };
  }, [kb.id, refreshTick]);

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await ragApi.delete(kb.id);
      onDelete(kb.id);
    } catch {
      setDeleting(false); setConfirmDelete(false);
    }
  }

  const dateLabel = new Date(kb.createdAt).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div className={`bg-white border rounded-xl shadow-sm flex flex-col transition-shadow hover:shadow-md ${
      isGraph ? "border-purple-100" : isSemantic ? "border-emerald-100" : "border-gray-200"
    }`}>
      <div className="p-5 flex-1">
        {/* Card header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isGraph ? "bg-purple-50" : isSemantic ? "bg-emerald-50" : "bg-indigo-50"
          }`}>
            {isGraph ? (
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="2.5" strokeWidth={1.5} />
                <circle cx="20" cy="5.5" r="2.5" strokeWidth={1.5} />
                <circle cx="20" cy="18.5" r="2.5" strokeWidth={1.5} />
                <path strokeLinecap="round" strokeWidth={1.5} d="M7.5 11.2L17.5 6.8M7.5 12.8L17.5 17.2" />
              </svg>
            ) : isSemantic ? (
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25 4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-semibold text-slate-900 text-sm leading-tight truncate">{kb.name}</h3>
              <span className={`flex-shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                isGraph
                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                  : isSemantic
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-indigo-50 text-indigo-700 border border-indigo-100"
              }`}>
                {isGraph ? "Graph" : isSemantic ? "Semantic" : "Basic"}
              </span>
            </div>
            <p className="text-xs text-gray-500 line-clamp-2">{kb.description || "No description"}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
          {isSemantic ? (
            <span className={`flex items-center gap-1 ${kb.schemaTableCount != null ? "text-emerald-600" : "text-gray-400"}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              {kb.schemaTableCount != null ? `${kb.schemaTableCount} tables` : "Not connected"}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              {docs.length} doc{docs.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
            {dateLabel}
          </span>
        </div>

        {/* Document list */}
        {docs.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Documents</p>
            <ul className="space-y-1">
              {docs.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 text-xs text-slate-600 truncate">
                  <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                  </svg>
                  {d.filename}
                </li>
              ))}
              {docs.length > 4 && <li className="text-xs text-gray-400">+{docs.length - 4} more</li>}
            </ul>
          </div>
        )}

        {/* Upload panel */}
        {showUpload && (
          <UploadPanel kb={kb} onDocAdded={() => setRefreshTick((t) => t + 1)} onClose={() => setShowUpload(false)} />
        )}
      </div>

      {/* Actions */}
      <div className="px-5 pb-4 pt-0 flex items-center gap-2">
        {isSemantic ? (
          <button
            onClick={() => onConnect(kb)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            {kb.schemaTableCount != null ? "Reconnect" : "Connect DB"}
          </button>
        ) : (
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Upload
          </button>
        )}

        {isGraph ? (
          <button
            onClick={() => onExploreGraph(kb)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 border border-purple-200 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="2" strokeWidth={2} />
              <circle cx="19" cy="6" r="2" strokeWidth={2} />
              <circle cx="19" cy="18" r="2" strokeWidth={2} />
              <path strokeLinecap="round" strokeWidth={1.5} d="M7 11.5l10-4M7 12.5l10 4" />
            </svg>
            Explore Graph
          </button>
        ) : (
          <button
            onClick={() => onQuery(kb)}
            disabled={isSemantic && kb.schemaTableCount == null}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={isSemantic && kb.schemaTableCount == null ? "Connect a database first" : undefined}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
            </svg>
            Query
          </button>
        )}

        {isGraph && (
          <button
            onClick={() => onQuery(kb)}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors"
            title="Query this knowledge base"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
            </svg>
          </button>
        )}

        {!isGraph && !isSemantic && (
          <button onClick={() => onSettings(kb)}
            className="p-1.5 text-gray-400 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
            title="Retrieval settings">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.11v1.093c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.11v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button onClick={handleConfirmDelete} disabled={deleting}
              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-60">
              {deleting ? "…" : "Confirm"}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              No
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            className="p-1.5 text-gray-400 border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
            title="Delete">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function KnowledgeBases() {
  const [kbs, setKBs] = useState<KB[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [queryTarget, setQueryTarget] = useState<KB | null>(null);
  const [graphTarget, setGraphTarget] = useState<KB | null>(null);
  const [connectTarget, setConnectTarget] = useState<KB | null>(null);
  const [settingsTarget, setSettingsTarget] = useState<KB | null>(null);

  useEffect(() => {
    ragApi.list().then((res) => {
      const data = res.data as {
        id: string; name: string; description: string; kb_type?: string;
        document_count: number; schema_table_count?: number; created_at: string;
        retrieval_strategy?: string; retrieval_top_k?: number; retrieval_threshold?: number;
      }[];
      setKBs(data.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        kb_type: (d.kb_type as "basic" | "graph" | "semantic") || "basic",
        documentCount: d.document_count,
        createdAt: d.created_at,
        schemaTableCount: d.schema_table_count ?? undefined,
        retrievalStrategy: (d.retrieval_strategy as "default" | "mmr" | "hyde") || "default",
        retrievalTopK: d.retrieval_top_k ?? 6,
        retrievalThreshold: d.retrieval_threshold ?? 0.3,
      })));
    }).catch(() => setKBs([]))
      .finally(() => setLoading(false));
  }, []);

  function handleCreate(kb: KB) { setKBs((prev) => [...prev, kb]); setShowCreate(false); }
  function handleDelete(id: string) { setKBs((prev) => prev.filter((kb) => kb.id !== id)); }
  function handleConnected(id: string, tableCount: number) {
    setKBs((prev) => prev.map((k) => k.id === id ? { ...k, schemaTableCount: tableCount } : k));
    setConnectTarget(null);
  }
  function handleSettingsUpdated(id: string, settings: { retrievalStrategy: "default" | "mmr" | "hyde"; retrievalTopK: number; retrievalThreshold: number }) {
    setKBs((prev) => prev.map((k) => k.id === id ? { ...k, ...settings } : k));
    setSettingsTarget(null);
  }

  const graphCount = kbs.filter((k) => k.kb_type === "graph").length;
  const basicCount = kbs.filter((k) => k.kb_type === "basic").length;
  const semanticCount = kbs.filter((k) => k.kb_type === "semantic").length;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Knowledge Bases</h1>
          <p className="text-gray-500 text-sm mt-1">Upload documents and query your data with AI</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Knowledge Base
        </button>
      </div>

      {/* Summary bar */}
      {kbs.length > 0 && (
        <div className="mb-6 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
            {kbs.length} knowledge base{kbs.length !== 1 ? "s" : ""}
          </span>
          {basicCount > 0 && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
              {basicCount} Basic
            </span>
          )}
          {graphCount > 0 && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
              {graphCount} Graph
            </span>
          )}
          {semanticCount > 0 && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              {semanticCount} Semantic
            </span>
          )}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-sm text-gray-400">Loading…</div>
      ) : kbs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25 4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">No knowledge bases yet</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-sm">
            Create a Basic KB for fast vector search, or a Graph KB to extract entity relationships from your documents.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create your first KB
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {kbs.map((kb) => (
            <KBCard
              key={kb.id}
              kb={kb}
              onDelete={handleDelete}
              onQuery={(k) => setQueryTarget(k)}
              onExploreGraph={(k) => setGraphTarget(k)}
              onConnect={(k) => setConnectTarget(k)}
              onSettings={(k) => setSettingsTarget(k)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {queryTarget && <QueryModal kb={queryTarget} onClose={() => setQueryTarget(null)} />}
      {graphTarget && <GraphExplorerModal kb={graphTarget} onClose={() => setGraphTarget(null)} />}
      {connectTarget && (
        <ConnectModal
          kb={connectTarget}
          onClose={() => setConnectTarget(null)}
          onConnected={(count) => handleConnected(connectTarget.id, count)}
        />
      )}
      {settingsTarget && (
        <SettingsModal
          kb={settingsTarget}
          onClose={() => setSettingsTarget(null)}
          onUpdated={(settings) => handleSettingsUpdated(settingsTarget.id, settings)}
        />
      )}
    </div>
  );
}
