import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000/api", timeout: 180000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", new URLSearchParams({ username: email, password })),
  register: (email: string, password: string, full_name: string) =>
    api.post("/auth/register", { email, password, full_name }),
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
  extractDocText: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ filename: string; text: string }>("/architect/extract-doc-text", form);
  },
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

export default api;
