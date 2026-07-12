import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { agentsApi } from "../api/client";

interface Agent {
  id: string;
  name: string;
  model: string;
  description: string;
  current_version: number;
  tools: string[];
  system_prompt?: string;
}

const AVATAR_COLORS = [
  "bg-teal-500", "bg-indigo-500", "bg-violet-500",
  "bg-blue-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500",
];

function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function RunChatbotModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setMessages((p) => [...p, { role: "user", text }]);
    setRunning(true);
    try {
      const res = await agentsApi.run(agent.id, text);
      setMessages((p) => [...p, { role: "agent", text: res.data.output }]);
    } catch {
      setMessages((p) => [...p, { role: "agent", text: "Error: could not get response." }]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ height: "560px" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-sm ${getAvatarColor(agent.name)}`}>
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">{agent.name}</h3>
              <p className="text-xs text-gray-400">{agent.model}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">Start a conversation with {agent.name}</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-md"
                  : "bg-gray-100 text-gray-800 rounded-bl-md"
              }`}>
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            </div>
          ))}
          {running && (
            <div className="flex justify-start">
              <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              autoFocus
            />
            <button
              onClick={send}
              disabled={!input.trim() || running}
              className="w-10 h-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function downloadAgentCode(agent: Agent) {
  const config = {
    name: agent.name,
    description: agent.description,
    model: agent.model,
    version: agent.current_version,
    tools: agent.tools || [],
    system_prompt: agent.system_prompt || "",
  };

  const readme = `# ${agent.name}

${agent.description || "AI Agent built with AgentForge"}

## Model
${agent.model}

## Tools
${(agent.tools || []).map((t) => `- ${t}`).join("\n") || "No tools configured"}

## System Prompt
\`\`\`
${agent.system_prompt || "(not set)"}
\`\`\`

## Usage

\`\`\`python
from openai import AzureOpenAI
import json

# Load agent config
config = json.load(open("agent_config.json"))

client = AzureOpenAI(
    azure_endpoint="YOUR_AZURE_ENDPOINT",
    api_key="YOUR_API_KEY",
    api_version="2024-02-01",
)

def run_agent(user_input: str) -> str:
    response = client.chat.completions.create(
        model=config["model"],
        messages=[
            {"role": "system", "content": config["system_prompt"]},
            {"role": "user", "content": user_input},
        ],
    )
    return response.choices[0].message.content

# Example
print(run_agent("Hello, how can you help me?"))
\`\`\`
`;

  const files: Record<string, string> = {
    "agent_config.json": JSON.stringify(config, null, 2),
    "README.md": readme,
    "run_agent.py": `import json
from openai import AzureOpenAI

config = json.load(open("agent_config.json"))

client = AzureOpenAI(
    azure_endpoint="YOUR_AZURE_ENDPOINT",
    api_key="YOUR_API_KEY",
    api_version="2024-02-01",
)

def run_agent(user_input: str) -> str:
    response = client.chat.completions.create(
        model=config["model"],
        messages=[
            {"role": "system", "content": config.get("system_prompt", "")},
            {"role": "user", "content": user_input},
        ],
    )
    return response.choices[0].message.content

if __name__ == "__main__":
    while True:
        user_input = input("You: ")
        if user_input.lower() in ("exit", "quit"):
            break
        print(f"Agent: {run_agent(user_input)}")
`,
  };

  // Create a downloadable zip-like text bundle (plain .txt with all files)
  // For a real ZIP we'd need JSZip; here we download agent_config.json as the primary artifact
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${agent.name.replace(/\s+/g, "_")}_config.json`;
  a.click();
  URL.revokeObjectURL(url);

  // Also download README
  const readmeBlob = new Blob([files["README.md"]], { type: "text/markdown" });
  const readmeUrl = URL.createObjectURL(readmeBlob);
  setTimeout(() => {
    const b = document.createElement("a");
    b.href = readmeUrl;
    b.download = `${agent.name.replace(/\s+/g, "_")}_README.md`;
    b.click();
    URL.revokeObjectURL(readmeUrl);
  }, 300);

  // Also download run_agent.py
  const pyBlob = new Blob([files["run_agent.py"]], { type: "text/x-python" });
  const pyUrl = URL.createObjectURL(pyBlob);
  setTimeout(() => {
    const c = document.createElement("a");
    c.href = pyUrl;
    c.download = `${agent.name.replace(/\s+/g, "_")}_run_agent.py`;
    c.click();
    URL.revokeObjectURL(pyUrl);
  }, 600);
}

export default function MyProjects() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<Agent | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    agentsApi.list().then((r) => setAgents(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {runningAgent && (
        <RunChatbotModal agent={runningAgent} onClose={() => setRunningAgent(null)} />
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">My Projects</h1>
          <p className="text-gray-500 text-sm">All your AI agent projects in one place</p>
        </div>
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Project
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center mt-32">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading projects...
          </div>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center mt-20">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium mb-1">No projects yet</p>
          <p className="text-gray-400 text-sm mb-5">Go to Home and describe an agent to get started</p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Create your first agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col">
              {/* Card body */}
              <div className="p-5 flex-1">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0 ${getAvatarColor(agent.name)}`}>
                    {agent.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{agent.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{agent.model}</span>
                      <span className="text-xs text-gray-400">v{agent.current_version}</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                  {agent.description || "No description"}
                </p>
                {agent.tools?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {agent.tools.slice(0, 3).map((t) => (
                      <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">{t}</span>
                    ))}
                    {agent.tools.length > 3 && (
                      <span className="text-xs text-gray-400 px-1">+{agent.tools.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="px-5 pb-5 pt-0">
                <div className="border-t border-gray-100 pt-4 flex items-center gap-2">
                  {/* Open in Studio */}
                  <button
                    onClick={() => navigate(`/studio?id=${agent.id}`)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                    title="Open in Agent Studio"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    Open
                  </button>

                  {/* Download Code */}
                  <button
                    onClick={() => downloadAgentCode(agent)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                    title="Download agent config and starter code"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download
                  </button>

                  {/* Run Chatbot */}
                  <button
                    onClick={() => setRunningAgent(agent)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
                    title="Run chatbot"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    Run
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
