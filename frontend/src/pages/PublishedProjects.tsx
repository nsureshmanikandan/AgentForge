import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projectsApi } from "../api/client";

interface Project {
  id: string;
  name: string;
  summary: string;
  app_type: string;
  updated_at: string;
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

export default function PublishedProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    projectsApi.list("published").then((r) => setProjects(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const deleteProject = async (id: string) => {
    if (!window.confirm("Remove this project from Published Projects? This can't be undone.")) return;
    try {
      await projectsApi.remove(id);
      load();
    } catch {
      window.alert("Only the project owner can delete this project.");
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Published Projects</h1>
        <p className="text-gray-500 text-sm">Projects published org-wide, visible to anyone at Accenture</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center mt-32 text-gray-400 text-sm">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-center mt-20">
          <p className="text-gray-600 font-medium mb-1">No published projects yet</p>
          <p className="text-gray-400 text-sm">Publish a project from My Projects to see it here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
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
                <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">{project.summary || "No description"}</p>
              </div>
              <div className="px-5 pb-5 pt-0">
                <div className="border-t border-gray-100 pt-4 flex items-center gap-2">
                  <button
                    onClick={() => navigate("/architect", { state: { openProjectId: project.id } })}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                  >
                    Open in Architect
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
