import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.graph_engine import GraphEngine


class _Entity:
    """Plain object stand-in for GraphEntity -- MagicMock's reserved `.name`
    attribute makes it awkward to mock an object whose real attribute is
    literally called `name`."""

    def __init__(self, name, faiss_id=None, description="entity description"):
        self.name = name
        self.entity_type = "CONCEPT"
        self.description = description
        self.faiss_id = faiss_id
        self.created_at = None


@pytest.mark.asyncio
class TestSelectRelevantEntities:
    async def test_substring_match_wins_without_embedding_call(self):
        engine = GraphEngine(kb_id="test-kb-substr")
        entities = [_Entity("Multi-Factor Authentication"), _Entity("Single Sign-On")]
        db = AsyncMock()

        with patch.object(engine, "_ensure_entity_index_loaded", new_callable=AsyncMock) as mock_ensure:
            relevant = await engine._select_relevant_entities(
                "Tell me about Multi-Factor Authentication", entities, db
            )

        assert relevant == [entities[0]]
        mock_ensure.assert_not_called()

    async def test_semantic_match_finds_synonym_entity(self):
        """The core bug: 'who uses MFA?' has no substring/word overlap with
        'Multi-Factor Authentication', but embeddings should still match it."""
        engine = GraphEngine(kb_id="test-kb-semantic")
        mfa = _Entity("Multi-Factor Authentication", faiss_id=0)
        sso = _Entity("Single Sign-On", faiss_id=1)
        entities = [mfa, sso]

        fake_index = MagicMock()
        fake_index.ntotal = 2
        fake_index.search.return_value = ([[0.8]], [[0]])  # matches faiss_id 0 (MFA)

        db = AsyncMock()
        with patch.object(engine, "_ensure_entity_index_loaded", new_callable=AsyncMock) as mock_ensure, \
             patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed:
            mock_ensure.return_value = fake_index
            mock_embed.return_value = [[0.1] * 1536]

            relevant = await engine._select_relevant_entities("who uses MFA?", entities, db)

        assert relevant == [mfa]

    async def test_falls_back_to_word_overlap_when_embedding_raises(self):
        engine = GraphEngine(kb_id="test-kb-fallback")
        entities = [_Entity("Payment Gateway"), _Entity("Order Service")]
        db = AsyncMock()

        with patch.object(engine, "_ensure_entity_index_loaded", new_callable=AsyncMock) as mock_ensure:
            mock_ensure.side_effect = RuntimeError("embedding service down")
            relevant = await engine._select_relevant_entities("tell me about the order service", entities, db)

        # word-overlap fallback still returns a ranked result instead of raising
        assert relevant[0].name == "Order Service"

    async def test_falls_back_to_word_overlap_when_no_faiss_matches(self):
        engine = GraphEngine(kb_id="test-kb-empty-index")
        entities = [_Entity("Payment Gateway"), _Entity("Order Service")]
        db = AsyncMock()

        empty_index = MagicMock()
        empty_index.ntotal = 0
        with patch.object(engine, "_ensure_entity_index_loaded", new_callable=AsyncMock) as mock_ensure:
            mock_ensure.return_value = empty_index
            relevant = await engine._select_relevant_entities("tell me about order service", entities, db)

        assert relevant[0].name == "Order Service"


@pytest.mark.asyncio
class TestEnsureEntityIndexLoaded:
    async def test_embeds_only_unembedded_entities_and_assigns_sequential_ids(self):
        engine = GraphEngine(kb_id="test-kb-backfill")
        existing_index = MagicMock()
        existing_index.ntotal = 3  # two entities already embedded, index already has 3 vectors
        engine._entity_index = existing_index

        new_entity_a = _Entity("New Concept A")
        new_entity_b = _Entity("New Concept B")
        db = AsyncMock()
        db.execute.return_value = MagicMock(
            scalars=lambda: MagicMock(all=lambda: [new_entity_a, new_entity_b])
        )

        with patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed, \
             patch.object(engine, "_save_entity_index") as mock_save:
            mock_embed.return_value = [[0.1] * 1536, [0.2] * 1536]
            await engine._ensure_entity_index_loaded(db)

        mock_embed.assert_awaited_once_with([
            "New Concept A: entity description",
            "New Concept B: entity description",
        ])
        existing_index.add.assert_called_once()
        assert new_entity_a.faiss_id == 3
        assert new_entity_b.faiss_id == 4
        mock_save.assert_called_once()
        # query_kb (the only caller of this method's call chain) never commits
        # its own session -- without a commit here, the faiss_id assignments
        # above would silently roll back when the request's session closes,
        # and the same entities would be re-embedded (as duplicate vectors)
        # on every subsequent query.
        db.commit.assert_awaited_once()

    async def test_noop_when_all_entities_already_embedded(self):
        engine = GraphEngine(kb_id="test-kb-noop")
        existing_index = MagicMock()
        existing_index.ntotal = 2
        engine._entity_index = existing_index

        db = AsyncMock()
        db.execute.return_value = MagicMock(scalars=lambda: MagicMock(all=lambda: []))

        with patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed, \
             patch.object(engine, "_save_entity_index") as mock_save:
            await engine._ensure_entity_index_loaded(db)

        mock_embed.assert_not_called()
        mock_save.assert_not_called()
        db.commit.assert_not_awaited()
