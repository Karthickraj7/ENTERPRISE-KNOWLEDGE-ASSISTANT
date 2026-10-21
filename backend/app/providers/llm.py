"""Pluggable Generation (LLM) Providers (Section 5.4 & 5.6).

Default: DisabledLLMProvider (GENERATION_PROVIDER=none -> honest retrieval-only mode).
Optional:
- OpenAICompatibleLLMProvider (local llama.cpp / vLLM server; no Ollama dependency)
- GeminiLLMProvider
- OpenAILLMProvider
- AnthropicLLMProvider
- DeterministicMockLLMProvider (evidence-grounded generator for automated tests)
"""
import re
import time
import uuid
from typing import Any, Dict, Iterator, Optional
import httpx

from app.core.config import Settings
from app.providers.base import (
    GenerationResult,
    InvalidRequestError,
    LLMModelInfo,
    LLMProvider,
    ProviderAuthError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitedError,
)


class DisabledLLMProvider(LLMProvider):
    """Default retrieval-only provider when GENERATION_PROVIDER=none."""

    def describe(self) -> LLMModelInfo:
        return LLMModelInfo(
            id="none",
            provider="none",
            model_name="none",
            context_window=0,
            max_output=0,
            supports_stream=False,
            data_used_for_training=False,
        )

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
        timeout_s: float = 30.0,
    ) -> GenerationResult:
        raise ProviderUnavailableError("Generation is disabled (GENERATION_PROVIDER=none).")

    def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
    ) -> Iterator[str]:
        raise ProviderUnavailableError("Generation is disabled (GENERATION_PROVIDER=none).")

    def health(self) -> Dict[str, Any]:
        return {
            "status": "disabled",
            "provider": "none",
            "model_name": None,
            "mode": "retrieval_only",
            "message": "Generated answers are unavailable: no generation provider is configured.",
        }


class DeterministicMockLLMProvider(LLMProvider):
    """Deterministic evidence-grounded generator for automated tests and fault injection."""

    def __init__(
        self,
        model_name: str = "mock-grounded-v2",
        scripted_response: Optional[str] = None,
        fail_mode: Optional[str] = None,
    ) -> None:
        self.model_name = model_name
        self.scripted_response = scripted_response
        self.fail_mode = fail_mode

    def describe(self) -> LLMModelInfo:
        return LLMModelInfo(
            id=f"mock:{self.model_name}",
            provider="mock",
            model_name=self.model_name,
            context_window=8192,
            max_output=1024,
            supports_stream=True,
            data_used_for_training=False,
        )

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
        timeout_s: float = 30.0,
    ) -> GenerationResult:
        if self.fail_mode == "timeout":
            raise ProviderTimeoutError("Simulated LLM timeout")
        if self.fail_mode == "rate_limit":
            raise RateLimitedError("Simulated 429 rate limit", retry_after=1.5)
        if self.fail_mode == "unavailable":
            raise ProviderUnavailableError("Simulated 503 upstream failure")

        if self.scripted_response is not None:
            text = self.scripted_response
        else:
            # Synthesize grounded answer strictly citing the supplied [S1], [S2] evidence blocks
            blocks = re.findall(r"\[(S\d+)\]\s*Title:\s*([^\n]+)\n([^\[]+)", user_prompt)
            if not blocks:
                text = "INSUFFICIENT_EVIDENCE: The authorized documents do not contain enough evidence to answer this question."
            else:
                parts = []
                for label, title, body in blocks[:2]:
                    clean_line = " ".join(body.strip().split())
                    snippet = clean_line[:220].rstrip(".")
                    parts.append(f"According to {title}, {snippet} [{label}].")
                text = " ".join(parts)

        tokens_in = max(1, len((system_prompt + user_prompt).split()))
        tokens_out = max(1, len(text.split()))
        return GenerationResult(
            text=text,
            finish_reason="stop",
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            estimated_cost_usd=0.0,
            latency_ms=2.5,
            provider_request_id=f"mock_req_{uuid.uuid4().hex[:10]}",
        )

    def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
    ) -> Iterator[str]:
        res = self.generate(system_prompt, user_prompt, max_output_tokens, temperature)
        words = res.text.split(" ")
        for i, w in enumerate(words):
            yield w + (" " if i + 1 < len(words) else "")

    def health(self) -> Dict[str, Any]:
        return {
            "status": "healthy" if not self.fail_mode else "degraded",
            "provider": "mock",
            "model_name": self.model_name,
            "mode": "grounded_generation",
        }


