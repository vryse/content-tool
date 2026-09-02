"""Cloudflare R2 object storage for reference documents.

R2 speaks the S3 API, so boto3 is the client. boto3 is synchronous, and every
call here is made from an async request handler, so each one is pushed onto a
worker thread rather than blocking the event loop for the duration of a
multi-megabyte upload.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.utils.config import R2_PREFIX, REFERENCE_CACHE_DIR, ensure_directories, r2_config

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DOC_CONTENT_TYPE = "application/msword"
MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8"
_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


class StorageError(RuntimeError):
    """Raised for object-storage failures the caller is expected to surface."""


@dataclass(frozen=True)
class StoredObject:
    key: str
    size_bytes: int
    content_hash: str


@lru_cache(maxsize=1)
def _client() -> tuple[Any, str]:
    """Build the S3 client once; it is thread-safe and pools its connections."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError as error:  # pragma: no cover - setup failure path
        raise StorageError("Run `uv sync` in the backend directory to install boto3.") from error
    settings = r2_config()
    client = boto3.client(
        "s3",
        endpoint_url=settings["endpoint_url"],
        aws_access_key_id=settings["aws_access_key_id"],
        aws_secret_access_key=settings["aws_secret_access_key"],
        # R2 ignores regions but botocore insists on one being present.
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
    )
    return client, settings["bucket"]


def object_key(company: str, filename: str) -> str:
    """Namespace objects per company and strip anything path-like from the name.

    The filename reaches this function from a browser upload, so it is untrusted:
    a name such as ``../../secrets.docx`` must not be able to address an object
    outside the configured prefix.
    """
    safe_company = _UNSAFE.sub("-", company.casefold().strip()).strip("-") or "unknown"
    safe_name = _UNSAFE.sub("_", Path(filename).name).strip("._") or "document.docx"
    return f"{R2_PREFIX}{safe_company}/{safe_name}"


def _run(call, *args, **kwargs):
    try:
        return call(*args, **kwargs)
    except Exception as error:  # botocore raises a wide family of client errors
        raise StorageError(f"Cloudflare R2 request failed: {error}") from error


async def put_object(key: str, data: bytes, content_type: str = DOCX_CONTENT_TYPE) -> StoredObject:
    """Upload an object, overwriting any existing one at the same key."""
    client, bucket = _client()
    await asyncio.to_thread(
        _run, client.put_object, Bucket=bucket, Key=key, Body=data, ContentType=content_type
    )
    return StoredObject(key=key, size_bytes=len(data), content_hash=hashlib.sha256(data).hexdigest())


async def get_object(key: str) -> bytes:
    client, bucket = _client()
    response = await asyncio.to_thread(_run, client.get_object, Bucket=bucket, Key=key)
    return await asyncio.to_thread(response["Body"].read)


async def delete_object(key: str) -> None:
    client, bucket = _client()
    await asyncio.to_thread(_run, client.delete_object, Bucket=bucket, Key=key)


async def list_objects(prefix: str = R2_PREFIX) -> list[StoredObject]:
    """List the bucket itself, which is the source of truth for what exists."""
    client, bucket = _client()

    def collect() -> list[StoredObject]:
        found: list[StoredObject] = []
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                # ETag is an md5 for single-part uploads; the sha256 we record at
                # upload time lives in Postgres, so this listing reports size only.
                found.append(StoredObject(key=item["Key"], size_bytes=item["Size"], content_hash=""))
        return found

    return await asyncio.to_thread(_run, collect)


async def cached_copy(key: str, content_hash: str) -> Path:
    """Return a local path holding the object's bytes, downloading only on a miss.

    Style profiling reparses the whole corpus on every build, and generation
    reparses it per run. Re-downloading unchanged documents each time would make
    R2 latency proportional to corpus size for no benefit, so the hash recorded
    at upload time doubles as the cache key: new bytes mean a new filename.
    """
    ensure_directories()
    suffix = Path(key).suffix or ".docx"
    path = REFERENCE_CACHE_DIR / f"{content_hash[:32]}{suffix}"
    if path.exists() and path.stat().st_size > 0:
        return path
    data = await get_object(key)
    # Write via a temporary sibling so a failed download cannot leave a
    # truncated file that later runs would treat as a valid cache hit.
    scratch = path.with_suffix(f"{suffix}.partial")
    await asyncio.to_thread(scratch.write_bytes, data)
    await asyncio.to_thread(scratch.replace, path)
    return path


async def store_cached(key: str, content_hash: str, data: bytes) -> Path:
    """Seed the local cache with bytes already in hand.

    An upload has the document in memory and still needs it on disk to parse it
    for metadata. Writing the cache entry directly avoids a pointless
    upload-then-download round trip against R2.
    """
    ensure_directories()
    suffix = Path(key).suffix or ".docx"
    path = REFERENCE_CACHE_DIR / f"{content_hash[:32]}{suffix}"
    if not (path.exists() and path.stat().st_size == len(data)):
        await asyncio.to_thread(path.write_bytes, data)
    return path


async def forget_cached(key: str, content_hash: str) -> None:
    """Drop a cached copy once its object is gone, so the disk does not grow forever."""
    suffix = Path(key).suffix or ".docx"
    path = REFERENCE_CACHE_DIR / f"{content_hash[:32]}{suffix}"
    await asyncio.to_thread(path.unlink, True)
