"""Deterministic Document Text Extraction with Provenance & Safety Limits (Section 5 & 6.1).

Supports:
- PDF (via pypdf, preserving 1-based page numbers, detecting encrypted PDFs and scanned 0-text PDFs)
- DOCX (via python-docx, preserving heading hierarchy paths and table text)
- Markdown (via markdown-it-py / heading parser, preserving section hierarchy)
- TXT (charset normalization, preserving paragraph/section headings)
"""
from dataclasses import dataclass
import io
import re
from typing import List, Optional

import docx
from pypdf import PdfReader

PARSER_VERSION = "v2.0"
MAX_PDF_PAGES = 500
MAX_EXTRACTED_CHARS = 2_000_000


class ExtractionError(RuntimeError):
    def __init__(
        self,
        error_code: str,
        message: str,
        retryable: bool = False,
        terminal_status: str = "failed",
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.retryable = retryable
        self.terminal_status = terminal_status


@dataclass
class ExtractedSection:
    text: str
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    heading_path: Optional[str] = None


def extract_document_sections(extension: str, data: bytes) -> List[ExtractedSection]:
    ext = extension.lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    if ext == ".pdf":
        return _extract_pdf(data)
    if ext == ".docx":
        return _extract_docx(data)
    if ext == ".md":
        return _extract_markdown(data)
    if ext == ".txt":
        return _extract_txt(data)
    raise ExtractionError("unsupported_file_type", f"Unsupported file extension: {ext}", retryable=False)


def _extract_pdf(data: bytes) -> List[ExtractedSection]:
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:
        raise ExtractionError("corrupt_file", f"Failed to parse PDF structure: {exc}", retryable=False) from exc

    if reader.is_encrypted:
        raise ExtractionError(
            "encrypted_pdf",
            "Encrypted or password-protected PDF files cannot be indexed.",
            retryable=False,
        )

    num_pages = len(reader.pages)
    if num_pages == 0:
        raise ExtractionError("empty_pdf", "PDF contains zero pages.", retryable=False)
    if num_pages > MAX_PDF_PAGES:
        raise ExtractionError(
            "page_limit_exceeded",
            f"PDF has {num_pages} pages, exceeding the maximum limit of {MAX_PDF_PAGES}.",
            retryable=False,
        )

    sections: List[ExtractedSection] = []
    total_chars = 0
    for idx, page in enumerate(reader.pages, start=1):
        try:
            page_text = (page.extract_text() or "").strip()
        except Exception as exc:
            raise ExtractionError("corrupt_file", f"Failed extracting page {idx}: {exc}", retryable=False) from exc

        if page_text:
            total_chars += len(page_text)
            if total_chars > MAX_EXTRACTED_CHARS:
                raise ExtractionError(
                    "decompression_or_text_limit_exceeded",
                    "Extracted text exceeds safety limit.",
                    retryable=False,
                )
            # Detect leading section heading on page if present
            first_line = page_text.splitlines()[0].strip()
            heading = first_line[:120] if len(first_line) < 90 and not first_line.endswith(".") else f"Page {idx}"
            sections.append(
                ExtractedSection(
                    text=page_text,
                    page_start=idx,
                    page_end=idx,
                    heading_path=heading,
                )
            )

    if not sections or total_chars < 10:
        # Scanned PDF with no extractable text -> mark needs_ocr (OCR is future Stage 2+)
        raise ExtractionError(
            "needs_ocr",
            "PDF contains no extractable text layer (scanned document requires OCR).",
            retryable=False,
            terminal_status="needs_ocr",
        )

    return sections


def _extract_docx(data: bytes) -> List[ExtractedSection]:
    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise ExtractionError("corrupt_file", f"Failed to read DOCX document: {exc}", retryable=False) from exc

    heading_stack: List[str] = []
    sections: List[ExtractedSection] = []
    current_lines: List[str] = []
    current_path = "Document Root"

    def flush_buffer() -> None:
        if current_lines:
            joined = "\n".join(current_lines).strip()
            if joined:
                sections.append(
                    ExtractedSection(
                        text=joined,
                        page_start=None,
                        page_end=None,
                        heading_path=current_path,
                    )
                )
            current_lines.clear()

    for para in document.paragraphs:
        raw = para.text.strip()
        if not raw:
            continue
        style_name = (para.style.name if para.style else "") or ""
        if style_name.lower().startswith("heading") or style_name.lower() == "title":
            flush_buffer()
            level_match = re.search(r"(\d+)", style_name)
            level = int(level_match.group(1)) if level_match else 1
            while len(heading_stack) >= level:
                heading_stack.pop()
            heading_stack.append(raw)
            current_path = " > ".join(heading_stack)
            current_lines.append(raw)
        else:
            current_lines.append(raw)

    # Also extract text from DOCX tables
    for table in document.tables:
        table_rows = []
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                table_rows.append(" | ".join(cells))
        if table_rows:
            current_lines.append("\n".join(table_rows))

    flush_buffer()

    if not sections:
        raise ExtractionError("empty_document", "DOCX contains no extractable text.", retryable=False)
    return sections


def _extract_markdown(data: bytes) -> List[ExtractedSection]:
    text = data.decode("utf-8", errors="replace")
    lines = text.splitlines()
    heading_stack: List[tuple[int, str]] = []
    sections: List[ExtractedSection] = []
    current_lines: List[str] = []
    current_path = "Overview"

    def flush() -> None:
        if current_lines:
            body = "\n".join(current_lines).strip()
            if body:
                sections.append(
                    ExtractedSection(text=body, page_start=None, page_end=None, heading_path=current_path)
                )
            current_lines.clear()

    for line in lines:
        m = re.match(r"^(#{1,6})\s+(.+)$", line.strip())
        if m:
            flush()
            level = len(m.group(1))
            title = m.group(2).strip()
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, title))
            current_path = " > ".join(h[1] for h in heading_stack)
            current_lines.append(title)
        else:
            current_lines.append(line)

    flush()
    if not sections:
        raise ExtractionError("empty_document", "Markdown file contains no text.", retryable=False)
    return sections


def _extract_txt(data: bytes) -> List[ExtractedSection]:
    text = data.decode("utf-8", errors="replace").strip()
    if not text:
        raise ExtractionError("empty_document", "Text file is empty.", retryable=False)

    blocks = re.split(r"\n\s*\n", text)
    sections: List[ExtractedSection] = []
    current_heading = "General Text"
    buffer: List[str] = []

    for blk in blocks:
        clean = blk.strip()
        if not clean:
            continue
        first_line = clean.splitlines()[0].strip()
        if re.match(r"^(Section\s+\d+|Chapter\s+\d+|[A-Z][A-Z0-9\s:&-]{5,80})$", first_line):
            if buffer:
                sections.append(
                    ExtractedSection(
                        text="\n\n".join(buffer),
                        page_start=None,
                        page_end=None,
                        heading_path=current_heading,
                    )
                )
                buffer.clear()
            current_heading = first_line[:120]
        buffer.append(clean)

    if buffer:
        sections.append(
            ExtractedSection(
                text="\n\n".join(buffer),
                page_start=None,
                page_end=None,
                heading_path=current_heading,
            )
        )
    return sections
