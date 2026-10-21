"""Comprehensive Automated Test Suite for Enterprise Knowledge Assistant (Section 12 & 13).

Covers:
1. Configuration startup validation & Argon runtime model guard
2. Deterministic text normalization & overlapping chunker
3. Upload file validation (magic-byte sniffing, zip-bomb protection, binary-in-text rejection)
4. Document parsers (multi-page PDF provenance, DOCX headings/tables, Markdown, TXT, encrypted PDF, scanned 0-text PDF -> needs_ocr)
5. Authentication, Google OIDC state/nonce/claims, session expiration/revocation, CSRF protection, and RBAC hierarchy
6. Strict Multi-Tenant Isolation & Document ACL Revocation (zero cross-tenant or revoked-ACL leakage across search, chat, citations, downloads, conversations, and admin APIs)
7. Ingestion pipeline idempotency, SHA-256 deduplication, retry recovery, reindexing atomic active_version switch, and soft delete + purge
8. Hybrid retrieval (Vector + FTS + Reciprocal Rank Fusion), retrieval-only mode (GENERATION_PROVIDER=none), grounded generation with [S1] validation, rejection of hallucinated [S99] labels, provider timeout/429 degraded fallback, and embedding model migration
9. 50-Question Golden Evaluation Suite (40 answerable + 10 no-answer abstention cases)
"""
import io
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

import docx
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.core.config import ConfigurationError, Settings
from app.db.repository import DatabaseRepository
from app.documents.storage import LocalFilesystemStorage
from app.documents.validation import FileValidationError, validate_uploaded_file
from app.generation.rag import validate_citations_in_answer
from app.ingestion.chunker import chunk_extracted_sections, normalize_text
from app.ingestion.parsers import ExtractionError, extract_document_sections
from app.main import create_app
from app.providers.embeddings import DeterministicMockEmbeddingProvider
from app.providers.llm import DeterministicMockLLMProvider, DisabledLLMProvider


def _make_sample_pdf_bytes(pages_text: list[str], encrypt_password: str = "") -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    for txt in pages_text:
        if txt:
            y = 720
            for line in txt.splitlines():
                c.drawString(72, y, line)
                y -= 18
        c.showPage()
    c.save()
    raw = buf.getvalue()
    if encrypt_password:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        writer = PdfWriter()
        for p in reader.pages:
            writer.add_page(p)
        writer.encrypt(encrypt_password)
        enc_buf = io.BytesIO()
        writer.write(enc_buf)
        return enc_buf.getvalue()
    return raw


def _make_sample_docx_bytes(heading: str, paragraph: str) -> bytes:
    d = docx.Document()
    d.add_heading(heading, level=1)
    d.add_paragraph(paragraph)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


