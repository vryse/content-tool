"""Small async wrapper around Firecrawl's crawl API, with no browser key leakage."""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class FirecrawlError(RuntimeError):
    pass


@dataclass(frozen=True)
class CrawlPage:
    markdown: str
    title: str
    source_url: str


class FirecrawlClient:
    base_url = "https://api.firecrawl.dev/v2"

    def __init__(self) -> None:
        self.key = os.getenv("FIRECRAWL_API_KEY", "").strip()
        if not self.key:
            raise FirecrawlError("Set FIRECRAWL_API_KEY on the backend before starting a crawl.")

    def _request(self, url: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(url, data=data, method=method, headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=45) as response:  # nosec B310 - fixed Firecrawl API / API-provided continuation
                return json.loads(response.read().decode())
        except HTTPError as error:
            detail = error.read().decode(errors="replace")[:500]
            raise FirecrawlError(f"Firecrawl returned {error.code}: {detail}") from error
        except URLError as error:
            raise FirecrawlError(f"Could not reach Firecrawl: {error.reason}") from error

    async def start(self, url: str, include_path: str | None, limit: int) -> str:
        payload: dict[str, Any] = {
            "url": url,
            "limit": limit,
            "ignoreQueryParameters": True,
            "crawlEntireDomain": include_path is None,
            "allowExternalLinks": False,
            "scrapeOptions": {"formats": ["markdown"], "onlyMainContent": True},
        }
        if include_path:
            payload["includePaths"] = [include_path]
        response = await asyncio.to_thread(self._request, f"{self.base_url}/crawl", "POST", payload)
        job_id = response.get("id")
        if not isinstance(job_id, str) or not job_id:
            raise FirecrawlError("Firecrawl did not return a crawl job id.")
        return job_id

    async def status(self, job_id: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._request, f"{self.base_url}/crawl/{job_id}")

    async def collect_pages(self, response: dict[str, Any]) -> list[CrawlPage]:
        """Follow Firecrawl's continuation URL when a completed crawl exceeds 10MB."""
        pages = self.pages(response)
        next_url = response.get("next")
        while isinstance(next_url, str) and next_url:
            if not next_url.startswith(self.base_url):
                raise FirecrawlError("Firecrawl returned an unexpected crawl continuation URL.")
            response = await asyncio.to_thread(self._request, next_url)
            pages.extend(self.pages(response))
            next_url = response.get("next")
        return pages

    @staticmethod
    def pages(response: dict[str, Any]) -> list[CrawlPage]:
        pages: list[CrawlPage] = []
        for item in response.get("data", []):
            if not isinstance(item, dict) or not isinstance(item.get("markdown"), str):
                continue
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            pages.append(CrawlPage(item["markdown"], str(metadata.get("title") or "Untitled page"), str(metadata.get("sourceURL") or metadata.get("url") or "")))
        return pages
