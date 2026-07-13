import { useEffect, useRef, useState } from "react";
import api from "../api/client";

interface Voice {
  id: string;
  name: string;
  locale: string;
  language: string;
  gender: "Female" | "Male";
  style: string;
  engine: string;
}

interface SttLanguage {
  code: string;
  label: string;
}

interface VoiceConfig {
  tts_engine: string;
  stt_engine: string;
  tts_voice: string;
  stt_language: string;
  silence_timeout_ms: number;
  max_call_duration_s: number;
  speaking_rate: number;
  pitch: number;
  persona: string;
  enabled: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  ts: string;
}

interface CallLog {
  id: string;
  session_id: string;
  agent_id: string;
  role: "user" | "assistant";
  text: string;
  persona: string;
  tts_voice: string;
  llm_duration_ms: number;
  tts_duration_ms: number;
  timestamp: string;
}

interface VoiceTrace {
  session_id: string;
  agent_id: string;
  persona: string;
  total_turns: number;
  total_llm_ms: number;
  total_tts_ms: number;
  avg_llm_ms: number;
  max_llm_ms: number;
  started_at: string;
  last_turn_at: string;
}

const DEFAULT_CONFIG: VoiceConfig = {
  tts_engine: "azure",
  stt_engine: "azure",
  tts_voice: "en-US-JennyNeural",
  stt_language: "en-US",
  silence_timeout_ms: 1500,
  max_call_duration_s: 300,
  speaking_rate: 1.0,
  pitch: 0,
  persona: "friendly",
  enabled: true,
};

const PERSONAS = [
  { id: "formal",       label: "Formal",       desc: "Polished, no contractions" },
  { id: "professional", label: "Professional",  desc: "Clear & business-appropriate" },
  { id: "friendly",     label: "Friendly",      desc: "Warm & conversational" },
  { id: "casual",       label: "Casual",        desc: "Relaxed, like a knowledgeable friend" },
];

type Tab = "gallery" | "chat" | "config" | "logs";

