import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.semantic_engine import SemanticEngine


def _schema(table_names: list[str]) -> dict:
    return {
        "tables": [
            {
                "name": name,
                "columns": [
                    {"column": "id", "type": "integer", "nullable": False},
                    {"column": f"{name}_value", "type": "text", "nullable": True},
                ],
            }
            for name in table_names
        ]
    }


@pytest.mark.asyncio
class TestSchemaIndexing:
    async def test_index_schema_persists_rows_and_builds_faiss_index(self):
        engine = SemanticEngine(kb_id="test-kb-schema")
        schema = _schema(["users", "orders", "products", "invoices", "shipments", "returns"])

        db = AsyncMock()
        with patch.object(engine, "_generate_table_descriptions", new_callable=AsyncMock) as mock_desc, \
             patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed, \
             patch.object(engine, "_save_schema_index") as mock_save:
            mock_desc.return_value = [f"Stores {t['name']} records." for t in schema["tables"]]
            mock_embed.return_value = [[0.1 * i] * 1536 for i in range(len(schema["tables"]))]

            count = await engine.index_schema(schema, db)

        assert count == 6
        assert db.add.call_count == 6
        added_faiss_ids = sorted(call.args[0].faiss_id for call in db.add.call_args_list)
        assert added_faiss_ids == list(range(6))
        assert engine._schema_index.ntotal == 6
        mock_save.assert_called_once()

    async def test_index_schema_handles_empty_schema(self):
        engine = SemanticEngine(kb_id="test-kb-schema-empty")
        db = AsyncMock()
        with patch.object(engine, "_save_schema_index") as mock_save:
            count = await engine.index_schema({"tables": []}, db)

        assert count == 0
        db.add.assert_not_called()
        assert engine._schema_index.ntotal == 0
        mock_save.assert_called_once()

    async def test_generate_table_descriptions_falls_back_on_bad_json(self):
        engine = SemanticEngine(kb_id="test-kb-schema-fallback")
        tables = _schema(["users"])["tables"]
        with patch.object(engine._llm, "chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = "not valid json"
            descriptions = await engine._generate_table_descriptions(tables)

        assert len(descriptions) == 1
        assert "users" in descriptions[0]


@pytest.mark.asyncio
class TestSchemaRetrieval:
    async def test_select_relevant_tables_returns_none_without_index(self):
        engine = SemanticEngine(kb_id="test-kb-no-index")
        db = AsyncMock()
        db.execute.return_value = MagicMock(scalars=lambda: MagicMock(all=lambda: []))

        result = await engine.select_relevant_tables("Who placed the most orders?", db)

        assert result is None

    async def test_select_relevant_tables_returns_top_k_ddls_in_score_order(self):
        engine = SemanticEngine(kb_id="test-kb-topk")
        fake_index = MagicMock()
        fake_index.ntotal = 3
        # faiss_id 2 scores highest, then 0, then 1
        fake_index.search.return_value = ([[0.9, 0.5, 0.3]], [[2, 0, 1]])
        engine._schema_index = fake_index

        rows_by_id = {
            0: MagicMock(faiss_id=0, ddl="CREATE TABLE users (...);"),
            1: MagicMock(faiss_id=1, ddl="CREATE TABLE orders (...);"),
            2: MagicMock(faiss_id=2, ddl="CREATE TABLE invoices (...);"),
        }
        db = AsyncMock()
        db.execute.return_value = MagicMock(
            scalars=lambda: MagicMock(all=lambda: [rows_by_id[0], rows_by_id[1], rows_by_id[2]])
        )

        with patch.object(engine._embedder, "embed", new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = [[0.1] * 1536]
            ddls = await engine.select_relevant_tables("invoice question", db)

        assert ddls == [
            "CREATE TABLE invoices (...);",
            "CREATE TABLE users (...);",
            "CREATE TABLE orders (...);",
        ]


@pytest.mark.asyncio
class TestQueryUsesFilteredSchema:
    async def test_query_uses_pruned_schema_not_full_dump(self):
        """The generated-SQL prompt should only see the table(s) the schema
        index picked, not every table in the connected database."""
        engine = SemanticEngine(kb_id="test-kb-query")
        full_schema = _schema(["users", "orders", "products", "invoices", "shipments", "returns"])
        schema_json = json.dumps(full_schema)

        captured_schema_text = {}

        async def fake_generate_sql(question, schema_text):
            captured_schema_text["value"] = schema_text
            return "SELECT * FROM invoices LIMIT 50"

        with patch.object(engine, "select_relevant_tables", new_callable=AsyncMock) as mock_select, \
             patch.object(engine, "_generate_sql", side_effect=fake_generate_sql), \
             patch.object(engine, "_execute_sql", new_callable=AsyncMock) as mock_execute, \
             patch.object(engine, "_compute_faithfulness", new_callable=AsyncMock) as mock_faithfulness, \
             patch.object(engine._llm, "chat", new_callable=AsyncMock) as mock_chat:
            mock_select.return_value = ["CREATE TABLE invoices (id INTEGER NOT NULL, invoices_value TEXT);"]
            mock_execute.return_value = (["id"], [["1"]])
            mock_faithfulness.return_value = 1.0
            mock_chat.return_value = "There is one invoice."

            db = AsyncMock()
            result = await engine.query("How many invoices are there?", schema_json, "postgresql://fake", db)

        schema_text = captured_schema_text["value"]
        assert "invoices" in schema_text
        for other_table in ["users", "orders", "products", "shipments", "returns"]:
            assert other_table not in schema_text
        assert result["sql_query"] == "SELECT * FROM invoices LIMIT 50"

    async def test_query_falls_back_to_full_dump_without_schema_index(self):
        engine = SemanticEngine(kb_id="test-kb-query-fallback")
        full_schema = _schema(["users", "orders"])
        schema_json = json.dumps(full_schema)

        captured_schema_text = {}

        async def fake_generate_sql(question, schema_text):
            captured_schema_text["value"] = schema_text
            return "SELECT * FROM users LIMIT 50"

        with patch.object(engine, "select_relevant_tables", new_callable=AsyncMock) as mock_select, \
             patch.object(engine, "_generate_sql", side_effect=fake_generate_sql), \
             patch.object(engine, "_execute_sql", new_callable=AsyncMock) as mock_execute, \
             patch.object(engine, "_compute_faithfulness", new_callable=AsyncMock) as mock_faithfulness, \
             patch.object(engine._llm, "chat", new_callable=AsyncMock) as mock_chat:
            mock_select.return_value = None  # no schema index yet
            mock_execute.return_value = (["id"], [["1"]])
            mock_faithfulness.return_value = 1.0
            mock_chat.return_value = "answer"

            db = AsyncMock()
            await engine.query("question", schema_json, "postgresql://fake", db)

        schema_text = captured_schema_text["value"]
        assert "users" in schema_text
        assert "orders" in schema_text