class OpenAICompatibleLLMProvider(LLMProvider):
    """Adapter for local open-weight servers exposing an OpenAI-compatible /v1/chat/completions API (e.g. llama.cpp, vLLM) or OpenAI."""

    def __init__(self, settings: Settings, is_openai_cloud: bool = False) -> None:
        self.provider_name = "openai" if is_openai_cloud else "openai_compatible"
        self.base_url = (
            "https://api.openai.com/v1" if is_openai_cloud else settings.generation_base_url.rstrip("/")
        )
        self.api_key = settings.openai_api_key or "local-no-key-required"
        self.model_name = settings.generation_model
        self.timeout_s = settings.generation_timeout_s

    def describe(self) -> LLMModelInfo:
        return LLMModelInfo(
            id=f"{self.provider_name}:{self.model_name}",
            provider=self.provider_name,
            model_name=self.model_name,
            context_window=16384,
            max_output=2048,
            supports_stream=True,
            data_used_for_training=False,
        )

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
        timeout_s: float = 30.0,
    ) -> GenerationResult:
        t0 = time.perf_counter()
        url = f"{self.base_url}/chat/completions"
        try:
            with httpx.Client(timeout=timeout_s or self.timeout_s) as client:
                resp = client.post(
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model_name,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "max_tokens": max_output_tokens,
                        "temperature": temperature,
                    },
                )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(f"{self.provider_name} generation timed out") from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"{self.provider_name} connection error: {exc}") from exc

        if resp.status_code in (401, 403):
            raise ProviderAuthError(f"{self.provider_name} authentication rejected")
        if resp.status_code == 429:
            raise RateLimitedError(f"{self.provider_name} rate limited", retry_after=2.0)
        if resp.status_code >= 500:
            raise ProviderUnavailableError(f"{self.provider_name} returned {resp.status_code}")
        if resp.status_code >= 400:
            raise InvalidRequestError(f"{self.provider_name} bad request {resp.status_code}")

        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        text = choice.get("message", {}).get("content", "")
        usage = data.get("usage", {})
        tokens_in = int(usage.get("prompt_tokens", len((system_prompt + user_prompt).split())))
        tokens_out = int(usage.get("completion_tokens", len(text.split())))
        cost = 0.0 if self.provider_name == "openai_compatible" else round((tokens_in * 0.5 + tokens_out * 1.5) / 1e6, 6)
        return GenerationResult(
            text=text,
            finish_reason=choice.get("finish_reason", "stop"),
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            estimated_cost_usd=cost,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
            provider_request_id=data.get("id", f"req_{uuid.uuid4().hex[:10]}"),
        )

    def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
    ) -> Iterator[str]:
        res = self.generate(system_prompt, user_prompt, max_output_tokens, temperature)
        yield res.text

    def health(self) -> Dict[str, Any]:
        return {
            "status": "configured",
            "provider": self.provider_name,
            "model_name": self.model_name,
            "base_url": self.base_url,
            "mode": "grounded_generation",
        }


class GeminiLLMProvider(LLMProvider):
    """Optional Gemini API generation adapter (model configured via GENERATION_MODEL env var)."""

    def __init__(self, settings: Settings) -> None:
        self.api_key = settings.gemini_api_key
        self.model_name = settings.generation_model
        self.timeout_s = settings.generation_timeout_s
        self.is_free_tier = settings.gemini_tier_is_free

    def describe(self) -> LLMModelInfo:
        return LLMModelInfo(
            id=f"gemini:{self.model_name}",
            provider="gemini",
            model_name=self.model_name,
            context_window=128000,
            max_output=4096,
            supports_stream=True,
            data_used_for_training=self.is_free_tier,
        )

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
        timeout_s: float = 30.0,
    ) -> GenerationResult:
        t0 = time.perf_counter()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent"
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_output_tokens,
            },
        }
        try:
            with httpx.Client(timeout=timeout_s or self.timeout_s) as client:
                resp = client.post(url, params={"key": self.api_key}, json=payload)
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("Gemini generation timed out") from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"Gemini transport error: {exc}") from exc

        if resp.status_code in (401, 403):
            raise ProviderAuthError("Gemini API key unauthorized")
        if resp.status_code == 429:
            raise RateLimitedError("Gemini rate limit exceeded", retry_after=2.0)
        if resp.status_code >= 500:
            raise ProviderUnavailableError(f"Gemini upstream 5xx ({resp.status_code})")

        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise ProviderUnavailableError("Gemini returned no candidates")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        usage = data.get("usageMetadata", {})
        tokens_in = int(usage.get("promptTokenCount", len(user_prompt.split())))
        tokens_out = int(usage.get("candidatesTokenCount", len(text.split())))
        cost = 0.0 if self.is_free_tier else round((tokens_in * 0.75 + tokens_out * 3.75) / 1e6, 6)
        return GenerationResult(
            text=text,
            finish_reason=candidates[0].get("finishReason", "STOP"),
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            estimated_cost_usd=cost,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
            provider_request_id=f"gem_{uuid.uuid4().hex[:10]}",
        )

    def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
    ) -> Iterator[str]:
        res = self.generate(system_prompt, user_prompt, max_output_tokens, temperature)
        yield res.text

    def health(self) -> Dict[str, Any]:
        return {
            "status": "configured" if bool(self.api_key) else "unconfigured",
            "provider": "gemini",
            "model_name": self.model_name,
            "data_used_for_training": self.is_free_tier,
            "mode": "grounded_generation",
        }


