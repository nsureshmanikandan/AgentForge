import io
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from docx import Document as DocxDocument

from app.core.rag_engine import (
    RAGEngine,
    _extract_docx_units,
    _chunk_units,
    MAX_CHUNK_CHARS,
)


def _build_qa_docx() -> bytes:
    doc = DocxDocument()
    doc.add_paragraph("Lane Issues", style="Heading 1")
    doc.add_paragraph("What is a lane closure?")
    doc.add_paragraph("A lane closure is a temporary restriction on one or more lanes.")
    doc.add_paragraph("How do I report one?")
    doc.add_paragraph("Report it through the ops portal within 24 hours.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


class TestStructureAwareChunking:
    def test_qa_pairs_stay_together_under_limit(self):
        units = _extract_docx_units(_build_qa_docx())
        # Each question should be grouped with its own answer, not split apart.
        assert any("lane closure?" in text and "temporary restriction" in text for text, _ in units)
        assert any("report one?" in text and "ops portal" in text for text, _ in units)
        # All three units (2 Q&A pairs) come from the "Lane Issues" heading.
        assert all(heading == "Lane Issues" for _, heading in units)

    def test_oversized_unit_splits_with_overlap(self):
        long_answer = "Sentence about lane policy. " * 100  # well over MAX_CHUNK_CHARS
        units = [(f"What is the policy?\n{long_answer}", "Lane Issues")]
        chunked = _chunk_units(units)
        assert len(chunked) > 1
        assert all(len(text) <= MAX_CHUNK_CHARS + 1 for text, _ in chunked)
        # heading carried through to every sub-chunk
        assert all(heading == "Lane Issues" for _, heading in chunked)

    def test_short_units_pass_through_unsplit(self):
        units = [("Short answer.", "Heading")]
        chunked = _chunk_units(units)
        assert chunked == [("Short answer.", "Heading")]


@pytest.mark.asyncio
class TestRAGEngineRetrieval:
    async def test_query_returns_not_enough_info_below_cutoff(self):
        engine = RAGEngine(kb_id="test-kb")
        with patch.object(engine, "retrieve", new_callable=AsyncMock) as mock_retrieve, \
             patch.object(engine._llm, "chat", new_callable=AsyncMock) as mock_chat:
            mock_retrieve.return_value = []
            db = AsyncMock()
            result = await engine.query("Unrelated question?", db, enforce_cutoff=True)
        assert result["sources"] == []
        assert "don't have enough information" in result["answer"]
        mock_chat.assert_not_called()

    async def test_query_answers_when_sources_found(self):
        engine = RAGEngine(kb_id="test-kb")
        with patch.object(engine, "retrieve", new_callable=AsyncMock) as mock_retrieve, \
             patch.object(engine._llm, "chat", new_callable=AsyncMock) as mock_chat:
            mock_retrieve.return_value = ["Azure is a cloud platform by Microsoft."]
            mock_chat.return_value = "Azure is Microsoft's cloud platform."
            db = AsyncMock()
            result = await engine.query("What is Azure?", db)
        assert "Azure" in result["answer"]
        assert len(result["sources"]) > 0
        mock_chat.assert_awaited_once()

    async def test_disabled_cutoff_still_passes_low_score_chunks_to_llm(self):
        engine = RAGEngine(kb_id="test-kb")
        fake_index = MagicMock()
        fake_index.ntotal = 1
        fake_index.search.return_value = ([[0.05]], [[0]])  # below SIMILARITY_CUTOFF
        engine._index = fake_index

        chunk_row = MagicMock(faiss_id=0, text="marginal match")
        db = AsyncMock()
        db.execute.return_value = MagicMock(scalars=lambda: MagicMock(all=lambda: [chunk_row]))

        with patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = [[0.1] * 1536]
            sources = await engine.retrieve("question", db, enforce_cutoff=False)

        assert sources == ["marginal match"]

    async def test_ensure_loaded_rebuilds_index_from_chunk_rows(self):
        engine = RAGEngine(kb_id="test-kb-rebuild")
        empty_index = MagicMock()
        empty_index.ntotal = 0
        engine._index = empty_index

        chunk_row = MagicMock(faiss_id=0, text="persisted chunk text")
        db = AsyncMock()
        db.execute.return_value = MagicMock(scalars=lambda: MagicMock(all=lambda: [chunk_row]))

        with patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed, \
             patch.object(engine, "_save_index") as mock_save:
            mock_embed.return_value = [[0.2] * 1536]
            await engine.ensure_loaded(db)

        mock_embed.assert_awaited_once_with(["persisted chunk text"])
        empty_index.add.assert_called_once()
        mock_save.assert_called_once()

    async def test_rebuild_index_reassigns_sequential_faiss_ids(self):
        """After deleting a document's chunks (upsert-by-filename), the
        remaining chunks must be reindexed with fresh, gap-free faiss_ids
        so stale vectors don't linger and lookups stay consistent."""
        engine = RAGEngine(kb_id="test-kb-rebuild-2")

        # Simulate two surviving chunks whose original faiss_ids (0 and 2)
        # have a gap because faiss_id=1 belonged to a since-deleted document.
        remaining_a = MagicMock(faiss_id=0, text="chunk A")
        remaining_b = MagicMock(faiss_id=2, text="chunk B")
        db = AsyncMock()
        db.execute.return_value = MagicMock(scalars=lambda: MagicMock(all=lambda: [remaining_a, remaining_b]))

        with patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed, \
             patch.object(engine, "_save_index") as mock_save:
            mock_embed.return_value = [[0.1] * 1536, [0.2] * 1536]
            await engine.rebuild_index(db)

        mock_embed.assert_awaited_once_with(["chunk A", "chunk B"])
        assert engine._index.ntotal == 2
        # faiss_ids reassigned to 0, 1 -- no gap left over from the deleted chunk.
        assert remaining_a.faiss_id == 0
        assert remaining_b.faiss_id == 1
        mock_save.assert_called_once()

    async def test_rebuild_index_handles_empty_kb(self):
        """Rebuilding after deleting the KB's only document must produce a
        valid empty index, not error out on a zero-chunk embed call."""
        engine = RAGEngine(kb_id="test-kb-rebuild-empty")
        db = AsyncMock()
        db.execute.return_value = MagicMock(scalars=lambda: MagicMock(all=lambda: []))

        with patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed, \
             patch.object(engine, "_save_index") as mock_save:
            await engine.rebuild_index(db)

        mock_embed.assert_not_called()
        assert engine._index.ntotal == 0
        mock_save.assert_called_once()
