import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import mammoth from "mammoth";
import { agentsApi, architectApi } from "../api/client";

interface ClarifyQuestion {
  id: string;
  text: string;
  options: string[];
}

async function extractFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "docx") {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    // Truncate to ~3000 chars so the prompt stays reasonable
    return result.value.slice(0, 3000);
  }
  if (ext === "txt" || ext === "md" || ext === "csv" || ext === "json") {
    return (await file.text()).slice(0, 3000);
  }
  if (ext === "pdf") {
    return `[PDF text extraction not supported in browser — please copy-paste the text content instead]`;
  }
  return `[Binary file: ${file.name}]`;
}

function IntegrationIcon({ name }: { name: string }) {
  if (name === "Gmail") return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="#fff" stroke="#E5E7EB" strokeWidth="1"/>
      <path d="M2 6l10 7 10-7" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M2 6l10 7" stroke="#34A853" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M22 6l-10 7" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M2 6v12" stroke="#FBBC05" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M22 6v12" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
  if (name === "Slack") return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.8 14.4a1.6 1.6 0 11-1.6-1.6h1.6v1.6zm.8 0a1.6 1.6 0 113.2 0v4a1.6 1.6 0 11-3.2 0v-4z" fill="#E01E5A"/>
      <path d="M9.6 5.8a1.6 1.6 0 111.6-1.6v1.6H9.6zm0 .8a1.6 1.6 0 110 3.2H5.6a1.6 1.6 0 110-3.2h4z" fill="#36C5F0"/>
      <path d="M18.2 9.6a1.6 1.6 0 111.6 1.6H18.2V9.6zm-.8 0a1.6 1.6 0 11-3.2 0v-4a1.6 1.6 0 113.2 0v4z" fill="#2EB67D"/>
      <path d="M14.4 18.2a1.6 1.6 0 11-1.6 1.6v-1.6h1.6zm0-.8a1.6 1.6 0 110-3.2h4a1.6 1.6 0 110 3.2h-4z" fill="#ECB22E"/>
    </svg>
  );
  if (name === "Teams") return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5 5.5a2 2 0 100 4 2 2 0 000-4z" fill="#5059C9"/>
      <path d="M14.5 10.5H19a1 1 0 011 1v4.5a2.5 2.5 0 01-5 0V11.5a1 1 0 00-1-1h-.5z" fill="#5059C9"/>
      <path d="M9.5 4a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" fill="#7B83EB"/>
      <path d="M13.5 10H5.5a1.5 1.5 0 00-1.5 1.5v5a4 4 0 008 0v-5a1.5 1.5 0 00-1.5-1.5z" fill="#7B83EB"/>
    </svg>
  );
  if (name === "GitHub") return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="#1F2328"/>
    </svg>
  );
  if (name === "Notion") return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 3.75A.75.75 0 014.5 3h15a.75.75 0 010 1.5h-15a.75.75 0 010-1.5zM4.5 7.5A.75.75 0 014.5 6h15a.75.75 0 010 1.5h-15A.75.75 0 014.5 7.5zM4.5 11.25A.75.75 0 014.5 10.5h9a.75.75 0 010 1.5h-9a.75.75 0 010-1.5z" fill="#000" opacity=".15"/>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="#000" strokeWidth="1.2" opacity=".1"/>
      <path d="M5 4.5l.8.6 10.7-1.1c.9-.1 1.5.5 1.5 1.4v13.2c0 .6-.3 1.1-.8 1.4l-1.6 1c-.3.2-.7.2-1 0l-.4-.3c-.2-.1-.3-.4-.3-.6V7.4L5 8.7V4.5z" fill="#fff" stroke="#E5E7EB" strokeWidth="0.5"/>
      <path d="M7 9.5h6M7 12h4" stroke="#374151" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
  if (name === "Jira") return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.975 2.006L3 10.981l3.628 3.628 5.319-5.32 5.32 5.32L21 10.98l-9.025-8.975z" fill="#2684FF"/>
      <path d="M11.975 8.372L7.384 12.96l4.591 4.591 4.591-4.591-4.591-4.588z" fill="url(#jira-grad)"/>
      <path d="M11.975 14.734L8.725 17.984 11.975 21.234 15.225 17.984l-3.25-3.25z" fill="#2684FF"/>
      <defs>
        <linearGradient id="jira-grad" x1="11.975" y1="8.372" x2="11.975" y2="17.551" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0052CC"/>
          <stop offset="1" stopColor="#2684FF"/>
        </linearGradient>
      </defs>
    </svg>
  );
  return <span className="text-xs font-bold text-gray-500">{name[0]}</span>;
}

