import json
import math
import os
import re
import tempfile
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.azure_openai import AzureOpenAIClient
from app.models.rag import GraphEntity, GraphRelationship

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
        self._rag = None  # lazy — avoids import cycle at module load time

    def _get_rag(self):
        if self._rag is None:
            from app.core.rag_engine import RAGEngine
            self._rag = RAGEngine(kb_id=self.kb_id)
        return self._rag

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

        question_lower = question.lower()
        relevant = [e for e in all_entities if e.name.lower() in question_lower]
        if not relevant:
            q_words = set(question_lower.split())
            relevant = sorted(
                all_entities,
                key=lambda e: sum(1 for w in e.name.lower().split() if w in q_words),
                reverse=True,
            )[:8]
        relevant = relevant[:8]

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
            rag_result = await self._get_rag().retrieve(question, db, top_k=3, enforce_cutoff=False)
            rag_sources = [text for text, _, _, _ in rag_result]
            if rag_sources:
                lines.append("\nDOCUMENT EXCERPTS:")
                for s in rag_sources[:3]:
                    lines.append(f"  {s[:300]}")
        except Exception:
            rag_sources = []

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

        return {
            "answer": answer,
            "sources": [r.context for r in relationships if r.context][:3],
            "graph_entities": [{"name": e.name, "type": e.entity_type} for e in relevant[:5]],
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
