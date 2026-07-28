import { useState } from "react";
import type { MarketplaceTemplate } from "./marketplaceTemplates";

function bumpCounter(storeKey: string, id: string): number {
  try {
    const store = JSON.parse(localStorage.getItem(storeKey) ?? "{}");
    store[id] = (store[id] ?? 0) + 1;
    localStorage.setItem(storeKey, JSON.stringify(store));
    return store[id];
  } catch {
    return 0;
  }
}

function readCounter(storeKey: string, id: string): number {
  try {
    const store = JSON.parse(localStorage.getItem(storeKey) ?? "{}");
    return store[id] ?? 0;
  } catch {
    return 0;
  }
}

export default function TemplateDetailModal({
  template,
  onClose,
  onUseTemplate,
}: {
  template: MarketplaceTemplate;
  onClose: () => void;
  onUseTemplate: (template: MarketplaceTemplate) => void;
}) {
  const [views, setViews] = useState(() => readCounter("af_marketplace_views", template.id));
  const [clones, setClones] = useState(() => readCounter("af_marketplace_clones", template.id));
  const [imgFailed, setImgFailed] = useState(false);

  const showPreview = template.hasPreview && !imgFailed;

  function handleViewApp() {
    if (!template.hasPreview) return;
    setViews(bumpCounter("af_marketplace_views", template.id));
    window.open(template.previewImagePath, "_blank", "noopener,noreferrer");
  }

  function handleUseTemplate() {
    setClones(bumpCounter("af_marketplace_clones", template.id));
    onUseTemplate(template);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-xl font-bold text-gray-900">{template.name}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 mb-4">
            {template.category}
          </span>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">About</p>
          <p className="text-sm text-gray-700 mb-4">{template.about}</p>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Created by</p>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
              {template.createdBy.charAt(0)}
            </div>
            <span className="text-sm text-gray-700">{template.createdBy}</span>
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tags</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {template.tags.map((t) => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Use cases</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {template.useCases.map((u) => (
              <span key={u} className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full">{u}</span>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Integrations</p>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {template.integrations.map((i) => (
              <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{i}</span>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mb-5">Model: {template.llmModel}</p>

          <div className="flex gap-2 mb-5">
            {template.hasPreview && (
              <button
                onClick={handleViewApp}
                className="flex-1 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg px-4 py-2.5"
              >
                View App
              </button>
            )}
            <button
              onClick={handleUseTemplate}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2.5"
            >
              Use This Template
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center border border-gray-200 rounded-lg py-2">
              <p className="text-lg font-bold text-gray-900">{views}</p>
              <p className="text-[10px] text-gray-400">Views</p>
            </div>
            <div className="text-center border border-gray-200 rounded-lg py-2">
              <p className="text-lg font-bold text-gray-900">{clones}</p>
              <p className="text-[10px] text-gray-400">Clones</p>
            </div>
            <div className="text-center border border-gray-200 rounded-lg py-2">
              <p className="text-lg font-bold text-gray-300">—</p>
              <p className="text-[10px] text-gray-400">Rating</p>
            </div>
          </div>

          <p className="text-[11px] text-gray-400">Published: {template.publishedDate}</p>
        </div>

        <div className="bg-gray-50 border-t md:border-t-0 md:border-l border-gray-100 flex items-center justify-center p-6">
          {showPreview ? (
            <img
              src={template.previewImagePath}
              alt={template.name}
              className="rounded-lg border border-gray-200 max-h-64 object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-3xl">
              {template.name.charAt(0)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
