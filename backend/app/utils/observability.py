"""LLM call accounting is first-class so pipeline cost is visible, not guessed."""

from __future__ import annotations

import time
from dataclasses import dataclass

from app.db.models import LLMCall
from app.models import CallRecord, RunSummary

INPUT_USD_PER_MILLION = 3.0
OUTPUT_USD_PER_MILLION = 15.0


def estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return round(
        (input_tokens * INPUT_USD_PER_MILLION + output_tokens * OUTPUT_USD_PER_MILLION)
        / 1_000_000,
        6,
    )


async def record_call(record: CallRecord) -> None:
    """Keep successful and failed calls; failures affect real run cost and latency."""
    await LLMCall.create(
        run_id=record.run_id,
        stage=record.stage,
        model=record.model,
        input_tokens=record.input_tokens,
        output_tokens=record.output_tokens,
        latency_seconds=record.latency_seconds,
        estimated_cost_usd=record.estimated_cost_usd,
        success=record.success,
        error=record.error,
        created_at=record.created_at,
    )


async def summarize_run(run_id: str) -> RunSummary:
    """Derive sidebar figures from the call log instead of transient UI state.

    Model time and wall time are reported separately. Summing per-call latency was
    previously labelled wall time, which overstates it wherever calls run
    concurrently — and after the deterministic scorers were moved alongside the
    judge call, they do. The gap between the two figures is the parallelism win.
    """
    calls = await LLMCall.filter(run_id=run_id).order_by("created_at").values(
        "input_tokens", "output_tokens", "estimated_cost_usd", "latency_seconds", "success", "created_at"
    )
    if not calls:
        return RunSummary(
            run_id=run_id,
            total_calls=0,
            input_tokens=0,
            output_tokens=0,
            estimated_cost_usd=0.0,
            wall_time_seconds=0.0,
            model_time_seconds=0.0,
            failed_calls=0,
        )
    model_time = sum(call["latency_seconds"] for call in calls)
    # created_at is stamped when a call completes, so the span between the first and
    # last completion plus the first call's own duration approximates true elapsed.
    span = (calls[-1]["created_at"] - calls[0]["created_at"]).total_seconds()
    wall_time = span + calls[0]["latency_seconds"]
    return RunSummary(
        run_id=run_id,
        total_calls=len(calls),
        input_tokens=sum(call["input_tokens"] for call in calls),
        output_tokens=sum(call["output_tokens"] for call in calls),
        estimated_cost_usd=round(sum(call["estimated_cost_usd"] for call in calls), 6),
        wall_time_seconds=round(wall_time, 2),
        model_time_seconds=round(model_time, 2),
        failed_calls=sum(1 for call in calls if not call["success"]),
    )


@dataclass
class Stopwatch:
    started_at: float

    @classmethod
    def start(cls) -> "Stopwatch":
        return cls(time.perf_counter())

    @property
    def elapsed(self) -> float:
        return time.perf_counter() - self.started_at
