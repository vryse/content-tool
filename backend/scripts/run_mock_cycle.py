"""Run one complete local demo cycle against the configured services."""

from __future__ import annotations

import argparse
import asyncio
import uuid

from app.utils.config import ensure_directories
from app.agents.quality import evaluate_draft
from app.feedback import process_feedback
from app.agents.generation import generate_article, revise_targeted_sections
from app.ingest import load_references
from app.utils.llm import LLMClient
from app.models import ArticleRequirements, GenerationRun
from app.utils.observability import summarize_run
from app.utils.retrieve import build_reference_index, retrieve
from app.store import (
    close_database,
    initialise_database,
    learned_preferences,
    list_references,
    load_profile,
    save_run,
)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    # Named rather than fixed: the demo persists two runs and a feedback record, and
    # with several projects in one database it must be explicit about whose history
    # it is writing into.
    parser.add_argument(
        "--company",
        default="Protecto AI",
        help="Project whose profile and corpus the demo cycle runs against.",
    )
    args = parser.parse_args()
    ensure_directories()
    await initialise_database()
    try:
        company = args.company
        profile = await load_profile(company)
        if profile is None:
            raise RuntimeError(
                f"No profile for {company}. Build one with "
                f'scripts.build_profile --company "{company}".'
            )
        articles = await load_references(await list_references(company))
        index = build_reference_index(articles)
        requirements = ArticleRequirements(
            company=company,
            topic="Reducing PII exposure in AI support copilots",
            target_audience="Security and privacy leaders",
            target_word_count=420,
            key_points=[
                "Map PII before it reaches the model",
                "Tokenise sensitive identifiers at the application boundary",
                "Keep the re-identification path under policy control",
            ],
            required_sections=["Map the exposure", "Build the control plane"],
            notes="Approved scenario: an address change request contains a name, phone number, and account number.",
        )
        run_id = str(uuid.uuid4())
        client = LLMClient(run_id)
        plan, article, _ = await generate_article(
            requirements,
            profile,
            retrieve(requirements.topic, index, company=company),
            client,
            await learned_preferences(company),
        )
        evaluation = await evaluate_draft(article, requirements, profile, client, index)
        run = GenerationRun(run_id=run_id, requirements=requirements, plan=plan, article=article, evaluation=evaluation)
        await save_run(run)
        instructions = await process_feedback(
            run_id,
            company,
            "The intro is too generic. Open with the address-change scenario and make re-identification approval concrete.",
            4,
            article,
            evaluation,
            LLMClient(f"feedback-{run_id}"),
        )
        revision_run_id = f"{run_id}-revision"
        revision_client = LLMClient(revision_run_id)
        revised = await revise_targeted_sections(article, requirements, profile, instructions, revision_client)
        revised_evaluation = await evaluate_draft(revised, requirements, profile, revision_client, index)
        revised_run = GenerationRun(
            run_id=revision_run_id,
            parent_run_id=run_id,
            requirements=requirements,
            plan=plan,
            article=revised,
            evaluation=revised_evaluation,
        )
        await save_run(revised_run)
        summary = await summarize_run(revised_run.run_id)
        print(f"initial_run={run.run_id} score={evaluation.overall_score:.2f}")
        print(f"revision_run={revised_run.run_id} score={revised_evaluation.overall_score:.2f} delta={revised_evaluation.overall_score - evaluation.overall_score:+.2f}")
        print(f"instructions={len(instructions)} calls={summary.total_calls} tokens={summary.input_tokens + summary.output_tokens} cost=${summary.estimated_cost_usd:.4f}")
        for item in instructions:
            print(f"- [{item.source}] {item.target}: {item.instruction}")
    finally:
        await close_database()


if __name__ == "__main__":
    asyncio.run(main())
