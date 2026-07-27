import { useState } from "react";
import type { MarketplaceTemplate } from "./marketplaceTemplates";

const CATEGORY_COLORS: Record<string, string> = {
  "Automation": "bg-indigo-100 text-indigo-700",
  "Analytics & Insights": "bg-sky-100 text-sky-700",
  "Communication": "bg-purple-100 text-purple-700",
  "Content Creation": "bg-pink-100 text-pink-700",
  "Customer Support": "bg-teal-100 text-teal-700",
  "Data Processing": "bg-cyan-100 text-cyan-700",
  "Developer Tools": "bg-gray-100 text-gray-700",
  "Finance & Accounting": "bg-emerald-100 text-emerald-700",
  "HR & Recruiting": "bg-orange-100 text-orange-700",
  "Marketing": "bg-rose-100 text-rose-700",
  "Productivity": "bg-blue-100 text-blue-700",
  "Sales & CRM": "bg-amber-100 text-amber-700",
  "Other": "bg-slate-100 text-slate-700",
};

function viewCount(id: string): number {
  try {
    const store = JSON.parse(localStorage.getItem("af_marketplace_views") ?? "{}");
    return store[id] ?? 0;
  } catch {
    return 0;
  }
}

export default function TemplateCard({
  template,
  onClick,
}: {
  template: MarketplaceTemplate;
  onClick: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const badgeClass = CATEGORY_COLORS[template.category] ?? "bg-slate-100 text-slate-700";
  const showImage = template.hasPreview && !imgFailed;

  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-300 transition-all overflow-hidden flex flex-col"
    >
      <div className="h-32 bg-gray-50 border-b border-gray-100 flex items-center justify-center overflow-hidden">
        {showImage ? (
          <img
            src={template.previewImagePath}
            alt={template.name}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
            {template.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <span className={`self-start text-[11px] font-medium px-2 py-0.5 rounded-full mb-2 ${badgeClass}`}>
          {template.category}
        </span>
        <p className="text-sm font-semibold text-gray-900 mb-1">{template.name}</p>
        <p className="text-xs text-gray-500 flex-1">{template.shortDescription}</p>
        <div className="flex items-center gap-1 mt-3 text-[11px] text-gray-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {viewCount(template.id)}
        </div>
      </div>
    </button>
  );
}
