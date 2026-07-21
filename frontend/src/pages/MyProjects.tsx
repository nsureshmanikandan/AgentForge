import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projectsApi, teamApi } from "../api/client";

interface Project {
  id: string;
  owner_id: string;
  name: string;
  summary: string;
  app_type: string;
  visibility: "private" | "published" | "shared";
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: string;
  email: string;
  full_name: string;
}

const AVATAR_COLORS = [
  "bg-teal-500", "bg-indigo-500", "bg-violet-500",
  "bg-blue-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500",
];

function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ShareModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [visibility, setVisibility] = useState<"private" | "published" | "shared">(project.visibility);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    teamApi.list().then((r) => setTeam(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await projectsApi.setVisibility(project.id, visibility, visibility === "shared" ? selected : []);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-semibold text-slate-900 mb-1">Share "{project.name}"</h3>
        <p className="text-xs text-gray-400 mb-4">Choose who can see this project.</p>

        <div className="space-y-2 mb-4">
          {(["private", "published", "shared"] as const).map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={visibility === v} onChange={() => setVisibility(v)} />
              <span className="capitalize">{v}</span>
              <span className="text-xs text-gray-400">
                {v === "private" && "— only you"}
                {v === "published" && "— visible to everyone in the org"}
                {v === "shared" && "— pick specific teammates"}
              </span>
            </label>
          ))}
        </div>

        {visibility === "shared" && (
          <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg mb-4 divide-y divide-gray-50">
            {team.map((m) => (
              <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)))
                  }
                />
                {m.full_name} <span className="text-gray-400">({m.email})</span>
              </label>
            ))}
            {team.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No teammates found.</p>}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [trash, setTrash] = useState<Project[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shareTarget, setShareTarget] = useState<Project | null>(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    Promise.all([
      projectsApi.list("private", true),
      projectsApi.trash(),
    ])
      .then(([p, t]) => { setProjects(p.data); setTrash(t.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const deleteProject = async (id: string) => {
    await projectsApi.remove(id);
    load();
  };
  const restoreProject = async (id: string) => {
    await projectsApi.restore(id);
    load();
  };
  const permanentlyDelete = async (id: string) => {
    if (!window.confirm("Permanently delete this project? This can't be undone.")) return;
    await projectsApi.permanentDelete(id);
    load();
  };

  const list = showTrash ? trash : projects;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {shareTarget && (
        <ShareModal project={shareTarget} onClose={() => setShareTarget(null)} onSaved={load} />
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">My Projects</h1>
          <p className="text-gray-500 text-sm">Everything you've built with Architect, saved and reusable</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTrash((s) => !s)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              showTrash ? "bg-gray-800 text-white" : "border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
            }`}
          >
            {showTrash ? "Back to Projects" : `Trash${trash.length ? ` (${trash.length})` : ""}`}
          </button>
          <button
            onClick={() => navigate("/architect")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center mt-32">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading projects...
          </div>
        </div>
      ) : list.length === 0 ? (
        <div className="text-center mt-20">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium mb-1">{showTrash ? "Trash is empty" : "No projects yet"}</p>
          {!showTrash && (
            <>
              <p className="text-gray-400 text-sm mb-5">Describe an app in Architect to get started — it'll show up here automatically</p>
              <button
                onClick={() => navigate("/architect")}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Go to Architect
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((project) => (
            <div key={project.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col">
              <div className="p-5 flex-1">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0 ${getAvatarColor(project.name)}`}>
                    {project.name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{project.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{project.app_type}</span>
                      <span className="text-xs text-gray-400">{formatDate(project.updated_at)}</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                  {project.summary || "No description"}
                </p>
              </div>

              <div className="px-5 pb-5 pt-0">
                <div className="border-t border-gray-100 pt-4 flex items-center gap-2 flex-wrap">
                  {showTrash ? (
                    <>
                      <button
                        onClick={() => restoreProject(project.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => permanentlyDelete(project.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        Delete Forever
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => navigate("/architect", { state: { openProjectId: project.id } })}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                        title="Open in Architect"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => navigate("/architect", { state: { openProjectId: project.id, autoDownload: true } })}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                        title="Download ZIP"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => setShareTarget(project)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
                        title="Publish or share"
                      >
                        Share
                      </button>
                      <button
                        onClick={() => deleteProject(project.id)}
                        className="inline-flex items-center justify-center px-2.5 py-2 border border-gray-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-gray-500 hover:text-rose-600 text-xs font-medium rounded-lg transition-colors"
                        title="Delete"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
