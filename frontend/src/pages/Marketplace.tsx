import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CATEGORIES,
  USE_CASES,
  INTEGRATIONS,
  LLM_MODELS,
  MARKETPLACE_TEMPLATES,
  type MarketplaceTemplate,
} from "../components/marketplaceTemplates";
import TemplateCard from "../components/TemplateCard";
import TemplateDetailModal from "../components/TemplateDetailModal";

type SortMode = "popular" | "recent" | "top-rated";

function viewCount(id: string): number {
  try {
    const store = JSON.parse(localStorage.getItem("af_marketplace_views") ?? "{}");
    return store[id] ?? 0;
  } catch {
    return 0;
  }
}

export default function Marketplace() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>("popular");
  const [activeTemplate, setActiveTemplate] = useState<MarketplaceTemplate | null>(null);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let items = MARKETPLACE_TEMPLATES.filter((t) => {
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.shortDescription.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q));
      const matchCat = selectedCategories.length === 0 || selectedCategories.includes(t.category);
      const matchUseCase =
        selectedUseCases.length === 0 || t.useCases.some((u) => selectedUseCases.includes(u));
      const matchIntegration =
        selectedIntegrations.length === 0 || t.integrations.some((i) => selectedIntegrations.includes(i));
      const matchModel = selectedModels.length === 0 || selectedModels.includes(t.llmModel);
      return matchSearch && matchCat && matchUseCase && matchIntegration && matchModel;
    });

    if (sort === "popular") {
      items = [...items].sort((a, b) => viewCount(b.id) - viewCount(a.id));
    } else if (sort === "recent") {
      items = [...items].sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
    }
    // "top-rated" has no real rating data yet -- keep curated order as a
    // reasonable placeholder (see design spec's Non-Goals section).
    return items;
  }, [search, selectedCategories, selectedUseCases, selectedIntegrations, selectedModels, sort]);

  function handleUseTemplate(template: MarketplaceTemplate) {
    setActiveTemplate(null);
    navigate("/architect", {
      state: {
        prompt: template.prompt,
        files: [{ name: template.testDataFileName, text: template.testData }],
      },
    });
  }

  const allFilters: { label: string; group: string; onClear: () => void }[] = [
    ...selectedCategories.map((v) => ({ label: v, group: "category", onClear: () => toggle(selectedCategories, setSelectedCategories, v) })),
    ...selectedUseCases.map((v) => ({ label: v, group: "useCase", onClear: () => toggle(selectedUseCases, setSelectedUseCases, v) })),
    ...selectedIntegrations.map((v) => ({ label: v, group: "integration", onClear: () => toggle(selectedIntegrations, setSelectedIntegrations, v) })),
    ...selectedModels.map((v) => ({ label: v, group: "model", onClear: () => toggle(selectedModels, setSelectedModels, v) })),
  ];

  function clearAllFilters() {
    setSelectedCategories([]);
    setSelectedUseCases([]);
    setSelectedIntegrations([]);
    setSelectedModels([]);
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Marketplace</h1>
        <p className="text-gray-500 text-sm">Browse pre-built app templates and start building in one click.</p>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates by name, description, or tags..."
            className="outline-none text-sm bg-transparent w-full text-gray-700 placeholder-gray-400"
          />
        </div>
        <div className="flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          {([
            ["popular", "Popular"],
            ["recent", "Recent"],
            ["top-rated", "Top Rated"],
          ] as [SortMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setSort(mode)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                sort === mode ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        <aside className="w-56 flex-shrink-0 space-y-5">
          <FilterSection
            title="Categories"
            options={CATEGORIES as readonly string[]}
            selected={selectedCategories}
            onToggle={(v) => toggle(selectedCategories, setSelectedCategories, v)}
            onSelectAll={() => setSelectedCategories([...CATEGORIES])}
            onClearAll={() => setSelectedCategories([])}
          />
          <FilterSection
            title="Use Cases"
            options={USE_CASES as readonly string[]}
            selected={selectedUseCases}
            onToggle={(v) => toggle(selectedUseCases, setSelectedUseCases, v)}
            onSelectAll={() => setSelectedUseCases([...USE_CASES])}
            onClearAll={() => setSelectedUseCases([])}
          />
          <FilterSection
            title="Integrations"
            options={INTEGRATIONS as readonly string[]}
            selected={selectedIntegrations}
            onToggle={(v) => toggle(selectedIntegrations, setSelectedIntegrations, v)}
            onSelectAll={() => setSelectedIntegrations([...INTEGRATIONS])}
            onClearAll={() => setSelectedIntegrations([])}
          />
          <FilterSection
            title="LLM Models"
            options={LLM_MODELS as readonly string[]}
            selected={selectedModels}
            onToggle={(v) => toggle(selectedModels, setSelectedModels, v)}
            onSelectAll={() => setSelectedModels([...LLM_MODELS])}
            onClearAll={() => setSelectedModels([])}
          />
        </aside>

        <div className="flex-1">
          {allFilters.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-gray-500">Active filters:</span>
              {allFilters.map((f) => (
                <span key={`${f.group}-${f.label}`} className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                  {f.label}
                  <button onClick={f.onClear} className="hover:text-indigo-900">×</button>
                </span>
              ))}
              <button onClick={clearAllFilters} className="text-[11px] text-indigo-600 hover:underline ml-1">
                Clear all
              </button>
            </div>
          )}
          <p className="text-sm text-gray-500 mb-4">Results ({filtered.length})</p>

          {filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">No templates match your search/filters.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((t) => (
                <TemplateCard key={t.id} template={t} onClick={() => setActiveTemplate(t)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {activeTemplate && (
        <TemplateDetailModal
          template={activeTemplate}
          onClose={() => setActiveTemplate(null)}
          onUseTemplate={handleUseTemplate}
        />
      )}
    </div>
  );
}

function FilterSection({
  title,
  options,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  title: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        <div className="flex items-center gap-2">
          <button onClick={onSelectAll} className="text-[11px] text-indigo-600 hover:underline">
            Select all
          </button>
          {selected.length > 0 && (
            <button onClick={onClearAll} className="text-[11px] text-indigo-600 hover:underline">
              Clear all
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => onToggle(opt)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}
