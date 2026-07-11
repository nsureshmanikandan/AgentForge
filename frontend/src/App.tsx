import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./store/auth";
import Login from "./pages/Login";
import Home from "./pages/Home";
import AgentStudio from "./pages/AgentStudio";
import MyProjects from "./pages/MyProjects";
import Usage from "./pages/Usage";
import PromptLibrary from "./pages/PromptLibrary";
import Marketplace from "./pages/Marketplace";
import WorkflowBuilder from "./pages/WorkflowBuilder";
import Dashboard from "./pages/Dashboard";
import CreateAgent from "./pages/CreateAgent";
import Architect from "./pages/Architect";

// ─── Inline SVG Icons ────────────────────────────────────────────────────────

function IconHome() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H15.75v-6h-7.5v6H3.75A.75.75 0 013 21V9.75z" />
    </svg>
  );
}

function IconRobot() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="8" width="18" height="12" rx="2" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 8V4M8 4h8M9 13h.01M15 13h.01M9 17h6" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3s4.5 4.03 4.5 9-2.015 9-4.5 9zM3 12h18" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 13.5l5.5-5.5 4 4 5-6.5M21 21H3" />
    </svg>
  );
}

function IconMonitor() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8M12 17v4" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}

function IconStore() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 2.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
    </svg>
  );
}

function IconArchitect() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function IconLightbulb() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar() {
  const { logout } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? "bg-indigo-50 text-indigo-700 font-medium border-l-2 border-indigo-600 pl-[10px]"
        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`;

  return (
    <aside className="w-64 flex-shrink-0 h-screen bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <IconBolt />
          </div>
          <span className="font-semibold text-slate-900 text-base tracking-tight">AgentForge</span>
        </div>
      </div>

      {/* User org */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2.5">
        <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">N</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-700 truncate">n.sureshmanikandan</p>
          <p className="text-xs text-gray-400 truncate">Accenture Org</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {/* MAIN */}
        <p className="text-xs font-semibold text-gray-400 px-3 pt-1 pb-2 uppercase tracking-wider">Main</p>
        <NavLink to="/" end className={linkClass}>
          <IconHome /> Home
        </NavLink>
        <NavLink to="/studio" className={linkClass}>
          <IconRobot /> Agent Studio
        </NavLink>

        {/* PROJECTS */}
        <p className="text-xs font-semibold text-gray-400 px-3 pt-4 pb-2 uppercase tracking-wider">Projects</p>
        <NavLink to="/projects" className={linkClass}>
          <IconFolder /> My Projects
        </NavLink>
        <NavLink to="/published" className={linkClass}>
          <IconGlobe /> Published Projects
        </NavLink>
        <NavLink to="/shared" className={linkClass}>
          <IconLink /> Shared Projects
        </NavLink>

        {/* TRACEABILITY */}
        <p className="text-xs font-semibold text-gray-400 px-3 pt-4 pb-2 uppercase tracking-wider">Traceability</p>
        <NavLink to="/usage" className={linkClass}>
          <IconChart /> Usage
        </NavLink>
        <NavLink to="/dashboard" className={linkClass}>
          <IconMonitor /> Control Plane
        </NavLink>

        {/* BUILD */}
        <p className="text-xs font-semibold text-gray-400 px-3 pt-4 pb-2 uppercase tracking-wider">Build</p>
        <NavLink to="/architect" className={linkClass}>
          <IconArchitect /> Architect
        </NavLink>

        {/* GET STARTED */}
        <p className="text-xs font-semibold text-gray-400 px-3 pt-4 pb-2 uppercase tracking-wider">Get Started</p>
        <NavLink to="/builder" className={linkClass}>
          <IconWrench /> Visual Builder
        </NavLink>
        <NavLink to="/prompts" className={linkClass}>
          <IconSparkle /> Prompt Library
        </NavLink>
        <NavLink to="/marketplace" className={linkClass}>
          <IconStore /> Marketplace
        </NavLink>
        <NavLink to="/what-to-build" className={linkClass}>
          <IconLightbulb /> What Should I Build
        </NavLink>
      </nav>

      {/* Bottom user + sign out */}
      <div className="px-3 py-3 border-t border-gray-200 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">N</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">My Account</p>
            <p className="text-xs text-gray-400 truncate">n.sureshmanikandan@accenture.com</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <IconLogout /> Sign out
        </button>
      </div>
    </aside>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const fullscreen = location.pathname === "/builder" || location.pathname === "/studio/create" || location.pathname === "/architect";

  return (
    <div className="flex h-screen bg-gray-50">
      {!fullscreen && <Sidebar />}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <Protected>
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/studio" element={<AgentStudio />} />
                  <Route path="/studio/create" element={<CreateAgent />} />
                  <Route path="/projects" element={<MyProjects />} />
                  <Route path="/published" element={<MyProjects />} />
                  <Route path="/shared" element={<MyProjects />} />
                  <Route path="/usage" element={<Usage />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/builder" element={<WorkflowBuilder />} />
                  <Route path="/prompts" element={<PromptLibrary />} />
                  <Route path="/marketplace" element={<Marketplace />} />
                  <Route path="/what-to-build" element={<PromptLibrary />} />
                  <Route path="/architect" element={<Architect />} />
                </Routes>
              </Layout>
            </Protected>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
