import { useState } from "react";
import { useAuth } from "../store/auth";
import { authApi } from "../api/client";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await authApi.login(email, password);
      login(res.data.access_token);
      navigate("/");
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-96">
        <h1 className="text-2xl font-bold text-white mb-2">AIArchitect</h1>
        <p className="text-gray-400 text-sm mb-6">Enterprise AI Agent Builder</p>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        <input
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 mb-3 outline-none focus:ring-2 focus:ring-violet-500"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 mb-6 outline-none focus:ring-2 focus:ring-violet-500"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
        <button
          onClick={handleLogin}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 font-semibold transition-colors"
        >
          Sign In
        </button>
      </div>
    </div>
  );
}
