import json
import os
import re
import asyncpg
import numpy as np
import faiss
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.azure_openai import AzureOpenAIClient
from app.models.rag import SemanticTable

EMBED_DIM = 1536  # text-embedding-3-small
SCHEMA_TOP_K = 5  # tables injected into the NL->SQL prompt per query

_INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "kb_indexes")


def schema_index_path(kb_id: str) -> str:
    return os.path.join(_INDEX_DIR, f"{kb_id}_schema.faiss")


_TABLE_DESCRIPTION_PROMPT = """You are a database analyst. For each table below, write a single \
concise sentence (max ~20 words) describing what kind of data it stores, based on its name and columns.

Tables:
{tables}

Respond ONLY with a JSON array, no markdown fences, one entry per table in the same order:
[{{"table": "<table name>", "description": "<one sentence>"}}, ...]
"""

_SCHEMA_SQL = """
SELECT
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position
"""

_NL_TO_SQL_PROMPT = """You are a PostgreSQL expert. Given the database schema and a natural language question, write a SQL SELECT query.

Schema:
{schema}

Question: {question}

Rules:
- Return ONLY the SQL query, no explanation, no markdown fences
- Only SELECT statements are allowed
- Add LIMIT 50 unless the question asks for all rows
- Use exact table and column names from the schema
- Add readable aliases for aggregation columns

SQL:"""


