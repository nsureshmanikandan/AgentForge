import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  icon: string;
  label: string;
  path: string;
  desc: string;
}

// ─── Static nav items ─────────────────────────────────────────────────────────

const NAV_ITEMS: SearchResult[] = [
  { icon: "🏠", label: "Home", path: "/", desc: "Go to home" },
  { icon: "🤖", label: "Agent Studio", path: "/studio", desc: "View all agents" },
  { icon: "➕", label: "New Agent", path: "/studio/create", desc: "Create a new agent" },
  { icon: "📁", label: "My Projects", path: "/projects", desc: "Your saved projects" },
  { icon: "📊", label: "Usage", path: "/usage", desc: "Audit logs & metrics" },
  { icon: "🖥️", label: "Control Plane", path: "/dashboard", desc: "Agent health dashboard" },
  { icon: "⚡", label: "Architect", path: "/architect", desc: "AI architecture generator" },
  { icon: "🗄️", label: "Knowledge Bases", path: "/knowledge-bases", desc: "Manage RAG knowledge" },
  { icon: "🔧", label: "Visual Builder", path: "/builder", desc: "Drag-drop workflow builder" },
  { icon: "🛍️", label: "Marketplace", path: "/marketplace", desc: "Browse agents & tools" },
  { icon: "👥", label: "Team Members", path: "/team", desc: "Manage team access" },
  { icon: "🔑", label: "API Keys", path: "/api-keys", desc: "Manage API tokens" },
  { icon: "⚙️", label: "Settings", path: "/settings", desc: "Platform preferences" },
  { icon: "👤", label: "Profile", path: "/profile", desc: "Your account details" },
];

// ─── Helper: load agents from localStorage ────────────────────────────────────

function getAgentResults(): SearchResult[] {
  try {
    const raw = localStorage.getItem("af_agents");
    if (!raw) return [];
    const agents = JSON.parse(raw) as { id: string; name: string; description?: string }[];
    if (!Array.isArray(agents)) return [];
    return agents.map((a) => ({
      icon: "🤖",
      label: a.name,
      path: `/studio?id=${a.id}`,
      desc: a.description ?? "Agent",
    }));
  } catch {
    return [];
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build full results list (nav + agents)
  const allItems: SearchResult[] = [...NAV_ITEMS, ...getAgentResults()];

  const filtered = query.trim()
    ? allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.desc.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus the input after a short delay to ensure the modal is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Clamp activeIndex when filtered list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLDivElement>("[data-active='true']");
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSelect = useCallback(
    (item: SearchResult) => {
      navigate(item.path);
      onClose();
    },
    [navigate, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[activeIndex]) {
          handleSelect(filtered[activeIndex]);
        }
      }
    },
    [filtered, activeIndex, handleSelect, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 mt-[15vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="relative flex items-center border-b border-gray-200">
          <span className="pl-4 text-gray-400 text-lg select-none">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, agents..."
            className="flex-1 px-3 py-3.5 text-base focus:outline-none bg-transparent placeholder-gray-400"
          />
          <span className="mr-4 px-1.5 py-0.5 text-xs text-gray-400 border border-gray-300 rounded font-mono select-none">
            Ctrl+K
          </span>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((item, index) => (
              <div
                key={item.path + item.label}
                data-active={index === activeIndex ? "true" : undefined}
                className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${
                  index === activeIndex ? "bg-indigo-50" : "hover:bg-indigo-50"
                }`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="text-lg w-6 flex-shrink-0 text-center">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-400 truncate">{item.desc}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 flex gap-4 text-xs text-gray-400">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
