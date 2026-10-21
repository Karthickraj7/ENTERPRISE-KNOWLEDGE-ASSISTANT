"""Provider interface contracts and normalized error classes (Section 5.4)."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, Iterator, List, Optional


class ProviderError(Exception):
    """Base class for normalized provider errors."""
    retryable: bool = False


class ProviderUnavailableError(ProviderError):
    retryable = True


class RateLimitedError(ProviderError):
    retryable = True

    def __init__(self, message: str = "Rate limit exceeded", retry_after: float = 1.0) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class ProviderTimeoutError(ProviderError):
    retryable = True


class ProviderAuthError(ProviderError):
    retryable = False


class InvalidRequestError(ProviderError):
    retryable = False


class ContentRejectedError(ProviderError):
    retryable = False


class QuotaExhaustedError(ProviderError):
    retryable = False


@dataclass
class EmbeddingModelInfo:
    id: str
    provider: str
    model_name: str
    dim: int
    max_input_tokens: int
    normalize: bool
    query_prefix: str
    document_prefix: str
    revision: str = "main"


@dataclass
class EmbeddingBatchResult:
    vectors: List[List[float]]
    tokens_used: int
    latency_ms: float


@dataclass
class LLMModelInfo:
    id: str
    provider: str
    model_name: str
    context_window: int
    max_output: int
    supports_stream: bool
    data_used_for_training: bool


@dataclass
class GenerationResult:
    text: str
    finish_reason: str
    tokens_in: int
    tokens_out: int
    estimated_cost_usd: float
    latency_ms: float
    provider_request_id: str


class EmbeddingProvider(ABC):
    @abstractmethod
    def describe(self) -> EmbeddingModelInfo:
        raise NotImplementedError

    @abstractmethod
    def embed_documents(self, texts: List[str]) -> EmbeddingBatchResult:
        raise NotImplementedError

    @abstractmethod
    def embed_query(self, text: str) -> EmbeddingBatchResult:
        raise NotImplementedError

    @abstractmethod
    def health(self) -> Dict[str, Any]:
        raise NotImplementedError


class LLMProvider(ABC):
    @abstractmethod
    def describe(self) -> LLMModelInfo:
        raise NotImplementedError

    @abstractmethod
    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
        timeout_s: float = 30.0,
    ) -> GenerationResult:
        raise NotImplementedError

    @abstractmethod
    def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        max_output_tokens: int = 768,
        temperature: float = 0.0,
    ) -> Iterator[str]:
        raise NotImplementedError

    @abstractmethod
    def health(self) -> Dict[str, Any]:
        raise NotImplementedError
