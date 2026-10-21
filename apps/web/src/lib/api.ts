export interface ApiErrorPayload {
  type?: string;
  title: string;
  status: number;
  detail: string;
  request_id: string;
  error_code: string;
}

export class ApiClientError extends Error {
  status: number;
  errorCode: string;
  requestId: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.detail || payload.title);
    this.status = payload.status;
    this.errorCode = payload.error_code || "unknown_error";
    this.requestId = payload.request_id || "req_unknown";
  }
}

let inMemoryCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return inMemoryCsrfToken;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && !headers.has("Content-Type") && method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && inMemoryCsrfToken) {
    headers.set("X-CSRF-Token", inMemoryCsrfToken);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include"
  });

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiClientError({
      title: data.title || "Request Failed",
      status: response.status,
      detail: data.detail || `HTTP ${response.status} error`,
      request_id: data.request_id || response.headers.get("X-Request-ID") || "req_unknown",
      error_code: data.error_code || "http_error"
    });
  }

  if (data && typeof data.csrf_token === "string") {
    inMemoryCsrfToken = data.csrf_token;
  }
  return data as T;
}
