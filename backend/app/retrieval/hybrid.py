"""Hybrid Retrieval Engine: Pre-Filtered Vector + Full-Text Search + Reciprocal Rank Fusion (Section 6.2).

Enforces:
1. Tenant isolation, active indexed document version, and user/role/ACL read permissions BEFORE ranking.
2. Separate Vector Cosine Top-N and Full-Text Search (BM25/tsvector-style lexical) Top-N.
3. Reciprocal Rank Fusion: RRF(d) = w_vec / (k + rank_vec) + w_fts / (k + rank_fts) with k = 60.
4. Content-hash deduplication of near-identical chunks and MAX_CONTEXT_TOKENS budget enforcement.
"""
import math
import re
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from app.core.config import Settings
from app.db.repository import DatabaseRepository
from app.providers.base import EmbeddingProvider

STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "in", "on", "at", "to", "for", "of", "with", "by", "about", "as",
    "into", "like", "through", "after", "over", "between", "out", "against",
    "during", "without", "before", "under", "around", "among", "what", "which",
    "who", "whom", "this", "that", "these", "those", "am", "have", "has", "had",
    "do", "does", "did", "can", "could", "should", "would", "may", "might", "must",
    "how", "when", "where", "why", "and", "or", "not", "from",
}


def tokenize_fts_query(text: str) -> List[str]:
    raw_tokens = re.findall(r"[a-z0-9_\-]+", text.lower())
    filtered = [t for t in raw_tokens if t not in STOPWORDS and len(t) > 1]
    return filtered or raw_tokens


def compute_fts_lexical_score(query_tokens: List[str], content: str, heading_path: Optional[str] = None) -> float:
    if not query_tokens:
        return 0.0
    full_text = f"{heading_path or ''} {content}".lower()
    doc_tokens = re.findall(r"[a-z0-9_\-]+", full_text)
    if not doc_tokens:
        return 0.0

    doc_len = len(doc_tokens)
    freq_map: Dict[str, int] = {}
    for dt in doc_tokens:
        freq_map[dt] = freq_map.get(dt, 0) + 1

    score = 0.0
    matched_unique = 0
    for qt in set(query_tokens):
        tf = freq_map.get(qt, 0)
        # Also reward prefix/stem match for inflectional variants (e.g. "deleted" vs "deletion")
        if tf == 0 and len(qt) >= 5:
            stem = qt[:5]
            tf = sum(count for tok, count in freq_map.items() if tok.startswith(stem))
        if tf > 0:
            matched_unique += 1
            # BM25-inspired saturation
            k1 = 1.5
            b = 0.75
            norm_tf = (tf * (k1 + 1.0)) / (tf + k1 * (1.0 - b + b * (doc_len / 150.0)))
            score += norm_tf

    if matched_unique == 0:
        return 0.0
    coverage = matched_unique / len(set(query_tokens))
    return round(score * (0.5 + 0.5 * coverage), 6)


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    a = np.asarray(vec_a, dtype=np.float64)
    b = np.asarray(vec_b, dtype=np.float64)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom <= 1e-12:
        return 0.0
    return float(np.dot(a, b) / denom)


