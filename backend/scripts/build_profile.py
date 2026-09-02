#!/usr/bin/env python3
"""Build or explicitly rebuild the cached reference style profile."""

from __future__ import annotations

import argparse
import asyncio
import uuid

from app.agents.analysis import build_style_profile
from app.ingest import load_references
from app.utils.llm import LLMClient
from app.utils.observability import summarize_run
from app.store import close_database, initialise_database, list_references


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company", required=True, help="Project the documents belong to.")
    parser.add_argument("--force", action="store_true", help="Ignore a cached profile.")
    args = parser.parse_args()
    await initialise_database()
    try:
        records = await list_references(args.company)
        if not records:
            raise SystemExit(
                f"No reference documents stored for {args.company}. "
                "Upload them on the Ingest page or run scripts.seed_references."
            )
        articles = await load_references(records)
        run_id = f"profile-{uuid.uuid4()}"
        profile = await build_style_profile(
            articles,
            LLMClient(run_id),
            force=args.force,
            source_keys=[record.key for record in records],
        )
        print(f"Wrote {profile.company} profile from {profile.source_article_count} articles.")
        summary = await summarize_run(run_id)
        print(f"LLM calls: {summary.total_calls}; tokens: {summary.input_tokens + summary.output_tokens}; estimated cost: ${summary.estimated_cost_usd:.4f}")
    finally:
        await close_database()


if __name__ == "__main__":
    asyncio.run(main())
