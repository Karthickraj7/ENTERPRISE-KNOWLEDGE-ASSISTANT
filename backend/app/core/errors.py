import uuid
from typing import Optional
from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Safe application exception mapped to RFC 7807 Problem Details without leaking stack traces."""

    def __init__(
        self,
        status_code: int,
        error_code: str,
        title: str,
        detail: str,
        headers: Optional[dict] = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.error_code = error_code
        self.title = title
        self.detail = detail
        self.headers = headers or {}


def get_request_id(request: Request) -> str:
    req_id = getattr(request.state, "request_id", None)
    if not req_id:
        req_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:16]}"
        request.state.request_id = req_id
    return req_id


def problem_response(
    request: Request,
    status_code: int,
    error_code: str,
    title: str,
    detail: str,
    headers: Optional[dict] = None,
) -> JSONResponse:
    req_id = get_request_id(request)
    body = {
        "type": f"https://eka.internal/errors/{error_code}",
        "title": title,
        "status": status_code,
        "detail": detail,
        "instance": str(request.url.path),
        "request_id": req_id,
        "error_code": error_code,
    }
    resp_headers = {"X-Request-ID": req_id}
    if headers:
        resp_headers.update(headers)
    return JSONResponse(status_code=status_code, content=body, headers=resp_headers)