class SemanticEngine:
    def __init__(self, kb_id: str):
        self.kb_id = kb_id
        self._llm = AzureOpenAIClient()
        # Embeddings always go through Azure OpenAI, same as RAGEngine, regardless
        # of the chat provider a session/agent is otherwise configured for.
        self._embedder = AzureOpenAIClient(provider="azure")
        self._schema_index: faiss.IndexFlatIP | None = None

    async def discover_schema(self, connection_url: str) -> dict:
        """Connect to PostgreSQL, query information_schema, return structured schema."""
        conn = await asyncpg.connect(connection_url, timeout=10)
        try:
            rows = await conn.fetch(_SCHEMA_SQL)
        finally:
            await conn.close()

        tables: dict[str, list[dict]] = {}
        for row in rows:
            tbl = row["table_name"]
            if tbl not in tables:
                tables[tbl] = []
            tables[tbl].append({
                "column": row["column_name"],
                "type": row["data_type"],
                "nullable": row["is_nullable"] == "YES",
            })

        return {"tables": [{"name": t, "columns": cols} for t, cols in tables.items()]}

    def _table_to_ddl(self, table: dict) -> str:
        col_defs = ", ".join(
            f"{c['column']} {c['type'].upper()}"
            + ("" if c["nullable"] else " NOT NULL")
            for c in table["columns"]
        )
        return f"CREATE TABLE {table['name']} ({col_defs});"

    def _schema_to_text(self, schema: dict) -> str:
        return "\n".join(self._table_to_ddl(t) for t in schema.get("tables", []))

    @staticmethod
    def _normalize(vectors: list[list[float]]) -> np.ndarray:
        arr = np.array(vectors, dtype="float32")
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return arr / norms

    def _load_schema_index(self) -> faiss.IndexFlatIP:
        if self._schema_index is not None:
            return self._schema_index
        path = schema_index_path(self.kb_id)
        if os.path.exists(path):
            self._schema_index = faiss.read_index(path)
        else:
            self._schema_index = faiss.IndexFlatIP(EMBED_DIM)
        return self._schema_index

    def _save_schema_index(self):
        os.makedirs(_INDEX_DIR, exist_ok=True)
        faiss.write_index(self._schema_index, schema_index_path(self.kb_id))

    async def _generate_table_descriptions(self, tables: list[dict]) -> list[str]:
        """One short sentence per table, generated in batches so very large
        schemas don't blow past a single prompt. This runs once at connect
        time -- unlike _schema_to_text, it is never on the per-query path."""
        batch_size = 25
        descriptions: list[str] = []
        for start in range(0, len(tables), batch_size):
            batch = tables[start:start + batch_size]
            listing = "\n".join(
                f"- {t['name']}({', '.join(c['column'] for c in t['columns'])})"
                for t in batch
            )
            raw = await self._llm.chat(
                [{"role": "user", "content": _TABLE_DESCRIPTION_PROMPT.format(tables=listing)}],
                temperature=0.0,
            )
            raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
            raw = re.sub(r"```\s*$", "", raw.strip(), flags=re.MULTILINE)
            try:
                by_name = {item["table"]: item["description"] for item in json.loads(raw)}
            except Exception:
                by_name = {}
            for t in batch:
                fallback = f"Table {t['name']} with columns: {', '.join(c['column'] for c in t['columns'])}"
                descriptions.append(by_name.get(t["name"]) or fallback)
        return descriptions

    async def index_schema(self, schema: dict, db: AsyncSession) -> int:
        """Generate + embed a description per table and rebuild the schema
        FAISS index, so query() can inject only the relevant tables instead
        of the full schema dump. Called once per (re)connect."""
        tables = schema.get("tables", [])

        await db.execute(delete(SemanticTable).where(SemanticTable.kb_id == self.kb_id))

        self._schema_index = faiss.IndexFlatIP(EMBED_DIM)
        if tables:
            descriptions = await self._generate_table_descriptions(tables)
            vectors = await self._embedder.embed(descriptions)
            self._schema_index.add(self._normalize(vectors))
            for i, (table, desc) in enumerate(zip(tables, descriptions)):
                db.add(SemanticTable(
                    kb_id=self.kb_id,
                    table_name=table["name"],
                    ddl=self._table_to_ddl(table),
                    description=desc,
                    faiss_id=i,
                ))
        self._save_schema_index()
        return len(tables)

    async def _ensure_schema_index_loaded(self, db: AsyncSession) -> faiss.IndexFlatIP:
        """Rebuild the schema FAISS index from persisted SemanticTable rows if
        the on-disk file is missing, mirroring RAGEngine.ensure_loaded."""
        index = self._load_schema_index()
        if index.ntotal > 0:
            return index
        result = await db.execute(
            select(SemanticTable).where(SemanticTable.kb_id == self.kb_id).order_by(SemanticTable.faiss_id)
        )
        rows = result.scalars().all()
        if not rows:
            return index
        vectors = await self._embedder.embed([r.description for r in rows])
        index.add(self._normalize(vectors))
        self._save_schema_index()
        return index

    async def select_relevant_tables(self, question: str, db: AsyncSession) -> list[str] | None:
        """Return the DDL of the top-K tables most relevant to the question,
        or None if no schema index exists yet (caller should fall back to a
        full schema dump -- e.g. a KB connected before this feature)."""
        index = await self._ensure_schema_index_loaded(db)
        if index.ntotal == 0:
            return None

        q_vec = await self._embedder.embed([question])
        k = min(SCHEMA_TOP_K, index.ntotal)
        # No similarity cutoff here (unlike chunk retrieval): a best-guess
        # top-K set of tables is always better than falling back to nothing.
        _, ids = index.search(self._normalize(q_vec), k)
        faiss_ids = [int(i) for i in ids[0] if i >= 0]
        if not faiss_ids:
            return None

        result = await db.execute(
            select(SemanticTable).where(
                SemanticTable.kb_id == self.kb_id, SemanticTable.faiss_id.in_(faiss_ids)
            )
        )
        rows = result.scalars().all()
        rank = {fid: i for i, fid in enumerate(faiss_ids)}
        rows.sort(key=lambda r: rank.get(r.faiss_id, len(rank)))
        return [r.ddl for r in rows]

    async def _generate_sql(self, question: str, schema_text: str) -> str:
        prompt = _NL_TO_SQL_PROMPT.format(schema=schema_text, question=question)
        raw = await self._llm.chat([{"role": "user", "content": prompt}], temperature=0.0)
        # Strip markdown fences if LLM wraps output
        raw = re.sub(r"^```(?:sql)?\s*", "", raw.strip(), flags=re.MULTILINE)
        raw = re.sub(r"```\s*$", "", raw.strip(), flags=re.MULTILINE)
        return raw.strip()

    async def _execute_sql(
        self, connection_url: str, sql: str
    ) -> tuple[list[str], list[list[str]]]:
        """Execute sql in a read-only transaction. Returns (columns, rows)."""
        if not sql.strip().upper().startswith("SELECT"):
            raise ValueError("Only SELECT queries are allowed")
        conn = await asyncpg.connect(connection_url, timeout=15)
        try:
            async with conn.transaction(readonly=True):
                records = await conn.fetch(sql)
                if not records:
                    return [], []
                columns = list(records[0].keys())
                rows = [
                    [str(v) if v is not None else "NULL" for v in rec.values()]
                    for rec in records[:50]
                ]
                return columns, rows
        finally:
            await conn.close()

    async def _compute_faithfulness(self, answer: str, context: str) -> float | None:
        if not context or not answer.strip():
            return None
        prompt = (
            "Given the context and answer, count the factual claims in the answer "
            "and how many are directly supported by the context.\n\n"
            f"Context:\n{context}\n\n"
            f"Answer:\n{answer}\n\n"
            'Respond ONLY with JSON (no markdown): {"supported": <int>, "total": <int>}'
        )
        try:
            result = await self._llm.chat(
                [{"role": "user", "content": prompt}], temperature=0.0
            )
            match = re.search(r"\{[^{}]+\}", result)
            if match:
                data = json.loads(match.group())
                total = int(data.get("total", 0))
                supported = int(data.get("supported", 0))
                if total > 0:
                    return round(min(supported, total) / total, 2)
        except Exception:
            pass
        return None

    async def query(
        self, question: str, schema_json: str, connection_url: str, db: AsyncSession
    ) -> dict:
        schema = json.loads(schema_json) if schema_json else {"tables": []}
        filtered_ddls = await self.select_relevant_tables(question, db)
        # filtered_ddls is None when no schema index exists yet (KB connected
        # before this feature) -- fall back to the full dump so it still works.
        schema_text = "\n".join(filtered_ddls) if filtered_ddls else self._schema_to_text(schema)

        sql = ""
        sql_error: str | None = None
        columns: list[str] = []
        rows: list[list[str]] = []

        try:
            sql = await self._generate_sql(question, schema_text)
            columns, rows = await self._execute_sql(connection_url, sql)
        except Exception as exc:
            sql_error = str(exc)

        if sql_error:
            context = f"SQL attempted: {sql}\nError: {sql_error}"
        elif not rows:
            context = f"SQL: {sql}\nResult: no rows returned"
        else:
            header = " | ".join(columns)
            sample = "\n".join(" | ".join(r) for r in rows[:10])
            context = f"SQL: {sql}\nColumns: {header}\nData ({len(rows)} rows):\n{sample}"

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a data analyst. Answer the question using the SQL query results. "
                    "Be concise and factual. Format numbers readably. "
                    "If the query failed, explain why briefly."
                ),
            },
            {"role": "user", "content": f"Question: {question}\n\n{context}"},
        ]
        answer = await self._llm.chat(messages, temperature=0.1)
        grounding_score = await self._compute_faithfulness(answer, context)

        return {
            "answer": answer,
            "sql_query": sql,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "sql_error": sql_error,
            "sources": [],
            "graph_entities": None,
            "related_questions": [],
            "grounding_score": grounding_score,
        }
