import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./store/auth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import WorkflowBuilder from "./pages/WorkflowBuilder";

function Nav() {
  const { logout } = useAuth();
  return (
    <nav className="h-14 bg-gray-900 border-b border-gray-800 flex items-center px-6 gap-6 flex-shrink-0">
      <span className="text-violet-400 font-bold text-lg">AIArchitect</span>
      <Link
        to="/"
        className="text-gray-300 hover:text-white text-sm transition-colors"
      >
        Dashboard
      </Link>
      <Link
        to="/builder"
        className="text-gray-300 hover:text-white text-sm transition-colors"
      >
        Builder
      </Link>
      <button
        onClick={logout}
        className="ml-auto text-gray-400 hover:text-white text-sm transition-colors"
      >
        Logout
      </button>
    </nav>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protected>
              <div className="flex flex-col h-screen">
                <Nav />
                <div className="flex-1 overflow-auto">
                  <Dashboard />
                </div>
              </div>
            </Protected>
          }
        />
        <Route
          path="/builder"
          element={
            <Protected>
              <div className="flex flex-col h-screen">
                <Nav />
                <div className="flex-1 overflow-hidden">
                  <WorkflowBuilder />
                </div>
              </div>
            </Protected>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
