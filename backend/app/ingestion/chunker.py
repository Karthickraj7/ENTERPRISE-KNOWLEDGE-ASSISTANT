"""Deterministic Text Normalization and Token-Aware Overlapping Chunker (Section 6.1 & C7).

Derives chunk size from the active embedding model's max_input_tokens (default 350 tokens with 50 overlap
for BAAI/bge-small-en-v1.5's 512-token window).
"""
from dataclasses import dataclass
import re
from typing import List, Optional
import unicodedata

from app.core.security import sha256_text
from app.ingestion.parsers import ExtractedSection, PARSER_VERSION


@dataclass
class DocumentChunk:
    chunk_index: int
    content: str
    content_hash: str
    token_count: int
    page_start: Optional[int]
    page_end: Optional[int]
    heading_path: Optional[str]
    parser_version: str = PARSER_VERSION


def normalize_text(text: str) -> str:
    """Normalize Unicode (NFKC), strip non-printable control chars, and collapse redundant whitespace."""
    norm = unicodedata.normalize("NFKC", text)
    # Remove control characters except newline and tab
    norm = "".join(ch for ch in norm if ch == "\n" or ch == "\t" or unicodedata.category(ch)[0] != "C")
    # Normalize line endings and collapse horizontal spaces
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in norm.splitlines()]
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def estimate_wordpiece_tokens(text: str) -> int:
    """Conservative WordPiece token estimator (~1.3 tokens per whitespace word)."""
    words = text.split()
    if not words:
        return 0
    return max(1, int(round(len(words) * 1.3)))


def chunk_extracted_sections(
    sections: List[ExtractedSection],
    target_tokens: int = 350,
    overlap_tokens: int = 50,
) -> List[DocumentChunk]:
    """Deterministically split extracted sections into overlapping chunks with provenance."""
    if target_tokens < 40:
        target_tokens = 40
    if overlap_tokens >= target_tokens:
        overlap_tokens = max(0, target_tokens // 4)

    target_words = max(20, int(target_tokens / 1.3))
    overlap_words = max(0, int(overlap_tokens / 1.3))

    chunks: List[DocumentChunk] = []
    chunk_idx = 0

    for sec in sections:
        cleaned = normalize_text(sec.text)
        if not cleaned:
            continue
        words = cleaned.split()
        if len(words) <= target_words:
            content_hash = sha256_text(cleaned)
            chunks.append(
                DocumentChunk(
                    chunk_index=chunk_idx,
                    content=cleaned,
                    content_hash=content_hash,
                    token_count=estimate_wordpiece_tokens(cleaned),
                    page_start=sec.page_start,
                    page_end=sec.page_end,
                    heading_path=sec.heading_path,
                    parser_version=PARSER_VERSION,
                )
            )
            chunk_idx += 1
            continue

        step = max(1, target_words - overlap_words)
        start = 0
        while start < len(words):
            window = words[start : start + target_words]
            chunk_str = " ".join(window).strip()
            if chunk_str:
                chunks.append(
                    DocumentChunk(
                        chunk_index=chunk_idx,
                        content=chunk_str,
                        content_hash=sha256_text(chunk_str),
                        token_count=estimate_wordpiece_tokens(chunk_str),
                        page_start=sec.page_start,
                        page_end=sec.page_end,
                        heading_path=sec.heading_path,
                        parser_version=PARSER_VERSION,
                    )
                )
                chunk_idx += 1
            if start + target_words >= len(words):
                break
            start += step

    return chunks