class HybridRetriever:
    def __init__(
        self,
        settings: Settings,
        repo: DatabaseRepository,
        embedding_provider: EmbeddingProvider,
    ) -> None:
        self.settings = settings
        self.repo = repo
        self.embedding_provider = embedding_provider

    def retrieve(
        self,
        tenant_id: str,
        user_id: str,
        role: str,
        query: str,
        top_k: Optional[int] = None,
    ) -> Dict[str, Any]:
        k_limit = top_k or self.settings.retrieval_top_k
        active_model = self.repo.get_active_embedding_model()
        if not active_model:
            info = self.embedding_provider.describe()
            active_model = self.repo.ensure_active_embedding_model(
                provider=info.provider,
                model_name=info.model_name,
                revision=info.revision,
                dim=info.dim,
                max_input_tokens=info.max_input_tokens,
                normalize=info.normalize,
                query_prefix=info.query_prefix,
                document_prefix=info.document_prefix,
            )

        # 1. Embed query with active embedding model (graceful FTS-only degradation if embedding fails)
        query_vector: Optional[List[float]] = None
        retrieval_mode = "hybrid"
        try:
            emb_res = self.embedding_provider.embed_query(query)
            if emb_res.vectors and len(emb_res.vectors[0]) == int(active_model["dim"]):
                query_vector = emb_res.vectors[0]
            else:
                retrieval_mode = "fts_only"
        except Exception:
            retrieval_mode = "fts_only"

        # 2. Fetch ONLY authorized chunks belonging to tenant's active indexed documents
        candidates = self.repo.fetch_authorized_active_chunks(
            tenant_id=tenant_id,
            user_id=user_id,
            role=role,
            active_embedding_model_id=active_model["id"],
        )
        if not candidates:
            return {
                "mode": retrieval_mode,
                "total_candidates": 0,
                "passages": [],
            }

        query_tokens = tokenize_fts_query(query)

        # 3. Score candidates via Vector Cosine and FTS Lexical Rank separately
        vec_scored: List[Tuple[str, float]] = []
        fts_scored: List[Tuple[str, float]] = []

        for cand in candidates:
            cid = cand["chunk_id"]
            if query_vector is not None and cand.get("vector"):
                sim = cosine_similarity(query_vector, cand["vector"])
                if sim > 0.05:
                    vec_scored.append((cid, sim))
            fts_val = compute_fts_lexical_score(query_tokens, cand["content"], cand.get("heading_path"))
            min_fts = 1.35 if len(set(query_tokens)) >= 3 else 0.5
            if fts_val >= min_fts:
                fts_scored.append((cid, fts_val))

        vec_scored.sort(key=lambda x: x[1], reverse=True)
        fts_scored.sort(key=lambda x: x[1], reverse=True)

        vec_rank_map = {cid: rank for rank, (cid, _) in enumerate(vec_scored, start=1)}
        vec_sim_map = {cid: sim for cid, sim in vec_scored}
        fts_rank_map = {cid: rank for rank, (cid, _) in enumerate(fts_scored, start=1)}
        fts_val_map = {cid: val for cid, val in fts_scored}

        # 4. Reciprocal Rank Fusion (RRF, k = 60)
        rrf_k = float(self.settings.rrf_k)
        w_vec = float(self.settings.vector_weight)
        w_fts = float(self.settings.fts_weight)

        fused: List[Dict[str, Any]] = []
        for cand in candidates:
            cid = cand["chunk_id"]
            v_rank = vec_rank_map.get(cid)
            f_rank = fts_rank_map.get(cid)
            if v_rank is None and f_rank is None:
                continue

            rrf_score = 0.0
            if v_rank is not None:
                rrf_score += w_vec / (rrf_k + v_rank)
            if f_rank is not None:
                # Only allow pure vector hits when lexical overlap is zero if cosine similarity is strong
                rrf_score += w_fts / (rrf_k + f_rank)
            elif vec_sim_map.get(cid, 0.0) < 0.22:
                continue

            item = dict(cand)
            item.pop("vector", None)
            item["score"] = round(rrf_score, 6)
            item["vector_rank"] = v_rank
            item["fts_rank"] = f_rank
            item["vector_similarity"] = round(vec_sim_map.get(cid, 0.0), 4)
            item["fts_score"] = round(fts_val_map.get(cid, 0.0), 4)
            fused.append(item)

        fused.sort(
            key=lambda x: (
                x["score"],
                x.get("fts_score", 0.0),
                x.get("vector_similarity", 0.0),
            ),
            reverse=True,
        )

        # 5. Deduplicate by content_hash and enforce MAX_CONTEXT_TOKENS
        seen_hashes = set()
        selected: List[Dict[str, Any]] = []
        token_budget = self.settings.max_context_tokens
        tokens_accum = 0

        for item in fused:
            chash = item["content_hash"]
            if chash in seen_hashes:
                continue
            if tokens_accum + int(item.get("token_count", 100)) > token_budget and selected:
                break
            seen_hashes.add(chash)
            tokens_accum += int(item.get("token_count", 100))
            label = f"S{len(selected) + 1}"
            selected.append(
                {
                    "label": label,
                    "chunk_id": item["chunk_id"],
                    "document_id": item["document_id"],
                    "document_title": item["document_title"],
                    "version": item["version"],
                    "page_start": item["page_start"],
                    "page_end": item["page_end"],
                    "heading_path": item["heading_path"],
                    "excerpt": item["content"],
                    "content_hash": item["content_hash"],
                    "score": item["score"],
                    "vector_rank": item["vector_rank"],
                    "fts_rank": item["fts_rank"],
                }
            )
            if len(selected) >= k_limit:
                break

        return {
            "mode": retrieval_mode,
            "total_candidates": len(fused),
            "passages": selected,
        }
