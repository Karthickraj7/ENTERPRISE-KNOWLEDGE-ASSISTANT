# Security, Multi-Tenancy, and Threat Model

## 1. Identity vs. Session vs. Document Authorization
1. **Identity**: Verified via Google OIDC authorization-code flow with `state`, `nonce`, and `PKCE` (`S256`), matching `google_sub` as the immutable subject key.
2. **Session**: 256-bit opaque token stored as a SHA-256 hash (`sessions.id_hash`). Idle timeout defaults to 8 hours; absolute lifetime defaults to 24 hours. Role changes immediately revoke active sessions.
3. **Authorization**: Enforced inside SQL before vector or FTS ranking. Every citation click (`GET /api/v1/sources/{chunk_id}`) re-verifies tenant and document ACL permissions.

## 2. Prompt Injection & Poisoned Document Controls
- Document excerpts are wrapped in `<EVIDENCE_PACK>` XML delimiters with a fixed, non-overridable system prompt instructing the model to treat all evidence strictly as untrusted data.
- The LLM has zero tool-execution or network capabilities.
- Every `[S#]` citation marker in the generated output is validated server-side against the authorized evidence pack; unknown or hallucinated labels are rejected before persistence.
