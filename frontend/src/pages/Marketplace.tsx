import { useState } from "react";

const MARKETPLACE_ITEMS = [
  { name: "Gmail Integration", category: "Communication", description: "Send, read and draft emails using Gmail API", icon: "M", installs: 1240, color: "bg-red-100 text-red-700" },
  { name: "Slack Notifications", category: "Communication", description: "Post messages and alerts to Slack channels", icon: "#", installs: 980, color: "bg-purple-100 text-purple-700" },
  { name: "GitHub Connector", category: "Engineering", description: "Read PRs, issues and trigger workflows on GitHub", icon: "G", installs: 870, color: "bg-gray-100 text-gray-700" },
  { name: "Notion Database", category: "Productivity", description: "Read and write to Notion pages and databases", icon: "N", installs: 760, color: "bg-gray-100 text-gray-700" },
  { name: "Jira Ticketing", category: "Engineering", description: "Create, update and query Jira issues", icon: "J", installs: 650, color: "bg-blue-100 text-blue-700" },
  { name: "Salesforce CRM", category: "Sales", description: "Access contacts, leads and opportunities in Salesforce", icon: "S", installs: 540, color: "bg-sky-100 text-sky-700" },
  { name: "HubSpot CRM", category: "Sales", description: "Manage contacts, deals and pipelines in HubSpot", icon: "H", installs: 430, color: "bg-orange-100 text-orange-700" },
  { name: "SharePoint Docs", category: "Documents", description: "Read and index SharePoint documents for RAG", icon: "SP", installs: 390, color: "bg-teal-100 text-teal-700" },
  { name: "MS Teams", category: "Communication", description: "Send messages and create meetings in Teams", icon: "T", installs: 320, color: "bg-indigo-100 text-indigo-700" },
];

const CATEGORIES = ["All", "Communication", "Engineering", "Productivity", "Sales", "Documents"];

interface PublishedAgent {
  id: string;
  name: string;
  model: string;
  description: string;
  category: string;
  tags: string[];
  pricing: "free" | "paid";
  publishedAt: number;
}

export default function Marketplace() {
  const [activeTab, setActiveTab] = useState<"integrations" | "published">("integrations");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [installedNames, setInstalledNames] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("af_installed_integrations") ?? "[]"); }
    catch { return []; }
  });
  const [publishedAgents] = useState<PublishedAgent[]>(() => {
    try { return JSON.parse(localStorage.getItem("af_marketplace_agents") ?? "[]"); }
    catch { return []; }
  });
  const [installedAgentIds, setInstalledAgentIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("af_installed_agents") ?? "[]"); }
    catch { return []; }
  });

  const filteredItems = MARKETPLACE_ITEMS.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === "All" || item.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const filteredPublished = publishedAgents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Marketplace</h1>
          <p className="text-gray-500 text-sm">Browse tool integrations and published agents</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="outline-none text-sm bg-transparent w-48 text-gray-700 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5">
        {([
          { id: "integrations", label: `Tool Integrations (${MARKETPLACE_ITEMS.length})` },
          { id: "published", label: `Published Agents (${publishedAgents.length})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.id
                ? "bg-indigo-600 text-white"
                : "text-gray-500 hover:text-gray-700 hover:bg-white border border-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "integrations" && (
        <>
          {/* Category filter */}
          <div className="flex flex-wrap gap-2 mb-5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCategory(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedCategory === c
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <div key={item.name} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${item.color}`}>
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    <span className="text-xs text-gray-400">{item.category}</span>
                  </div>
                  <span className="text-xs text-gray-400">{item.installs.toLocaleString()} installs</span>
                </div>
                <p className="text-sm text-gray-500 mb-4">{item.description}</p>
                <button
                  onClick={() => {
                    const newInstalled = installedNames.includes(item.name)
                      ? installedNames.filter((n) => n !== item.name)
                      : [...installedNames, item.name];
                    setInstalledNames(newInstalled);
                    localStorage.setItem("af_installed_integrations", JSON.stringify(newInstalled));
                  }}
                  className={`w-full py-2 text-sm rounded-lg transition-colors ${
                    installedNames.includes(item.name)
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                      : "border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-teal-300"
                  }`}
                >
                  {installedNames.includes(item.name) ? "✓ Connected" : "Connect"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === "published" && (
        <div>
          {filteredPublished.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253M3 12a8.954 8.954 0 01.284-2.253" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-600 mb-1">No published agents yet</p>
              <p className="text-xs text-gray-400 max-w-xs leading-relaxed">Go to Agent Studio and click "Publish" on an agent to share it here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredPublished.map((agent) => (
                <div key={agent.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-sm">
                      {agent.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-400">{agent.category}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          agent.pricing === "free"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}>
                          {agent.pricing === "free" ? "Free" : "Paid"}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{agent.model}</span>
                  </div>
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{agent.description}</p>
                  {agent.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {agent.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2 py-0.5">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{new Date(agent.publishedAt).toLocaleDateString()}</span>
                    <button
                      onClick={() => {
                        const newIds = installedAgentIds.includes(agent.id)
                          ? installedAgentIds.filter((id) => id !== agent.id)
                          : [...installedAgentIds, agent.id];
                        setInstalledAgentIds(newIds);
                        localStorage.setItem("af_installed_agents", JSON.stringify(newIds));
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        installedAgentIds.includes(agent.id)
                          ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                          : "bg-indigo-600 hover:bg-indigo-700 text-white"
                      }`}
                    >
                      {installedAgentIds.includes(agent.id) ? "✓ Installed" : "Install"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
