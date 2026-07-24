import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import mammoth from "mammoth";

async function extractFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "docx") {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.slice(0, 3000);
  }
  if (ext === "txt" || ext === "md" || ext === "csv" || ext === "json") {
    return (await file.text()).slice(0, 3000);
  }
  if (ext === "pdf") {
    return `[PDF text extraction not supported in browser — please copy-paste the text content instead]`;
  }
  return `[Binary file: ${file.name}]`;
}

export default function ArchitectHome() {
  const [prompt, setPrompt] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files]);
    for (const file of files) {
      const text = await extractFileText(file);
      setFileContents((prev) => ({ ...prev, [file.name]: text }));
    }
  };

  const removeFile = (name: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name));
    setFileContents((prev) => { const n = { ...prev }; delete n[name]; return n; });
  };

  const handleSubmit = () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    const files = attachedFiles.map((f) => ({ name: f.name, text: fileContents[f.name] || "" }));
    navigate("/architect", { state: { prompt: prompt.trim(), files } });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-semibold text-slate-900 mb-3 tracking-tight">Architect</h1>
        <p className="text-gray-500 text-lg max-w-md mx-auto">
          The agent builder platform for business executives &amp; consultants.
        </p>
      </div>

      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-md p-5">
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachedFiles.map((f) => (
              <span key={f.name} className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full">
                {f.name}
                {fileContents[f.name] ? (
                  <span className="text-indigo-400 ml-0.5">✓</span>
                ) : (
                  <svg className="w-2.5 h-2.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <button onClick={() => removeFile(f.name)} className="ml-0.5 hover:text-indigo-900">×</button>
              </span>
            ))}
          </div>
        )}

        <textarea
          className="w-full text-gray-800 text-base outline-none resize-none placeholder-gray-400 min-h-[72px] leading-relaxed"
          placeholder="Build me a customer support chatbot using RAG..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
          }}
          rows={3}
        />

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium text-lg transition-colors"
            title="Attach files"
          >
            +
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.pdf,.md,.docx,.csv,.json"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !prompt.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {submitting ? "Opening Architect..." : "Build it"}
          </button>
        </div>
      </div>
    </div>
  );
}
