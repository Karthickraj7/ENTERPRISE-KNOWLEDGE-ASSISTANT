"""Server-Side Session Resolution, CSRF Enforcement, Rate Limiting, and RBAC Hierarchy (Section 7 & 9)."""
import time
from typing import Any, Callable, Dict, Optional
from fastapi import Request

from app.core.errors import AppError
from app.core.security import generate_csrf_token, hash_session_token, verify_csrf_token

ROLE_RANK = {
    "viewer": 1,
    "contributor": 2,
    "knowledge_admin": 3,
    "system_admin": 4,
}

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class RateLimiter:
    """In-process sliding window rate limiter per user/IP and tenant."""

    def __init__(self, max_per_minute: int = 120) -> None:
        self.max_per_minute = max_per_minute
        self._buckets: Dict[str, list[float]] = {}

    def check(self, key: str, custom_limit: Optional[int] = None) -> None:
        now = time.time()
        limit = custom_limit or self.max_per_minute
        window = [t for t in self._buckets.get(key, []) if now - t < 60.0]
        if len(window) >= limit:
            raise AppError(
                429,
                "rate_limit_exceeded",
                "Too Many Requests",
                "Rate limit exceeded. Please wait before retrying.",
                headers={"Retry-After": "15"},
            )
        window.append(now)
        self._buckets[key] = window


def resolve_authenticated_session(request: Request, require_csrf: bool = True) -> Dict[str, Any]:
    """Resolve user, tenant, and role strictly from the server-side hashed session cookie.
    Never trusts user_id, tenant_id, or role headers/body fields sent by the browser.
    """
    state_app = request.app.state
    settings = state_app.settings
    repo = state_app.repo

    raw_cookie = request.cookies.get(settings.session_cookie_name)
    if not raw_cookie:
        raise AppError(
            401,
            "unauthenticated",
            "Authentication Required",
            "A valid session cookie is required to access this resource.",
        )

    id_hash = hash_session_token(raw_cookie)
    session = repo.get_valid_session(id_hash, idle_ttl_seconds=settings.session_idle_ttl_seconds)
    if not session:
        raise AppError(
            401,
            "session_expired_or_revoked",
            "Session Expired or Revoked",
            "Your session has expired or been revoked. Please sign in again.",
        )

    if require_csrf and request.method.upper() in MUTATING_METHODS:
        provided_csrf = request.headers.get("X-CSRF-Token", "")
        if not verify_csrf_token(
            provided_token=provided_csrf,
            session_id_hash=id_hash,
            csrf_secret=session["csrf_secret"],
            secret_key=settings.csrf_secret_key,
        ):
            raise AppError(
                403,
                "csrf_validation_failed",
                "CSRF Token Validation Failed",
                "Missing or invalid X-CSRF-Token header on mutating request.",
            )

    csrf_token = generate_csrf_token(id_hash, session["csrf_secret"], settings.csrf_secret_key)
    session["csrf_token"] = csrf_token
    return session


def require_min_role(session: Dict[str, Any], min_role: str) -> None:
    actual_role = session.get("role", "viewer")
    if ROLE_RANK.get(actual_role, 0) < ROLE_RANK.get(min_role, 99):
        raise AppError(
            403,
            "insufficient_role_permissions",
            "Forbidden",
            f"This operation requires at least '{min_role}' role privileges.",
        )
