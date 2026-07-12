import { useEffect, useRef, useState } from "react";
import { ragApi } from "../api/client";

interface KB {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

const LS_KBS = "af_kbs";

function kbDocsKey(id: string) {
  return `af_kb_docs_${id}`;
}

function loadKBs(): KB[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KBS) || "[]");
  } catch {
    return [];
  }
}

function saveKBs(kbs: KB[]) {
  localStorage.setItem(LS_KBS, JSON.stringify(kbs));
}

function loadDocs(id: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(kbDocsKey(id)) || "[]");
  } catch {
    return [];
  }
}

function saveDocs(id: string, docs: string[]) {
  localStorage.setItem(kbDocsKey(id), JSON.stringify(docs));
}

// ── Modal: Create KB ──────────────────────────────────────────────────────────
interface CreateModalProps {
  onClose: () => void;
  onCreate: (kb: KB) => void;
}

function CreateModal({ onClose, onCreate }: CreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await ragApi.createKB(name.trim(), description.trim());
      const data = res.data as { id: string; name: string; description: string };
      const kb: KB = {
        id: data.id,
        name: data.name,
        description: data.description,
        createdAt: new Date().toISOString(),
      };
      onCreate(kb);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to create knowledge base.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">New Knowledge Base</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product Documentation"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this KB contains…"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Query KB ───────────────────────────────────────────────────────────
interface QueryModalProps {
  kb: KB;
  onClose: () => void;
}

function QueryModal({ kb, onClose }: QueryModalProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleQuery() {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");
    setError("");
    try {
      const res = await ragApi.query(kb.id, question.trim());
      const data = res.data as { answer: string };
      setAnswer(data.answer);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Query failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Query Knowledge Base</h2>
            <p className="text-xs text-gray-400 mt-0.5">{kb.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleQuery()}
            placeholder="Ask a question…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            onClick={handleQuery}
            disabled={loading || !question.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              "Ask"
            )}
          </button>
        </div>

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

        {answer && (
          <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">Answer</p>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline Upload Panel ───────────────────────────────────────────────────────
interface UploadStatus {
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

interface UploadPanelProps {
  kb: KB;
  onDocAdded: (filename: string) => void;
  onClose: () => void;
}

function UploadPanel({ kb, onDocAdded, onClose }: UploadPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadStatus[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      setUploads((prev) => [...prev, { name: file.name, status: "uploading" }]);
      try {
        await ragApi.upload(kb.id, file);
        setUploads((prev) =>
          prev.map((u) => (u.name === file.name ? { ...u, status: "done" } : u))
        );
        onDocAdded(file.name);
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setUploads((prev) =>
          prev.map((u) =>
            u.name === file.name ? { ...u, status: "error", error: msg || "Upload failed" } : u
          )
        );
      }
    }
  }

  return (
    <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-slate-700">Upload Documents</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-xs">
          Close
        </button>
      </div>

      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <svg className="w-7 h-7 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-xs text-gray-500">Drop files here or <span className="text-indigo-600 font-medium">browse</span></p>
        <p className="text-xs text-gray-400 mt-0.5">PDF, DOCX, TXT, CSV</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.csv"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center gap-2">
              {u.status === "uploading" && (
                <svg className="w-3.5 h-3.5 animate-spin text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {u.status === "done" && (
                <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {u.status === "error" && (
                <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="text-xs text-slate-700 truncate flex-1">{u.name}</span>
              {u.status === "uploading" && <span className="text-xs text-gray-400">Uploading…</span>}
              {u.status === "done" && <span className="text-xs text-emerald-600">Done</span>}
              {u.status === "error" && <span className="text-xs text-red-600">{u.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── KB Card ───────────────────────────────────────────────────────────────────
interface KBCardProps {
  kb: KB;
  onDelete: (id: string) => void;
  onQuery: (kb: KB) => void;
}

function KBCard({ kb, onDelete, onQuery }: KBCardProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [docs, setDocs] = useState<string[]>(() => loadDocs(kb.id));
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDocAdded(filename: string) {
    setDocs((prev) => {
      const updated = prev.includes(filename) ? prev : [...prev, filename];
      saveDocs(kb.id, updated);
      return updated;
    });
  }

  const dateLabel = new Date(kb.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col">
      <div className="p-5 flex-1">
        {/* Card header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 text-sm leading-tight truncate">{kb.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{kb.description || "No description"}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            {docs.length} doc{docs.length !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
            {dateLabel}
          </span>
        </div>

        {/* Document list */}
        {docs.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Documents</p>
            <ul className="space-y-1">
              {docs.slice(0, 4).map((d, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs text-slate-600 truncate">
                  <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                  </svg>
                  {d}
                </li>
              ))}
              {docs.length > 4 && (
                <li className="text-xs text-gray-400">+{docs.length - 4} more</li>
              )}
            </ul>
          </div>
        )}

        {/* Upload panel */}
        {showUpload && (
          <UploadPanel
            kb={kb}
            onDocAdded={handleDocAdded}
            onClose={() => setShowUpload(false)}
          />
        )}
      </div>

      {/* Actions */}
      <div className="px-5 pb-4 pt-0 flex items-center gap-2">
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          Upload
        </button>
        <button
          onClick={() => onQuery(kb)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
          </svg>
          Query
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                localStorage.removeItem(kbDocsKey(kb.id));
                onDelete(kb.id);
              }}
              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 text-gray-400 border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function KnowledgeBases() {
  const [kbs, setKBs] = useState<KB[]>(() => loadKBs());
  const [showCreate, setShowCreate] = useState(false);
  const [queryTarget, setQueryTarget] = useState<KB | null>(null);

  function handleCreate(kb: KB) {
    const updated = [...kbs, kb];
    setKBs(updated);
    saveKBs(updated);
    setShowCreate(false);
  }

  function handleDelete(id: string) {
    const updated = kbs.filter((kb) => kb.id !== id);
    setKBs(updated);
    saveKBs(updated);
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Knowledge Bases</h1>
          <p className="text-gray-500 text-sm mt-1">Upload documents and query your data with AI</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Knowledge Base
        </button>
      </div>

      {/* Summary bar */}
      {kbs.length > 0 && (
        <div className="mb-6 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
            {kbs.length} knowledge base{kbs.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Grid */}
      {kbs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">No knowledge bases yet</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-sm">
            Create a knowledge base to upload documents and let your AI agents query them.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create your first KB
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {kbs.map((kb) => (
            <KBCard
              key={kb.id}
              kb={kb}
              onDelete={handleDelete}
              onQuery={(k) => setQueryTarget(k)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
      {queryTarget && (
        <QueryModal kb={queryTarget} onClose={() => setQueryTarget(null)} />
      )}
    </div>
  );
}
