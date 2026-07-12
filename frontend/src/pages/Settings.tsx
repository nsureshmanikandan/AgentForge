import { useState, useEffect } from "react";

type Tab = "General" | "Models" | "Guardrails" | "Appearance";

/* ── Reusable toggle switch ────────────────────────────────────────────── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
        checked ? "bg-indigo-600" : "bg-gray-200"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/* ── Toast ─────────────────────────────────────────────────────────────── */
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg animate-fade-in">
      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {message}
    </div>
  );
}

/* ── Section heading ────────────────────────────────────────────────────── */
function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

/* ── General tab ────────────────────────────────────────────────────────── */
function GeneralTab({ onSave }: { onSave: () => void }) {
  const [orgName, setOrgName] = useState(() => localStorage.getItem("af_org_name") ?? "Accenture Org");
  const [defaultDesc, setDefaultDesc] = useState(() => localStorage.getItem("af_default_desc") ?? "");

  function save() {
    localStorage.setItem("af_org_name", orgName);
    localStorage.setItem("af_default_desc", defaultDesc);
    onSave();
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <SectionHeading title="Organization" subtitle="General information about your workspace." />
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Accenture Org"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Default Agent Description</label>
            <textarea
              value={defaultDesc}
              onChange={(e) => setDefaultDesc(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              placeholder="Pre-filled description for new agents…"
            />
            <p className="text-xs text-gray-400 mt-1">This will be pre-filled when creating a new agent.</p>
          </div>
        </div>
      </div>
      <div className="flex">
        <button
          onClick={save}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

/* ── Models tab ─────────────────────────────────────────────────────────── */
function ModelsTab({ onSave }: { onSave: () => void }) {
  const [model, setModel] = useState(() => localStorage.getItem("af_default_model") ?? "gpt-4o");
  const [temperature, setTemperature] = useState(() =>
    parseFloat(localStorage.getItem("af_default_temperature") ?? "0.7")
  );
  const [topP, setTopP] = useState(() =>
    parseFloat(localStorage.getItem("af_default_top_p") ?? "1.0")
  );

  function save() {
    localStorage.setItem("af_default_model", model);
    localStorage.setItem("af_default_temperature", String(temperature));
    localStorage.setItem("af_default_top_p", String(topP));
    onSave();
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <SectionHeading title="Default Model Settings" subtitle="Applied to all new agents unless overridden." />
        <div className="space-y-6 max-w-lg">
          {/* Model selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Default Model</label>
            <div className="flex gap-3 flex-wrap">
              {["gpt-4o", "gpt-4-5", "gpt-4o-mini"].map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    model === m
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Temperature slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Default Temperature</label>
              <span className="text-sm font-mono text-indigo-600">{temperature.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Deterministic (0)</span>
              <span>Creative (1)</span>
            </div>
          </div>

          {/* Top-P slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Default Top-P</label>
              <span className="text-sm font-mono text-indigo-600">{topP.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Focused (0)</span>
              <span>Diverse (1)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Endpoint info */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <SectionHeading title="Azure OpenAI Endpoint" subtitle="Configured via backend environment variables." />
        <div className="max-w-lg">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Endpoint</label>
          <input
            type="text"
            readOnly
            value="http://localhost:8000 (via backend)"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">To change this, update the backend <code className="bg-gray-100 px-1 rounded">.env</code> file.</p>
        </div>
      </div>

      <div className="flex">
        <button
          onClick={save}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

/* ── Guardrails tab ─────────────────────────────────────────────────────── */
function GuardrailsTab({ onSave }: { onSave: () => void }) {
  const [pii, setPii] = useState(() => localStorage.getItem("af_default_pii") === "true");
  const [hallucination, setHallucination] = useState(
    () => localStorage.getItem("af_default_hallucination") === "true"
  );
  const [inputGuard, setInputGuard] = useState(
    () => localStorage.getItem("af_default_input_guard") !== "false"
  );
  const [outputGuard, setOutputGuard] = useState(
    () => localStorage.getItem("af_default_output_guard") !== "false"
  );

  function save() {
    localStorage.setItem("af_default_pii", String(pii));
    localStorage.setItem("af_default_hallucination", String(hallucination));
    localStorage.setItem("af_default_input_guard", String(inputGuard));
    localStorage.setItem("af_default_output_guard", String(outputGuard));
    onSave();
  }

  const rows = [
    {
      label: "PII Redaction",
      description: "Automatically redact personally identifiable information before sending to the LLM.",
      value: pii,
      onChange: setPii,
    },
    {
      label: "Hallucination Guard",
      description: "Run a secondary check to flag low-confidence or unsupported model claims.",
      value: hallucination,
      onChange: setHallucination,
    },
    {
      label: "Input Guardrails",
      description: "Check and sanitize user input before it reaches the LLM.",
      value: inputGuard,
      onChange: setInputGuard,
    },
    {
      label: "Output Guardrails",
      description: "Validate and filter LLM output before returning it to the user.",
      value: outputGuard,
      onChange: setOutputGuard,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <SectionHeading title="Default Guardrail Settings" />
        <div className="divide-y divide-gray-100">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
              <div className="pr-8">
                <p className="text-sm font-medium text-slate-900">{row.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{row.description}</p>
              </div>
              <Toggle checked={row.value} onChange={row.onChange} />
            </div>
          ))}
        </div>
      </div>

      {/* Info box */}
      <div className="flex gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
        <svg className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-sm text-indigo-800">
          These defaults apply to all <strong>new agents</strong>. Existing agents use their own saved settings.
        </p>
      </div>

      <div className="flex">
        <button
          onClick={save}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

/* ── Appearance tab ─────────────────────────────────────────────────────── */
function AppearanceTab() {
  const [theme, setTheme] = useState(() => localStorage.getItem("af_theme") ?? "System");
  const [density, setDensity] = useState(() => localStorage.getItem("af_sidebar_density") ?? "Comfortable");

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <SectionHeading title="Theme" />
        <div className="flex gap-3 flex-wrap mb-4">
          {["Light", "Dark", "System"].map((t) => (
            <button
              key={t}
              onClick={() => { setTheme(t); localStorage.setItem("af_theme", t); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                theme === t
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <SectionHeading title="Sidebar Density" subtitle="Controls spacing in the navigation sidebar." />
        <div className="flex gap-3 flex-wrap">
          {["Comfortable", "Compact"].map((d) => (
            <button
              key={d}
              onClick={() => { setDensity(d); localStorage.setItem("af_sidebar_density", d); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                density === d
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Coming soon note */}
      <div className="flex gap-3 bg-amber-50 border border-amber-100 rounded-xl px-5 py-4">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-800">Coming Soon</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Theme switching will be applied globally in a future update. Your preference is saved and will activate automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Main Settings page ─────────────────────────────────────────────────── */
const TABS: Tab[] = ["General", "Models", "Guardrails", "Appearance"];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("General");
  const [toast, setToast] = useState<string | null>(null);

  function showToast() {
    setToast("Settings saved successfully.");
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage platform-wide defaults and preferences</p>
      </div>

      {/* Tab pills */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl w-fit mb-8">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-slate-900 shadow-sm"
                : "text-gray-500 hover:text-slate-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "General" && <GeneralTab onSave={showToast} />}
      {activeTab === "Models" && <ModelsTab onSave={showToast} />}
      {activeTab === "Guardrails" && <GuardrailsTab onSave={showToast} />}
      {activeTab === "Appearance" && <AppearanceTab />}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
