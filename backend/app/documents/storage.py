"""Object Storage Abstraction (Local Filesystem & S3-Compatible Adapter) (Section 3 & 6.1)."""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
import uuid


class StorageBackend(ABC):
    @abstractmethod
    def put(self, tenant_id: str, extension: str, data: bytes, quarantine: bool = False) -> str:
        raise NotImplementedError

    @abstractmethod
    def get(self, storage_key: str) -> bytes:
        raise NotImplementedError

    @abstractmethod
    def delete(self, storage_key: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def health(self) -> bool:
        raise NotImplementedError


class LocalFilesystemStorage(StorageBackend):
    """Private local storage backend for development and single-node deployments."""

    def __init__(self, base_dir: str) -> None:
        self.base_path = Path(base_dir).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve_safe(self, storage_key: str) -> Path:
        clean_key = storage_key.lstrip("/").replace("..", "")
        target = (self.base_path / clean_key).resolve()
        if not str(target).startswith(str(self.base_path)):
            raise ValueError("Invalid storage key path traversal attempt")
        return target

    def put(self, tenant_id: str, extension: str, data: bytes, quarantine: bool = False) -> str:
        prefix = "quarantine" if quarantine else "originals"
        ext_clean = extension.lower().lstrip(".")
        key = f"{prefix}/{tenant_id}/{uuid.uuid4().hex}.{ext_clean}"
        target = self._resolve_safe(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return key

    def get(self, storage_key: str) -> bytes:
        target = self._resolve_safe(storage_key)
        if not target.exists():
            raise FileNotFoundError(f"Storage object not found: {storage_key}")
        return target.read_bytes()

    def delete(self, storage_key: str) -> None:
        target = self._resolve_safe(storage_key)
        if target.exists():
            target.unlink()

    def health(self) -> bool:
        return self.base_path.exists() and self.base_path.is_dir()


class S3CompatibleStorage(StorageBackend):
    """S3-compatible private bucket adapter (Cloudflare R2, AWS S3, MinIO, Backblaze B2)."""

    def __init__(
        self,
        bucket: str,
        endpoint_url: Optional[str] = None,
        region: str = "us-east-1",
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
    ) -> None:
        self.bucket = bucket
        self.endpoint_url = endpoint_url
        self.region = region
        self.access_key = access_key
        self.secret_key = secret_key

    def _client(self):
        import boto3  # type: ignore

        return boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            region_name=self.region,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
        )

    def put(self, tenant_id: str, extension: str, data: bytes, quarantine: bool = False) -> str:
        prefix = "quarantine" if quarantine else "originals"
        ext_clean = extension.lower().lstrip(".")
        key = f"{prefix}/{tenant_id}/{uuid.uuid4().hex}.{ext_clean}"
        self._client().put_object(Bucket=self.bucket, Key=key, Body=data)
        return key

    def get(self, storage_key: str) -> bytes:
        resp = self._client().get_object(Bucket=self.bucket, Key=storage_key)
        return resp["Body"].read()

    def delete(self, storage_key: str) -> None:
        self._client().delete_object(Bucket=self.bucket, Key=storage_key)

    def health(self) -> bool:
        return bool(self.bucket)
