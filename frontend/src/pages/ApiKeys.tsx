import { useEffect, useState } from "react";
import { apiKeysApi } from "../api/client";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

function CopyBox({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 break-all">
        {label ?? value}
      </code>
      <button
        onClick={handleCopy}
        className="flex-shrink-0 px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadKeys = () => {
    apiKeysApi.list().then((r) => setKeys(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadKeys(); }, []);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await apiKeysApi.create(newKeyName.trim());
      setCreatedToken(res.data.token);
      setNewKeyName("");
      loadKeys();
    } catch {
      alert("Failed to create API key.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiKeysApi.delete(revokeTarget.id);
      setRevokeTarget(null);
      loadKeys();
    } catch {
      alert("Failed to revoke key.");
    } finally {
      setRevoking(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">API Keys</h1>
          <p className="text-gray-500 text-sm mt-1">Generate tokens to access your agents programmatically</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreatedToken(null); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Generate New Key
        </button>
      </div>

      {/* Keys Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-slate-900">Your API Keys</h2>
          <p className="text-xs text-gray-400 mt-0.5">{keys.length} key{keys.length !== 1 ? "s" : ""}</p>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm font-medium">No API keys yet</p>
            <p className="text-gray-400 text-xs mt-1">Generate your first key to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prefix</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Used</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key, idx) => (
                  <tr key={key.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${idx === keys.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-6 py-4 font-medium text-slate-900">{key.name}</td>
                    <td className="px-6 py-4">
                      <code className="bg-gray-100 border border-gray-200 rounded px-2 py-0.5 text-xs font-mono text-slate-700">
                        {key.key_prefix}••••••••
                      </code>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm">{formatDate(key.created_at)}</td>
                    <td className="px-6 py-4 text-gray-500 text-sm">
                      {key.last_used_at ? formatDate(key.last_used_at) : <span className="text-gray-300">Never</span>}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setRevokeTarget(key)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Code Example */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Usage Example</h2>
        <p className="text-xs text-gray-400 mb-4">Use the Bearer token in your Authorization header</p>
        <CopyBox
          value={`curl -H "Authorization: Bearer YOUR_KEY" http://localhost:8000/api/agents/{id}/run`}
        />
      </div>

      {/* Create Key Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Generate API Key</h2>
              <button onClick={() => { setShowCreate(false); setCreatedToken(null); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createdToken ? (
              <div>
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-sm text-amber-800">
                    <strong>Save this now</strong> — it won't be shown again.
                  </p>
                </div>
                <CopyBox value={createdToken} />
                <button
                  onClick={() => { setShowCreate(false); setCreatedToken(null); }}
                  className="mt-5 w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="e.g. Production, CI/CD"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating || !newKeyName.trim()}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Revoke API Key</h2>
            <p className="text-sm text-gray-500 mb-5">
              Are you sure you want to revoke <strong>{revokeTarget.name}</strong>? Any applications using this key will stop working immediately.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRevokeTarget(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {revoking ? "Revoking..." : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
