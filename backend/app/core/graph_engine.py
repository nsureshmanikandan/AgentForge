import json
import math
import os
import re
import tempfile
import numpy as np
import faiss
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.azure_openai import AzureOpenAIClient
from app.models.rag import GraphEntity, GraphRelationship

EMBED_DIM = 1536  # text-embedding-3-small
ENTITY_TOP_K = 8  # matches the existing relevant[:8] cap

_INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "kb_indexes")


def entity_index_path(kb_id: str) -> str:
    return os.path.join(_INDEX_DIR, f"{kb_id}_entities.faiss")


COMBINED_EXTRACT_PROMPT = """Extract entities and their relationships from the text.
Focus on concepts, technologies, tools, people, organizations, and processes.

Text:
{text}

Return ONLY valid JSON (no markdown, no extra text):
{{
  "entities": [
    {{"name": "canonical name", "type": "CONCEPT|TECHNOLOGY|PERSON|ORG|PROCESS|TOOL", "description": "1-sentence summary"}}
  ],
  "relationships": [
    {{"source": "entity name", "target": "entity name", "relation": "short verb phrase", "context": "supporting excerpt"}}
  ]
}}

Rules:
- Use consistent canonical names (e.g. always "GPT-4", never "gpt4")
- Keep names concise (1-4 words)
- Only relate entities listed above
- Aim for 3-8 entities and 2-6 relationships"""

MAX_CHUNKS_FOR_GRAPH = 10


