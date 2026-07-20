import { useState } from "react";
import { agentsApi } from "../../api/client";
import { X } from "lucide-react";
import type { NodeUpdateData } from "../canvas/AgentCanvas";

const TOOLS = [
  "email", "slack", "github", "jira",
  "google_drive", "web_search", "calculator",
];

const NODE_ROLES = [
  "input", "classifier", "router", "responder", "guard", "rag", "output", "agent", "condition", "approval", "http_request",
];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

interface Props {
  nodeId: string;
  nodeData?: {
    label?: string; role?: string; description?: string; rule?: string; approver_email?: string;
    url?: string; method?: string; headers?: string; body?: string;
  };
  onUpdate?: (nodeId: string, data: NodeUpdateData) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function AgentConfigPanel({ nodeId, nodeData, onUpdate, onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("local");
  const [tools, setTools] = useState<string[]>([]);
  const [nlPrompt, setNlPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Node config fields (inline canvas editing)
  const [nodeLabel, setNodeLabel] = useState(nodeData?.label ?? "");
  const [nodeRole, setNodeRole] = useState(nodeData?.role ?? "agent");
  const [nodeDesc, setNodeDesc] = useState(nodeData?.description ?? "");
  const [nodeRule, setNodeRule] = useState(nodeData?.rule ?? "");
  const [nodeApproverEmail, setNodeApproverEmail] = useState(nodeData?.approver_email ?? "");
  const [nodeUrl, setNodeUrl] = useState(nodeData?.url ?? "");
  const [nodeMethod, setNodeMethod] = useState(nodeData?.method ?? "GET");
  const [nodeHeaders, setNodeHeaders] = useState(nodeData?.headers ?? "");
  const [nodeBody, setNodeBody] = useState(nodeData?.body ?? "");
  const [nodeUpdated, setNodeUpdated] = useState(false);

  const generateFromNL = async () => {
    if (!nlPrompt.trim()) return;
    setLoading(true);
    try {
      const res = await agentsApi.generateFromPrompt(nlPrompt);
      const config = res.data;
      setName(config.name ?? "");
      setDescription(config.description ?? "");
      setPrompt(config.system_prompt ?? "");
      setModel(config.model ?? "local");
      setTools(config.tools ?? []);
    } catch {
      // generation failed — leave fields as-is
    } finally {
      setLoading(false);
    }
  };

  const saveAgent = async () => {
    if (!name.trim()) return;
    setSaveLoading(true);
    try {
      await agentsApi.create({
        name,
        description,
        system_prompt: prompt,
        model,
        tools,
        guardrails: { pii: true, hallucination: true },
      });
      setSaved(true);
      setTimeout(onSave, 800);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleUpdateNode = () => {
    if (!onUpdate) return;
    onUpdate(nodeId, {
      label: nodeLabel,
      role: nodeRole,
      description: nodeDesc,
      rule: nodeRole === "condition" ? nodeRule : undefined,
      approver_email: nodeRole === "approval" ? nodeApproverEmail : undefined,
      url: nodeRole === "http_request" ? nodeUrl : undefined,
      method: nodeRole === "http_request" ? nodeMethod : undefined,
      headers: nodeRole === "http_request" ? nodeHeaders : undefined,
      body: nodeRole === "http_request" ? nodeBody : undefined,
    });
    setNodeUpdated(true);
    setTimeout(() => setNodeUpdated(false), 1500);
  };

  const toggleTool = (tool: string) =>
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-white font-semibold text-sm">Agent Config</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* ── Node config (inline canvas editing) ── */}
        <div className="bg-gray-800 rounded-lg p-3 space-y-2">
          <p className="text-gray-400 text-xs font-medium mb-1">Node Settings</p>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Label</label>
            <input
              className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="Node label"
              value={nodeLabel}
              onChange={(e) => setNodeLabel(e.target.value)}
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Role</label>
            <select
              className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none"
              value={nodeRole}
              onChange={(e) => setNodeRole(e.target.value)}
            >
              {NODE_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Description</label>
            <textarea
              className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
              rows={2}
              placeholder="What does this node do?"
              value={nodeDesc}
              onChange={(e) => setNodeDesc(e.target.value)}
            />
          </div>

          {nodeRole === "condition" && (
            <div>
              <label className="text-gray-400 text-xs mb-1 block">
                Rule (Python expression over extracted variables)
              </label>
              <input
                className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                placeholder="e.g. days <= 2"
                value={nodeRule}
                onChange={(e) => setNodeRule(e.target.value)}
              />
              <p className="text-gray-500 text-xs mt-1">
                Label the outgoing edges exactly "true" and "false" to define the branches.
              </p>
            </div>
          )}

          {nodeRole === "approval" && (
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Approver email</label>
              <input
                className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                placeholder="manager@company.com"
                value={nodeApproverEmail}
                onChange={(e) => setNodeApproverEmail(e.target.value)}
              />
            </div>
          )}

          {nodeRole === "http_request" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="w-28">
                  <label className="text-gray-400 text-xs mb-1 block">Method</label>
                  <select
                    className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm focus:outline-none"
                    value={nodeMethod}
                    onChange={(e) => setNodeMethod(e.target.value)}
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-gray-400 text-xs mb-1 block">URL</label>
                  <input
                    className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="https://api.example.com/lookup?q={{input}}"
                    value={nodeUrl}
                    onChange={(e) => setNodeUrl(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Headers (JSON, optional)</label>
                <textarea
                  className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                  rows={2}
                  placeholder={'{"Authorization": "Bearer sk-..."}'}
                  value={nodeHeaders}
                  onChange={(e) => setNodeHeaders(e.target.value)}
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Body (optional)</label>
                <textarea
                  className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                  rows={3}
                  placeholder={'{"query": "{{input}}"}'}
                  value={nodeBody}
                  onChange={(e) => setNodeBody(e.target.value)}
                />
              </div>
              <p className="text-gray-500 text-xs">
                Use the literal text <code className="bg-gray-800 px-1 rounded">{"{{input}}"}</code> anywhere in the URL or body to insert the previous node's output. The response body becomes this node's output.
              </p>
            </div>
          )}

          <button
            onClick={handleUpdateNode}
            disabled={!onUpdate}
            className={`w-full py-1.5 rounded text-sm font-medium transition-colors ${
              nodeUpdated
                ? "bg-green-700 text-white"
                : "bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40"
            }`}
          >
            {nodeUpdated ? "Updated!" : "Update Node"}
          </button>
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-gray-700 pt-1">
          <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">Save as Agent</p>
        </div>

        {/* Generate from NL */}
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-gray-400 text-xs mb-2 font-medium">Generate from description</p>
          <textarea
            className="w-full bg-gray-700 text-white text-sm rounded p-2 mb-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
            rows={2}
            placeholder="e.g. Build an HR assistant that answers employee policy questions..."
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
          />
          <button
            onClick={generateFromNL}
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm py-1.5 rounded disabled:opacity-50 transition-colors"
          >
            {loading ? "Generating..." : "Generate with GPT-4o"}
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Agent Name *</label>
          <input
            className="w-full bg-gray-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
            placeholder="e.g. Support Bot"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* System Prompt */}
        <div>
          <label className="text-gray-400 text-xs mb-1 block">System Prompt</label>
          <textarea
            className="w-full bg-gray-800 text-white rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
            rows={4}
            placeholder="You are a helpful assistant..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {/* Model */}
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Model</label>
          <select
            className="w-full bg-gray-800 text-white rounded px-3 py-2 text-sm focus:outline-none"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="local">Local Model</option>
            <option value="azure">Azure GPT-5.4-mini</option>
          </select>
        </div>

        {/* Tools */}
        <div>
          <label className="text-gray-400 text-xs mb-2 block">Tools</label>
          <div className="flex flex-wrap gap-1">
            {TOOLS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTool(t)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  tools.includes(t)
                    ? "bg-violet-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Guardrails — always on */}
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-gray-400 text-xs font-medium mb-2">Guardrails (always active)</p>
          <div className="flex gap-2">
            <span className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded">PII Redaction</span>
            <span className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded">Hallucination Guard</span>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-800">
        {saved ? (
          <div className="w-full bg-green-700 text-white py-2 rounded text-sm text-center">
            Agent saved!
          </div>
        ) : (
          <button
            onClick={saveAgent}
            disabled={saveLoading || !name.trim()}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {saveLoading ? "Saving..." : "Save Agent"}
          </button>
        )}
      </div>
    </div>
  );
}
