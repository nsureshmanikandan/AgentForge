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

export default function Marketplace() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [installedNames, setInstalledNames] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("af_installed_integrations") ?? "[]"); }
    catch { return []; }
  });

  const filteredItems = MARKETPLACE_ITEMS.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === "All" || item.category === selectedCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Marketplace</h1>
          <p className="text-gray-500 text-sm">Browse tool integrations</p>
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

      {/* Not-yet-active notice -- Connect below only toggles a local preview state; it
          does not grant any agent real access to the tool yet. */}
      <div className="flex gap-3 bg-amber-50 border border-amber-100 rounded-xl px-5 py-4 mb-5">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-800">Not yet active</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Connecting a tool here doesn't grant any agent real access yet — this is a preview of what's planned.
          </p>
        </div>
      </div>

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
    </div>
  );
}