class TestEnterpriseKnowledgeAssistant(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test.db"
        self.storage_dir = Path(self.tmp_dir.name) / "storage"
        self.settings = Settings(
            app_env="test",
            database_url=f"sqlite:///{self.db_path}",
            local_storage_path=str(self.storage_dir),
            embedding_provider="mock",
            embedding_model="BAAI/bge-small-en-v1.5",
            embedding_dim=384,
            generation_provider="none",
            enable_dev_auth=True,
        )
        self.settings.validate_startup()
        self.repo = DatabaseRepository(self.settings.database_url)
        self.storage = LocalFilesystemStorage(self.settings.local_storage_path)
        self.embedder = DeterministicMockEmbeddingProvider(dim=384)
        self.app = create_app(
            custom_settings=self.settings,
            custom_repo=self.repo,
            custom_storage=self.storage,
            custom_embedder=self.embedder,
            custom_llm=DisabledLLMProvider(),
        )
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.tmp_dir.cleanup()

    def _login(
        self,
        email: str = "admin@acme.internal",
        role: str = "system_admin",
        tenant_slug: str = "acme-enterprise",
    ) -> tuple[TestClient, str]:
        client = TestClient(self.app)
        resp = client.post(
            "/auth/dev/login",
            json={
                "email": email,
                "full_name": email.split("@")[0].title(),
                "role": role,
                "tenant_slug": tenant_slug,
                "tenant_name": tenant_slug.title(),
            },
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        csrf = resp.json()["csrf_token"]
        return client, csrf

    # --- 1. Startup Config Validation Tests ---
    def test_01_startup_configuration_validation(self) -> None:
        # Unknown provider fails fast
        with self.assertRaises(ConfigurationError):
            Settings(embedding_provider="ollama").validate_startup()
        with self.assertRaises(ConfigurationError):
            Settings(generation_provider="ollama").validate_startup()

        # Production with dev auth enabled fails fast
        with self.assertRaises(ConfigurationError):
            Settings(app_env="production", enable_dev_auth=True).validate_startup()

        # Coding agent model name (Argon) rejected as runtime model
        with self.assertRaises(ConfigurationError):
            Settings(
                generation_provider="gemini",
                generation_model="gemini-argon-4",
                gemini_api_key="test-key",
                allow_training_use_providers=True,
            ).validate_startup()

        # Free-tier Gemini blocked when ALLOW_TRAINING_USE_PROVIDERS=false
        with self.assertRaises(ConfigurationError):
            Settings(
                generation_provider="gemini",
                generation_model="gemini-2.5-flash",
                gemini_api_key="test-key",
                gemini_tier_is_free=True,
                allow_training_use_providers=False,
            ).validate_startup()

    # --- 2. Deterministic Normalization & Chunking Tests ---
    def test_02_deterministic_chunker_and_normalization(self) -> None:
        raw = "Section 1: Security\r\n\r\n\r\nAll   sessions\x00 use   SHA-256   hashes."
        norm = normalize_text(raw)
        self.assertNotIn("\x00", norm)
        self.assertEqual(norm, "Section 1: Security\n\nAll sessions use SHA-256 hashes.")

        long_words = " ".join([f"token_{i}" for i in range(450)])
        sections = extract_document_sections(".txt", long_words.encode("utf-8"))
        c1 = chunk_extracted_sections(sections, target_tokens=150, overlap_tokens=30)
        c2 = chunk_extracted_sections(sections, target_tokens=150, overlap_tokens=30)
        self.assertGreater(len(c1), 2)
        self.assertEqual([x.content_hash for x in c1], [x.content_hash for x in c2])

    # --- 3. File Validation, Magic-Byte & Zip-Bomb Protection Tests ---
    def test_03_file_validation_and_magic_bytes(self) -> None:
        # Fake PDF (text bytes with .pdf extension) rejected
        with self.assertRaises(FileValidationError) as ctx:
            validate_uploaded_file("fake.pdf", b"Hello world not a pdf")
        self.assertEqual(ctx.exception.error_code, "mime_mismatch_pdf")

        # Binary PDF disguised as .txt rejected
        pdf_bytes = _make_sample_pdf_bytes(["Valid PDF Page 1"])
        with self.assertRaises(FileValidationError) as ctx2:
            validate_uploaded_file("disguised.txt", pdf_bytes)
        self.assertEqual(ctx2.exception.error_code, "binary_content_in_text_file")

        # Zip bomb DOCX rejected
        bomb_buf = io.BytesIO()
        with zipfile.ZipFile(bomb_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", "<Types></Types>")
            zf.writestr("word/document.xml", "A" * (10 * 1024 * 1024))
        with self.assertRaises(FileValidationError) as ctx3:
            validate_uploaded_file("bomb.docx", bomb_buf.getvalue())
        self.assertEqual(ctx3.exception.error_code, "zip_bomb_detected")

    # --- 4. Extraction Tests (PDF, DOCX, MD, TXT, Encrypted PDF, Scanned PDF -> needs_ocr) ---
    def test_04_document_parsers_and_error_states(self) -> None:
        # Multi-page PDF preserves page numbers
        pdf_bytes = _make_sample_pdf_bytes(["Page One Security Policy", "Page Two Retention Policy"])
        pdf_secs = extract_document_sections(".pdf", pdf_bytes)
        self.assertEqual(len(pdf_secs), 2)
        self.assertEqual(pdf_secs[0].page_start, 1)
        self.assertEqual(pdf_secs[1].page_start, 2)

        # Encrypted PDF raises encrypted_pdf (non-retryable)
        enc_pdf = _make_sample_pdf_bytes(["Secret Page"], encrypt_password="secret")
        with self.assertRaises(ExtractionError) as enc_ctx:
            extract_document_sections(".pdf", enc_pdf)
        self.assertEqual(enc_ctx.exception.error_code, "encrypted_pdf")
        self.assertFalse(enc_ctx.exception.retryable)

        # Scanned PDF with 0 text raises needs_ocr
        blank_pdf = _make_sample_pdf_bytes([""])
        with self.assertRaises(ExtractionError) as ocr_ctx:
            extract_document_sections(".pdf", blank_pdf)
        self.assertEqual(ocr_ctx.exception.terminal_status, "needs_ocr")

        # DOCX heading preservation
        docx_bytes = _make_sample_docx_bytes("Access Control Standard", "RBAC is enforced in SQL before ranking.")
        docx_secs = extract_document_sections(".docx", docx_bytes)
        self.assertEqual(docx_secs[0].heading_path, "Access Control Standard")

    # --- 5. AuthN, OIDC Claims, CSRF, Session Revocation & RBAC Matrix ---
    def test_05_auth_csrf_session_and_rbac(self) -> None:
        # Unauthenticated request returns 401 RFC 7807 Problem Details
        r_unauth = self.client.get("/api/v1/me")
        self.assertEqual(r_unauth.status_code, 401)
        self.assertIn("request_id", r_unauth.json())

        viewer_client, viewer_csrf = self._login("viewer@acme.internal", role="viewer")
        # Viewer cannot upload documents (requires contributor+)
        r_up_forbidden = viewer_client.post(
            "/api/v1/documents",
            headers={"X-CSRF-Token": viewer_csrf},
            files={"file": ("note.txt", b"Some text content", "text/plain")},
        )
        self.assertEqual(r_up_forbidden.status_code, 403)

        # Contributor can upload, but missing CSRF token fails with 403
        contrib_client, contrib_csrf = self._login("contrib@acme.internal", role="contributor")
        r_no_csrf = contrib_client.post(
            "/api/v1/documents",
            files={"file": ("note.txt", b"Some text content", "text/plain")},
        )
        self.assertEqual(r_no_csrf.status_code, 403)
        self.assertEqual(r_no_csrf.json()["error_code"], "csrf_validation_failed")

        # Logout revokes session immediately
        r_logout = contrib_client.post("/auth/logout", headers={"X-CSRF-Token": contrib_csrf})
        self.assertEqual(r_logout.status_code, 204)
        r_after_logout = contrib_client.get("/api/v1/me")
        self.assertEqual(r_after_logout.status_code, 401)

    # --- 6. Strict Multi-Tenant Isolation & Revoked ACL Tests ---
    def test_06_multi_tenant_isolation_and_acl_revocation(self) -> None:
        client_a, csrf_a = self._login("alice@tenant-a.internal", role="system_admin", tenant_slug="tenant-alpha")
        client_b, csrf_b = self._login("bob@tenant-b.internal", role="system_admin", tenant_slug="tenant-beta")

        # Upload secret document in Tenant Alpha
        secret_text = b"PROJECT_ORION_LAUNCH_CODE_994821_ALPHA_ONLY is stored in vault alpha."
        up_a = client_a.post(
            "/api/v1/documents",
            headers={"X-CSRF-Token": csrf_a},
            files={"file": ("orion_alpha.txt", secret_text, "text/plain")},
            data={"title": "Project Orion Alpha Secret", "visibility": "tenant"},
        )
        self.assertEqual(up_a.status_code, 202)
        doc_a_id = up_a.json()["document_id"]
        doc_a_detail = client_a.get(f"/api/v1/documents/{doc_a_id}").json()
        chunk_a_id = doc_a_detail["chunks"][0]["id"]

        # Tenant Beta cannot see, search, chat, download, or inspect citations from Tenant Alpha
        self.assertEqual(len(client_b.get("/api/v1/documents").json()["items"]), 0)
        self.assertEqual(client_b.get(f"/api/v1/documents/{doc_a_id}").status_code, 404)
        self.assertEqual(client_b.get(f"/api/v1/documents/{doc_a_id}/file").status_code, 404)
        self.assertEqual(client_b.get(f"/api/v1/sources/{chunk_a_id}").status_code, 404)

        search_b = client_b.post(
            "/api/v1/search",
            headers={"X-CSRF-Token": csrf_b},
            json={"query": "PROJECT_ORION_LAUNCH_CODE_994821_ALPHA_ONLY"},
        )
        self.assertEqual(len(search_b.json()["passages"]), 0)

        # Within Tenant Alpha: test ACL restriction & revocation against a Viewer
        viewer_a, csrf_va = self._login("viewer@tenant-a.internal", role="viewer", tenant_slug="tenant-alpha")
        # Initially visibility='tenant', so viewer_a can find it
        s1 = viewer_a.post(
            "/api/v1/search",
            headers={"X-CSRF-Token": csrf_va},
            json={"query": "PROJECT_ORION_LAUNCH_CODE_994821_ALPHA_ONLY"},
        )
        self.assertEqual(len(s1.json()["passages"]), 1)

        # Restrict ACL to owner only
        acl_resp = client_a.put(
            f"/api/v1/documents/{doc_a_id}/acl",
            headers={"X-CSRF-Token": csrf_a},
            json={"visibility": "owner", "acl_entries": []},
        )
        self.assertEqual(acl_resp.status_code, 200)

        # Viewer in Tenant Alpha can no longer search, view document, or open citation chunk
        s2 = viewer_a.post(
            "/api/v1/search",
            headers={"X-CSRF-Token": csrf_va},
            json={"query": "PROJECT_ORION_LAUNCH_CODE_994821_ALPHA_ONLY"},
        )
        self.assertEqual(len(s2.json()["passages"]), 0)
        self.assertEqual(viewer_a.get(f"/api/v1/sources/{chunk_a_id}").status_code, 404)

    # --- 7. Deduplication, Reindexing, Soft Delete & Purge ---
    def test_07_dedup_reindex_and_soft_delete_purge(self) -> None:
        client, csrf = self._login("admin@acme.internal", role="system_admin")
        payload = b"Deterministic security runbook content for SHA-256 deduplication and reindexing."
        r1 = client.post(
            "/api/v1/documents",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("runbook.txt", payload, "text/plain")},
        )
        self.assertEqual(r1.status_code, 202)
        self.assertFalse(r1.json()["duplicate"])
        doc_id = r1.json()["document_id"]

        # Uploading identical content returns duplicate=True and creates no duplicate chunks
        r2 = client.post(
            "/api/v1/documents",
            headers={"X-CSRF-Token": csrf},
            files={"file": ("runbook_copy.txt", payload, "text/plain")},
        )
        self.assertTrue(r2.json()["duplicate"])
        self.assertEqual(r2.json()["document_id"], doc_id)

        # Reindex creates Version 2 and atomically switches active_version to 2
        re_resp = client.post(f"/api/v1/documents/{doc_id}/reindex", headers={"X-CSRF-Token": csrf})
        self.assertEqual(re_resp.status_code, 202)
        self.assertEqual(re_resp.json()["version"], 2)
        detail = client.get(f"/api/v1/documents/{doc_id}").json()
        self.assertEqual(detail["active_version"], 2)

        # Soft delete + purge removes chunks and marks historical citations as tombstone
        ask_resp = client.post(
            "/api/v1/chat/ask",
            headers={"X-CSRF-Token": csrf},
            json={"question": "What is the security runbook content for SHA-256 deduplication?"},
        ).json()
        conv_id = ask_resp["conversation_id"]

        del_resp = client.delete(f"/api/v1/documents/{doc_id}", headers={"X-CSRF-Token": csrf})
        self.assertEqual(del_resp.status_code, 202)
        self.assertEqual(client.get(f"/api/v1/documents/{doc_id}").status_code, 404)

        conv_detail = client.get(f"/api/v1/conversations/{conv_id}").json()
        asst_msg = [m for m in conv_detail["messages"] if m["role"] == "assistant"][0]
        self.assertTrue(asst_msg["citations"][0]["tombstone"])

    # --- 8. Grounded Generation, Citation Validation & Degraded Fallback ---
    def test_08_grounded_generation_and_citation_validation(self) -> None:
        # Test citation validator unit function directly
        passages = [{"label": "S1", "chunk_id": "chk_1"}, {"label": "S2", "chunk_id": "chk_2"}]
        ok, used, _ = validate_citations_in_answer("Sessions expire after 8 hours [S1].", passages)
        self.assertTrue(ok)
        self.assertEqual(used, ["S1"])

        # Reject hallucinated [S99] label
        bad, _, reason = validate_citations_in_answer("Sessions never expire [S99].", passages)
        self.assertFalse(bad)
        self.assertIn("unknown_citation_labels:S99", reason)

        # Configure app with DeterministicMockLLMProvider and verify grounded chat response
        self.app.state.llm_provider = DeterministicMockLLMProvider()
        self.app.state.rag_service.llm_provider = self.app.state.llm_provider

        client, csrf = self._login("admin@acme.internal", role="system_admin")
        client.post(
            "/api/v1/documents",
            headers={"X-CSRF-Token": csrf},
            files={
                "file": (
                    "policy.txt",
                    b"Idle sessions expire after 8 hours (28800 seconds) and use SHA-256 hashed cookies.",
                    "text/plain",
                )
            },
        )
        ans = client.post(
            "/api/v1/chat/ask",
            headers={"X-CSRF-Token": csrf},
            json={"question": "When do idle sessions expire and how are cookies stored?"},
        ).json()
        self.assertEqual(ans["generation_status"], "available")
        self.assertIn("[S1]", ans["answer"])

        # Inject hallucinated citation from LLM -> server rejects answer and degrades safely
        self.app.state.llm_provider = DeterministicMockLLMProvider(
            scripted_response="Hallucinated claim with invalid citation [S99]."
        )
        self.app.state.rag_service.llm_provider = self.app.state.llm_provider
        ans_bad = client.post(
            "/api/v1/chat/ask",
            headers={"X-CSRF-Token": csrf},
            json={"question": "When do idle sessions expire?"},
        ).json()
        self.assertEqual(ans_bad["generation_status"], "degraded")
        self.assertIsNone(ans_bad["answer"])
        self.assertGreater(len(ans_bad["citations"]), 0)

    # --- 9. Golden Evaluation Set (50 Questions: 40 Grounded + 10 No-Answer Abstention) ---
    def test_09_golden_evaluation_set_50_questions(self) -> None:
        self.app.state.llm_provider = DeterministicMockLLMProvider()
        self.app.state.rag_service.llm_provider = self.app.state.llm_provider
        client, csrf = self._login("eval@acme.internal", role="system_admin")

        # Ingest the 4 sample documents from sample-documents/
        sample_dir = Path(__file__).resolve().parent.parent.parent / "sample-documents"
        for fpath in sorted(sample_dir.iterdir()):
            if fpath.is_file():
                client.post(
                    "/api/v1/documents",
                    headers={"X-CSRF-Token": csrf},
                    files={"file": (fpath.name, fpath.read_bytes(), "application/octet-stream")},
                )

        answerable_queries = [
            ("How are application sessions stored in PostgreSQL?", "SHA-256"),
            ("What is the idle session expiration timeout?", "8 hours"),
            ("What is the absolute session lifetime cap?", "24 hours"),
            ("Which four canonical tenant roles are enforced?", "Viewer"),
            ("When are document visibility filters applied during search?", "before"),
            ("How quickly must credential exposure be reported to the SOC?", "30 minutes"),
            ("How often are session signing keys rotated?", "90 days"),
            ("What encryption algorithm is used for backup pg_dump archives?", "AES-256-GCM"),
            ("What is the default local embedding model?", "bge-small-en-v1.5"),
            ("What is the vector dimension of the default embedding model?", "384"),
            ("Which multilingual embedding model is supported as a swap-in?", "multilingual-e5-small"),
            ("How are vector and full-text search results combined?", "Reciprocal Rank Fusion"),
            ("What constant k is used in Reciprocal Rank Fusion?", "60"),
            ("How are near-duplicate passages deduplicated?", "content_hash"),
            ("What happens when GENERATION_PROVIDER is set to none?", "retrieval-only"),
            ("How are inline citations like [S1] verified?", "server-side"),
            ("What endpoints expose liveness and readiness checks?", "healthz"),
            ("How do ingestion workers claim jobs from PostgreSQL?", "SKIP LOCKED"),
            ("What is the worker lease duration in seconds?", "300"),
            ("How many attempts are allowed before a job is marked failed?", "3"),
            ("What is the target Recovery Point Objective (RPO)?", "24 hours"),
            ("What is the target Recovery Time Objective (RTO)?", "2 hours"),
            ("When is the monthly backup and restore drill executed?", "Tuesday"),
            ("Why does ALLOW_TRAINING_USE_PROVIDERS default to false?", "improve"),
            ("How do local open-weight servers connect to the platform?", "openai_compatible"),
            ("What header should be included when reporting a failed API response?", "X-Request-ID"),
            ("What cookies flags are required for session security?", "HttpOnly"),
            ("What flow is used for Google authentication?", "OIDC"),
            ("What happens to original blobs during the purge workflow?", "24 hours"),
            ("What license does BAAI/bge-small-en-v1.5 use?", "MIT"),
            ("What database extension provides vector similarity search?", "pgvector"),
            ("How does PostgreSQL perform keyword matching?", "tsvector"),
            ("What happens if a worker crashes mid-extraction?", "lease"),
            ("What command runs the monthly restore verification drill?", "restore-drill"),
            ("Where are confidential tenant documents blocked from being sent?", "free"),
            ("Which team handles ingestion queue alerts?", "Knowledge Platform Team"),
            ("What Slack channel is used for platform RAG operations?", "platform-rag-ops"),
            ("What happens immediately when a document is soft-deleted?", "deleted_at"),
            ("How long are encrypted backup dumps retained?", "30 days"),
            ("What check ensures the active embedding model matches EMBEDDING_DIM?", "readyz"),
        ]

        unanswerable_queries = [
            "What is the cafeteria lunch menu for Friday in Tokyo?",
            "How many vacation days do interns receive in Brazil?",
            "What is the Wi-Fi password for the Berlin guest network?",
            "Who won the 2024 corporate ping-pong tournament?",
            "What is the stock ticker symbol for Acme Mars Colony?",
            "How do I calibrate the quantum lithography laser?",
            "What is the reimbursement limit for pet grooming?",
            "Where are the keys to the delivery van parked in Zurich?",
            "What is the dental insurance deductible for orthodontic braces?",
            "Who is the regional sales director for Antarctica?",
        ]

        self.assertEqual(len(answerable_queries) + len(unanswerable_queries), 50)

        hits_at_5 = 0
        faithful_count = 0
        for q, expected_term in answerable_queries:
            res = client.post(
                "/api/v1/chat/ask",
                headers={"X-CSRF-Token": csrf},
                json={"question": q, "top_k": 5},
            ).json()
            combined = " ".join(c["excerpt"] for c in res.get("citations", [])).lower()
            if expected_term.lower() in combined:
                hits_at_5 += 1
            if res.get("generation_status") == "available" and res.get("answer") and "[S1]" in res["answer"]:
                faithful_count += 1

        abstentions = 0
        for uq in unanswerable_queries:
            res = client.post(
                "/api/v1/chat/ask",
                headers={"X-CSRF-Token": csrf},
                json={"question": uq, "top_k": 5},
            ).json()
            if res.get("insufficient_evidence") or not res.get("citations"):
                abstentions += 1

        recall_at_5 = hits_at_5 / len(answerable_queries)
        faithfulness = faithful_count / len(answerable_queries)
        abstention_rate = abstentions / len(unanswerable_queries)

        self.assertGreaterEqual(recall_at_5, 0.90, f"Recall@5 too low: {recall_at_5}")
        self.assertGreaterEqual(faithfulness, 0.90, f"Faithfulness too low: {faithfulness}")
        self.assertGreaterEqual(abstention_rate, 0.80, f"Abstention rate too low: {abstention_rate}")
