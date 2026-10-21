import base64
import hashlib
import hmac
import secrets
from typing import Tuple


def generate_opaque_token(nbytes: int = 32) -> str:
    """Generate a URL-safe high-entropy opaque session or state token."""
    return secrets.token_urlsafe(nbytes)


def hash_session_token(raw_token: str) -> str:
    """Hash raw session cookie value using SHA-256 before database storage or lookup."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_csrf_token(session_id_hash: str, csrf_secret: str, secret_key: str) -> str:
    """Derive an HMAC-SHA256 CSRF token bound to the server-side session."""
    msg = f"{session_id_hash}:{csrf_secret}".encode("utf-8")
    sig = hmac.new(secret_key.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"{csrf_secret[:16]}.{sig}"


def verify_csrf_token(
    provided_token: str,
    session_id_hash: str,
    csrf_secret: str,
    secret_key: str,
) -> bool:
    if not provided_token:
        return False
    expected = generate_csrf_token(session_id_hash, csrf_secret, secret_key)
    return hmac.compare_digest(provided_token, expected)


def generate_pkce_pair() -> Tuple[str, str]:
    """Return (code_verifier, code_challenge) using S256 for Google OIDC."""
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
