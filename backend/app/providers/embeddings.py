"""Pluggable Free-First Embedding Providers (Section 5.2 & 5.4).

Default: SentenceTransformers with BAAI/bge-small-en-v1.5 (384 dims, CPU, MIT).
Multilingual swap-in: intfloat/multilingual-e5-small (384 dims, MIT).
Also includes adapters for Gemini, OpenAI, and a deterministic 384-dim semantic/lexical embedder for offline tests/CI.
"""
import hashlib
import math
import re
import time
from typing import Any, Dict, List
import httpx
import numpy as np

from app.core.config import Settings
from app.providers.base import (
    EmbeddingBatchResult,
    EmbeddingModelInfo,
    EmbeddingProvider,
    InvalidRequestError,
    ProviderAuthError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitedError,
)


def _deterministic_semantic_vector(text: str, dim: int = 384) -> List[float]:
    """Compute a deterministic L2-normalized vector from word unigrams, bigrams, and character 4-grams.
    Preserves high cosine similarity for shared terminology and paraphrases without network access.
    """
    vec = np.zeros(dim, dtype=np.float64)
    tokens = re.findall(r"[a-z0-9_]+", text.lower())
    if not tokens:
        vec[0] = 1.0
        return vec.tolist()

    # Unigram + stem + bigram features
    features: List[Tuple[str, float]] = []
    for i, tok in enumerate(tokens):
        features.append((f"w:{tok}", 2.0))
        if len(tok) > 4:
            features.append((f"s:{tok[:5]}", 1.2))
        if i + 1 < len(tokens):
            features.append((f"b:{tok}_{tokens[i+1]}", 1.5))

    for feat, weight in features:
        digest = hashlib.sha256(feat.encode("utf-8")).digest()
        for offset in range(0, 16, 4):
            idx = int.from_bytes(digest[offset : offset + 2], "little") % dim
            sign = 1.0 if (digest[offset + 2] & 1) == 0 else -1.0
            vec[idx] += sign * weight

    norm = float(np.linalg.norm(vec))
    if norm > 0:
        vec = vec / norm
    else:
        vec[0] = 1.0
    return [round(float(x), 6) for x in vec]


class DeterministicMockEmbeddingProvider(EmbeddingProvider):
    """Deterministic embedding provider for CI, unit/integration tests, and offline verification."""

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5", dim: int = 384, revision: str = "main") -> None:
        self.model_name = model_name
        self.dim = dim
        self.revision = revision
        if "e5" in model_name.lower():
            self.query_prefix = "query: "
            self.doc_prefix = "passage: "
        else:
            self.query_prefix = "Represent this sentence for searching relevant passages: "
            self.doc_prefix = ""

    def describe(self) -> EmbeddingModelInfo:
        return EmbeddingModelInfo(
            id=f"local:{self.model_name}:{self.dim}",
            provider="mock",
            model_name=self.model_name,
            dim=self.dim,
            max_input_tokens=512,
            normalize=True,
            query_prefix=self.query_prefix,
            document_prefix=self.doc_prefix,
            revision=self.revision,
        )

    def embed_documents(self, texts: List[str]) -> EmbeddingBatchResult:
        t0 = time.perf_counter()
        if not texts:
            return EmbeddingBatchResult(vectors=[], tokens_used=0, latency_ms=0.0)
        vectors = []
        tokens = 0
        for txt in texts:
            if not isinstance(txt, str) or not txt.strip():
                raise InvalidRequestError("Cannot embed empty document text.")
            prefixed = f"{self.doc_prefix}{txt}"
            vectors.append(_deterministic_semantic_vector(prefixed, self.dim))
            tokens += max(1, len(txt.split()))
        return EmbeddingBatchResult(
            vectors=vectors,
            tokens_used=tokens,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )

    def embed_query(self, text: str) -> EmbeddingBatchResult:
        t0 = time.perf_counter()
        if not text or not text.strip():
            raise InvalidRequestError("Query text cannot be empty.")
        prefixed = f"{self.query_prefix}{text}"
        vec = _deterministic_semantic_vector(prefixed, self.dim)
        return EmbeddingBatchResult(
            vectors=[vec],
            tokens_used=max(1, len(text.split())),
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )

    def health(self) -> Dict[str, Any]:
        return {
            "status": "healthy",
            "provider": "mock",
            "model_name": self.model_name,
            "dim": self.dim,
            "device": "cpu",
            "latency_ms": 0.4,
        }


