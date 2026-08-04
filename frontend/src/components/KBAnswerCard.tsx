import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ragApi } from "../api/client";

export interface SourceChunk {
  filename: string;
  snippet: string;
  score: number;
  doc_id: string;
}

interface KBAnswerCardProps {
  kbId: string;
  question: string;
  answer: string;
  sources: SourceChunk[];
  graphEntities?: { name: string; type: string }[];
  relatedQuestions: string[];
  groundingScore: number | null;
  onRelatedClick: (q: string) => void;
  sqlQuery?: string;
  queryColumns?: string[];
  queryRows?: string[][];
  rowCount?: number;
  sqlError?: string;
}

function groundingColor(score: number | null): string {
  if (score === null) return "bg-slate-400";
  if (score >= 0.8) return "bg-green-500";
  if (score >= 0.6) return "bg-amber-400";
  return "bg-red-400";
}

type FeedbackState = "idle" | "up_sent" | "down_open" | "down_sent";

export function KBAnswerCard({
  kbId,
  question,
  answer,
  sources,
  graphEntities,
  relatedQuestions,
  groundingScore,
  onRelatedClick,
  sqlQuery,
  queryColumns,
  queryRows,
  rowCount,
  sqlError,
}: KBAnswerCardProps) {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("idle");
  const [comment, setComment] = useState("");

  async function sendFeedback(vote: "up" | "down", commentText?: string) {
    try {
      await ragApi.feedback(kbId, { question, answer, vote, comment: commentText ?? null });
    } catch {
      // best-effort — never show error for feedback
    }
  }

  function handleThumbsUp() {
    if (feedbackState !== "idle") return;
    setFeedbackState("up_sent");
    sendFeedback("up");
  }

  function handleThumbsDown() {
    if (feedbackState !== "idle") return;
    setFeedbackState("down_open");
  }

  async function submitDownFeedback() {
    setFeedbackState("down_sent");
    await sendFeedback("down", comment || undefined);
  }

  return (
    <div className="border border-indigo-100 rounded-xl overflow-hidden">

      {/* ── Header: ANSWER + Grounding badge ── */}
      <div className="flex items-center justify-between bg-indigo-50 px-4 py-2.5 border-b border-indigo-100">
        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Answer</span>
        <div className="flex items-center gap-1.5"
          title="Faithfulness score: fraction of answer claims directly supported by the retrieved context (0 = hallucinated, 1 = fully grounded)">
          <span className="text-xs text-slate-400">Grounding</span>
          <span className={`text-white text-xs font-bold px-2 py-0.5 rounded-full ${groundingColor(groundingScore)}`}>
            {groundingScore !== null ? groundingScore.toFixed(2) : "N/A"}
          </span>
        </div>
      </div>

      {/* ── Generated SQL (semantic KB) ── */}
      {sqlQuery && (
        <div className="border-t border-indigo-100 bg-slate-900 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Generated SQL</span>
            {sqlError && (
              <span className="text-[10px] text-red-400 bg-red-900/30 rounded px-1.5 py-0.5">Query failed</span>
            )}
            {!sqlError && rowCount !== undefined && (
              <span className="text-[10px] text-slate-400">{rowCount} row{rowCount !== 1 ? "s" : ""}</span>
            )}
          </div>
          <pre className="text-xs text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">{sqlQuery}</pre>
        </div>
      )}

      {/* ── Answer body ── */}
      <div className="px-4 py-3 prose prose-sm prose-slate max-w-none prose-p:my-1.5 prose-ol:my-1.5 prose-ul:my-1.5 bg-white">
        <ReactMarkdown>{answer}</ReactMarkdown>
      </div>

      {/* ── Query Results Table (semantic KB) ── */}
      {queryColumns && queryColumns.length > 0 && queryRows && queryRows.length > 0 && (
        <div className="border-t border-indigo-100 bg-slate-50 px-4 py-3">
          <details open>
            <summary className="cursor-pointer text-xs font-bold text-emerald-700 list-none flex items-center gap-1.5 mb-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3.375 19.5h17.25M3.375 7.5h17.25M3.375 13.5h17.25" />
              </svg>
              Query Results ({rowCount} row{rowCount !== 1 ? "s" : ""})
            </summary>
            <div className="overflow-x-auto rounded-lg border border-emerald-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-emerald-50">
                    {queryColumns.map((col, i) => (
                      <th key={i} className="px-3 py-2 text-left font-semibold text-emerald-800 whitespace-nowrap border-b border-emerald-100">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryRows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-[200px] truncate border-b border-slate-100">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {/* ── Source Documents ── */}
      {sources.length > 0 && (
        <div className="border-t border-indigo-100 bg-slate-50 px-4 py-3">
          <details>
            <summary className="cursor-pointer text-xs font-bold text-indigo-600 list-none flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Source Documents ({sources.length} matched)
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {sources.map((src, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700">{src.filename}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                        Score: {src.score.toFixed(2)}
                      </span>
                      <a
                        href={`/knowledge-bases?doc=${src.doc_id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        target="_blank" rel="noreferrer"
                      >
                        View →
                      </a>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 italic line-clamp-2">"{src.snippet}"</p>
                </div>
              ))}
            </div>
          </details>

          {/* Graph entities (Graph KB only) */}
          {graphEntities && graphEntities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {graphEntities.map((e, i) => (
                <span key={i}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200">
                  {e.name}
                  <span className="text-violet-400">·</span>
                  <span className="text-violet-500">{e.type}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Related Questions ── */}
      {relatedQuestions.length > 0 && (
        <div className="border-t border-indigo-100 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Related Questions</p>
          <div className="flex flex-wrap gap-2">
            {relatedQuestions.map((q, i) => (
              <button key={i} onClick={() => onRelatedClick(q)}
                className="text-xs text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1.5 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Feedback row ── */}
      <div className="border-t border-indigo-100 bg-slate-50 px-4 py-2.5">
        {feedbackState === "up_sent" && (
          <p className="text-xs text-green-600 font-medium">Thanks for your feedback!</p>
        )}
        {feedbackState === "down_sent" && (
          <p className="text-xs text-slate-400">Thanks for your feedback.</p>
        )}
        {feedbackState === "idle" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Was this helpful?</span>
            <button onClick={handleThumbsUp}
              className="bg-green-50 border border-green-200 rounded-lg px-3 py-1 text-sm hover:bg-green-100 transition-colors">
              👍
            </button>
            <button onClick={handleThumbsDown}
              className="bg-red-50 border border-red-200 rounded-lg px-3 py-1 text-sm hover:bg-red-100 transition-colors">
              👎
            </button>
          </div>
        )}
        {feedbackState === "down_open" && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-500 font-medium">What was wrong? <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. The answer was incorrect, missing key details..."
              rows={2}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={submitDownFeedback}
                className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors font-medium">
                Submit
              </button>
              <button onClick={() => setFeedbackState("down_sent")}
                className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5">
                Skip
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

interface KBTestPanelProps {
  kbId: string;
}

export function KBTestPanel({ kbId }: KBTestPanelProps) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<{
    answer: string;
    sources: SourceChunk[];
    graphEntities?: { name: string; type: string }[];
    relatedQuestions: string[];
    groundingScore: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState("");

  async function runTest(q: string) {
    if (!q.trim()) return;
    setLoading(true); setResult(null); setAsked(q.trim());
    try {
      const res = await ragApi.query(kbId, q.trim());
      const d = res.data as {
        answer: string;
        sources: SourceChunk[];
        graph_entities?: { name: string; type: string }[];
        related_questions: string[];
        grounding_score: number | null;
      };
      setResult({
        answer: d.answer,
        sources: d.sources ?? [],
        graphEntities: d.graph_entities,
        relatedQuestions: d.related_questions ?? [],
        groundingScore: d.grounding_score ?? null,
      });
    } catch {
      setResult({ answer: "Query failed.", sources: [], relatedQuestions: [], groundingScore: null });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 border border-indigo-100 rounded-xl overflow-hidden bg-white">
      <div className="bg-indigo-50 px-3 py-2 border-b border-indigo-100">
        <p className="text-xs font-semibold text-indigo-600">Test KB — ask a question</p>
      </div>
      <div className="px-3 py-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runTest(question)}
          placeholder="Ask the KB a test question..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          type="button"
          onClick={() => runTest(question)}
          disabled={loading || !question.trim()}
          className="text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>
      {result && (
        <div className="px-3 pb-3">
          <KBAnswerCard
            kbId={kbId}
            question={asked}
            answer={result.answer}
            sources={result.sources}
            graphEntities={result.graphEntities}
            relatedQuestions={result.relatedQuestions}
            groundingScore={result.groundingScore}
            onRelatedClick={(q) => { setQuestion(q); runTest(q); }}
          />
        </div>
      )}
    </div>
  );
}
