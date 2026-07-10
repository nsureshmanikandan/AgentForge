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

export default function Marketplace() {
  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Marketplace</h1>
      <p className="text-gray-500 text-sm mb-6">Browse and connect tool integrations for your agents</p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {MARKETPLACE_ITEMS.map((item) => (
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
            <button className="w-full py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 hover:border-teal-300 transition-colors">
              Connect
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
