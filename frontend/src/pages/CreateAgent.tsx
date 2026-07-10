import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { agentsApi } from "../api/client";

const TOUR_STEPS = [
  { title: "Agent Builder has been revamped", body: "We've redesigned the Agent Builder experience to make agent creation more intuitive, guided, and organized.", step: 1 },
  { title: "Define Your Agent", body: "Provide your agent's role, goal, and instructions here.", step: 2 },
  { title: "Models Have Moved Here", body: "Choose and configure the model powering your agent from this section.", step: 3 },
  { title: "Output Settings Are Grouped Together", body: "Output configurations are now organized in one place.", step: 4 },
  { title: "Features Are Organized Here", body: "Memory, Data query, Responsible AI, and other capabilities are now grouped together.", step: 5 },
];

const MODELS = ["gpt-4o", "gpt-4-5", "gpt-4o-mini"];
const FEATURES = [
  { id: "memory", name: "Memory", desc: "Retains contextual memory. Applicable...", icon: "🧠" },
  { id: "data_query", name: "Data Query", desc: "Answers questions instantly by querying...", icon: "📊" },
  { id: "responsible_ai", name: "Responsible AI", desc: "Analyze and ensure safety, fairness, and...", icon: "🛡️" },
];

export default function CreateAgent() {
  const navigate = useNavigate();
  const [tourStep, setTourStep] = useState(1);
  const [showTour, setShowTour] = useState(true);

  // Left panel state
  const [role, setRole] = useState("");
  const [goal, setGoal] = useState("");
  const [instructions, setInstructions] = useState("");
  const [agentName, setAgentName] = useState("My AI Agent");

  // Right panel state
  const [model, setModel] = useState("gpt-4o");
  const [outputFormat, setOutputFormat] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>(["memory"]);

  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  const tour = TOUR_STEPS[tourStep - 1];

  const handleGenerate = async () => {
    if (!role && !goal) return;
    setGenerating(true);
    try {
      const desc = `Role: ${role}. Goal: ${goal}`;
      const res = await agentsApi.generateFromPrompt(desc);
      const cfg = res.data;
      if (cfg.instructions) setInstructions(cfg.instructions);
      if (cfg.name) setAgentName(cfg.name);
    } catch {
      /* ignore */
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    if (!agentName.trim()) return;
    setCreating(true);
    try {
      const systemPrompt = [
        role && `Role: ${role}`,
        goal && `Goal: ${goal}`,
        instructions && `Instructions: ${instructions}`,
      ].filter(Boolean).join("\n");

      await agentsApi.create({
        name: agentName,
        description: goal || role || agentName,
        model,
        system_prompt: systemPrompt || `You are ${agentName}, a helpful AI assistant.`,
        tools: [],
        guardrails: { pii: true, hallucination: true },
      });
      navigate("/studio");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(msg ? `Failed to create agent: ${msg}` : "Failed to create agent. Is the backend running?");
    } finally {
      setCreating(false);
    }
  };

  const toggleFeature = (id: string) => {
    setEnabledFeatures((f) => f.includes(id) ? f.filter((x) => x !== id) : [...f, id]);
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => navigate("/studio")} className="hover:text-gray-800">Agents</button>
          <span>›</span>
          <span className="text-gray-800 font-medium truncate max-w-40">{agentName}</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-gray-400 hover:text-gray-600">⚙️</button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Panel */}
        <div className="flex-1 flex flex-col border-r border-gray-100 overflow-y-auto">
          {/* Agent name editable */}
          <div className="px-6 pt-5 pb-2">
            <input
              className="text-lg font-semibold text-gray-900 outline-none border-b border-transparent hover:border-gray-200 focus:border-teal-500 pb-0.5 w-full"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />
          </div>

          <div className="px-6 pb-4 flex-1">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gray-800">Tell your agent how to behave</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span>✨</span> {generating ? "Generating..." : "Generate"}
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-purple-600 hover:bg-purple-50">
                  <span>🔮</span> Improve
                </button>
              </div>
            </div>

            {/* Role */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="e.g., Customer Support Agent, Research Assistant"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>

            {/* Goal */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Goal</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="e.g., Answer customer questions, summarize documents"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>

            {/* Instructions */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Instructions</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                placeholder={"Write instructions in plain English. Example: 'You are a helpful customer support agent. Answer questions politely using our FAQ docs.' Use @ to mention other agents."}
                rows={8}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            <p className="text-xs text-gray-400 mb-6">Use @ to mention other agents</p>

            {/* Managerial Agent Section */}
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Managerial Agent</span>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                    + Agent
                  </button>
                  <button className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                    + A2A
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Add worker agents under this manager or connect Agent-to-Agent (A2A) flows</p>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-80 flex-shrink-0 overflow-y-auto">
          {/* Model */}
          <div className={`border-b border-gray-100 p-4 ${tourStep === 3 && showTour ? "ring-2 ring-teal-400 ring-inset" : ""}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-800">Model</span>
              <button className="text-gray-400 hover:text-gray-600 text-xs">⇄</button>
            </div>
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-sm">🤖</span>
              <span className="text-xs text-gray-500">Azure OpenAI /</span>
              <select
                className="flex-1 text-sm font-medium text-gray-800 outline-none bg-transparent"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {MODELS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Output Format */}
          <div className={`border-b border-gray-100 ${tourStep === 4 && showTour ? "ring-2 ring-teal-400 ring-inset" : ""}`}>
            <button
              onClick={() => setOutputFormat(!outputFormat)}
              className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <span>Output Format</span>
              <span className="text-gray-400">{outputFormat ? "›" : "›"}</span>
            </button>
            {outputFormat && (
              <div className="px-4 pb-4 space-y-2">
                {["Plain text", "Markdown", "JSON", "Structured"].map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="radio" name="output" className="accent-teal-600" /> {f}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Knowledge */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => setKnowledgeOpen(!knowledgeOpen)}
              className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <span>Knowledge</span>
              <span className="text-gray-400 text-lg">{knowledgeOpen ? "−" : "+"}</span>
            </button>
            {knowledgeOpen && (
              <div className="px-4 pb-4">
                <button className="w-full border border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors">
                  + Upload document or connect KB
                </button>
              </div>
            )}
          </div>

          {/* Tools */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <span>Tools</span>
              <span className="text-gray-400 text-lg">{toolsOpen ? "−" : "+"}</span>
            </button>
            {toolsOpen && (
              <div className="px-4 pb-4 space-y-2">
                {["calculator", "web_search", "email_sender", "slack_notifier", "github_reader"].map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" className="accent-teal-600" /> {t}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Skills */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => setSkillsOpen(!skillsOpen)}
              className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <span>Skills</span>
              <span className="text-gray-400 text-lg">{skillsOpen ? "−" : "+"}</span>
            </button>
            {skillsOpen && (
              <div className="px-4 pb-4 space-y-2">
                {["Summarization", "Translation", "Code Generation", "Data Analysis"].map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" className="accent-teal-600" /> {s}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Automation */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => setAutomationOpen(!automationOpen)}
              className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <span>Automation</span>
              <div className="flex gap-2">
                <span className="text-xs text-teal-600 hover:underline">+ Schedule</span>
                <span className="text-xs text-teal-600 hover:underline">+ Trigger</span>
              </div>
            </button>
            {automationOpen && (
              <div className="px-4 pb-4 text-sm text-gray-400">
                No automations configured
              </div>
            )}
          </div>

          {/* Features */}
          <div className={`p-4 ${tourStep === 5 && showTour ? "ring-2 ring-teal-400 ring-inset" : ""}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">Features</span>
                <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                  {enabledFeatures.length}
                </span>
              </div>
              <button className="text-xs text-teal-600 hover:underline">View All →</button>
            </div>
            <div className="space-y-2">
              {FEATURES.map((f) => (
                <div
                  key={f.id}
                  className={`border rounded-xl p-3 cursor-pointer transition-colors ${
                    enabledFeatures.includes(f.id)
                      ? "border-teal-400 bg-teal-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => toggleFeature(f.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{f.icon}</span>
                    <span className="text-sm font-medium text-gray-800">{f.name}</span>
                  </div>
                  <p className="text-xs text-gray-400">{f.desc}</p>
                  <button className="text-xs text-teal-600 mt-1">
                    {enabledFeatures.includes(f.id) ? "✓ Added" : "+ Add"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Onboarding Tour Overlay */}
        {showTour && (
          <>
            <div className="absolute inset-0 bg-black/20 pointer-events-none z-10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl p-6 w-96 z-20">
              <button
                onClick={() => setShowTour(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
              <h3 className="font-semibold text-gray-900 mb-2">{tour.title}</h3>
              <p className="text-sm text-gray-500 mb-6">{tour.body}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{tour.step} of {TOUR_STEPS.length}</span>
                <div className="flex gap-2">
                  {tourStep > 1 && (
                    <button
                      onClick={() => setTourStep(tourStep - 1)}
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Back
                    </button>
                  )}
                  {tourStep < TOUR_STEPS.length ? (
                    <button
                      onClick={() => setTourStep(tourStep + 1)}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-700"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowTour(false)}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-700"
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
              {/* Step dots */}
              <div className="flex gap-1.5 mt-4 justify-center">
                {TOUR_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${i + 1 === tourStep ? "bg-gray-900" : "bg-gray-200"}`}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
