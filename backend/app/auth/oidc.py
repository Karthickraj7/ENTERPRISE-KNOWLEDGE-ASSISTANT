"""Google OAuth 2.0 / OIDC Authorization-Code Flow with PKCE, State, Nonce & Isolated Dev Login (Section 7 & 9.1)."""
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import time
from typing import Any, Dict, Optional
import urllib.parse
import httpx

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import generate_opaque_token, generate_pkce_pair


@dataclass
class PendingOIDCState:
    state: str
    nonce: str
    code_verifier: str
    tenant_slug: str
    created_at: float


class OIDCFlowManager:
    """Manages server-side OIDC authorization state, nonce, PKCE, and ID token verification."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._pending_states: Dict[str, PendingOIDCState] = {}

    def start_authorization(self, tenant_slug: Optional[str] = None) -> Dict[str, str]:
        if not self.settings.google_client_id:
            raise AppError(
                503,
                "google_oidc_not_configured",
                "Google Sign-In Not Configured",
                "GOOGLE_CLIENT_ID is not configured on this server. Use local development login if ENABLE_DEV_AUTH=true.",
            )
        state = generate_opaque_token(24)
        nonce = generate_opaque_token(24)
        verifier, challenge = generate_pkce_pair()
        slug = tenant_slug or self.settings.default_tenant_slug
        self._pending_states[state] = PendingOIDCState(
            state=state,
            nonce=nonce,
            code_verifier=verifier,
            tenant_slug=slug,
            created_at=time.time(),
        )
        params = {
            "client_id": self.settings.google_client_id,
            "redirect_uri": self.settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "online",
            "prompt": "select_account",
        }
        url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
        return {"authorization_url": url, "state": state, "nonce": nonce}

    def consume_state(self, state: str) -> PendingOIDCState:
        pending = self._pending_states.pop(state, None)
        if not pending or (time.time() - pending.created_at) > 600:
            raise AppError(
                400,
                "invalid_oidc_state",
                "Invalid or Expired OIDC State",
                "The login state parameter is missing, invalid, or expired.",
            )
        return pending

    def verify_id_token_claims(self, claims: Dict[str, Any], expected_nonce: str) -> Dict[str, str]:
        iss = claims.get("iss", "")
        if iss not in ("https://accounts.google.com", "accounts.google.com"):
            raise AppError(401, "invalid_oidc_issuer", "Invalid Token Issuer", "ID token issuer is not Google.")

        if self.settings.google_client_id and claims.get("aud") != self.settings.google_client_id:
            raise AppError(401, "invalid_oidc_audience", "Invalid Token Audience", "ID token audience mismatch.")

        exp = int(claims.get("exp", 0))
        if exp <= int(time.time()):
            raise AppError(401, "expired_id_token", "Expired ID Token", "The Google ID token has expired.")

        if claims.get("nonce") != expected_nonce:
            raise AppError(401, "invalid_oidc_nonce", "Invalid Nonce", "ID token nonce does not match login request.")

        if not claims.get("email_verified", False):
            raise AppError(403, "unverified_email", "Email Not Verified", "Google account email is not verified.")

        email = str(claims.get("email", "")).strip().lower()
        sub = str(claims.get("sub", "")).strip()
        if not email or not sub:
            raise AppError(400, "missing_identity_claims", "Missing Identity Claims", "ID token lacked sub or email.")

        if self.settings.allowed_email_domains:
            domain = email.split("@")[-1]
            if domain not in self.settings.allowed_email_domains:
                raise AppError(
                    403,
                    "email_domain_not_allowed",
                    "Account Domain Not Authorized",
                    f"Email domain '{domain}' is not on the tenant allow-list.",
                )

        return {
            "google_sub": sub,
            "email": email,
            "full_name": str(claims.get("name") or email.split("@")[0]),
        }
