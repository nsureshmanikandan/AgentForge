import os
import tempfile
from app.core.azure_openai import AzureOpenAIClient

try:
    from langchain_community.document_loaders import PyPDFLoader, TextLoader
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    _LANGCHAIN_AVAILABLE = True
except ImportError:
    _LANGCHAIN_AVAILABLE = False


class RAGEngine:
    def __init__(self, kb_id: str):
        self.kb_id = kb_id
        self._llm = AzureOpenAIClient(model="gpt-4o")
        self._chunks: list[str] = []

    async def ingest(self, file_bytes: bytes, filename: str) -> int:
        if not _LANGCHAIN_AVAILABLE:
            text = file_bytes.decode("utf-8", errors="ignore")
            self._chunks.append(text)
            return 1

        suffix = os.path.splitext(filename)[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            if suffix == ".pdf":
                loader = PyPDFLoader(tmp_path)
            else:
                loader = TextLoader(tmp_path, encoding="utf-8")
            docs = loader.load()
        finally:
            os.unlink(tmp_path)

        splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = splitter.split_documents(docs)
        self._chunks.extend([c.page_content for c in chunks])
        return len(chunks)

    async def _retrieve(self, query: str, top_k: int = 3) -> list[str]:
        if not self._chunks:
            return []
        query_words = set(query.lower().split())
        scored = [
            (chunk, sum(1 for w in query_words if w in chunk.lower()))
            for chunk in self._chunks
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [chunk for chunk, score in scored[:top_k] if score > 0]

    async def query(self, question: str) -> dict:
        sources = await self._retrieve(question)
        context = "\n\n".join(sources) if sources else "No relevant context found."
        messages = [
            {"role": "system", "content": "Answer using only the provided context. If the context is insufficient, say so briefly."},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ]
        answer = await self._llm.chat(messages, temperature=0.1)
        return {"answer": answer, "sources": sources}
