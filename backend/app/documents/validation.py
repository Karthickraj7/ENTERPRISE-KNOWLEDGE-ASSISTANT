"""Upload Validation, Magic-Byte MIME Sniffing, and Zip-Bomb Protection (Section 6.1 & 9.2)."""
from dataclasses import dataclass
import io
from pathlib import Path
import re
import zipfile

from app.core.security import sha256_bytes

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}
MAX_ZIP_DECOMPRESSION_RATIO = 50.0
MAX_UNCOMPRESSED_DOCX_BYTES = 50 * 1024 * 1024  # 50 MB


class FileValidationError(ValueError):
    def __init__(self, status_code: int, error_code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = message


@dataclass
class ValidatedUpload:
    sanitized_filename: str
    extension: str
    detected_mime: str
    size_bytes: int
    sha256: str


def sanitize_filename(filename: str) -> str:
    base = Path(filename or "document").name
    clean = re.sub(r"[^A-Za-z0-9._ -]", "_", base).strip()
    return clean[:200] or "document.txt"


def validate_uploaded_file(
    filename: str,
    data: bytes,
    max_upload_size_mb: int = 25,
) -> ValidatedUpload:
    """Validate extension, size, magic bytes (ignoring browser Content-Type), and zip-bomb ratio."""
    if not data:
        raise FileValidationError(400, "empty_file", "Uploaded file is empty.")

    max_bytes = max_upload_size_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise FileValidationError(
            413,
            "file_too_large",
            f"File exceeds maximum allowed upload size of {max_upload_size_mb} MB.",
        )

    safe_name = sanitize_filename(filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise FileValidationError(
            415,
            "unsupported_file_extension",
            f"Unsupported file extension '{ext}'. Allowed formats: PDF, DOCX, TXT, MD.",
        )

    # Magic-byte inspection (never trust browser MIME header)
    detected_mime = _sniff_and_verify_content(ext, data)
    digest = sha256_bytes(data)

    return ValidatedUpload(
        sanitized_filename=safe_name,
        extension=ext,
        detected_mime=detected_mime,
        size_bytes=len(data),
        sha256=digest,
    )


def _sniff_and_verify_content(ext: str, data: bytes) -> str:
    if ext == ".pdf":
        # PDF header must start with %PDF- within the first 1024 bytes
        if b"%PDF-" not in data[:1024]:
            raise FileValidationError(
                415,
                "mime_mismatch_pdf",
                "File has .pdf extension but does not contain a valid %PDF- magic header.",
            )
        return "application/pdf"

    if ext == ".docx":
        # DOCX is an OpenXML ZIP container starting with PK\\x03\\x04
        if not data.startswith(b"PK\x03\x04"):
            raise FileValidationError(
                415,
                "mime_mismatch_docx",
                "File has .docx extension but is not a valid OpenXML ZIP archive.",
            )
        try:
            with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
                names = set(zf.namelist())
                if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                    raise FileValidationError(
                        415,
                        "invalid_docx_structure",
                        "Archive is missing required OpenXML word/document.xml structure.",
                    )
                total_uncompressed = sum(info.file_size for info in zf.infolist())
                compressed_size = max(1, len(data))
                ratio = total_uncompressed / compressed_size
                if (
                    ratio > MAX_ZIP_DECOMPRESSION_RATIO
                    or total_uncompressed > MAX_UNCOMPRESSED_DOCX_BYTES
                ):
                    raise FileValidationError(
                        400,
                        "zip_bomb_detected",
                        "Archive exceeds safe decompression ratio or uncompressed size limits.",
                    )
        except zipfile.BadZipFile as exc:
            raise FileValidationError(400, "corrupt_file", "Corrupt DOCX archive.") from exc
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    if ext in (".txt", ".md"):
        # Reject binary files disguised as text (check for null bytes or PDF/ZIP magic headers)
        if b"\x00" in data[:8192] or data.startswith(b"%PDF-") or data.startswith(b"PK\x03\x04"):
            raise FileValidationError(
                415,
                "binary_content_in_text_file",
                "Binary content detected in a plain-text or Markdown upload.",
            )
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            try:
                data.decode("latin-1")
            except UnicodeDecodeError as exc:
                raise FileValidationError(
                    415, "invalid_text_encoding", "Text file could not be decoded safely."
                ) from exc
        return "text/markdown" if ext == ".md" else "text/plain"

    raise FileValidationError(415, "unsupported_file_type", "Unsupported file type.")
