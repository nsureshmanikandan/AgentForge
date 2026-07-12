import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { agentsApi, ragApi } from "../api/client";
import type { PromptVersion, PromptChangeType } from "../components/PromptEvolution";
import { detectChangeType, PromptEvolutionSection, buildRepairEntry } from "../components/PromptEvolution";

const CA_HISTORY_KEY = "agentforge_create_agent_history";

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
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("id");

  const [loadingAgent, setLoadingAgent] = useState(!!editId);

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

  // Advanced model settings
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [showAdvancedModel, setShowAdvancedModel] = useState(false);

  // JSON schema editor
  const [jsonSchema, setJsonSchema] = useState('{\n  "type": "object",\n  "properties": {\n    "result": { "type": "string" }\n  }\n}');

  // Image output provider
  const [imageProvider, setImageProvider] = useState<"dalle3" | "stable-diffusion">("dalle3");

  // File output formats
  const [fileFormats, setFileFormats] = useState<{ docx: boolean; pdf: boolean; csv: boolean; ppt: boolean }>({ docx: true, pdf: false, csv: false, ppt: false });

  // Managerial agent state
  const [managerialAgents, setManagerialAgents] = useState<{ id: string; name: string; type: "agent" | "a2a" }[]>([]);
  const [managerialModalOpen, setManagerialModalOpen] = useState(false);
  const [managerialModalType, setManagerialModalType] = useState<"agent" | "a2a">("agent");
  const [newAgentName, setNewAgentName] = useState("");

  // Automation
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState({ enabled: false, cron: "0 9 * * 1-5", timezone: "UTC", description: "Weekdays at 9am" });
  const [triggerConfig, setTriggerConfig] = useState({ enabled: false, event: "webhook", endpoint: "" });

  // Knowledge base files
  const [kbFiles, setKbFiles] = useState<{name: string; size: string; status: "uploading"|"done"|"error"; kbId?: string}[]>([]);
  const [kbId, setKbId] = useState<string | null>(null);

  // Tools
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  // Skills
  const [skillsSearch, setSkillsSearch] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Prompt evolution tracking
  const [promptHistory, setPromptHistory] = useState<PromptVersion[]>(() => {
    try { return JSON.parse(localStorage.getItem(CA_HISTORY_KEY) ?? "[]"); } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(CA_HISTORY_KEY, JSON.stringify(promptHistory)); } catch { /* full */ }
  }, [promptHistory]);

  // Load existing agent when in edit mode
  useEffect(() => {
    if (!editId) return;
    agentsApi.get(editId).then((res) => {
      const agent = res.data;
      if (agent.name) setAgentName(agent.name);
      if (agent.model) setModel(agent.model);
      if (agent.tools) setSelectedTools(agent.tools);
      if (agent.temperature != null) setTemperature(agent.temperature);

      // Parse system_prompt into role/goal/instructions
      if (agent.system_prompt) {
        const sp: string = agent.system_prompt;
        const roleMatch = sp.match(/^Role:\s*(.+?)(?=\nGoal:|\nInstructions:|$)/ms);
        const goalMatch = sp.match(/^Goal:\s*(.+?)(?=\nRole:|\nInstructions:|$)/ms);
        const instrMatch = sp.match(/^Instructions:\s*([\s\S]+?)(?=\nRole:|\nGoal:|$)/ms);

        if (roleMatch || goalMatch || instrMatch) {
          if (roleMatch) setRole(roleMatch[1].trim());
          if (goalMatch) setGoal(goalMatch[1].trim());
          if (instrMatch) setInstructions(instrMatch[1].trim());
        } else {
          // Couldn't parse structured format — put full text in instructions
          setInstructions(sp);
        }
      }
    }).catch(() => {
      // If fetch fails, continue with empty form in "edit" mode
    }).finally(() => {
      setLoadingAgent(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

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

  // ── Shared prompt evolution recorder with self-healing ──────────────────────
  const recordPromptChange = (
    userInput: string,
    generatedInstructions: string,
    changeType: PromptChangeType,
  ) => {
    const changeSummary = generatedInstructions.split(/[.\n]/)[0]?.trim().slice(0, 120) ?? userInput.slice(0, 80);

    setPromptHistory((prev) => {
      // Dedup guard: skip if last entry has the same userInput
      if (prev[prev.length - 1]?.userInput?.trim() === userInput.trim()) return prev;

      if (prev.length === 0) {
        // v1: original prompt — locked forever
        return [{
          version: 1, ts: Date.now(), changeType: "initial",
          userInput, enhancedPrompt: generatedInstructions,
          changeLabel: "v1 · Initial generation", changeSummary,
        }];
      }
      const lastVer = prev[prev.length - 1].version;
      return [...prev, {
        version: lastVer + 1, ts: Date.now(), changeType,
        userInput, enhancedPrompt: "",
        changeSummary,
        changeLabel: `Change ${lastVer} · ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}`,
      }];
    });

    // ── Self-correction verifier (50ms) ───────────────────────────────────────
    // If the setPromptHistory above was somehow a no-op (edge case),
    // the verifier reads the committed state and inserts the missing entry.
    const capturedInput = userInput;
    const capturedSummary = changeSummary;
    const capturedType = changeType;
    setTimeout(() => {
      setPromptHistory((latest) => {
        // If last entry already matches this input, it was written correctly — skip
        if (latest[latest.length - 1]?.userInput?.trim() === capturedInput.trim()) return latest;
        // Also skip if any entry already has this input (avoid duplicates)
        if (latest.some((v) => v.userInput?.trim() === capturedInput.trim())) return latest;
        // Self-heal: the write was dropped — insert the repair entry
        return [...latest, buildRepairEntry(latest, capturedInput, capturedSummary, capturedType)];
      });
    }, 50);
  };

  const handleGenerate = async () => {
    if (!role && !goal) return;
    setGenerating(true);
    try {
      const desc = `Role: ${role}. Goal: ${goal}`;
      const res = await agentsApi.generateFromPrompt(desc);
      const cfg = res.data;
      if (cfg.instructions) setInstructions(cfg.instructions);
      if (cfg.name) setAgentName(cfg.name);
      // Record prompt evolution
      const userInput = `Role: ${role}${goal ? `\nGoal: ${goal}` : ""}`;
      const changeType: PromptChangeType = promptHistory.length === 0 ? "initial" : "enhance";
      recordPromptChange(userInput, cfg.instructions ?? "", changeType);
      // Immediately re-detect output formats
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

  const handleImprove = async () => {
    if (!instructions.trim()) return;
    setGenerating(true);
    try {
      const desc = `Role: ${role}. Goal: ${goal}. Current instructions: ${instructions}\n\nImprove these instructions to be clearer, more specific, and more effective.`;
      const res = await agentsApi.generateFromPrompt(desc);
      const cfg = res.data;
      if (cfg.instructions) setInstructions(cfg.instructions);
      const userInput = `Improve: ${instructions.slice(0, 80)}${instructions.length > 80 ? "…" : ""}`;
      recordPromptChange(userInput, cfg.instructions ?? instructions, "enhance");
    } catch { /* ignore */ } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!agentName.trim()) return;
    setCreating(true);
    try {
      const systemPrompt = [
        role && `Role: ${role}`,
        goal && `Goal: ${goal}`,
        instructions && `Instructions: ${instructions}`,
      ].filter(Boolean).join("\n");

      const payload = {
        name: agentName,
        description: goal || instructions || role || agentName,
        model,
        system_prompt: systemPrompt || `You are ${agentName}, a helpful AI assistant.`,
        tools: [...selectedTools, ...selectedSkills],
        guardrails: {
          pii: responsibleAIConfig.enabledPolicies.includes("pii"),
          hallucination: responsibleAIConfig.enabledPolicies.includes("hallucination"),
        },
        temperature,
        top_p: topP,
      };

      if (editId) {
        await agentsApi.update(editId, payload);
        navigate(`/studio?id=${editId}`);
      } else {
        await agentsApi.create({
          ...payload,
          knowledge_base_id: kbId ?? undefined,
          memory_config: enabledFeatures.includes("memory") ? memoryConfig : undefined,
          schedule: scheduleConfig.enabled ? scheduleConfig : undefined,
        });
        navigate("/studio");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const action = editId ? "update" : "create";
      alert(msg ? `Failed to ${action} agent: ${msg}` : `Failed to ${action} agent. Is the backend running?`);
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

  if (loadingAgent) {
    return (
      <div className="flex flex-col h-screen bg-white items-center justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400 mt-3">Loading agent...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 z-10">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => navigate("/studio")} className="hover:text-gray-800">Agents</button>
          <span>›</span>
          <span className="text-gray-800 font-medium truncate max-w-40">{agentName}</span>
          {editId && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Edit</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={handleSubmit}
            disabled={creating}
            className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {creating ? (editId ? "Saving..." : "Creating...") : (editId ? "Save Changes" : "Create")}
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
                <button
                  onClick={handleImprove}
                  disabled={generating || !instructions.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-purple-600 hover:bg-purple-50 disabled:opacity-40"
                >
                  🔮 {generating ? "Improving..." : "Improve"}
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

            <p className="text-xs text-gray-400 mb-3">Use @ to mention other agents</p>

            {/* Prompt Evolution — shows once Generate/Improve has been used */}
            {promptHistory.length > 0 && (
              <div className="mb-6">
                <PromptEvolutionSection history={promptHistory} sectionTitle="Prompt Evolution" />
              </div>
            )}

            <div className="border border-gray-200 rounded-xl p-4 relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Managerial Agent</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setManagerialModalType("agent"); setManagerialModalOpen(true); setNewAgentName(""); }}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                  >+ Agent</button>
                  <button
                    onClick={() => { setManagerialModalType("a2a"); setManagerialModalOpen(true); setNewAgentName(""); }}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                  >+ A2A</button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-3">Add worker agents under this manager or connect Agent-to-Agent (A2A) flows</p>
              {managerialAgents.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {managerialAgents.map((a) => (
                    <span key={a.id} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${
                      a.type === "a2a"
                        ? "bg-violet-50 border-violet-200 text-violet-700"
                        : "bg-teal-50 border-teal-200 text-teal-700"
                    }`}>
                      {a.type === "a2a" ? "⇄" : "🤖"} {a.name}
                      <button
                        onClick={() => setManagerialAgents((p) => p.filter((x) => x.id !== a.id))}
                        className="ml-0.5 opacity-60 hover:opacity-100"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Managerial modal */}
              {managerialModalOpen && (
                <div className="absolute left-0 right-0 top-0 z-20 bg-white border border-gray-200 rounded-xl shadow-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-800">
                      {managerialModalType === "a2a" ? "Connect A2A Flow" : "Add Worker Agent"}
                    </p>
                    <button onClick={() => setManagerialModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                  </div>
                  <label className="block text-xs text-gray-500 mb-1">Agent name</label>
                  <input
                    autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-teal-500 mb-3"
                    placeholder={managerialModalType === "a2a" ? "e.g. EmailAgent" : "e.g. ResearchAgent"}
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newAgentName.trim()) {
                        setManagerialAgents((p) => [...p, { id: crypto.randomUUID(), name: newAgentName.trim(), type: managerialModalType }]);
                        setManagerialModalOpen(false);
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setManagerialModalOpen(false)}
                      className="flex-1 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                    >Cancel</button>
                    <button
                      disabled={!newAgentName.trim()}
                      onClick={() => {
                        if (!newAgentName.trim()) return;
                        setManagerialAgents((p) => [...p, { id: crypto.randomUUID(), name: newAgentName.trim(), type: managerialModalType }]);
                        setManagerialModalOpen(false);
                      }}
                      className="flex-1 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 text-white rounded-lg text-xs font-medium"
                    >Add</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-80 flex-shrink-0 overflow-y-auto">
          {/* Model */}
          <div className={`border-b border-gray-100 p-4 ${tourStep === 3 && showTour ? "ring-2 ring-teal-400 ring-inset" : ""}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-800">Model</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowAdvancedModel(!showAdvancedModel)} className="text-xs text-gray-400 hover:text-teal-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                  Advanced
                </button>
                <button className="text-gray-400 hover:text-gray-600 text-xs">⇄</button>
              </div>
            </div>
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 mb-3">
              <span className="text-sm">🤖</span>
              <span className="text-xs text-gray-500">Azure OpenAI /</span>
              <select className="flex-1 text-sm font-medium text-gray-800 outline-none bg-transparent" value={model} onChange={(e) => setModel(e.target.value)}>
                {MODELS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            {showAdvancedModel && (
              <div className="space-y-4 bg-gray-50 rounded-xl p-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-600">Temperature</label>
                    <span className="text-xs font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">{temperature.toFixed(1)}</span>
                  </div>
                  <input type="range" min="0" max="2" step="0.1" value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-teal-500 h-1.5 rounded-full" />
                  <div className="flex justify-between text-xs text-gray-300 mt-0.5"><span>Precise</span><span>Creative</span></div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-600">Top P</label>
                    <span className="text-xs font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">{topP.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={topP}
                    onChange={(e) => setTopP(parseFloat(e.target.value))}
                    className="w-full accent-teal-500 h-1.5 rounded-full" />
                  <div className="flex justify-between text-xs text-gray-300 mt-0.5"><span>0.0</span><span>1.0</span></div>
                </div>
              </div>
            )}
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
                    <div key={key}>
                      <div
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
                      {key === "structured_json" && outputToggles.structured_json && (
                        <div className="mt-2 px-1">
                          <p className="text-xs font-medium text-gray-600 mb-1">JSON Schema</p>
                          <textarea
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 outline-none focus:ring-1 focus:ring-teal-500 resize-none bg-gray-50"
                            rows={5}
                            value={jsonSchema}
                            onChange={(e) => setJsonSchema(e.target.value)}
                            spellCheck={false}
                          />
                        </div>
                      )}
                      {key === "image_output" && outputToggles.image_output && (
                        <div className="mt-2 px-1">
                          <p className="text-xs font-medium text-gray-600 mb-1.5">Image Provider</p>
                          <div className="flex gap-2">
                            {([
                              { id: "dalle3", label: "DALL·E 3" },
                              { id: "stable-diffusion", label: "Stable Diffusion" },
                            ] as const).map((p) => (
                              <button
                                key={p.id}
                                onClick={() => setImageProvider(p.id)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                  imageProvider === p.id
                                    ? "bg-teal-50 border-teal-400 text-teal-700"
                                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {key === "file_output" && outputToggles.file_output && (
                        <div className="mt-2 px-1">
                          <p className="text-xs font-medium text-gray-600 mb-1.5">Output Formats</p>
                          <div className="flex flex-wrap gap-2">
                            {(["docx", "pdf", "csv", "ppt"] as const).map((fmt) => (
                              <label key={fmt} className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={fileFormats[fmt]}
                                  onChange={(e) => setFileFormats((f) => ({ ...f, [fmt]: e.target.checked }))}
                                  className="accent-teal-500 w-3.5 h-3.5"
                                />
                                <span className="text-xs font-medium text-gray-600 uppercase">{fmt}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
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
              <div className="px-4 pb-4 space-y-2">
                {kbFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{f.name}</p>
                      <p className="text-xs text-gray-400">{f.size}</p>
                    </div>
                    {f.status === "uploading" && <div className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />}
                    {f.status === "done" && <span className="text-xs text-emerald-500">✓</span>}
                    {f.status === "error" && <span className="text-xs text-red-400">✗</span>}
                    <button onClick={() => setKbFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 text-xs ml-1">✕</button>
                  </div>
                ))}
                <label className="block w-full border border-dashed border-gray-300 rounded-xl py-3 px-4 text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors cursor-pointer text-center">
                  <input type="file" accept=".pdf,.docx,.txt,.md,.csv" multiple className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      for (const file of files) {
                        const entry = { name: file.name, size: (file.size / 1024).toFixed(0) + " KB", status: "uploading" as const };
                        setKbFiles(prev => [...prev, entry]);
                        try {
                          let activeKbId = kbId;
                          if (!activeKbId) {
                            const res = await ragApi.createKB(agentName || "Agent KB", `Knowledge base for ${agentName}`);
                            activeKbId = res.data.id;
                            setKbId(activeKbId);
                          }
                          await ragApi.upload(activeKbId!, file);
                          setKbFiles(prev => prev.map(f => f.name === file.name ? {...f, status: "done" as const} : f));
                        } catch {
                          setKbFiles(prev => prev.map(f => f.name === file.name ? {...f, status: "error" as const} : f));
                        }
                      }
                    }} />
                  + Upload document (PDF, DOCX, TXT, CSV)
                </label>
                <button className="w-full border border-gray-200 rounded-xl py-2 text-xs text-teal-600 hover:bg-teal-50">🔗 Connect Knowledge Base URL</button>
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
                    <input
                      type="checkbox"
                      className="accent-teal-600"
                      checked={selectedTools.includes(t)}
                      onChange={(e) => setSelectedTools(prev => e.target.checked ? [...prev, t] : prev.filter(x => x !== t))}
                    /> {t}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Skills */}
          <div className="border-b border-gray-100">
            <button onClick={() => setSkillsOpen(!skillsOpen)} className="w-full flex items-center justify-between p-4 text-sm font-medium text-gray-800 hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <span>Skills</span>
                {selectedSkills.length > 0 && <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">{selectedSkills.length}</span>}
              </div>
              <span className="text-gray-400 text-lg">{skillsOpen ? "−" : "+"}</span>
            </button>
            {skillsOpen && (
              <div className="px-4 pb-4">
                <div className="relative mb-3">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-teal-500"
                    placeholder="Search skills..." value={skillsSearch} onChange={(e) => setSkillsSearch(e.target.value)} />
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {[
                    {id:"summarization",label:"Summarization",cat:"NLP"},
                    {id:"translation",label:"Translation",cat:"NLP"},
                    {id:"code_gen",label:"Code Generation",cat:"Dev"},
                    {id:"data_analysis",label:"Data Analysis",cat:"Analytics"},
                    {id:"web_search",label:"Web Search",cat:"Tools"},
                    {id:"image_gen",label:"Image Generation",cat:"Multimodal"},
                    {id:"sentiment",label:"Sentiment Analysis",cat:"NLP"},
                    {id:"extraction",label:"Entity Extraction",cat:"NLP"},
                    {id:"classify",label:"Text Classification",cat:"NLP"},
                    {id:"sql_gen",label:"SQL Generation",cat:"Dev"},
                    {id:"email_draft",label:"Email Drafting",cat:"Productivity"},
                    {id:"calendar",label:"Calendar Management",cat:"Productivity"},
                  ].filter(s => !skillsSearch || s.label.toLowerCase().includes(skillsSearch.toLowerCase()) || s.cat.toLowerCase().includes(skillsSearch.toLowerCase()))
                   .map(skill => {
                    const sel = selectedSkills.includes(skill.id);
                    return (
                      <button key={skill.id} onClick={() => setSelectedSkills(prev => sel ? prev.filter(x => x !== skill.id) : [...prev, skill.id])}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition-colors ${sel ? "border-teal-400 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        <span className="font-medium">{skill.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${sel ? "bg-teal-100 text-teal-600" : "bg-gray-100 text-gray-400"}`}>{skill.cat}</span>
                          {sel && <span className="text-teal-500">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedSkills.length > 0 && (
                  <p className="text-xs text-teal-600 mt-2 font-medium">{selectedSkills.length} skill{selectedSkills.length > 1 ? "s" : ""} selected</p>
                )}
              </div>
            )}
          </div>

          {/* Automation */}
          <div className="border-b border-gray-100">
            <div className="flex items-center justify-between p-4">
              <span className="text-sm font-semibold text-gray-800">Automation</span>
              <div className="flex gap-2">
                <button onClick={() => setScheduleModalOpen(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50">
                  + Schedule
                </button>
                <button onClick={() => setTriggerModalOpen(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50">
                  + Trigger
                </button>
              </div>
            </div>
            {(scheduleConfig.enabled || triggerConfig.enabled) && (
              <div className="px-4 pb-4 space-y-2">
                {scheduleConfig.enabled && (
                  <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-teal-700">🕐 Schedule</p>
                      <p className="text-xs text-teal-600">{scheduleConfig.description}</p>
                    </div>
                    <button onClick={() => setScheduleConfig(c => ({...c, enabled: false}))} className="text-teal-400 hover:text-red-400 text-xs">✕</button>
                  </div>
                )}
                {triggerConfig.enabled && (
                  <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-purple-700">⚡ Trigger</p>
                      <p className="text-xs text-purple-600">{triggerConfig.event} event</p>
                    </div>
                    <button onClick={() => setTriggerConfig(c => ({...c, enabled: false}))} className="text-purple-400 hover:text-red-400 text-xs">✕</button>
                  </div>
                )}
              </div>
            )}
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

        {/* Schedule Modal */}
        {scheduleModalOpen && (
          <div className="absolute inset-0 bg-black/30 z-40 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-96">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Configure Schedule</h3>
                <button onClick={() => setScheduleModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Cron Expression</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500"
                    value={scheduleConfig.cron} onChange={(e) => setScheduleConfig(c => ({...c, cron: e.target.value}))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {["0 9 * * 1-5", "0 * * * *", "0 0 * * *", "*/30 * * * *"].map(preset => (
                    <button key={preset} onClick={() => setScheduleConfig(c => ({...c, cron: preset}))}
                      className={`text-xs py-1.5 px-2 rounded-lg border transition-colors ${scheduleConfig.cron === preset ? "border-teal-400 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      {preset}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Timezone</label>
                  <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    value={scheduleConfig.timezone} onChange={(e) => setScheduleConfig(c => ({...c, timezone: e.target.value}))}>
                    <option>UTC</option><option>America/New_York</option><option>Europe/London</option><option>Asia/Singapore</option><option>Asia/Kolkata</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Description</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="e.g. Weekdays at 9am" value={scheduleConfig.description}
                    onChange={(e) => setScheduleConfig(c => ({...c, description: e.target.value}))} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setScheduleModalOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={() => { setScheduleConfig(c => ({...c, enabled: true})); setScheduleModalOpen(false); }}
                  className="flex-1 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700">Save Schedule</button>
              </div>
            </div>
          </div>
        )}

        {/* Trigger Modal */}
        {triggerModalOpen && (
          <div className="absolute inset-0 bg-black/30 z-40 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-96">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Configure Trigger</h3>
                <button onClick={() => setTriggerModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Event Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[{id:"webhook",label:"Webhook",icon:"🔗"},{id:"email",label:"Email",icon:"✉️"},{id:"slack",label:"Slack",icon:"💬"},{id:"form",label:"Form Submit",icon:"📝"}].map(e => (
                      <button key={e.id} onClick={() => setTriggerConfig(c => ({...c, event: e.id}))}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${triggerConfig.event === e.id ? "border-purple-400 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        <span>{e.icon}</span>{e.label}
                      </button>
                    ))}
                  </div>
                </div>
                {triggerConfig.event === "webhook" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Webhook Endpoint</label>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                      <span className="text-xs text-gray-400 font-mono">https://agentforge.io/trigger/</span>
                      <span className="text-xs font-mono text-gray-600">{agentName.toLowerCase().replace(/\s+/g,"-")}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setTriggerModalOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={() => { setTriggerConfig(c => ({...c, enabled: true})); setTriggerModalOpen(false); }}
                  className="flex-1 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700">Save Trigger</button>
              </div>
            </div>
          </div>
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
