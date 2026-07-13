import { useState } from "react";
import { useAuth } from "../store/auth";
import { authApi } from "../api/client";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      localStorage.setItem("af_user_email", email);
      login(res.data.access_token);
      navigate("/");
    } catch (err: unknown) {
      const e = err as { code?: string; response?: { status?: number } };
      if (e?.code === "ERR_NETWORK" || e?.code === "ERR_CONNECTION_REFUSED") {
        setError("Cannot reach server — make sure the backend is running on port 8000.");
      } else if (e?.response?.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await authApi.register(email, password, fullName);
      const res = await authApi.login(email, password);
      localStorage.setItem("af_user_email", email);
      login(res.data.access_token);
      navigate("/");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ? `Registration failed: ${detail}` : "Registration failed. Try a different email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AF</span>
          </div>
          <span className="font-bold text-gray-900">AgentForge</span>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-1">
          {tab === "login" ? "Welcome back" : "Create account"}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {tab === "login" ? "Sign in to your workspace" : "Start building AI agents"}
        </p>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5">
          <button
            onClick={() => { setTab("login"); setError(""); }}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "login" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab("register"); setError(""); }}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "register" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            <p className="text-red-600 text-sm font-medium">{error}</p>
            {error.includes("Invalid") && (
              <p className="text-red-400 text-xs mt-0.5">Default: admin@example.com / admin123</p>
            )}
          </div>
        )}

        {tab === "register" && (
          <input
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 mb-3 text-sm outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}
        <input
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 mb-3 text-sm outline-none focus:ring-2 focus:ring-teal-500"
          placeholder="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 mb-5 text-sm outline-none focus:ring-2 focus:ring-teal-500"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (tab === "login" ? handleLogin() : handleRegister())}
        />
        <button
          onClick={tab === "login" ? handleLogin : handleRegister}
          disabled={loading}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {loading && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {loading ? (tab === "login" ? "Signing in..." : "Creating account...") : (tab === "login" ? "Sign In" : "Create Account")}
        </button>
      </div>
    </div>
  );
}
