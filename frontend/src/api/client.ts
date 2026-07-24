import axios from "axios";

const api = axios.create({ baseURL: "/api", timeout: 180000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    // Tag the request with the token it was actually sent with, so a 401
    // response can tell a genuinely-expired session apart from a stale
    // in-flight request that started before the user already logged back in
    // with a newer token (which must NOT force another logout).
    (config as { _authToken?: string })._authToken = token;
  }
  return config;
});

// Without this, an expired/invalid JWT makes every authenticated call (most
// visibly Architect's auto-save of a session to /api/projects) fail with a
// silent 401 that calling code catches and ignores -- the user sees nothing
// ever get saved, with no indication their session expired. Redirect to
// login so the failure is visible and recoverable instead of silent forever.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestToken = (error.config as { _authToken?: string } | undefined)?._authToken;
    const currentToken = localStorage.getItem("token");
    if (
      error.response?.status === 401 &&
      window.location.pathname !== "/login" &&
      requestToken === currentToken
    ) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", new URLSearchParams({ username: email, password })),
  register: (email: string, password: string, full_name: string) =>
    api.post("/auth/register", { email, password, full_name }),
  me: () => api.get("/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    api.post("/auth/change-password", { current_password, new_password }),
};

export const agentsApi = {
  list: () => api.get("/agents/"),
  create: (data: object) => api.post("/agents/", data),
  get: (id: string) => api.get(`/agents/${id}`),
  update: (id: string, data: object) => api.put(`/agents/${id}`, data),
  delete: (id: string) => api.delete(`/agents/${id}`),
  run: (id: string, input: string) => api.post(`/agents/${id}/run`, { input }),
  generateFromPrompt: (description: string) =>
    api.post("/agents/generate", { description }),
  suggestInput: (id: string, signal?: AbortSignal) =>
    api.post(`/agents/${id}/suggest-input`, {}, { signal }),
  activeModel: (model?: string) => api.get("/agents/active-model", { params: { model } }),
};

export const ragApi = {
  createKB: (name: string, description: string) =>
    api.post("/rag/knowledge-bases", { name, description }),
  upload: (kbId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/rag/knowledge-bases/${kbId}/upload`, form);
  },
  query: (kbId: string, question: string) =>
    api.post(`/rag/knowledge-bases/${kbId}/query`, { question }),
};

export const simulationApi = {
  run: (agentId: string, testCases: object[]) =>
    api.post(`/simulation/${agentId}/run`, { test_cases: testCases }),
};

export const controlPlaneApi = {
  stats: () => api.get("/control-plane/stats"),
  auditLogs: () => api.get("/control-plane/audit-logs"),
  versions: (agentId: string) =>
    api.get(`/control-plane/agents/${agentId}/versions`),
};

export const architectApi = {
  chat: (messages: { role: string; content: string }[]) =>
    api.post("/architect/chat", { messages }),
  generateProject: (payload: {
    app_name: string;
    summary: string;
    features: string[];
    agents?: object[];
    api_endpoints?: string[];
    database_schema?: string;
    tech_stack?: object;
    documents?: { name: string; text: string }[];
    sandbox_html?: string;
  }) => api.post<{ files: Record<string, string>; file_count: number }>("/architect/generate-project", payload),
  extractDocText: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ filename: string; text: string }>("/architect/extract-doc-text", form);
  },
  sandboxToAppTsx: (payload: {
    sandbox_html: string;
    scaffold_type: "rag" | "cc";
    app_title: string;
  }) => api.post<{ app_tsx: string }>("/architect/sandbox-to-apptsx", payload),
  generateUI: (payload: {
    app_name: string;
    summary: string;
    features: string[];
    frontend?: string;
    app_type?: string;
    domain?: string;
    company?: string;
    doc_types?: string[];
    documents?: { name: string; text: string }[];
    user_feedback?: string;
  }) => api.post("/architect/generate-ui", payload),
};

export const projectsApi = {
  list: (visibility: "private" | "published" | "shared", mine?: boolean) =>
    api.get("/projects/", { params: { visibility, mine } }),
  trash: () => api.get("/projects/trash"),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: object) => api.post("/projects/", data),
  update: (id: string, data: object) => api.put(`/projects/${id}`, data),
  setVisibility: (id: string, visibility: string, shared_with: string[] = []) =>
    api.put(`/projects/${id}/visibility`, { visibility, shared_with }),
  remove: (id: string) => api.delete(`/projects/${id}`),
  restore: (id: string) => api.post(`/projects/${id}/restore`),
  permanentDelete: (id: string) => api.delete(`/projects/${id}/permanent`),
};

export const apiKeysApi = {
  list: () => api.get("/api-keys/"),
  create: (name: string) => api.post("/api-keys/", { name }),
  delete: (id: string) => api.delete(`/api-keys/${id}`),
};

export const teamApi = {
  list: () => api.get("/team/"),
  invite: (email: string, role: string) => api.post("/team/invite", { email, role }),
  updateRole: (userId: string, role: string) => api.put(`/team/${userId}/role`, { role }),
  remove: (userId: string) => api.delete(`/team/${userId}`),
};

export default api;