export default function VoiceAgents() {
  const [tab, setTab] = useState<Tab>("gallery");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [sttLanguages, setSttLanguages] = useState<SttLanguage[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [config, setConfig] = useState<VoiceConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Voice preview
  const [previewText, setPreviewText] = useState("Hello! I am your AI voice agent. How can I help you today?");
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Voice Chat
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [waveAmps, setWaveAmps] = useState<number[]>([4, 4, 4, 4, 4, 4, 8]);
  const [sessionId] = useState(() => crypto.randomUUID());
  const recognitionRef = useRef<any>(null);
  const waveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Call Logs + Traces
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [traces, setTraces] = useState<VoiceTrace[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsView, setLogsView] = useState<"traces" | "transcript">("traces");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  // Language filter for gallery
  const [langFilter, setLangFilter] = useState("all");

  useEffect(() => {
    Promise.all([
      api.get("/voice/voices"),
      api.get("/voice/stt-languages"),
    ])
      .then(([vr, lr]) => {
        setVoices(vr.data);
        setSttLanguages(lr.data);
      })
      .catch(() => setError("Failed to load voice data."))
      .finally(() => setLoadingVoices(false));
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    if (tab === "logs") fetchLogs();
  }, [tab]);

  // ── Waveform animation ───────────────────────────────────────────────────────
  function startWave() {
    waveTimerRef.current = setInterval(() => {
      setWaveAmps(Array.from({ length: 7 }, () => 4 + Math.random() * 20));
    }, 120);
  }
  function stopWave() {
    if (waveTimerRef.current) clearInterval(waveTimerRef.current);
    setWaveAmps([4, 4, 4, 4, 4, 4, 8]);
  }

  // ── STT microphone ───────────────────────────────────────────────────────────
  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Speech recognition not supported in this browser (use Chrome)."); return; }

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = config.stt_language;
    recognitionRef.current = rec;

    rec.onstart = () => { setListening(true); startWave(); };
    rec.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript;
      setChatInput(transcript);
      setListening(false);
      stopWave();
    };
    rec.onerror = () => { setListening(false); stopWave(); };
    rec.onend   = () => { setListening(false); stopWave(); };
    rec.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
    stopWave();
  }

  // ── TTS playback ─────────────────────────────────────────────────────────────
  async function playText(text: string) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(true);
    try {
      const res = await api.post(
        "/voice/synthesize",
        { text, voice: config.tts_voice, speaking_rate: config.speaking_rate, pitch: config.pitch },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "audio/mpeg" }));
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => setPlaying(false);
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }

  function stopAudio() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(false);
  }

  // ── Voice chat send ───────────────────────────────────────────────────────────
  async function sendChat(text?: string) {
    const msg = (text ?? chatInput).trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    stopAudio();

    const userMsg: ChatMessage = { role: "user", text: msg, ts: new Date().toLocaleTimeString() };
    setChatHistory((h) => [...h, userMsg]);
    setChatLoading(true);

    try {
      const res = await api.post("/voice/chat-text", {
        message: msg,
        agent_id: "default",
        session_id: sessionId,
        persona: config.persona,
        history: chatHistory.slice(-10).map((m) => ({ role: m.role, content: m.text })),
      });
      const reply: string = res.data.reply;
      const asstMsg: ChatMessage = { role: "assistant", text: reply, ts: new Date().toLocaleTimeString() };
      setChatHistory((h) => [...h, asstMsg]);
      // auto-play TTS reply
      await playText(reply);
    } catch {
      setChatHistory((h) => [...h, { role: "assistant", text: "Sorry, I couldn't process that.", ts: new Date().toLocaleTimeString() }]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Call logs + traces ────────────────────────────────────────────────────────
  async function fetchLogs(sessionFilter?: string) {
    setLogsLoading(true);
    try {
      const params = sessionFilter ? `?session_id=${sessionFilter}` : "";
      const [logsRes, tracesRes] = await Promise.all([
        api.get(`/voice/logs${params}`),
        api.get("/voice/traces"),
      ]);
      setCallLogs(logsRes.data);
      setTraces(tracesRes.data);
    } catch {
      /* ignore */
    } finally {
      setLogsLoading(false);
    }
  }

  async function clearLogs() {
    await api.delete("/voice/logs");
    setCallLogs([]);
    setTraces([]);
    setSelectedSession(null);
  }

  function selectSession(sid: string) {
    setSelectedSession(sid);
    setLogsView("transcript");
    fetchLogs(sid);
  }

  // ── Config save ───────────────────────────────────────────────────────────────
  async function saveConfig() {
    setSaving(true); setSaveMsg(null);
    try {
      await api.put("/voice/configs/default", { ...config, agent_id: "default" });
      setSaveMsg("Configuration saved.");
    } catch {
      setSaveMsg("Failed to save configuration.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  // ── Language groups for gallery ───────────────────────────────────────────────
  const languages = ["all", ...Array.from(new Set(voices.map((v) => v.language)))];
  const filteredVoices = langFilter === "all" ? voices : voices.filter((v) => v.language === langFilter);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Voice Agents</h1>
            <p className="text-slate-500 text-sm mt-0.5">Azure Neural TTS · Browser STT · Voice chat loop · 24 voices · SSML rate & pitch</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-green-100 text-green-700 font-medium px-2.5 py-1 rounded-full">24 Voices</span>
            <span className="text-xs bg-indigo-100 text-indigo-700 font-medium px-2.5 py-1 rounded-full">Azure Speech</span>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-red-700 text-sm">{error}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-200">
          {(["gallery", "chat", "config", "logs"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "gallery" ? "Voice Gallery" : t === "chat" ? "Voice Chat" : t === "config" ? "Configuration" : "Call Logs"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">

        {/* ── TAB: GALLERY ─────────────────────────────────────────────────────── */}
        {tab === "gallery" && (
          <div>
            {/* Language filter pills */}
            <div className="flex flex-wrap gap-2 mb-5">
              {languages.slice(0, 12).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLangFilter(lang)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    langFilter === lang
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                  }`}
                >
                  {lang === "all" ? `All (${voices.length})` : lang}
                </button>
              ))}
            </div>

            {loadingVoices ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse h-28" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filteredVoices.map((voice) => (
                  <div
                    key={voice.id}
                    className={`bg-white border rounded-xl p-4 flex flex-col gap-2 transition-all cursor-pointer ${
                      config.tts_voice === voice.id
                        ? "border-indigo-500 ring-1 ring-indigo-300 shadow-sm"
                        : "border-gray-200 hover:border-indigo-300"
                    }`}
                    onClick={() => setConfig((c) => ({ ...c, tts_voice: voice.id }))}
                  >
                    {/* Avatar */}
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        voice.gender === "Female" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {voice.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{voice.name}</p>
                        <p className="text-xs text-slate-400 truncate">{voice.locale}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{voice.language}</p>
                    <div className="flex flex-wrap gap-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        voice.gender === "Female" ? "bg-pink-50 text-pink-600" : "bg-blue-50 text-blue-600"
                      }`}>{voice.gender}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-indigo-50 text-indigo-600">{voice.style}</span>
                    </div>
                    <div className="flex gap-1.5 mt-auto">
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfig((c) => ({ ...c, tts_voice: voice.id })); playText(`Hello, I'm ${voice.name}. How can I help you today?`); }}
                        className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-gray-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                      >
                        Preview
                      </button>
                      {config.tts_voice === voice.id && (
                        <span className="flex items-center text-xs text-indigo-600 font-medium px-2">Selected</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Preview bar */}
            <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Test selected voice</p>
              <div className="flex gap-2">
                <input
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={() => playing ? stopAudio() : playText(previewText)}
                  disabled={!previewText.trim()}
                  className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                    playing
                      ? "bg-red-50 text-red-600 hover:bg-red-100"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  }`}
                >
                  {playing ? (
                    <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="4" height="12"/><rect x="14" y="6" width="4" height="12"/></svg>Stop</>
                  ) : (
                    <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Play</>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Voice: <span className="text-slate-600 font-medium">{config.tts_voice}</span> · Rate: {config.speaking_rate.toFixed(1)}× · Pitch: {config.pitch > 0 ? "+" : ""}{config.pitch}Hz</p>
            </div>
          </div>
        )}

        {/* ── TAB: VOICE CHAT ───────────────────────────────────────────────────── */}
        {tab === "chat" && (
          <div className="flex flex-col h-full" style={{ minHeight: "520px" }}>
            {/* Persona + voice bar */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Persona</span>
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setConfig((c) => ({ ...c, persona: p.id }))}
                  title={p.desc}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    config.persona === p.id
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                <span>Voice:</span>
                <select
                  value={config.tts_voice}
                  onChange={(e) => setConfig((c) => ({ ...c, tts_voice: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  {voices.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.locale})</option>)}
                </select>
              </div>
            </div>

            {/* Chat messages */}
            <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-y-auto p-4 flex flex-col gap-3" style={{ minHeight: "300px", maxHeight: "360px" }}>
              {chatHistory.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <p className="text-sm">Click the mic or type to start a voice conversation</p>
                </div>
              ) : (
                <>
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-br-sm"
                          : "bg-gray-100 text-slate-800 rounded-bl-sm"
                      }`}>
                        <p className="leading-relaxed">{msg.text}</p>
                        <div className="flex items-center justify-between gap-3 mt-1">
                          <span className={`text-xs ${msg.role === "user" ? "text-indigo-200" : "text-slate-400"}`}>{msg.ts}</span>
                          {msg.role === "assistant" && (
                            <button
                              onClick={() => playText(msg.text)}
                              className="text-slate-400 hover:text-indigo-600 transition-colors"
                              title="Replay"
                            >
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </>
              )}
            </div>

            {/* Waveform */}
            {listening && (
              <div className="flex items-center justify-center gap-1 py-3">
                {waveAmps.map((h, i) => (
                  <div
                    key={i}
                    className="bg-indigo-500 rounded-full transition-all duration-100"
                    style={{ width: "4px", height: `${h}px` }}
                  />
                ))}
                <span className="ml-3 text-sm text-indigo-600 font-medium">Listening…</span>
              </div>
            )}

            {/* Input row */}
            <div className="flex items-center gap-2 mt-3">
              {/* Mic button */}
              <button
                onClick={listening ? stopListening : startListening}
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  listening
                    ? "bg-red-500 text-white animate-pulse shadow-md"
                    : "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
                }`}
                title={listening ? "Stop listening" : "Start voice input"}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>

              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                placeholder="Speak or type your message…"
                className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* Stop audio / clear */}
              {playing && (
                <button
                  onClick={stopAudio}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors flex-shrink-0"
                  title="Stop playback (barge-in)"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="4" height="12"/><rect x="14" y="6" width="4" height="12"/></svg>
                </button>
              )}

              <button
                onClick={() => sendChat()}
                disabled={!chatInput.trim() || chatLoading}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-2 text-center">
              Mic uses browser Web Speech API · Response auto-plays via Azure Neural TTS · Click stop button to barge-in
            </p>
          </div>
        )}

        {/* ── TAB: CONFIGURATION ────────────────────────────────────────────────── */}
        {tab === "config" && (
          <div className="max-w-2xl space-y-6">
            {/* Persona */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Voice Persona</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setConfig((c) => ({ ...c, persona: p.id }))}
                    className={`flex flex-col gap-0.5 p-3 rounded-xl border text-left transition-all ${
                      config.persona === p.id
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-200 hover:border-indigo-200"
                    }`}
                  >
                    <span className={`text-sm font-semibold ${config.persona === p.id ? "text-indigo-700" : "text-slate-800"}`}>{p.label}</span>
                    <span className="text-xs text-slate-400">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rate & Pitch */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Prosody Controls (SSML)</h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-sm font-medium text-slate-700">Speaking Rate</label>
                    <span className="text-sm font-semibold text-indigo-600">{config.speaking_rate.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range" min={0.5} max={2.0} step={0.1}
                    value={config.speaking_rate}
                    onChange={(e) => setConfig((c) => ({ ...c, speaking_rate: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>0.5× Slow</span><span>1.0× Normal</span><span>2.0× Fast</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-sm font-medium text-slate-700">Pitch</label>
                    <span className="text-sm font-semibold text-indigo-600">{config.pitch > 0 ? "+" : ""}{config.pitch} Hz</span>
                  </div>
                  <input
                    type="range" min={-50} max={50} step={5}
                    value={config.pitch}
                    onChange={(e) => setConfig((c) => ({ ...c, pitch: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>-50 Hz Deep</span><span>0 Normal</span><span>+50 Hz High</span>
                  </div>
                </div>

                <button
                  onClick={() => playText(previewText)}
                  disabled={playing}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  Preview prosody settings
                </button>
              </div>
            </div>

            {/* Engines & language */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Engine & Language</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">TTS Voice</label>
                  <select value={config.tts_voice} onChange={(e) => setConfig((c) => ({ ...c, tts_voice: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {voices.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.language}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">STT Language</label>
                  <select value={config.stt_language} onChange={(e) => setConfig((c) => ({ ...c, stt_language: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {sttLanguages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">TTS Engine</label>
                  <select value={config.tts_engine} onChange={(e) => setConfig((c) => ({ ...c, tts_engine: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="azure">Azure Cognitive Speech</option>
                    <option value="openai">OpenAI TTS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">STT Engine</label>
                  <select value={config.stt_engine} onChange={(e) => setConfig((c) => ({ ...c, stt_engine: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="azure">Azure Speech SDK</option>
                    <option value="whisper">OpenAI Whisper</option>
                    <option value="browser">Browser Web Speech API</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Silence Timeout (ms)</label>
                  <input type="number" value={config.silence_timeout_ms} min={500} max={5000}
                    onChange={(e) => setConfig((c) => ({ ...c, silence_timeout_ms: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max Call Duration (s)</label>
                  <input type="number" value={config.max_call_duration_s} min={30} max={3600}
                    onChange={(e) => setConfig((c) => ({ ...c, max_call_duration_s: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={saveConfig} disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
                {saving ? "Saving…" : "Save Configuration"}
              </button>
              {saveMsg && (
                <span className={`text-sm ${saveMsg.startsWith("Failed") ? "text-red-600" : "text-green-600"}`}>{saveMsg}</span>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: CALL LOGS / OBSERVABILITY ───────────────────────────────────── */}
        {tab === "logs" && (
          <div>
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => { setLogsView("traces"); setSelectedSession(null); fetchLogs(); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${logsView === "traces" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  Session Traces
                </button>
                <button
                  onClick={() => { setLogsView("transcript"); fetchLogs(selectedSession ?? undefined); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${logsView === "transcript" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  Transcript{selectedSession ? ` · ${selectedSession.slice(0,8)}…` : "s"}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => fetchLogs(logsView === "transcript" ? selectedSession ?? undefined : undefined)}
                  className="text-xs font-medium text-slate-600 hover:text-indigo-600 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">
                  Refresh
                </button>
                {(traces.length > 0 || callLogs.length > 0) && (
                  <button onClick={clearLogs} className="text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg transition-colors">
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {logsLoading ? (
              <div className="text-center text-slate-400 py-16 text-sm">Loading…</div>

            ) : logsView === "traces" ? (
              /* ── SESSION TRACES VIEW ─── */
              traces.length === 0 ? (
                <div className="text-center text-slate-300 py-20 flex flex-col items-center gap-3">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-sm">No traces yet — start a voice chat to generate observability data</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-2">
                    {[
                      { label: "Sessions", value: traces.length },
                      { label: "Total Turns", value: traces.reduce((s, t) => s + t.total_turns, 0) },
                      { label: "Avg LLM Latency", value: `${Math.round(traces.reduce((s, t) => s + t.avg_llm_ms, 0) / traces.length)}ms` },
                      { label: "Max LLM Latency", value: `${Math.max(...traces.map(t => t.max_llm_ms))}ms` },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                        <p className="text-xs text-slate-400 mb-0.5">{stat.label}</p>
                        <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Trace table */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Session</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Persona</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Turns</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg LLM</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total LLM</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Started</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {traces.map((tr, i) => {
                          const latencyColor = tr.avg_llm_ms < 1500 ? "text-green-600" : tr.avg_llm_ms < 3000 ? "text-amber-600" : "text-red-600";
                          return (
                            <tr key={tr.session_id} className={`border-b border-gray-100 hover:bg-indigo-50/30 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{tr.session_id.slice(0, 12)}…</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                                  tr.persona === "formal" ? "bg-purple-100 text-purple-700" :
                                  tr.persona === "professional" ? "bg-blue-100 text-blue-700" :
                                  tr.persona === "casual" ? "bg-orange-100 text-orange-700" :
                                  "bg-green-100 text-green-700"
                                }`}>{tr.persona}</span>
                              </td>
                              <td className="px-4 py-3 text-slate-700 font-semibold">{tr.total_turns}</td>
                              <td className={`px-4 py-3 font-mono font-semibold text-xs ${latencyColor}`}>{tr.avg_llm_ms}ms</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{tr.total_llm_ms}ms</td>
                              <td className="px-4 py-3 text-xs text-slate-400">{new Date(tr.started_at).toLocaleTimeString()}</td>
                              <td className="px-4 py-3">
                                <button onClick={() => selectSession(tr.session_id)}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                                  View →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Latency bar chart */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">LLM Latency per Session</p>
                    <div className="space-y-2">
                      {traces.map((tr) => {
                        const maxMs = Math.max(...traces.map(t => t.avg_llm_ms), 1);
                        const pct = Math.round((tr.avg_llm_ms / maxMs) * 100);
                        const barColor = tr.avg_llm_ms < 1500 ? "bg-green-400" : tr.avg_llm_ms < 3000 ? "bg-amber-400" : "bg-red-400";
                        return (
                          <div key={tr.session_id} className="flex items-center gap-3">
                            <span className="font-mono text-xs text-slate-400 w-24 shrink-0">{tr.session_id.slice(0, 10)}…</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-600 w-16 text-right">{tr.avg_llm_ms}ms</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-4 mt-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"/> &lt;1.5s Good</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/> 1.5-3s Moderate</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/> &gt;3s Slow</span>
                    </div>
                  </div>
                </div>
              )

            ) : (
              /* ── TRANSCRIPT VIEW ─── */
              callLogs.length === 0 ? (
                <div className="text-center text-slate-300 py-16 text-sm">No messages in this session</div>
              ) : (
                <div>
                  {selectedSession && (
                    <button onClick={() => { setLogsView("traces"); setSelectedSession(null); fetchLogs(); }}
                      className="text-xs text-indigo-600 mb-3 flex items-center gap-1 hover:underline">
                      ← Back to sessions
                    </button>
                  )}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Transcript</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">LLM</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Session</th>
                        </tr>
                      </thead>
                      <tbody>
                        {callLogs.map((log, i) => (
                          <tr key={log.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                            <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                log.role === "user" ? "bg-indigo-100 text-indigo-700" : "bg-green-100 text-green-700"
                              }`}>
                                {log.role === "user" ? "User" : "Agent"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700 max-w-sm text-xs leading-relaxed">{log.text}</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-400">
                              {log.llm_duration_ms > 0 ? `${log.llm_duration_ms}ms` : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                              <button onClick={() => selectSession(log.session_id)}
                                className="hover:text-indigo-600 transition-colors">
                                {log.session_id.slice(0, 8)}…
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
