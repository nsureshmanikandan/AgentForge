import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { agentsApi } from "../api/client";

// ─── Output format auto-detection ────────────────────────────────────────────
type OutputToggles = { example_text: boolean; structured_json: boolean; image_output: boolean; file_output: boolean };

function detectOutputFormats(role: string, goal: string, instructions: string): Partial<OutputToggles> {
  const text = `${role} ${goal} ${instructions}`.toLowerCase();

  const result: Partial<OutputToggles> = {};

  // Structured JSON: data extraction, reports, schemas, APIs, forms, analytics, tables, structured
  if (/\b(json|structured|schema|data extract|report|analytics|dashboard|table|spreadsheet|csv|database|api response|form data|invoice|receipt|parse|extract)\b/.test(text)) {
    result.structured_json = true;
  }

  // File output: documents, PDFs, exports, downloads, generate files
  if (/\b(pdf|docx|word document|excel|ppt|powerpoint|file|download|export|generate report|produce|create document|attachment|spreadsheet)\b/.test(text)) {
    result.file_output = true;
  }

  // Image output: charts, diagrams, visuals, image generation, visualization
  if (/\b(image|chart|diagram|graph|visual|infographic|picture|photo|screenshot|render|draw|illustrat|design|figure|plot)\b/.test(text)) {
    result.image_output = true;
  }

  // Example text: conversational, QA, support, chat, explain, answer, summarize
  if (/\b(example|sample|conversation|chat|q&a|qa|support|explain|answer|summarize|help|assist|respond|reply|faq|tutorial|guide)\b/.test(text)) {
    result.example_text = true;
  }

  return result;
}

const TOUR_STEPS = [
  { title: "Agent Builder has been revamped", body: "We've redesigned the Agent Builder experience to make agent creation more intuitive, guided, and organized.", step: 1 },
  { title: "Define Your Agent", body: "Provide your agent's role, goal, and instructions here.", step: 2 },
  { title: "Models Have Moved Here", body: "Choose and configure the model powering your agent from this section.", step: 3 },
  { title: "Output Settings Are Grouped Together", body: "Output configurations are now organized in one place.", step: 4 },
  { title: "Features Are Organized Here", body: "Memory, Data Query, Responsible AI, and other capabilities are now grouped together.", step: 5 },
];

const MODELS = ["gpt-4o", "gpt-4-5", "gpt-4o-mini"];

// ─── Memory providers ───────────────────────────────────────────────────────
const MEMORY_PROVIDERS = [
  { id: "langmem",    label: "LangMem",             tag: "Default",  tagColor: "bg-emerald-100 text-emerald-700", desc: "LangGraph-native long-term memory with semantic search" },
  { id: "mem0",       label: "Mem0",                tag: "BYOK",     tagColor: "bg-purple-100 text-purple-700",  desc: "Personalised memory layer — bring your own API key" },
  { id: "zep",        label: "Zep Memory",          tag: "OSS",      tagColor: "bg-blue-100 text-blue-700",     desc: "Open-source temporal knowledge graph memory" },
  { id: "memgpt",     label: "MemGPT / Letta",      tag: "OSS",      tagColor: "bg-blue-100 text-blue-700",     desc: "Stateful agents with OS-inspired memory management" },
  { id: "chromadb",   label: "ChromaDB Memory",     tag: "OSS",      tagColor: "bg-blue-100 text-blue-700",     desc: "Self-hosted vector store for contextual recall" },
  { id: "supermemory",label: "SuperMemory",         tag: "BYOK",     tagColor: "bg-purple-100 text-purple-700", desc: "Universal memory API across conversations" },
];

// ─── Responsible AI policies ─────────────────────────────────────────────────
const AI_POLICIES = [
  { id: "pii",         label: "PII Redaction",        desc: "Automatically detect and redact personally identifiable information from inputs and outputs." },
  { id: "hallucination", label: "Hallucination Guard", desc: "Flag or block responses that appear factually unsupported by the provided context." },
  { id: "toxicity",    label: "Toxicity Filter",       desc: "Block harmful, offensive, or unsafe content in agent responses." },
  { id: "bias",        label: "Bias Detection",        desc: "Identify and reduce demographic or ideological bias in generated outputs." },
  { id: "fairness",    label: "Fairness Check",        desc: "Ensure equal treatment across protected attributes in agent decisions." },
];