class GraphEngine:
    def __init__(self, kb_id: str):
        self.kb_id = kb_id
        self._llm = AzureOpenAIClient()
        # Embeddings always go through Azure OpenAI, same as RAGEngine/SemanticEngine,
        # regardless of the chat provider a session/agent is otherwise configured for.
        self._embedder = AzureOpenAIClient(provider="azure")
        self._entity_index: faiss.IndexFlatIP | None = None
        self._rag = None  # lazy — avoids import cycle at module load time

    def _get_rag(self):
        if self._rag is None:
            from app.core.rag_engine import RAGEngine
            self._rag = RAGEngine(kb_id=self.kb_id)
        return self._rag

    @staticmethod
    def _normalize(vectors: list[list[float]]) -> np.ndarray:
        arr = np.array(vectors, dtype="float32")
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return arr / norms

    def _load_entity_index(self) -> faiss.IndexFlatIP:
        if self._entity_index is not None:
            return self._entity_index
        path = entity_index_path(self.kb_id)
        if os.path.exists(path):
            self._entity_index = faiss.read_index(path)
        else:
            self._entity_index = faiss.IndexFlatIP(EMBED_DIM)
        return self._entity_index

    def _save_entity_index(self):
        os.makedirs(_INDEX_DIR, exist_ok=True)
        faiss.write_index(self._entity_index, entity_index_path(self.kb_id))

    @staticmethod
    def _entity_embed_text(entity: GraphEntity) -> str:
        return f"{entity.name}: {entity.description}" if entity.description else entity.name

    async def _ensure_entity_index_loaded(self, db: AsyncSession) -> faiss.IndexFlatIP:
        """Batch-embed any entities not yet in the FAISS index (newly ingested,
        or created before this feature existed) and append them, mirroring
        RAGEngine.ensure_loaded / SemanticEngine._ensure_schema_index_loaded."""
        index = self._load_entity_index()
        result = await db.execute(
            select(GraphEntity).where(
                GraphEntity.kb_id == self.kb_id, GraphEntity.faiss_id.is_(None)
            ).order_by(GraphEntity.created_at)
        )
        unembedded = result.scalars().all()
        if unembedded:
            vectors = await self._embedder.embed([self._entity_embed_text(e) for e in unembedded])
            start_id = index.ntotal
            index.add(self._normalize(vectors))
            for i, entity in enumerate(unembedded):
                entity.faiss_id = start_id + i
            # query_kb (api/rag.py) never commits its session on the read path,
            # so without an explicit commit here the faiss_id backfill above
            # would roll back when the request ends -- leaving these entities
            # perpetually unembedded and re-added (as duplicate vectors) on
            # every subsequent query.
            await db.commit()
            self._save_entity_index()
        return index

    async def _select_relevant_entities(
        self, question: str, all_entities: list[GraphEntity], db: AsyncSession
    ) -> list[GraphEntity]:
        question_lower = question.lower()
        relevant = [e for e in all_entities if e.name.lower() in question_lower]
        if relevant:
            return relevant[:ENTITY_TOP_K]

        try:
            index = await self._ensure_entity_index_loaded(db)
            if index.ntotal > 0:
                q_vec = await self._embedder.embed([question])
                k = min(ENTITY_TOP_K, index.ntotal)
                # No similarity cutoff: a best-guess top-K set of entities is
                # always better than falling back to nothing.
                _, ids = index.search(self._normalize(q_vec), k)
                by_faiss_id = {e.faiss_id: e for e in all_entities if e.faiss_id is not None}
                matched = [by_faiss_id[int(i)] for i in ids[0] if int(i) in by_faiss_id]
                if matched:
                    return matched[:ENTITY_TOP_K]
        except Exception:
            pass  # embedding service hiccup -- degrade to the word-overlap fallback below

        q_words = set(question_lower.split())
        return sorted(
            all_entities,
            key=lambda e: sum(1 for w in e.name.lower().split() if w in q_words),
            reverse=True,
        )[:ENTITY_TOP_K]

    async def _compute_faithfulness(
        self, answer: str, context: str
    ) -> float | None:
        """LLM-as-judge faithfulness (RAGAS-style): fraction of answer claims
        directly supported by the graph + document context. Returns 0.0–1.0."""
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
            match = re.search(r'\{[^{}]+\}', result)
            if match:
                data = json.loads(match.group())
                total = int(data.get("total", 0))
                supported = int(data.get("supported", 0))
                if total > 0:
                    return round(min(supported, total) / total, 2)
        except Exception:
            pass
        return None

    def _parse_json(self, text: str) -> dict:
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE)
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return {"entities": [], "relationships": []}

    async def ingest(
        self, file_bytes: bytes, filename: str, document_id: str, db: AsyncSession
    ) -> tuple[int, str]:
        # Standard RAG ingest first (builds FAISS index + chunks for retrieval)
        rag = self._get_rag()
        chunk_count, full_text = await rag.ingest(file_bytes, filename, document_id, db)

        # Split full_text into chunks for entity extraction
        paragraphs = [p.strip() for p in full_text.split("\n\n") if len(p.strip()) > 80]
        if not paragraphs:
            return chunk_count, full_text

        # Sample evenly distributed paragraphs up to the cap
        if len(paragraphs) > MAX_CHUNKS_FOR_GRAPH:
            step = math.ceil(len(paragraphs) / MAX_CHUNKS_FOR_GRAPH)
            paragraphs = paragraphs[::step][:MAX_CHUNKS_FOR_GRAPH]

        entity_cache: dict[str, GraphEntity] = {}  # name_lower → entity

        for para in paragraphs:
            try:
                resp = await self._llm.chat(
                    [{"role": "user", "content": COMBINED_EXTRACT_PROMPT.format(text=para[:1400])}],
                    temperature=0.0,
                )
                data = self._parse_json(resp)
            except Exception:
                continue

            chunk_entity_ids: dict[str, str] = {}  # name_lower → entity.id

            for e in data.get("entities", [])[:12]:
                name = str(e.get("name", "")).strip()
                if not name or len(name) < 2 or len(name) > 100:
                    continue
                name_lower = name.lower()
                etype = str(e.get("type", "CONCEPT")).upper()
                if etype not in ("CONCEPT", "TECHNOLOGY", "PERSON", "ORG", "PROCESS", "TOOL"):
                    etype = "CONCEPT"
                desc = str(e.get("description", ""))[:400]

                if name_lower not in entity_cache:
                    result = await db.execute(
                        select(GraphEntity).where(
                            GraphEntity.kb_id == self.kb_id,
                            GraphEntity.name == name,
                        )
                    )
                    entity = result.scalars().first()
                    if not entity:
                        entity = GraphEntity(
                            kb_id=self.kb_id,
                            name=name,
                            entity_type=etype,
                            description=desc,
                        )
                        db.add(entity)
                        await db.flush()
                    entity_cache[name_lower] = entity

                chunk_entity_ids[name_lower] = entity_cache[name_lower].id

            for r in data.get("relationships", [])[:10]:
                src_key = str(r.get("source", "")).strip().lower()
                tgt_key = str(r.get("target", "")).strip().lower()
                rel_type = str(r.get("relation", "related_to")).strip()[:80]
                ctx = str(r.get("context", ""))[:300]

                if src_key not in chunk_entity_ids or tgt_key not in chunk_entity_ids:
                    continue
                if src_key == tgt_key:
                    continue

                src_id = chunk_entity_ids[src_key]
                tgt_id = chunk_entity_ids[tgt_key]

                existing = await db.execute(
                    select(GraphRelationship).where(
                        GraphRelationship.kb_id == self.kb_id,
                        GraphRelationship.source_id == src_id,
                        GraphRelationship.target_id == tgt_id,
                        GraphRelationship.relation_type == rel_type,
                    )
                )
                if not existing.scalars().first():
                    db.add(GraphRelationship(
                        kb_id=self.kb_id,
                        source_id=src_id,
                        target_id=tgt_id,
                        relation_type=rel_type,
                        context=ctx,
                    ))

        await db.flush()
        return chunk_count, full_text

    async def query(self, question: str, db: AsyncSession) -> dict:
        entities_result = await db.execute(
            select(GraphEntity).where(GraphEntity.kb_id == self.kb_id)
        )
        all_entities = entities_result.scalars().all()

        if not all_entities:
            return await self._get_rag().query(question, db)

        relevant = await self._select_relevant_entities(question, all_entities, db)

        relevant_ids = [e.id for e in relevant]
        rels_result = await db.execute(
            select(GraphRelationship).where(
                GraphRelationship.kb_id == self.kb_id,
                or_(
                    GraphRelationship.source_id.in_(relevant_ids),
                    GraphRelationship.target_id.in_(relevant_ids),
                ),
            )
        )
        relationships = rels_result.scalars().all()
        entity_by_id = {e.id: e for e in all_entities}

        lines = ["ENTITIES:"]
        for e in relevant:
            lines.append(f"  • {e.name} [{e.entity_type}]: {e.description}")

        if relationships:
            lines.append("\nRELATIONSHIPS:")
            seen: set[tuple] = set()
            for r in relationships[:20]:
                src = entity_by_id.get(r.source_id)
                tgt = entity_by_id.get(r.target_id)
                if src and tgt:
                    key = (r.source_id, r.target_id, r.relation_type)
                    if key not in seen:
                        seen.add(key)
                        lines.append(f"  • {src.name} --[{r.relation_type}]--> {tgt.name}")
                        if r.context:
                            lines.append(f"    Context: {r.context}")

        try:
            rag_result = await self._get_rag().retrieve(question, db, top_k=6, enforce_cutoff=False)
            rag_sources = [text for text, _, _, _ in rag_result]
            if rag_sources:
                lines.append("\nDOCUMENT EXCERPTS:")
                for s in rag_sources[:3]:
                    lines.append(f"  {s[:300]}")
        except Exception:
            rag_sources = []
            rag_result = []

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a knowledge graph assistant. Answer using entity descriptions "
                    "and their relationships. Be specific and cite relationships when relevant."
                ),
            },
            {
                "role": "user",
                "content": f"Context:\n{chr(10).join(lines)}\n\nQuestion: {question}",
            },
        ]
        answer = await self._llm.chat(messages, temperature=0.1)

        full_context = chr(10).join(lines)
        grounding_score = await self._compute_faithfulness(answer, full_context)

        sources_out = [
            {
                "filename": filename,
                "snippet": text[:200],
                "score": round(score, 3),
                "doc_id": doc_id,
            }
            for text, score, doc_id, filename in rag_result
        ]

        return {
            "answer": answer,
            "sources": sources_out,
            "graph_entities": [{"name": e.name, "type": e.entity_type} for e in relevant[:5]],
            "related_questions": [],    # filled by rag.py router
            "grounding_score": grounding_score,
        }

    async def get_graph_data(self, db: AsyncSession) -> dict:
        entities_result = await db.execute(
            select(GraphEntity).where(GraphEntity.kb_id == self.kb_id)
        )
        rels_result = await db.execute(
            select(GraphRelationship).where(GraphRelationship.kb_id == self.kb_id)
        )
        entities = entities_result.scalars().all()
        relationships = rels_result.scalars().all()
        return {
            "entities": [
                {"id": e.id, "name": e.name, "type": e.entity_type, "description": e.description}
                for e in entities
            ],
            "relationships": [
                {
                    "id": r.id,
                    "source_id": r.source_id,
                    "target_id": r.target_id,
                    "relation": r.relation_type,
                    "context": r.context,
                }
                for r in relationships
            ],
        }
