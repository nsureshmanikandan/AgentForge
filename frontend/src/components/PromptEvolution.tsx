import { useState } from "react";

// ─── Shared types ─────────────────────────────────────────────────────────────
export type PromptChangeType = "initial" | "suggest" | "feature" | "bugfix" | "enhance" | "refine";

export interface PromptVersion {
  version: number;
  ts: number;
  changeType: PromptChangeType;
  userInput: string;
  enhancedPrompt: string;
  addedFeatures?: string[];
  changeLabel: string;
  changeSummary?: string;
}

export const CHANGE_TYPE_META: Record<Exclude<PromptChangeType, "initial">, { label: string; pill: string; icon: string }> = {
  feature:  { label: "Feature",  pill: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "✦" },
  bugfix:   { label: "Bug Fix",  pill: "bg-rose-100 text-rose-700 border-rose-200",           icon: "⚒" },
  enhance:  { label: "Enhance",  pill: "bg-violet-100 text-violet-700 border-violet-200",     icon: "↑" },
  refine:   { label: "Refine",   pill: "bg-amber-100 text-amber-700 border-amber-200",        icon: "✎" },
  suggest:  { label: "Suggest",  pill: "bg-sky-100 text-sky-700 border-sky-200",              icon: "💡" },
};

export function detectChangeType(text: string): PromptChangeType {
  const t = text.toLowerCase();
  if (/\b(bug|fix|broken|error|not working|crash|issue|problem|wrong|incorrect|missing)\b/.test(t)) return "bugfix";
  if (/\b(add|include|new feature|support|enable|allow|integrate|connect)\b/.test(t)) return "feature";
  if (/\b(improve|better|enhance|upgrade|optimize|polish|refine|clean)\b/.test(t)) return "enhance";
  if (/\b(change|update|modify|adjust|tweak|different|instead|replace|switch)\b/.test(t)) return "refine";
  if (/\b(suggest|recommend|idea|what if|consider|maybe|how about)\b/.test(t)) return "suggest";
  return "refine";
}