class AnthropicLLMProvider(LLMProvider):
    """Optional Anthropic Messages API adapter."""

    def __init__(self, settings: Settings) -> None:
        self.api_key = settings.anthropic_api_key
        self.model_name = settings.generation_model
        self.timeout_s = settings.generation_timeout_s

    def describe(self) -> LLMModelInfo:
        return LLMModelInfo(
            id=f"anthropic:{self.model_name}",
            provider="anthropic",
            model_name=self.model_name,
            context_window=200000,
            max_output=4096,
            supports_stream=True,
            data_used_for_training=False,
        )

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
        timeout_s: float = 30.0,
    ) -> GenerationResult:
        t0 = time.perf_counter()
        try:
            with httpx.Client(timeout=timeout_s or self.timeout_s) as client:
                resp = client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    json={
                        "model": self.model_name,
                        "system": system_prompt,
                        "messages": [{"role": "user", "content": user_prompt}],
                        "max_tokens": max_output_tokens,
                        "temperature": temperature,
                    },
                )
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("Anthropic request timed out") from exc
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(f"Anthropic connection error: {exc}") from exc

        if resp.status_code in (401, 403):
            raise ProviderAuthError("Anthropic authentication failed")
        if resp.status_code == 429:
            raise RateLimitedError("Anthropic rate limit exceeded", retry_after=2.0)
        if resp.status_code >= 500:
            raise ProviderUnavailableError(f"Anthropic error {resp.status_code}")

        data = resp.json()
        blocks = data.get("content", [])
        text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        usage = data.get("usage", {})
        tokens_in = int(usage.get("input_tokens", len(user_prompt.split())))
        tokens_out = int(usage.get("output_tokens", len(text.split())))
        cost = round((tokens_in * 3.0 + tokens_out * 15.0) / 1e6, 6)
        return GenerationResult(
            text=text,
            finish_reason=data.get("stop_reason", "end_turn"),
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            estimated_cost_usd=cost,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
            provider_request_id=data.get("id", f"ant_{uuid.uuid4().hex[:10]}"),
        )

    def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
    ) -> Iterator[str]:
        res = self.generate(system_prompt, user_prompt, max_output_tokens, temperature)
        yield res.text

    def health(self) -> Dict[str, Any]:
        return {
            "status": "configured" if bool(self.api_key) else "unconfigured",
            "provider": "anthropic",
            "model_name": self.model_name,
            "mode": "grounded_generation",
        }


def build_llm_provider(settings: Settings) -> LLMProvider:
    if settings.generation_provider == "none":
        return DisabledLLMProvider()
    if settings.generation_provider == "mock":
        return DeterministicMockLLMProvider(model_name=settings.generation_model or "mock-grounded-v2")
    if settings.generation_provider == "openai_compatible":
        return OpenAICompatibleLLMProvider(settings, is_openai_cloud=False)
    if settings.generation_provider == "openai":
        return OpenAICompatibleLLMProvider(settings, is_openai_cloud=True)
    if settings.generation_provider == "gemini":
        return GeminiLLMProvider(settings)
    if settings.generation_provider == "anthropic":
        return AnthropicLLMProvider(settings)
    raise ValueError(f"Unsupported generation provider: {settings.generation_provider}")
