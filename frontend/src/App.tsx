import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "./store/auth";
import Login from "./pages/Login";
import Home from "./pages/Home";
import AgentStudio from "./pages/AgentStudio";
import MyProjects from "./pages/MyProjects";
import Usage from "./pages/Usage";
import PromptLibrary from "./pages/PromptLibrary";
import Blueprints from "./pages/Blueprints";
import Marketplace from "./pages/Marketplace";
import WorkflowBuilder from "./pages/WorkflowBuilder";
import Dashboard from "./pages/Dashboard";
import CreateAgent from "./pages/CreateAgent";
import Architect from "./pages/Architect";
import KnowledgeBases from "./pages/KnowledgeBases";
import ApiKeys from "./pages/ApiKeys";
import TeamMembers from "./pages/TeamMembers";
import Playground from "./pages/Playground";
import AgentVersions from "./pages/AgentVersions";
import Settings from "./pages/Settings";
import WhatShouldIBuild from "./pages/WhatShouldIBuild";
import Profile from "./pages/Profile";
import Safety from "./pages/Safety";
import Evaluations from "./pages/Evaluations";
import VoiceAgents from "./pages/VoiceAgents";
import WorkflowObservability from "./pages/WorkflowObservability";
import GlobalSearch from "./components/GlobalSearch";

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

function IconDatabase() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <ellipse cx="12" cy="5" rx="9" ry="3" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function IconCog() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 3l8 4v5c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V7l8-4z" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function IconMic() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

// ─── Chevron icons ───────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 256;
const SIDEBAR_COLLAPSED = 64;

