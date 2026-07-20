import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { agentsApi } from "../api/client";

interface Agent {
  id: string;
  name: string;
  model: string;
  description: string;
  system_prompt?: string;
  temperature?: number;
  current_version: number;
  tools: string[];
  guardrails?: {
    pii_detection?: boolean;
    hallucination_detection?: boolean;
  };
}

interface Message {
  role: "user" | "agent";
  content: string;
  latency_ms?: number;
  guardrail_triggered?: boolean;
  pii_triggered?: boolean;
  hallucination_triggered?: boolean;
  ts: number;
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-4">
      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="8" width="18" height="12" rx="2" strokeWidth={1.5} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8V4M8 4h8M9 13h.01M15 13h.01M9 17h6" />
        </svg>
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function GuardrailBadge({ triggered, label }: { triggered: boolean; label: string }) {
  if (!triggered) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      {label}
    </span>
  );
}

export default function Playground() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);

  const [sessionRuns, setSessionRuns] = useState(0);
  const [latencies, setLatencies] = useState<number[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!agentId) { setNotFound(true); setLoading(false); return; }
    agentsApi.get(agentId)
      .then((r) => setAgent(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    // agent.model is a per-agent "local"/"azure" choice, not a literal
    // deployment name -- resolve it to what this agent actually runs on so
    // this page doesn't show e.g. "gpt-4o" while it's really running locally.
    if (!agent) return;
    agentsApi.activeModel(agent.model)
      .then((r) => setActiveModel(r.data?.model ?? null))
      .catch(() => setActiveModel(null));
  }, [agent]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, running]);

  const suggestInput = async () => {
    if (!agentId || suggesting) return;
    setSuggesting(true);
    const controller = new AbortController();
    suggestAbortRef.current = controller;
    try {
      const res = await agentsApi.suggestInput(agentId, controller.signal);
      const suggestion = res.data?.suggested_input as string | undefined;
      if (suggestion) {
        setInput(suggestion);
        textareaRef.current?.focus();
      }
    } catch {
      // aborted (user hit Send first) or the model failed -- leave the
      // textarea as-is either way, user can still type their own message
    } finally {
      setSuggesting(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || running || !agentId) return;
    // A suggest-input call may still be in flight -- cancel it so it doesn't
    // run concurrently with the real message and contend for the same model.
    suggestAbortRef.current?.abort();
    setSuggesting(false);
    const userMsg: Message = { role: "user", content: input.trim(), ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setRunning(true);

    try {
      const res = await agentsApi.run(agentId, userMsg.content);
      const data = res.data;
      const latency: number = data.latency_ms ?? 0;
      setLatencies((prev) => [...prev, latency]);
      setSessionRuns((n) => n + 1);
      const agentMsg: Message = {
        role: "agent",
        content: data.output ?? "(no response)",
        latency_ms: latency,
        guardrail_triggered: data.guardrail_triggered,
        pii_triggered: data.pii_triggered,
        hallucination_triggered: data.hallucination_triggered,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "Error: could not reach the agent. Please try again.", ts: Date.now() },
      ]);
    } finally {
      setRunning(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSessionRuns(0);
    setLatencies([]);
  };

  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading agent...
        </div>
      </div>
    );
  }

  if (notFound || !agent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-slate-900 mb-1">Agent not found</h2>
        <p className="text-sm text-gray-500 mb-6">The agent you're looking for doesn't exist or was deleted.</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          ← Go back
        </button>
      </div>
    );
  }

  const piiActive = agent.guardrails?.pii_detection ?? false;
  const hallucinationActive = agent.guardrails?.hallucination_detection ?? false;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* LEFT PANEL */}
      <div className="w-80 flex-shrink-0 bg-slate-900 flex flex-col overflow-y-auto">
        {/* Agent header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-700">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs mb-4 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">{agent.name}</h2>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600 mt-0.5">
                {activeModel ?? agent.model}
              </span>
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div className="px-5 py-4 border-b border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">System Prompt</p>
          {agent.system_prompt ? (
            <pre className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap break-words bg-slate-800 rounded-lg p-3 max-h-48 overflow-y-auto">
              {agent.system_prompt}
            </pre>
          ) : (
            <p className="text-xs text-slate-500 italic">No system prompt configured.</p>
          )}
        </div>

        {/* Guardrails */}
        <div className="px-5 py-4 border-b border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Guardrails</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">PII Detection</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${piiActive ? "bg-emerald-900/50 text-emerald-400 border border-emerald-700" : "bg-slate-700 text-slate-400 border border-slate-600"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${piiActive ? "bg-emerald-400" : "bg-slate-500"}`} />
                {piiActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">Hallucination Guard</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${hallucinationActive ? "bg-emerald-900/50 text-emerald-400 border border-emerald-700" : "bg-slate-700 text-slate-400 border border-slate-600"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hallucinationActive ? "bg-emerald-400" : "bg-slate-500"}`} />
                {hallucinationActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>

        {/* Tools */}
        <div className="px-5 py-4 border-b border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tools</p>
          {agent.tools && agent.tools.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {agent.tools.map((tool) => (
                <span key={tool} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo-900/50 text-indigo-300 border border-indigo-700">
                  {tool}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No tools configured.</p>
          )}
        </div>

        {/* Model Settings */}
        <div className="px-5 py-4 border-b border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Model Settings</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Model</span>
              <span className="text-xs text-slate-300 font-mono">{activeModel ?? agent.model}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Temperature</span>
              <span className="text-xs text-slate-300 font-mono">
                {agent.temperature != null ? agent.temperature : "0.7"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Version</span>
              <span className="text-xs text-slate-300 font-mono">v{agent.current_version}</span>
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className="px-5 py-4 mt-auto">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Session Stats</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-white">{sessionRuns}</p>
              <p className="text-xs text-slate-400 mt-0.5">Total Runs</p>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-white">{avgLatency != null ? `${avgLatency}` : "—"}</p>
              <p className="text-xs text-slate-400 mt-0.5">Avg ms</p>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-base font-semibold text-slate-900">Playground</h1>
            <p className="text-xs text-gray-400 mt-0.5">{agent.name}</p>
          </div>
          <button
            onClick={clearChat}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-1">
          {messages.length === 0 && !running && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700 mb-1">Start a conversation</p>
              <p className="text-xs text-gray-400 max-w-xs">Type a message below to test your agent in real time.</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex mb-4 ${msg.role === "user" ? "justify-end" : "justify-start items-end gap-2"}`}>
              {msg.role === "agent" && (
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="8" width="18" height="12" rx="2" strokeWidth={1.5} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8V4M8 4h8M9 13h.01M15 13h.01M9 17h6" />
                  </svg>
                </div>
              )}
              <div className={`max-w-[70%] ${msg.role === "user" ? "" : ""}`}>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
                }`}>
                  {msg.content}
                </div>
                {msg.role === "agent" && (
                  <div className="flex items-center gap-2 mt-1.5 ml-1">
                    {msg.latency_ms != null && (
                      <span className="text-xs text-gray-400 font-mono">{msg.latency_ms}ms</span>
                    )}
                    <GuardrailBadge triggered={!!msg.pii_triggered} label="PII" />
                    <GuardrailBadge triggered={!!msg.hallucination_triggered} label="Hallucination" />
                    {msg.guardrail_triggered && !msg.pii_triggered && !msg.hallucination_triggered && (
                      <GuardrailBadge triggered={true} label="Guardrail" />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {running && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex gap-3 items-end">
            <button
              onClick={suggestInput}
              disabled={suggesting || running || !agentId}
              title="Suggest an example input for this agent"
              className="px-3 py-3 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-600 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              {suggesting ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <span aria-hidden>✨</span>
              )}
              Suggest
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 resize-none leading-relaxed"
              style={{ minHeight: "44px", maxHeight: "160px" }}
            />
            <button
              onClick={sendMessage}
              disabled={running || !input.trim()}
              className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 flex-shrink-0"
            >
              {running ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
              Send
            </button>
          </div>
          <p className="text-xs text-gray-300 mt-2">Shift+Enter for newline · Enter to send</p>
        </div>
      </div>
    </div>
  );
}
