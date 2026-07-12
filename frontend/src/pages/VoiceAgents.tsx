import { useEffect, useRef, useState } from "react";
import api from "../api/client";

interface Voice {
  id: string;
  name: string;
  gender: "Female" | "Male";
  engine: string;
}

interface VoiceConfig {
  tts_engine: string;
  stt_engine: string;
  tts_voice: string;
  silence_timeout_ms: number;
  max_call_duration_s: number;
}

const DEFAULT_CONFIG: VoiceConfig = {
  tts_engine: "azure",
  stt_engine: "azure",
  tts_voice: "en-US-JennyNeural",
  silence_timeout_ms: 1500,
  max_call_duration_s: 300,
};

export default function VoiceAgents() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [config, setConfig] = useState<VoiceConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState("Hello! I am your AI voice agent. How can I help you today?");
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api
      .get("/voice/voices")
      .then((res) => setVoices(res.data))
      .catch(() => setError("Failed to load voices."))
      .finally(() => setLoadingVoices(false));
  }, []);

  async function testVoice() {
    setPlaying(true);
    try {
      const res = await api.post("/voice/synthesize", { text: previewText, voice: config.tts_voice }, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "audio/mpeg" }));
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => setPlaying(false);
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.put("/voice/configs/default", config);
      setSaveMsg("Configuration saved.");
    } catch {
      setSaveMsg("Failed to save configuration.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Voice Agents</h1>
        <p className="text-slate-500 mt-1">Configure telephony and voice settings for your agents</p>
      </div>

      {/* Coming Soon Banner */}
      <div className="mb-8 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <p className="text-white font-semibold">Voice agent calls via Azure Cognitive Services</p>
          <p className="text-indigo-100 text-sm mt-0.5">Full telephony integration — inbound & outbound calls with your agents</p>
        </div>
        <button className="bg-white text-indigo-700 hover:bg-indigo-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0 ml-4">
          Configure
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {/* Voices Grid */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Available Voices</h2>
        {loadingVoices ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="flex gap-2">
                  <div className="h-5 bg-gray-100 rounded-full w-12" />
                  <div className="h-5 bg-gray-100 rounded-full w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : voices.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-slate-400">
            No voices available.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {voices.map((voice) => (
              <div key={voice.id} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col gap-2">
                <p className="font-medium text-slate-900 text-sm leading-tight">{voice.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      voice.gender === "Female"
                        ? "bg-pink-100 text-pink-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {voice.gender}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                    {voice.engine}
                  </span>
                </div>
                <button
                  onClick={() => setConfig((c) => ({ ...c, tts_voice: voice.id }))}
                  className={`mt-auto text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    config.tts_voice === voice.id
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                  }`}
                >
                  {config.tts_voice === voice.name ? "Selected" : "Use Voice"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test Voice */}
      <div className="mb-8 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-slate-900">Test Voice Preview</h2>
          <p className="text-sm text-slate-500 mt-0.5">Synthesize sample text with the selected voice via Azure Speech</p>
        </div>
        <div className="px-5 py-5 flex flex-col gap-3">
          <textarea
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={testVoice}
              disabled={playing || !previewText.trim()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {playing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Playing…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3" />
                  </svg>
                  Play Sample
                </>
              )}
            </button>
            <span className="text-sm text-slate-400">Voice: <span className="text-slate-600 font-medium">{config.tts_voice}</span></span>
          </div>
        </div>
      </div>

      {/* Voice Configuration */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-slate-900">Voice Configuration</h2>
        </div>
        <div className="px-5 py-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">TTS Engine</label>
            <select
              value={config.tts_engine}
              onChange={(e) => setConfig((c) => ({ ...c, tts_engine: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="azure">Azure</option>
              <option value="openai">OpenAI TTS</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">STT Engine</label>
            <select
              value={config.stt_engine}
              onChange={(e) => setConfig((c) => ({ ...c, stt_engine: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="azure">Azure</option>
              <option value="whisper">Whisper</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">TTS Voice</label>
            <select
              value={config.tts_voice}
              onChange={(e) => setConfig((c) => ({ ...c, tts_voice: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {voices.length > 0 ? (
                voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))
              ) : (
                <option value={config.tts_voice}>{config.tts_voice}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Silence Timeout (ms)</label>
            <input
              type="number"
              value={config.silence_timeout_ms}
              onChange={(e) => setConfig((c) => ({ ...c, silence_timeout_ms: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Max Call Duration (seconds)</label>
            <input
              type="number"
              value={config.max_call_duration_s}
              onChange={(e) => setConfig((c) => ({ ...c, max_call_duration_s: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              min={0}
            />
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center gap-3">
          <button
            onClick={saveConfig}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {saving ? "Saving…" : "Save Configuration"}
          </button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg.startsWith("Failed") ? "text-red-600" : "text-green-600"}`}>
              {saveMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