function Sidebar() {
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("af_sidebar_collapsed") === "true"
  );
  const [width, setWidth] = useState(
    () => parseInt(localStorage.getItem("af_sidebar_width") || String(SIDEBAR_DEFAULT), 10)
  );
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem("af_sidebar_collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "b") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Drag-to-resize handlers
  const onDragStart = (e: React.MouseEvent) => {
    if (collapsed) return;
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW.current + delta));
      setWidth(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth(w => { localStorage.setItem("af_sidebar_width", String(w)); return w; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      collapsed ? "justify-center px-0" : ""
    } ${
      isActive
        ? "bg-indigo-50 text-indigo-700 font-medium border-l-2 border-indigo-600 pl-[10px]"
        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`;

  const asideStyle = collapsed
    ? { width: SIDEBAR_COLLAPSED }
    : { width };

  return (
    <aside
      style={asideStyle}
      className="relative flex-shrink-0 h-screen bg-white border-r border-gray-200 flex flex-col overflow-hidden transition-[width] duration-200"
    >
      {/* Drag handle — only visible when expanded */}
      {!collapsed && (
        <div
          onMouseDown={onDragStart}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-indigo-400 z-10 transition-colors"
          title="Drag to resize"
        />
      )}
      {/* Logo */}
      <div className="px-3 py-4 border-b border-gray-200 flex-shrink-0">
        {collapsed ? (
          /* Collapsed: bolt icon + expand button stacked, fully centered */
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
              <IconBolt />
            </div>
            <button
              onClick={toggle}
              title="Expand sidebar (Ctrl+B)"
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <ChevronRightIcon />
            </button>
          </div>
        ) : (
          /* Expanded: bolt + title + collapse button in a row */
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
              <IconBolt />
            </div>
            <span className="font-semibold text-slate-900 text-base tracking-tight whitespace-nowrap">AgentForge</span>
            <button
              onClick={toggle}
              title="Collapse sidebar (Ctrl+B)"
              className="ml-auto p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <ChevronLeftIcon />
            </button>
          </div>
        )}
      </div>

      {/* User org */}
      <div className={`${collapsed ? "px-2 justify-center" : "px-5"} py-3 border-b border-gray-200 flex items-center gap-2.5 flex-shrink-0`}>
        <div
          className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          title={collapsed ? "n.sureshmanikandan — Accenture Org" : undefined}
        >N</div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">n.sureshmanikandan</p>
            <p className="text-xs text-gray-400 truncate">Accenture Org</p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* MAIN */}
        {!collapsed && <p className="text-xs font-semibold text-gray-400 px-3 pt-1 pb-2 uppercase tracking-wider">Main</p>}
        {collapsed && <div className="pt-1 pb-2" />}
        <NavLink to="/" end className={linkClass} title={collapsed ? "Home" : undefined}>
          <IconHome />{!collapsed && "Home"}
        </NavLink>
        <NavLink to="/studio" className={linkClass} title={collapsed ? "Agent Studio" : undefined}>
          <IconRobot />{!collapsed && "Agent Studio"}
        </NavLink>

        {/* PROJECTS */}
        {!collapsed && <p className="text-xs font-semibold text-gray-400 px-3 pt-4 pb-2 uppercase tracking-wider">Projects</p>}
        {collapsed && <div className="pt-3" />}
        <NavLink to="/projects" className={linkClass} title={collapsed ? "My Projects" : undefined}>
          <IconFolder />{!collapsed && "My Projects"}
        </NavLink>
        <NavLink to="/published" className={linkClass} title={collapsed ? "Published Projects" : undefined}>
          <IconGlobe />{!collapsed && "Published Projects"}
        </NavLink>
        <NavLink to="/shared" className={linkClass} title={collapsed ? "Shared Projects" : undefined}>
          <IconLink />{!collapsed && "Shared Projects"}
        </NavLink>

        {/* TRACEABILITY */}
        {!collapsed && <p className="text-xs font-semibold text-gray-400 px-3 pt-4 pb-2 uppercase tracking-wider">Traceability</p>}
        {collapsed && <div className="pt-3" />}
        <NavLink to="/usage" className={linkClass} title={collapsed ? "Usage" : undefined}>
          <IconChart />{!collapsed && "Usage"}
        </NavLink>
        <NavLink to="/dashboard" className={linkClass} title={collapsed ? "Control Plane" : undefined}>
          <IconMonitor />{!collapsed && "Control Plane"}
        </NavLink>
        <NavLink to="/workflow-runs" className={linkClass} title={collapsed ? "Workflow Runs" : undefined}>
          <IconChart />{!collapsed && "Workflow Runs"}
        </NavLink>

        {/* BUILD */}
        {!collapsed && <p className="text-xs font-semibold text-gray-400 px-3 pt-4 pb-2 uppercase tracking-wider">Build</p>}
        {collapsed && <div className="pt-3" />}
        <NavLink to="/architect" className={linkClass} title={collapsed ? "Architect" : undefined}>
          <IconArchitect />{!collapsed && "Architect"}
        </NavLink>
        <NavLink to="/knowledge-bases" className={linkClass} title={collapsed ? "Knowledge Bases" : undefined}>
          <IconDatabase />{!collapsed && "Knowledge Bases"}
        </NavLink>

        {/* GET STARTED */}
        {!collapsed && <p className="text-xs font-semibold text-gray-400 px-3 pt-4 pb-2 uppercase tracking-wider">Get Started</p>}
        {collapsed && <div className="pt-3" />}
        <NavLink to="/builder" className={linkClass} title={collapsed ? "Visual Builder" : undefined}>
          <IconWrench />{!collapsed && "Visual Builder"}
        </NavLink>
        <NavLink to="/prompts" className={linkClass} title={collapsed ? "Prompt Library" : undefined}>
          <IconSparkle />{!collapsed && "Prompt Library"}
        </NavLink>
        <NavLink to="/blueprints" className={linkClass} title={collapsed ? "Blueprints" : undefined}>
          <IconArchitect />{!collapsed && "Blueprints"}
        </NavLink>
        <NavLink to="/marketplace" className={linkClass} title={collapsed ? "Marketplace" : undefined}>
          <IconStore />{!collapsed && "Marketplace"}
        </NavLink>
        <NavLink to="/what-to-build" className={linkClass} title={collapsed ? "What Should I Build" : undefined}>
          <IconLightbulb />{!collapsed && "What Should I Build"}
        </NavLink>

        {/* ORGANIZATION */}
        {!collapsed && <p className="text-xs font-semibold text-gray-400 px-3 pt-4 pb-2 uppercase tracking-wider">Organization</p>}
        {collapsed && <div className="pt-3" />}
        <NavLink to="/team" className={linkClass} title={collapsed ? "Team Members" : undefined}>
          <IconUsers />{!collapsed && "Team Members"}
        </NavLink>
        <NavLink to="/api-keys" className={linkClass} title={collapsed ? "API Keys" : undefined}>
          <IconKey />{!collapsed && "API Keys"}
        </NavLink>
        <NavLink to="/safety" className={linkClass} title={collapsed ? "Safety & Guardrails" : undefined}>
          <IconShield />{!collapsed && "Safety & Guardrails"}
        </NavLink>
        <NavLink to="/evaluations" className={linkClass} title={collapsed ? "Evaluations" : undefined}>
          <IconClipboard />{!collapsed && "Evaluations"}
        </NavLink>
        <NavLink to="/voice" className={linkClass} title={collapsed ? "Voice Agents" : undefined}>
          <IconMic />{!collapsed && "Voice Agents"}
        </NavLink>
        <NavLink to="/settings" className={linkClass} title={collapsed ? "Settings" : undefined}>
          <IconCog />{!collapsed && "Settings"}
        </NavLink>
      </nav>

      {/* Bottom profile + sign out */}
      <div className="px-3 py-3 border-t border-gray-200 space-y-1 flex-shrink-0">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              collapsed ? "justify-center px-0" : ""
            } ${
              isActive ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50"
            }`
          }
          title={collapsed ? "My Profile" : undefined}
        >
          <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">N</div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">My Profile</p>
              <p className="text-xs text-gray-400 truncate">n.sureshmanikandan@accenture.com</p>
            </div>
          )}
        </NavLink>
        <button
          onClick={logout}
          className={`flex items-center gap-3 px-3 py-2 w-full text-left text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors ${collapsed ? "justify-center px-0" : ""}`}
          title={collapsed ? "Sign out" : undefined}
        >
          <IconLogout />{!collapsed && "Sign out"}
        </button>
      </div>
    </aside>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  const fullscreen =
    location.pathname === "/studio/create" ||
    location.pathname === "/architect" ||
    location.pathname.startsWith("/playground/");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      {!fullscreen && <Sidebar />}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
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
                  <Route path="/workflow-runs" element={<WorkflowObservability />} />
                  <Route path="/builder" element={<WorkflowBuilder />} />
                  <Route path="/prompts" element={<PromptLibrary />} />
                  <Route path="/blueprints" element={<Blueprints />} />
                  <Route path="/marketplace" element={<Marketplace />} />
                  <Route path="/what-to-build" element={<WhatShouldIBuild />} />
                  <Route path="/architect" element={<Architect />} />
                  <Route path="/knowledge-bases" element={<KnowledgeBases />} />
                  <Route path="/api-keys" element={<ApiKeys />} />
                  <Route path="/team" element={<TeamMembers />} />
                  <Route path="/playground/:agentId" element={<Playground />} />
                  <Route path="/versions/:agentId" element={<AgentVersions />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/safety" element={<Safety />} />
                  <Route path="/evaluations" element={<Evaluations />} />
                  <Route path="/voice" element={<VoiceAgents />} />
                </Routes>
              </Layout>
            </Protected>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
