import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

const API_BASE = "http://localhost:8000/api";

interface ApprovalInfo {
  run_id: string;
  workflow_id: string;
  paused_at_node_id: string;
  context: string;
  triggered_at: string | null;
}

export default function ApprovalPage() {
  const { runId } = useParams<{ runId: string }>();
  const [info, setInfo] = useState<ApprovalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem("token") || localStorage.getItem("agentforge_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  useEffect(() => {
    if (!runId) return;
    axios
      .get(`${API_BASE}/builder/runs/${runId}/approval-info`, { headers: authHeaders() })
      .then((res) => setInfo(res.data as ApprovalInfo))
      .catch((err) => {
        const msg = axios.isAxiosError(err) ? err.response?.data?.detail || err.message : "Failed to load approval info";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [runId, authHeaders]);

  const handleDecision = async (decision: "approve" | "reject") => {
    if (!runId || acting) return;
    setActing(true);
    try {
      const res = await axios.post(`${API_BASE}/builder/runs/${runId}/${decision}`, {}, { headers: authHeaders() });
      const data = res.data as { status: string; final_output?: string };
      setActionResult(
        decision === "approve"
          ? `Approved. Run status: ${data.status}. Final output: ${data.final_output ?? ""}`
          : `Rejected. Run status: ${data.status}.`
      );
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail || err.message : "Action failed";
      setError(msg);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading approval details…</div>;
  }

  if (error && !actionResult) {
    return <div className="flex items-center justify-center h-full text-red-400">{error}</div>;
  }

  return (
    <div className="flex items-center justify-center h-full bg-gray-950">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4">
        <h1 className="text-white font-semibold text-lg">Workflow Approval</h1>
        {actionResult ? (
          <p className="text-emerald-300 text-sm">{actionResult}</p>
        ) : (
          <>
            <p className="text-gray-400 text-sm">
              Run <span className="text-white font-mono">{info?.run_id}</span> is paused at node{" "}
              <span className="text-white font-mono">{info?.paused_at_node_id}</span>.
            </p>
            <div className="bg-gray-800 rounded-lg p-3 text-gray-300 text-sm whitespace-pre-wrap">
              {info?.context}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => handleDecision("reject")}
                disabled={acting}
                className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Reject
              </button>
              <button
                onClick={() => handleDecision("approve")}
                disabled={acting}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Approve
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
