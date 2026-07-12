import { useEffect, useState } from "react";
import { teamApi } from "../api/client";

interface Member {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
];

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

export default function TeamMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("developer");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ email: string; temp_password: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<Member | null>(null);
  const [newRole, setNewRole] = useState("");
  const [changingRole, setChangingRole] = useState(false);

  const [currentUserId] = useState<string>(() => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return "";
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.sub ?? "";
    } catch {
      return "";
    }
  });

  const loadMembers = () => {
    teamApi.list().then((r) => setMembers(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadMembers(); }, []);

  const adminCount = members.filter((m) => m.role === "admin").length;

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await teamApi.invite(inviteEmail.trim(), inviteRole);
      setInviteResult({ email: res.data.email, temp_password: res.data.temp_password });
      setInviteEmail("");
      loadMembers();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to invite member.";
      alert(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await teamApi.remove(removeTarget.id);
      setRemoveTarget(null);
      loadMembers();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to remove member.";
      alert(msg);
    } finally {
      setRemoving(false);
    }
  };

  const handleRoleChange = async () => {
    if (!roleChangeTarget || !newRole) return;
    setChangingRole(true);
    try {
      await teamApi.updateRole(roleChangeTarget.id, newRole);
      setRoleChangeTarget(null);
      loadMembers();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to update role.";
      alert(msg);
    } finally {
      setChangingRole(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  const [copied, setCopied] = useState(false);
  const handleCopyTempPass = (pass: string) => {
    navigator.clipboard.writeText(pass);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Team Members</h1>
          <p className="text-gray-500 text-sm mt-1">Manage who has access to AgentForge</p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setInviteResult(null); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Invite Member
        </button>
      </div>

      {/* Members Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-slate-900">Members</h2>
          <p className="text-xs text-gray-400 mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading...</div>
        ) : members.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">No team members found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left">
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, idx) => {
                  const isSelf = m.id === currentUserId;
                  const isLastAdmin = m.role === "admin" && adminCount === 1;
                  const canRemove = !isSelf && !isLastAdmin;
                  return (
                    <tr key={m.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${idx === members.length - 1 ? "border-b-0" : ""}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ${getAvatarColor(m.full_name)}`}>
                            {m.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {m.full_name}
                              {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                            </p>
                            <p className="text-xs text-gray-400">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <RoleBadge role={m.role} />
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm">{formatDate(m.created_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => { setRoleChangeTarget(m); setNewRole(m.role); }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                          >
                            Change Role
                          </button>
                          <span className="text-gray-200">|</span>
                          <button
                            onClick={() => canRemove && setRemoveTarget(m)}
                            disabled={!canRemove}
                            className={`text-xs font-medium transition-colors ${canRemove ? "text-red-500 hover:text-red-700" : "text-gray-300 cursor-not-allowed"}`}
                            title={isSelf ? "Cannot remove yourself" : isLastAdmin ? "Cannot remove the only admin" : ""}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Invite Member</h2>
              <button onClick={() => { setShowInvite(false); setInviteResult(null); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {inviteResult ? (
              <div>
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4">
                  <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-emerald-800">
                    <strong>{inviteResult.email}</strong> has been added. Share the temporary password below.
                  </p>
                </div>
                <p className="text-xs font-medium text-slate-700 mb-1">Temporary Password</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800">
                    {inviteResult.temp_password}
                  </code>
                  <button
                    onClick={() => handleCopyTempPass(inviteResult.temp_password)}
                    className="flex-shrink-0 px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={() => { setShowInvite(false); setInviteResult(null); }}
                  className="mt-5 w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div className="mb-5">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="admin">Admin</option>
                    <option value="developer">Developer</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowInvite(false)}
                    className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {inviting ? "Sending..." : "Send Invite"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Remove Member</h2>
            <p className="text-sm text-gray-500 mb-5">
              Are you sure you want to remove <strong>{removeTarget.full_name}</strong>? They will lose all access immediately.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveTarget(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {removing ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {roleChangeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Change Role</h2>
            <p className="text-sm text-gray-500 mb-4">
              Update role for <strong>{roleChangeTarget.full_name}</strong>
            </p>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-5"
            >
              <option value="admin">Admin</option>
              <option value="developer">Developer</option>
              <option value="viewer">Viewer</option>
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setRoleChangeTarget(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                disabled={changingRole || newRole === roleChangeTarget.role}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {changingRole ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