// ─── Compact pills — used wherever a "What evolved" strip is needed ────────────
export function PromptEvolutionPills({ history, title = "What evolved so far" }: { history: PromptVersion[]; title?: string }) {
  const changes = history.slice(1);
  if (changes.length === 0) return null;
  return (
    <div className="px-3 py-2 bg-amber-50/60 border border-amber-100 rounded-xl">
      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1">
        {changes.map((ch, idx) => {
          const meta = CHANGE_TYPE_META[ch.changeType as Exclude<PromptChangeType, "initial">] ?? CHANGE_TYPE_META.refine;
          const label = ch.changeSummary || ch.userInput;
          return (
            <span
              key={ch.version}
              className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${meta.pill}`}
              title={label}
            >
              {meta.icon} C{idx + 1}: {label.slice(0, 35)}{label.length > 35 ? "…" : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Full 3-block section — used in detailed plan/config views ────────────────
export function PromptEvolutionSection({ history, sectionTitle = "Prompt Evolution" }: { history: PromptVersion[]; sectionTitle?: string }) {
  const [enhancedOpen, setEnhancedOpen] = useState(false);
  const [openChange, setOpenChange] = useState<number | null>(null);

  const v1 = history[0];
  const changes = history.slice(1);
  if (!v1) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{sectionTitle}</h3>
        {changes.length > 0 && (
          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
            {changes.length} change{changes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Block 1: Original prompt — locked */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
          <span className="w-5 h-5 rounded-md bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">U</span>
          <span className="text-xs font-semibold text-slate-700">Original Prompt</span>
          <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 flex items-center gap-1">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
            Locked
          </span>
        </div>
        <p className="px-3 py-3 text-xs text-slate-700 leading-relaxed whitespace-pre-line">{v1.userInput}</p>
        <div className="px-3 pb-2">
          <span className="text-[10px] text-slate-400">{new Date(v1.ts).toLocaleString()}</span>
        </div>
      </div>

      {/* Block 2: LLM-enhanced version — collapsible, locked */}
      {v1.enhancedPrompt && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 overflow-hidden">
          <button
            className="w-full flex items-center gap-2 px-3 py-2 border-b border-indigo-100 bg-white/80 hover:bg-white transition-colors text-left"
            onClick={() => setEnhancedOpen((o) => !o)}
          >
            <span className="w-5 h-5 rounded-md bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">AI</span>
            <span className="text-xs font-semibold text-indigo-800">AI-Generated Version</span>
            <span className="ml-auto text-[10px] text-indigo-400 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 flex items-center gap-1 mr-1">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
              Locked
            </span>
            <svg className={`w-3.5 h-3.5 text-indigo-400 flex-shrink-0 transition-transform ${enhancedOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!enhancedOpen && (
            <p className="px-3 py-2.5 text-xs text-indigo-700 leading-relaxed line-clamp-2">{v1.enhancedPrompt}</p>
          )}
          {enhancedOpen && (
            <p className="px-3 py-3 text-xs text-indigo-800 leading-relaxed whitespace-pre-line">{v1.enhancedPrompt}</p>
          )}
        </div>
      )}

      {/* Block 3: Incremental changes */}
      {changes.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-semibold text-gray-600">Incremental Changes</span>
            <span className="ml-auto text-[10px] text-gray-400">{changes.length} total</span>
          </div>

          {/* Compact pills strip */}
          <div className="px-3 py-2 bg-amber-50/60 border-b border-amber-100">
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">What evolved so far</p>
            <div className="flex flex-wrap gap-1">
              {changes.map((ch, idx) => {
                const meta = CHANGE_TYPE_META[ch.changeType as Exclude<PromptChangeType, "initial">] ?? CHANGE_TYPE_META.refine;
                const label = ch.changeSummary || ch.userInput;
                return (
                  <span key={ch.version} className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${meta.pill}`} title={label}>
                    {meta.icon} C{idx + 1}: {label.slice(0, 35)}{label.length > 35 ? "…" : ""}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {changes.map((ch, idx) => {
              const changeNum = idx + 1;
              const meta = CHANGE_TYPE_META[ch.changeType as Exclude<PromptChangeType, "initial">] ?? CHANGE_TYPE_META.refine;
              const isOpen = openChange === ch.version;
              const isLatest = idx === changes.length - 1;
              return (
                <div key={ch.version}>
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setOpenChange(isOpen ? null : ch.version)}
                  >
                    <span className="w-6 h-6 rounded-full bg-gray-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {changeNum}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-700">Change {changeNum}</span>
                        {isLatest && (
                          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5">Latest</span>
                        )}
                      </div>
                      {ch.changeSummary && (
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">{ch.changeSummary}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-0.5 flex-shrink-0 ${meta.pill}`}>
                      {meta.icon} {meta.label}
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:inline">
                      {new Date(ch.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100 space-y-2">
                      {ch.changeSummary && (
                        <>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">AI Summary</p>
                          <p className="text-xs text-gray-700 leading-relaxed bg-white rounded-lg px-3 py-2 border border-gray-200 italic">
                            {ch.changeSummary}
                          </p>
                        </>
                      )}
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Instruction</p>
                      <p className="text-xs text-gray-700 leading-relaxed bg-white rounded-lg px-3 py-2.5 border border-gray-200 whitespace-pre-line">
                        {ch.userInput}
                      </p>
                      <p className="text-[10px] text-gray-400">{new Date(ch.ts).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Self-healing helper — call after any setSessions/setState that adds a PromptVersion
// Pass the expected new length; if the committed array is shorter, inserts the repair entry.
export function buildRepairEntry(
  existing: PromptVersion[],
  userInput: string,
  changeSummary: string,
  changeType: PromptChangeType
): PromptVersion {
  const lastVer = existing[existing.length - 1]?.version ?? 0;
  return {
    version: lastVer + 1,
    ts: Date.now(),
    changeType,
    userInput,
    enhancedPrompt: "",
    changeSummary,
    changeLabel: `Change ${lastVer} · ${changeType.charAt(0).toUpperCase() + changeType.slice(1)}`,
  };
}
