import { useState, useEffect, useCallback, type ReactNode } from "react";
import { authApi } from "../api/client";

/* ── JWT decoder (base64url payload only, no verification) ─────────────── */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return {};
  }
}

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
];

function avatarColor(seed: string): string {
  if (!seed) return "bg-gray-400";
  return AVATAR_COLORS[seed.charCodeAt(0) % AVATAR_COLORS.length];
}

function initials(name: string, email: string): string {
  if (name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email ? email[0].toUpperCase() : "?";
}

/* ── Toast ─────────────────────────────────────────────────────────────── */
function Toast({
  message,
  type,
  onDone,
}: {
  message: string;
  type: "success" | "error";
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 text-white text-sm px-4 py-3 rounded-lg shadow-lg ${
        type === "success" ? "bg-slate-900" : "bg-rose-600"
      }`}
    >
      {type === "success" ? (
        <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {message}
    </div>
  );
}

/* ── Section card wrapper ───────────────────────────────────────────────── */
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm p-6 ${className}`}>
      {children}
    </div>
  );
}

/* ── Password input ─────────────────────────────────────────────────────── */
function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
        >
          {show ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Main Profile page ──────────────────────────────────────────────────── */
export default function Profile() {
  // Decode JWT
  const token = localStorage.getItem("token") ?? "";
  const payload = token ? decodeJwtPayload(token) : {};

  const role = (payload.role as string) ?? "member";
  const iat = payload.iat as number | undefined;

  // Profile state — email fetched from /auth/me or cached in localStorage
  const [email, setEmail] = useState(() => localStorage.getItem("af_user_email") ?? "");
  const [name, setName] = useState(() => localStorage.getItem("af_profile_name") ?? "");

  // Fetch real email from backend if not cached
  useEffect(() => {
    if (!email) {
      authApi.me().then((r) => {
        const e = r.data.email as string;
        if (e) { localStorage.setItem("af_user_email", e); setEmail(e); }
      }).catch(() => {});
    }
  }, [email]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
  }, []);

  function saveProfile() {
    localStorage.setItem("af_profile_name", name);
    showToast("Profile saved successfully.");
  }

  async function handleChangePassword() {
    setPwError(null);
    if (!currentPw) { setPwError("Current password is required."); return; }
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setPwError("New passwords do not match."); return; }

    setPwLoading(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      showToast("Password updated successfully.");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPwError(detail ?? "Current password is incorrect.");
    } finally {
      setPwLoading(false);
    }
  }

  const memberSince = iat
    ? new Date(iat * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const orgName = localStorage.getItem("af_org_name") ?? "Accenture Org";
  const displayName = name.trim() || email;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your personal information and account security</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* ── Profile card ── */}
        <Card>
          <div className="flex items-start gap-5 mb-6">
            {/* Avatar */}
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0 ${avatarColor(email)}`}
            >
              {initials(name, email)}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-slate-900 truncate">{displayName}</p>
              <p className="text-sm text-gray-500 truncate">{email}</p>
              <span
                className={`inline-flex items-center mt-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                  role === "admin"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                    : "bg-gray-100 text-gray-600 border-gray-200"
                }`}
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                readOnly
                value={email}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">Email is managed by your identity provider.</p>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={saveProfile}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Save Profile
            </button>
          </div>
        </Card>

        {/* ── Change Password card ── */}
        <Card>
          <h2 className="text-base font-semibold text-slate-900 mb-1">Change Password</h2>
          <p className="text-sm text-gray-500 mb-5">Update your account password.</p>

          <div className="space-y-4">
            <PasswordInput
              label="Current Password"
              value={currentPw}
              onChange={setCurrentPw}
              placeholder="Enter current password"
            />
            <PasswordInput
              label="New Password"
              value={newPw}
              onChange={setNewPw}
              placeholder="Min. 8 characters"
            />
            <PasswordInput
              label="Confirm New Password"
              value={confirmPw}
              onChange={setConfirmPw}
              placeholder="Repeat new password"
            />

            {pwError && (
              <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {pwError}
              </div>
            )}

            <button
              onClick={handleChangePassword}
              disabled={pwLoading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {pwLoading ? "Verifying…" : "Update Password"}
            </button>
          </div>
        </Card>

        {/* ── Account Info card ── */}
        <Card>
          <h2 className="text-base font-semibold text-slate-900 mb-4">Account Info</h2>
          <dl className="divide-y divide-gray-100">
            {[
              { label: "Member Since", value: memberSince },
              { label: "Last Login", value: "This session" },
              { label: "Organization", value: orgName },
              { label: "Role", value: role.charAt(0).toUpperCase() + role.slice(1) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <dt className="text-sm font-medium text-gray-500">{label}</dt>
                <dd className="text-sm text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
