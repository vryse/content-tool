"""Live pipeline progress, streamed to the browser as newline-delimited JSON.

A generation run makes eight sequential model calls and takes over two minutes, so
a request that only returns at the end looks indistinguishable from a hang. The bus
lets each stage announce itself while the run continues.

NDJSON over a streaming POST rather than SSE: EventSource cannot send a request
body, so SSE would force a job-registry plus a second GET endpoint, with its own
lifecycle and cleanup, to carry the article requirements. Streaming the POST
response keeps it to one request and no server-side job state.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, AsyncIterator

# Stage wording lives with the backend because the backend is the only place that
# knows what a stage key means. The UI renders whatever label it is handed.
STAGE_LABELS: dict[str, str] = {
    "load_profile": "Loading style profile",
    "parse_references": "Parsing reference articles",
    "embed_retrieve": "Selecting closest references",
    "style_observation": "Reading reference articles",
    "style_synthesis": "Synthesising the style profile",
    "generation_plan": "Planning article structure",
    "generation_write_section": "Writing section",
    "generation_self_critique": "Critiquing the draft",
    "generation_apply_critique": "Applying critique edits",
    "score_deterministic": "Scoring structure and readability",
    "evaluation_judge": "Independent judge scoring",
    "feedback_transform": "Structuring your feedback",
    "feedback_targeted_revision": "Revising targeted section",
    "persist": "Saving run",
}

SENTINEL = object()


class ProgressBus:
    """Fan pipeline events out to one streaming HTTP response."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[Any] = asyncio.Queue()
        self._started_at = time.perf_counter()
        self._calls = 0
        self._input_tokens = 0
        self._output_tokens = 0
        self._cost = 0.0

    @property
    def elapsed(self) -> float:
        return round(time.perf_counter() - self._started_at, 2)

    def _put(self, payload: dict[str, Any]) -> None:
        self._queue.put_nowait(payload)

    def stage(
        self,
        key: str,
        status: str = "running",
        *,
        detail: str | None = None,
        index: int | None = None,
        total: int | None = None,
        markdown: str | None = None,
    ) -> None:
        """Announce a pipeline step. `detail` refines the generic label, e.g. a heading."""
        label = STAGE_LABELS.get(key, key.replace("_", " ").capitalize())
        if index is not None and total is not None:
            label = f"{label} {index}/{total}"
        if detail:
            label = f"{label}: {detail}"
        self._put(
            {
                "type": "stage",
                "key": key,
                "label": label,
                "status": status,
                "index": index,
                "total": total,
                "elapsed_s": self.elapsed,
                # Carried on completion so the article can fill in section by section
                # instead of appearing all at once at the end.
                **({"markdown": markdown} if markdown is not None else {}),
            }
        )

    def cost(self, input_tokens: int, output_tokens: int, cost_usd: float) -> None:
        """Accumulate spend so the UI can show a live running total."""
        self._calls += 1
        self._input_tokens += input_tokens
        self._output_tokens += output_tokens
        self._cost = round(self._cost + cost_usd, 6)
        self._put(
            {
                "type": "cost",
                "calls": self._calls,
                "input_tokens": self._input_tokens,
                "output_tokens": self._output_tokens,
                "cost_usd": self._cost,
                "elapsed_s": self.elapsed,
            }
        )

    def result(self, payload: Any) -> None:
        self._put({"type": "result", "elapsed_s": self.elapsed, "run": payload})
        self.close()

    def fail(self, stage: str, detail: str) -> None:
        self._put({"type": "error", "stage": stage, "detail": detail, "elapsed_s": self.elapsed})
        self.close()

    def close(self) -> None:
        self._queue.put_nowait(SENTINEL)

    async def stream(self) -> AsyncIterator[str]:
        """Yield one JSON object per line until the producing task signals completion."""
        while True:
            item = await self._queue.get()
            if item is SENTINEL:
                return
            yield json.dumps(item, default=str) + "\n"


class NullBus(ProgressBus):
    """No-op bus so non-streaming callers need no conditional branches."""

    def _put(self, payload: dict[str, Any]) -> None:  # noqa: D102
        return