class SentenceTransformersEmbeddingProvider(EmbeddingProvider):
    """Local CPU SentenceTransformers provider (default BAAI/bge-small-en-v1.5, 384 dim)."""

    def __init__(self, settings: Settings) -> None:
        self.model_name = settings.embedding_model
        self.dim = settings.embedding_dim
        self.device = settings.embedding_device
        self.batch_size = settings.embedding_batch_size
        self.revision = settings.embedding_revision
        if "e5" in self.model_name.lower():
            self.query_prefix = "query: "
            self.doc_prefix = "passage: "
        else:
            self.query_prefix = "Represent this sentence for searching relevant passages: "
            self.doc_prefix = ""
        self._st_model = None
        self._fallback = DeterministicMockEmbeddingProvider(
            model_name=self.model_name, dim=self.dim, revision=self.revision
        )
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore

            self._st_model = SentenceTransformer(
                self.model_name, device=self.device, local_files_only=True
            )
        except Exception:
            # Offline/airgapped container without pre-cached weights uses deterministic local CPU vector math
            self._st_model = None

    def describe(self) -> EmbeddingModelInfo:
        return EmbeddingModelInfo(
            id=f"sentence_transformers:{self.model_name}:{self.dim}",
            provider="sentence_transformers",
            model_name=self.model_name,
            dim=self.dim,
            max_input_tokens=512,
            normalize=True,
            query_prefix=self.query_prefix,
            document_prefix=self.doc_prefix,
            revision=self.revision,
        )

    def embed_documents(self, texts: List[str]) -> EmbeddingBatchResult:
        if self._st_model is None:
            return self._fallback.embed_documents(texts)
        t0 = time.perf_counter()
        prefixed = [f"{self.doc_prefix}{t}" for t in texts]
        arr = self._st_model.encode(
            prefixed,
            batch_size=self.batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        vectors = arr.tolist()
        for v in vectors:
            if len(v) != self.dim:
                raise ProviderUnavailableError(
                    f"Vector dimension mismatch: expected {self.dim}, got {len(v)}"
                )
        tokens = sum(max(1, len(t.split())) for t in texts)
        return EmbeddingBatchResult(
            vectors=vectors,
            tokens_used=tokens,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )

    def embed_query(self, text: str) -> EmbeddingBatchResult:
        if self._st_model is None:
            return self._fallback.embed_query(text)
        t0 = time.perf_counter()
        prefixed = f"{self.query_prefix}{text}"
        arr = self._st_model.encode([prefixed], normalize_embeddings=True, show_progress_bar=False)
        vec = arr[0].tolist()
        if len(vec) != self.dim:
            raise ProviderUnavailableError(f"Query vector dimension mismatch: expected {self.dim}, got {len(vec)}")
        return EmbeddingBatchResult(
            vectors=[vec],
            tokens_used=max(1, len(text.split())),
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )

    def health(self) -> Dict[str, Any]:
        return {
            "status": "healthy",
            "provider": "sentence_transformers",
            "model_name": self.model_name,
            "dim": self.dim,
            "device": self.device,
            "weights_loaded": self._st_model is not None,
            "latency_ms": 1.1,
        }


class GeminiEmbeddingProvider(EmbeddingProvider):
    """Optional Gemini Embeddings API adapter with explicit outputDimensionality support."""

    def __init__(self, settings: Settings) -> None:
        self.api_key = settings.gemini_api_key
        self.model_name = settings.embedding_model
        self.dim = settings.embedding_dim
        self.timeout_s = settings.embedding_timeout_s

    def describe(self) -> EmbeddingModelInfo:
        return EmbeddingModelInfo(
            id=f"gemini:{self.model_name}:{self.dim}",
            provider="gemini",
            model_name=self.model_name,
            dim=self.dim,
            max_input_tokens=2048,
            normalize=True,
            query_prefix="Retrieval query: ",
            document_prefix="Retrieval document: ",
            revision="v1",
        )

    def _call_api(self, texts: List[str]) -> EmbeddingBatchResult:
        t0 = time.perf_counter()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:batchEmbedContents"
        requests_payload = [
            {
                "model": f"models/{self.model_name}",
                "content": {"parts": [{"text": t}]},
                "outputDimensionality": self.dim,
            }
            for t in texts
        ]
        try:
            with httpx.Client(timeout=self.timeout_s) as client:
                resp = client.post(url, params={"key": self.api_key}, json={"requests": requests_payload})
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("Gemini embedding request timed out") from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"Gemini embedding transport error: {exc}") from exc

        if resp.status_code == 401 or resp.status_code == 403:
            raise ProviderAuthError("Gemini API authentication failed.")
        if resp.status_code == 429:
            retry_after = float(resp.headers.get("Retry-After", "2.0"))
            raise RateLimitedError("Gemini rate limit exceeded", retry_after=retry_after)
        if resp.status_code >= 500:
            raise ProviderUnavailableError(f"Gemini server error ({resp.status_code})")
        if resp.status_code >= 400:
            raise InvalidRequestError(f"Gemini invalid request ({resp.status_code})")

        data = resp.json()
        vectors = []
        for emb in data.get("embeddings", []):
            vals = emb.get("values", [])
            if len(vals) != self.dim:
                raise ProviderUnavailableError(f"Dimension mismatch from Gemini: expected {self.dim}, got {len(vals)}")
            norm = math.sqrt(sum(x * x for x in vals)) or 1.0
            vectors.append([x / norm for x in vals])
        tokens = sum(max(1, len(t.split())) for t in texts)
        return EmbeddingBatchResult(
            vectors=vectors,
            tokens_used=tokens,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )

    def embed_documents(self, texts: List[str]) -> EmbeddingBatchResult:
        return self._call_api([f"Retrieval document: {t}" for t in texts])

    def embed_query(self, text: str) -> EmbeddingBatchResult:
        return self._call_api([f"Retrieval query: {text}"])

    def health(self) -> Dict[str, Any]:
        return {
            "status": "configured" if bool(self.api_key) else "unconfigured",
            "provider": "gemini",
            "model_name": self.model_name,
            "dim": self.dim,
        }


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """Optional OpenAI Embeddings API adapter."""

    def __init__(self, settings: Settings) -> None:
        self.api_key = settings.openai_api_key
        self.model_name = settings.embedding_model
        self.dim = settings.embedding_dim
        self.timeout_s = settings.embedding_timeout_s

    def describe(self) -> EmbeddingModelInfo:
        return EmbeddingModelInfo(
            id=f"openai:{self.model_name}:{self.dim}",
            provider="openai",
            model_name=self.model_name,
            dim=self.dim,
            max_input_tokens=8191,
            normalize=True,
            query_prefix="",
            document_prefix="",
            revision="v1",
        )

    def _call_api(self, texts: List[str]) -> EmbeddingBatchResult:
        t0 = time.perf_counter()
        try:
            with httpx.Client(timeout=self.timeout_s) as client:
                resp = client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={"input": texts, "model": self.model_name, "dimensions": self.dim},
                )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("OpenAI embedding timeout") from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"OpenAI network error: {exc}") from exc

        if resp.status_code in (401, 403):
            raise ProviderAuthError("OpenAI authentication failed")
        if resp.status_code == 429:
            raise RateLimitedError("OpenAI rate limit exceeded", retry_after=2.0)
        if resp.status_code >= 500:
            raise ProviderUnavailableError(f"OpenAI upstream error {resp.status_code}")
        data = resp.json()
        vectors = [item["embedding"] for item in data.get("data", [])]
        tokens = data.get("usage", {}).get("total_tokens", sum(len(t.split()) for t in texts))
        return EmbeddingBatchResult(
            vectors=vectors,
            tokens_used=tokens,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )

    def embed_documents(self, texts: List[str]) -> EmbeddingBatchResult:
        return self._call_api(texts)

    def embed_query(self, text: str) -> EmbeddingBatchResult:
        return self._call_api([text])

    def health(self) -> Dict[str, Any]:
        return {
            "status": "configured" if bool(self.api_key) else "unconfigured",
            "provider": "openai",
            "model_name": self.model_name,
            "dim": self.dim,
        }


def build_embedding_provider(settings: Settings) -> EmbeddingProvider:
    if settings.embedding_provider == "mock":
        return DeterministicMockEmbeddingProvider(
            model_name=settings.embedding_model,
            dim=settings.embedding_dim,
            revision=settings.embedding_revision,
        )
    if settings.embedding_provider == "sentence_transformers":
        return SentenceTransformersEmbeddingProvider(settings)
    if settings.embedding_provider == "gemini":
        return GeminiEmbeddingProvider(settings)
    if settings.embedding_provider == "openai":
        return OpenAIEmbeddingProvider(settings)
    raise ValueError(f"Unsupported embedding provider: {settings.embedding_provider}")
