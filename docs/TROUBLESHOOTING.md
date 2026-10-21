# Troubleshooting Guide

| Symptom / Error Code | Root Cause | Resolution |
| :--- | :--- | :--- |
| `503 readiness_check_failed` | Active `embedding_models` row dimension does not match `EMBEDDING_DIM`. | Verify `EMBEDDING_DIM=384` matches your configured model or trigger an embedding migration via `POST /api/v1/admin/embedding-migrations`. |
| `403 csrf_validation_failed` | Mutating request (`POST`/`PUT`/`DELETE`) lacked a valid `X-CSRF-Token` header. | Fetch `/api/v1/me` to obtain the current session's `csrf_token` and pass it in `X-CSRF-Token`. |
| `415 mime_mismatch_pdf` / `zip_bomb_detected` | Uploaded file failed magic-byte sniffing or exceeded the 50x decompression ratio guard. | Upload a valid, uncorrupted PDF, DOCX, Markdown, or UTF-8 TXT file under 25 MB. |
| `needs_ocr` document status | Uploaded PDF is a scanned image with no extractable text layer. | Convert the scanned PDF using OCR before uploading (Stage 2+ OCR worker extension). |