type FeaturePanel = "memory" | "data_query" | "responsible_ai" | null;

// ─── Configure Memory Panel ───────────────────────────────────────────────────
function MemoryPanel({
  config,
  onChange,
  onClose,
}: {
  config: { provider: string; crossSession: boolean; extractionInstructions: string };
  onChange: (c: typeof config) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState(config);
  const [providerOpen, setProviderOpen] = useState(false);
  const selected = MEMORY_PROVIDERS.find((p) => p.id === local.provider) ?? MEMORY_PROVIDERS[0];

  return (
    <div className="absolute inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-2xl z-30 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900">Configure Memory</h3>
          <p className="text-xs text-gray-400 mt-0.5">Retain context across agent sessions using a memory provider.</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Provider selector */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Memory Provider</label>
          <div className="relative">
            <button
              onClick={() => setProviderOpen(!providerOpen)}
              className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-4 py-2.5 text-sm hover:border-gray-300 bg-white"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">{selected.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selected.tagColor}`}>{selected.tag}</span>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${providerOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {providerOpen && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {MEMORY_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setLocal({ ...local, provider: p.id }); setProviderOpen(false); }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 text-left transition-colors ${local.provider === p.id ? "bg-gray-50" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{p.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.tagColor}`}>{p.tag}</span>
                    </div>
                    {local.provider === p.id && (
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">{selected.desc}</p>
        </div>

        {/* Cross Session */}
        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Cross Session</p>
            <p className="text-xs text-gray-400 mt-0.5">Retain context across user sessions.</p>
          </div>
          <button
            onClick={() => setLocal({ ...local, crossSession: !local.crossSession })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${local.crossSession ? "bg-teal-500" : "bg-gray-300"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${local.crossSession ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* Extraction Instructions */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Extraction Instructions</label>
          <p className="text-xs text-gray-400 mb-2">Custom instructions layered on top of the default extraction prompt.</p>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            placeholder="e.g. Focus on extracting product names, issue categories, and user sentiment."
            rows={4}
            maxLength={2000}
            value={local.extractionInstructions}
            onChange={(e) => setLocal({ ...local, extractionInstructions: e.target.value })}
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{local.extractionInstructions.length}/2000</p>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
        <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        <button onClick={() => { onChange(local); onClose(); }} className="flex-1 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700">Save</button>
      </div>
    </div>
  );
}

// ─── Configure Data Query Panel ───────────────────────────────────────────────
function DataQueryPanel({
  config,
  onChange,
  onClose,
}: {
  config: { semanticModel: string; maxTries: number; timeLimit: number; autoTrain: boolean };
  onChange: (c: typeof config) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState(config);

  return (
    <div className="absolute inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-2xl z-30 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900">Configure Data Query</h3>
          <p className="text-xs text-gray-400 mt-0.5">Answers questions instantly by querying and reading data from your data source.</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Semantic Data Model */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
            Semantic Data Model <span className="text-red-400">*</span>
          </label>
          <p className="text-xs text-gray-400 mb-2">Select a semantic data model to query.</p>
          <div className="flex gap-2">
            <select
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              value={local.semanticModel}
              onChange={(e) => setLocal({ ...local, semanticModel: e.target.value })}
            >
              <option value="">No models available</option>
              <option value="sales_db">Sales Database</option>
              <option value="hr_db">HR Database</option>
              <option value="custom">Custom Model</option>
            </select>
            <button className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <button className="text-xs text-teal-600 hover:underline mt-1.5">Create New ↗</button>
        </div>

        {/* Max tries + Time limit */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
              Max tries <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">Maximum retry attempts.</p>
            <input
              type="number"
              min={1}
              max={10}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-teal-500"
              value={local.maxTries}
              onChange={(e) => setLocal({ ...local, maxTries: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
              Time limit (s) <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">Generation time limit.</p>
            <input
              type="number"
              min={5}
              max={300}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-teal-500"
              value={local.timeLimit}
              onChange={(e) => setLocal({ ...local, timeLimit: parseInt(e.target.value) || 60 })}
            />
          </div>
        </div>

        {/* Auto train */}
        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Auto train agent</p>
            <p className="text-xs text-gray-400 mt-0.5">Add generated queries to a vector store for future reference.</p>
          </div>
          <button
            onClick={() => setLocal({ ...local, autoTrain: !local.autoTrain })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${local.autoTrain ? "bg-teal-500" : "bg-gray-300"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${local.autoTrain ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
        <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        <button
          onClick={() => { onChange(local); onClose(); }}
          disabled={!local.semanticModel}
          className="flex-1 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Responsible AI Panel ─────────────────────────────────────────────────────
function ResponsibleAIPanel({
  config,
  onChange,
  onClose,
}: {
  config: { enabledPolicies: string[] };
  onChange: (c: typeof config) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState(config);

  const toggle = (id: string) =>
    setLocal((prev) => ({
      enabledPolicies: prev.enabledPolicies.includes(id)
        ? prev.enabledPolicies.filter((x) => x !== id)
        : [...prev.enabledPolicies, id],
    }));

  return (
    <div className="absolute inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-2xl z-30 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900">Responsible AI</h3>
          <p className="text-xs text-gray-400 mt-0.5">Enable safety and governance policies for this agent.</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {local.enabledPolicies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No Policies Enabled</p>
            <p className="text-xs text-gray-400">Enable a policy below to add governance to this agent.</p>
          </div>
        ) : (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <p className="text-xs font-medium text-emerald-700">{local.enabledPolicies.length} polic{local.enabledPolicies.length === 1 ? "y" : "ies"} active</p>
          </div>
        )}

        <div className="space-y-3 mt-2">
          {AI_POLICIES.map((policy) => {
            const active = local.enabledPolicies.includes(policy.id);
            return (
              <div
                key={policy.id}
                className={`border rounded-xl p-4 cursor-pointer transition-colors ${active ? "border-teal-400 bg-teal-50" : "border-gray-200 hover:border-gray-300"}`}
                onClick={() => toggle(policy.id)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-800">{policy.label}</span>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${active ? "border-teal-500 bg-teal-500" : "border-gray-300"}`}>
                    {active && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{policy.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
        <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        <button onClick={() => { onChange(local); onClose(); }} className="flex-1 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700">Save</button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CreateAgent() {
  const navigate = useNavigate();
  const [tourStep, setTourStep] = useState(1);
  const [showTour, setShowTour] = useState(true);

  // Left panel
  const [role, setRole] = useState("");
  const [goal, setGoal] = useState("");
  const [instructions, setInstructions] = useState("");
  const [agentName, setAgentName] = useState("My AI Agent");

  // Right panel
  const [model, setModel] = useState("gpt-4o");
  const [outputFormatOpen, setOutputFormatOpen] = useState(true);
  const [outputToggles, setOutputToggles] = useState<OutputToggles>({
    example_text: false,
    structured_json: false,
    image_output: false,
    file_output: false,
  });
  // Tracks which toggles were set by auto-detection (shown with "Auto" badge)
  const [autoDetected, setAutoDetected] = useState<Partial<OutputToggles>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);

  // Feature configs
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>(["memory"]);
  const [activePanel, setActivePanel] = useState<FeaturePanel>(null);
  const [memoryConfig, setMemoryConfig] = useState({ provider: "langmem", crossSession: false, extractionInstructions: "" });
  const [dataQueryConfig, setDataQueryConfig] = useState({ semanticModel: "", maxTries: 3, timeLimit: 60, autoTrain: false });
  const [responsibleAIConfig, setResponsibleAIConfig] = useState({ enabledPolicies: ["pii", "hallucination"] });

  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  const tour = TOUR_STEPS[tourStep - 1];

  // Auto-detect output formats from prompt text with 600ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const detected = detectOutputFormats(role, goal, instructions);
      if (Object.keys(detected).length > 0) {
        setAutoDetected(detected);
        setOutputToggles((prev) => {
          const next = { ...prev };
          (Object.keys(detected) as (keyof OutputToggles)[]).forEach((k) => {
            // Only auto-enable; never auto-disable a toggle the user already set
            if (detected[k]) next[k] = true;
          });
          return next;
        });
        setOutputFormatOpen(true);
      }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [role, goal, instructions]);

  const handleGenerate = async () => {
    if (!role && !goal) return;
    setGenerating(true);
    try {
      const desc = `Role: ${role}. Goal: ${goal}`;
      const res = await agentsApi.generateFromPrompt(desc);
      const cfg = res.data;
      if (cfg.instructions) setInstructions(cfg.instructions);
      if (cfg.name) setAgentName(cfg.name);
      // Immediately re-detect now that instructions are populated
      const detected = detectOutputFormats(role, goal, cfg.instructions ?? instructions);
      if (Object.keys(detected).length > 0) {
        setAutoDetected(detected);
        setOutputToggles((prev) => {
          const next = { ...prev };
          (Object.keys(detected) as (keyof OutputToggles)[]).forEach((k) => { if (detected[k]) next[k] = true; });
          return next;
        });
        setOutputFormatOpen(true);
      }
    } catch { /* ignore */ } finally {
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
        guardrails: {
          pii: responsibleAIConfig.enabledPolicies.includes("pii"),
          hallucination: responsibleAIConfig.enabledPolicies.includes("hallucination"),
        },
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

  const FEATURES = [
    {
      id: "memory",
      name: "Memory",
      desc: `${MEMORY_PROVIDERS.find((p) => p.id === memoryConfig.provider)?.label ?? "LangMem"} · ${memoryConfig.crossSession ? "Cross-session on" : "Session-scoped"}`,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      id: "data_query",
      name: "Data Query",
      desc: dataQueryConfig.semanticModel ? `Model: ${dataQueryConfig.semanticModel}` : "Answers questions by querying your data source.",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      ),
    },
    {
      id: "responsible_ai",
      name: "Responsible AI",
      desc: responsibleAIConfig.enabledPolicies.length > 0
        ? `${responsibleAIConfig.enabledPolicies.length} polic${responsibleAIConfig.enabledPolicies.length === 1 ? "y" : "ies"} active`
        : "No policies enabled — click Configure.",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 z-10">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => navigate("/studio")} className="hover:text-gray-800">Agents</button>
          <span>›</span>
          <span className="text-gray-800 font-medium truncate max-w-40">{agentName}</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
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
          <div className="px-6 pt-5 pb-2">
            <input
              className="text-lg font-semibold text-gray-900 outline-none border-b border-transparent hover:border-gray-200 focus:border-teal-500 pb-0.5 w-full"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />
          </div>

          <div className="px-6 pb-4 flex-1">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gray-800">Tell your agent how to behave</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  ✨ {generating ? "Generating..." : "Generate"}
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-purple-600 hover:bg-purple-50">
                  🔮 Improve
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="e.g., Customer Support Agent, Research Assistant"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Goal</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="e.g., Answer customer questions, summarize documents"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>

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

            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Managerial Agent</span>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">+ Agent</button>
                  <button className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">+ A2A</button>
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
              <select className="flex-1 text-sm font-medium text-gray-800 outline-none bg-transparent" value={model} onChange={(e) => setModel(e.target.value)}>
                {MODELS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Output Format */}
          <div className={`border-b border-gray-100 ${tourStep === 4 && showTour ? "ring-2 ring-teal-400 ring-inset" : ""}`}>
            <button
              onClick={() => setOutputFormatOpen(!outputFormatOpen)}
              className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span>Output Format</span>
                {Object.keys(autoDetected).length > 0 && (
                  <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">Auto</span>
                )}
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${outputFormatOpen ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {outputFormatOpen && (
              <div className="px-4 pb-4">
                {Object.keys(autoDetected).length > 0 && (
                  <div className="flex items-center justify-between mb-3 px-1">
                    <p className="text-xs text-teal-600 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Auto-detected from your prompt
                    </p>
                    <button
                      onClick={() => {
                        setAutoDetected({});
                        setOutputToggles({ example_text: false, structured_json: false, image_output: false, file_output: false });
                      }}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                )}
                <div className="space-y-3">
                  {([
                    { key: "example_text",    label: "Example (Text)",          desc: "Provide examples of how users might interact with the agent" },
                    { key: "structured_json", label: "Structured output (JSON)", desc: "Define the format for the agent's responses using JSON schema" },
                    { key: "image_output",    label: "Image as Output",          desc: "Enable image output format with provider selection" },
                    { key: "file_output",     label: "File as Output",           desc: "Enable File as Output so your agent can share results as downloadable Docx, PDFs, CSVs or PPTs" },
                  ] as { key: keyof OutputToggles; label: string; desc: string }[]).map(({ key, label, desc }) => (
                    <div
                      key={key}
                      className={`flex items-start justify-between gap-3 py-2 px-3 rounded-xl transition-colors ${
                        outputToggles[key]
                          ? autoDetected[key]
                            ? "bg-teal-50 border border-teal-200"
                            : "bg-gray-50 border border-gray-200"
                          : "border border-transparent"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-800 leading-snug">{label}</p>
                          {autoDetected[key] && outputToggles[key] && (
                            <span className="text-xs bg-teal-100 text-teal-600 px-1.5 py-0.5 rounded-full font-medium">Auto</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                      <button
                        onClick={() => {
                          setOutputToggles((t) => ({ ...t, [key]: !t[key] }));
                          // Manually toggling removes the auto badge for that key
                          if (autoDetected[key]) setAutoDetected((a) => { const n = { ...a }; delete n[key]; return n; });
                        }}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 mt-0.5 items-center rounded-full transition-colors ${
                          outputToggles[key] ? "bg-teal-500" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            outputToggles[key] ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Knowledge */}
          <div className="border-b border-gray-100">
            <button onClick={() => setKnowledgeOpen(!knowledgeOpen)} className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50">
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
            <button onClick={() => setToolsOpen(!toolsOpen)} className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50">
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
            <button onClick={() => setSkillsOpen(!skillsOpen)} className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50">
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
            <button onClick={() => setAutomationOpen(!automationOpen)} className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50">
              <span>Automation</span>
              <div className="flex gap-2">
                <span className="text-xs text-teal-600">+ Schedule</span>
                <span className="text-xs text-teal-600">+ Trigger</span>
              </div>
            </button>
            {automationOpen && <div className="px-4 pb-4 text-sm text-gray-400">No automations configured</div>}
          </div>

          {/* Features */}
          <div className={`p-4 ${tourStep === 5 && showTour ? "ring-2 ring-teal-400 ring-inset" : ""}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">Features</span>
                <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">{enabledFeatures.length}</span>
              </div>
              <button className="text-xs text-teal-600 hover:underline">View All →</button>
            </div>
            <div className="space-y-2">
              {FEATURES.map((f) => {
                const enabled = enabledFeatures.includes(f.id);
                return (
                  <div key={f.id} className={`border rounded-xl p-3 transition-colors ${enabled ? "border-teal-400 bg-teal-50" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={enabled ? "text-teal-600" : "text-gray-400"}>{f.icon}</span>
                        <span className="text-sm font-medium text-gray-800">{f.name}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{f.desc}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleFeature(f.id)}
                        className={`text-xs font-medium transition-colors ${enabled ? "text-teal-600" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        {enabled ? "✓ Added" : "+ Add"}
                      </button>
                      {enabled && (
                        <button
                          onClick={() => setActivePanel(f.id as FeaturePanel)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium ml-auto flex items-center gap-1"
                        >
                          Configure
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Configure slide-in panels ── */}
        {activePanel === "memory" && (
          <MemoryPanel config={memoryConfig} onChange={setMemoryConfig} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "data_query" && (
          <DataQueryPanel config={dataQueryConfig} onChange={setDataQueryConfig} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "responsible_ai" && (
          <ResponsibleAIPanel config={responsibleAIConfig} onChange={setResponsibleAIConfig} onClose={() => setActivePanel(null)} />
        )}

        {/* Onboarding Tour Overlay */}
        {showTour && (
          <>
            <div className="absolute inset-0 bg-black/20 pointer-events-none z-10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl p-6 w-96 z-20">
              <button onClick={() => setShowTour(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg">×</button>
              <h3 className="font-semibold text-gray-900 mb-2">{tour.title}</h3>
              <p className="text-sm text-gray-500 mb-6">{tour.body}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{tour.step} of {TOUR_STEPS.length}</span>
                <div className="flex gap-2">
                  {tourStep > 1 && (
                    <button onClick={() => setTourStep(tourStep - 1)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Back</button>
                  )}
                  {tourStep < TOUR_STEPS.length ? (
                    <button onClick={() => setTourStep(tourStep + 1)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-700">Next</button>
                  ) : (
                    <button onClick={() => setShowTour(false)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-700">Done</button>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 mt-4 justify-center">
                {TOUR_STEPS.map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i + 1 === tourStep ? "bg-gray-900" : "bg-gray-200"}`} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