const TOOL_INTEGRATIONS = [
  { name: "Gmail", desc: "Read and send emails via Gmail" },
  { name: "Slack", desc: "Post messages and read channels" },
  { name: "Teams", desc: "Integrate with Microsoft Teams" },
  { name: "GitHub", desc: "Access repos, PRs, and issues" },
  { name: "Notion", desc: "Read and write Notion pages" },
  { name: "Jira", desc: "Create and update Jira tickets" },
];

const SUGGESTIONS = [
  { title: "Customer Support Agent", description: "Build a support agent with FAQ knowledge base and ticket routing" },
  { title: "Lead Qualification Pipeline", description: "Create a multi-agent pipeline for scoring and routing leads" },
  { title: "Code Review Agent", description: "Generate a code review agent connected to your GitHub repos" },
  { title: "HR Onboarding Assistant", description: "Build an onboarding assistant with document upload capabilities" },
];

const THEMES = [
  { id: "default", name: "Default", primary: "#4f46e5" },
  { id: "teal", name: "Teal", primary: "#0d9488" },
  { id: "rose", name: "Rose", primary: "#e11d48" },
  { id: "amber", name: "Amber", primary: "#d97706" },
];

export default function Home() {
  const [prompt, setPrompt] = useState(() => {
    const saved = sessionStorage.getItem("homePrompt");
    if (saved) { sessionStorage.removeItem("homePrompt"); return saved; }
    return "";
  });
  const [showMenu, setShowMenu] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showIntegrationModal, setShowIntegrationModal] = useState<(typeof TOOL_INTEGRATIONS)[0] | null>(null);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [selectedTheme, setSelectedTheme] = useState("default");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  // Clarifying questions state
  const [clarifyStep, setClarifyStep] = useState<"idle" | "asking" | "generating">("idle");
  const [clarifyMessage, setClarifyMessage] = useState("");
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSaveAndOpen = async () => {
    if (!result || "error" in result) return;
    setSaving(true);
    try {
      await agentsApi.create({
        name: result.name as string,
        description: result.description as string,
        system_prompt: result.system_prompt as string,
        model: (result.model as string) || "gpt-4o",
        tools: (result.tools as string[]) || [],
        guardrails: (result.guardrails as object) || { pii: true, hallucination: true },
      });
      showToast(`Agent "${result.name}" created successfully!`);
      setTimeout(() => navigate("/studio"), 1000);
    } catch {
      showToast("Failed to save agent. Is the backend running?", "error");
    } finally {
      setSaving(false);
    }
  };

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowThemePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files]);
    setShowMenu(false);
    // Extract text from each file
    for (const file of files) {
      const text = await extractFileText(file);
      setFileContents((prev) => ({ ...prev, [file.name]: text }));
    }
  };

  const removeFile = (name: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name));
    setFileContents((prev) => { const n = { ...prev }; delete n[name]; return n; });
  };

  const buildFullPrompt = () => {
    let fullPrompt = prompt.trim();
    const docEntries = Object.entries(fileContents);
    if (docEntries.length > 0) {
      fullPrompt += "\n\n--- Attached Documents ---\n";
      for (const [name, content] of docEntries) {
        fullPrompt += `\nFile: ${name}\n${content}\n`;
      }
      fullPrompt += "\nIMPORTANT: Name the agent specifically based on the document topic and domain above.";
    }
    return fullPrompt;
  };

  // Phase 1: ask clarifying questions via Architect
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    setClarifyStep("idle");
    setClarifyAnswers({});
    try {
      const res = await architectApi.chat([{ role: "user", content: buildFullPrompt() }]);
      const data = res.data;
      if (data.type === "questions" && data.questions?.length) {
        setClarifyMessage(data.message);
        setClarifyQuestions(data.questions);
        setClarifyStep("asking");
      } else {
        // No questions — generate directly
        await generateAgent(buildFullPrompt(), {});
      }
    } catch {
      setResult({ error: "Failed to reach backend. Is the server running?" });
    } finally {
      setLoading(false);
    }
  };

  // Phase 2: user answered questions → generate agent
  const handleSubmitAnswers = async () => {
    const answered = Object.entries(clarifyAnswers).map(([, v]) => `- ${v}`).join("\n");
    const enrichedPrompt = `${buildFullPrompt()}\n\nUser clarifications:\n${answered}`;
    setClarifyStep("generating");
    await generateAgent(enrichedPrompt, clarifyAnswers);
  };

  const generateAgent = async (fullPrompt: string, _answers: Record<string, string>) => {
    setLoading(true);
    try {
      const res = await agentsApi.generateFromPrompt(fullPrompt);
      setResult(res.data);
      setClarifyStep("idle");
    } catch {
      setResult({ error: "Failed to generate agent. Check your Azure OpenAI config." });
      setClarifyStep("idle");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white px-4 py-12 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
          toast.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {toast.type === "success" ? (
            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}

      {/* Integration Connect Modal */}
      {showIntegrationModal && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
          onClick={() => setShowIntegrationModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 border border-gray-200 rounded-xl flex items-center justify-center">
                <IntegrationIcon name={showIntegrationModal.name} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Connect {showIntegrationModal.name}</h3>
                <p className="text-xs text-gray-400">{showIntegrationModal.desc}</p>
              </div>
            </div>
            <div className="space-y-2 mb-5">
              <label className="text-xs font-medium text-gray-600">API Key / Token</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={`Paste your ${showIntegrationModal.name} token...`}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowIntegrationModal(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowIntegrationModal(null);
                  setShowComingSoonModal(true);
                }}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coming Soon Modal */}
      {showComingSoonModal && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
          onClick={() => setShowComingSoonModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-96 max-w-[calc(100vw-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Coming Soon</h3>
                <p className="text-xs text-gray-400">Integration connections</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              Integration connections coming soon — this feature will let you connect live credentials to your agent.
            </p>
            <button
              onClick={() => setShowComingSoonModal(false)}
              className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1 rounded-full mb-5 border border-indigo-100">
          <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
            <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Enterprise AI Agent Platform
        </div>
        <h1 className="text-5xl font-semibold text-slate-900 mb-3 tracking-tight">AgentForge</h1>
        <p className="text-gray-500 text-lg max-w-md mx-auto">
          Design, deploy, and monitor production-grade AI agents — without the complexity.
        </p>
      </div>

      {/* Prompt Box */}
      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-md p-5">

        {/* Attached files chips */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachedFiles.map((f) => (
              <span key={f.name} className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {f.name}
                {fileContents[f.name] ? (
                  <span className="text-indigo-400 ml-0.5">✓</span>
                ) : (
                  <svg className="w-2.5 h-2.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                <button onClick={() => removeFile(f.name)} className="ml-0.5 hover:text-indigo-900">×</button>
              </span>
            ))}
          </div>
        )}

        <textarea
          className="w-full text-gray-800 text-base outline-none resize-none placeholder-gray-400 min-h-[72px] leading-relaxed"
          placeholder="Describe the agent you want to build..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
          }}
          rows={3}
        />

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          {/* + Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => { setShowMenu(!showMenu); setShowThemePicker(false); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium text-lg transition-colors"
              title="Attach or configure"
            >
              +
            </button>

            {showMenu && !showThemePicker && (
              <div className="absolute bottom-10 left-0 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 w-52 z-10">
                {/* Add files */}
                <button
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { fileInputRef.current?.click(); }}
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Add files
                </button>
                {/* Add studio agents */}
                <button
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => { navigate("/studio"); setShowMenu(false); }}
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="8" width="18" height="12" rx="2" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8V4M8 4h8M9 13h.01M15 13h.01" />
                  </svg>
                  Add studio agents
                </button>
                {/* Select theme */}
                <button
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowThemePicker(true)}
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
                  </svg>
                  Select theme
                  <svg className="w-3 h-3 ml-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}

            {/* Theme picker submenu */}
            {showThemePicker && (
              <div className="absolute bottom-10 left-0 bg-white border border-gray-200 rounded-xl shadow-lg py-2 w-52 z-10">
                <button
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 w-full"
                  onClick={() => setShowThemePicker(false)}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <div className="px-3 pb-1 pt-0.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Color theme</p>
                  <div className="grid grid-cols-2 gap-2">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setSelectedTheme(t.id); setShowThemePicker(false); setShowMenu(false); }}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors ${selectedTheme === t.id ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      >
                        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: t.primary }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.pdf,.md,.docx,.csv,.json"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Send */}
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                Generate
              </>
            )}
          </button>
        </div>
      </div>

      {/* Clarifying Questions Panel */}
      {clarifyStep === "asking" && (
        <div className="w-full max-w-2xl mt-4 bg-white border border-indigo-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 bg-indigo-50 border-b border-indigo-100">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-900">A few quick questions</p>
              <p className="text-xs text-indigo-600 mt-0.5">{clarifyMessage}</p>
            </div>
          </div>

          {/* Questions */}
          <div className="px-5 py-4 space-y-5">
            {clarifyQuestions.map((q) => (
              <div key={q.id}>
                <p className="text-sm font-medium text-slate-800 mb-2.5 flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {clarifyQuestions.indexOf(q) + 1}
                  </span>
                  {q.text}
                </p>
                <div className="flex flex-wrap gap-2 pl-7">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setClarifyAnswers((p) => ({ ...p, [q.id]: opt }))}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 cursor-pointer ${
                        clarifyAnswers[q.id] === opt
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                          : "bg-white border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-600"
                      }`}
                    >
                      {clarifyAnswers[q.id] === opt && (
                        <span className="mr-1.5">✓</span>
                      )}
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="px-5 pb-5 flex items-center gap-3">
            <button
              onClick={handleSubmitAnswers}
              disabled={Object.keys(clarifyAnswers).length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Generate Agent
            </button>
            <button
              onClick={() => generateAgent(buildFullPrompt(), {})}
              className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
            >
              Skip questions
            </button>
            <button
              onClick={() => { setClarifyStep("idle"); setClarifyAnswers({}); }}
              className="ml-auto text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Generating spinner overlay on questions panel */}
      {clarifyStep === "generating" && loading && (
        <div className="w-full max-w-2xl mt-4 flex items-center gap-3 px-5 py-4 bg-indigo-50 border border-indigo-200 rounded-2xl">
          <svg className="w-5 h-5 animate-spin text-indigo-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm font-medium text-indigo-700">Generating your agent with your preferences…</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="w-full max-w-2xl mt-4">
          {"error" in result && result.error ? (
            <div className="border border-red-200 bg-red-50 rounded-xl p-4">
              <p className="text-red-600 text-sm font-medium">{String(result.error)}</p>
            </div>
          ) : (
            <div className="border border-emerald-200 bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Card header */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-100 px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {(result.name as string)?.[0]?.toUpperCase() ?? "A"}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{result.name as string}</h3>
                  <p className="text-xs text-gray-500">{result.description as string}</p>
                </div>
                <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-medium">
                  Ready to deploy
                </span>
              </div>

              {/* Details grid */}
              <div className="px-5 py-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Model</p>
                  <span className="inline-flex items-center bg-slate-100 border border-slate-200 text-slate-700 text-xs px-2.5 py-1 rounded-full">
                    {result.model as string}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Tools</p>
                  <div className="flex flex-wrap gap-1">
                    {((result.tools as string[]) || []).slice(0, 4).map((t) => (
                      <span key={t} className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                    {((result.tools as string[]) || []).length > 4 && (
                      <span className="text-xs text-gray-400">+{((result.tools as string[]) || []).length - 4} more</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">System prompt preview</p>
                  <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 border border-gray-100 rounded-lg p-2.5 line-clamp-3">
                    {result.system_prompt as string}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 pb-5 flex gap-2.5">
                <button
                  onClick={handleSaveAndOpen}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                      </svg>
                      Save &amp; Open in Agent Studio
                    </>
                  )}
                </button>
                <button
                  onClick={() => navigate("/studio/create")}
                  className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Customize first
                </button>
                <button
                  onClick={() => setResult(null)}
                  className="ml-auto px-3 py-2.5 text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕ Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suggestions */}
      <div className="w-full max-w-2xl mt-8 grid grid-cols-2 gap-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => setPrompt(s.description)}
            className="text-left p-4 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
          >
            <p className="text-sm font-medium text-gray-800 mb-1 group-hover:text-indigo-700">{s.title}</p>
            <p className="text-xs text-gray-500 leading-relaxed">{s.description}</p>
          </button>
        ))}
      </div>

      {/* Integrations */}
      <div className="flex items-center gap-3 mt-8 flex-wrap justify-center">
        <span className="text-gray-400 text-sm">Connect with</span>
        {TOOL_INTEGRATIONS.map((t) => (
          <button
            key={t.name}
            title={`Connect ${t.name} — ${t.desc}`}
            onClick={() => setShowIntegrationModal(t)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all"
          >
            <IntegrationIcon name={t.name} />
          </button>
        ))}
        <span className="text-gray-400 text-sm">and more</span>
      </div>
    </div>
  );
}
