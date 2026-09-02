"""Transform feedback into constrained, persistent, section-local revision work."""

from __future__ import annotations

import json

from app.utils.llm import LLMClient
from app.models import (
    DraftArticle,
    EvaluationResult,
    RevisionInstruction,
    RevisionInstructions,
)
from app.store import remember_preferences, save_feedback

FEEDBACK_TRANSFORM_PROMPT = """Convert human editorial feedback into precise RevisionInstruction items.
Use only the valid targets listed below, __intro__ for a first-section opening, or __global__ for a genuine whole-article concern. Make each instruction imperative, specific, and minimal. Do not create instructions for praise. Priorities are 1 (most important) through 5.

VALID TARGETS:
{targets}

HUMAN FEEDBACK:
{feedback}
"""


async def transform_human_feedback(
    feedback: str, draft: DraftArticle, llm: LLMClient
) -> list[RevisionInstruction]:
    """Do not leak unstructured feedback into writer prompts; make it reviewable first."""
    targets = ["__intro__", "__global__", *[section.heading for section in draft.sections]]
    result = await llm.structured(
        "feedback_transform",
        FEEDBACK_TRANSFORM_PROMPT.format(targets=json.dumps(targets), feedback=feedback),
        RevisionInstructions,
    )
    valid = {target.casefold() for target in targets}
    return [
        instruction.model_copy(update={"source": "human"})
        for instruction in result.instructions
        if instruction.target.casefold() in valid
    ]


def _normalise(text: str) -> str:
    return " ".join(text.casefold().split())


def locate_in_draft(text: str, draft: DraftArticle) -> str | None:
    """Find which section a piece of evaluator feedback is about, if any.

    Two signals, cheapest first: the evaluator quotes generic passages verbatim, so
    a quote can be matched against section bodies; and its prose weaknesses usually
    name the section, so a heading mentioned in the text localises it. Returning a
    concrete heading is what lets the revision stay section-local instead of
    fanning out across the whole article.
    """
    haystack = _normalise(text)
    for section in draft.sections:
        heading = _normalise(section.heading)
        if heading and heading in haystack:
            return section.heading
    for section in draft.sections:
        body = _normalise(section.markdown)
        # A quoted passage is only evidence if it is long enough to be distinctive.
        if len(haystack) >= 25 and haystack in body:
            return section.heading
    return None


def derive_evaluator_instructions(
    evaluation: EvaluationResult, draft: DraftArticle | None = None
) -> list[RevisionInstruction]:
    """Turn diagnostic output into conservative secondary edits, never overriding humans."""
    derived: list[RevisionInstruction] = []

    def target_for(text: str) -> str:
        return (locate_in_draft(text, draft) if draft else None) or "__global__"

    # A missing section is genuinely article-wide: there is no section to point at.
    for missing in evaluation.missing_requirements:
        derived.append(
            RevisionInstruction(
                target="__global__",
                change_type="add",
                instruction=f"Add a clearly headed section covering {missing}.",
                source="evaluator",
                priority=3,
            )
        )
    for weakness in evaluation.weaknesses:
        derived.append(
            RevisionInstruction(
                target=target_for(weakness),
                change_type="rewrite",
                instruction=f"Address this evaluated weakness: {weakness}",
                source="evaluator",
                priority=4,
            )
        )
    # Quoted generic passages are the strongest localisation signal available, so
    # they become their own instructions rather than being left as commentary.
    for passage in evaluation.generic_sounding_passages:
        located = locate_in_draft(passage, draft) if draft else None
        if located:
            derived.append(
                RevisionInstruction(
                    target=located,
                    change_type="rewrite",
                    instruction=(
                        "Replace this generic passage with something concrete and "
                        f"specific: “{passage.strip()}”"
                    ),
                    source="evaluator",
                    priority=3,
                )
            )
    for recommendation in evaluation.recommendations:
        derived.append(
            RevisionInstruction(
                target=target_for(recommendation),
                change_type="tone",
                instruction=recommendation,
                source="evaluator",
                priority=5,
            )
        )
    return derived


def merge_instructions(*groups: list[RevisionInstruction]) -> list[RevisionInstruction]:
    """Deduplicate semantically identical commands while giving human input first claim."""
    unique: dict[tuple[str, str, str], RevisionInstruction] = {}
    for instruction in [item for group in groups for item in group]:
        key = (
            instruction.target.casefold(),
            instruction.change_type,
            " ".join(instruction.instruction.casefold().split()),
        )
        current = unique.get(key)
        if current is None or (
            instruction.source == "human" and current.source != "human"
        ) or instruction.priority < current.priority:
            unique[key] = instruction
    return sorted(
        unique.values(),
        key=lambda item: (0 if item.source == "human" else 1, item.priority, item.target.casefold()),
    )


async def process_feedback(
    run_id: str,
    company: str,
    raw_feedback: str,
    rating: int | None,
    draft: DraftArticle,
    evaluation: EvaluationResult,
    llm: LLMClient,
) -> list[RevisionInstruction]:
    """Persist both raw and accepted structured signals before a revision can begin."""
    human = await transform_human_feedback(raw_feedback, draft, llm)
    instructions = merge_instructions(human, derive_evaluator_instructions(evaluation, draft))
    await save_feedback(run_id, raw_feedback, rating, instructions)
    await remember_preferences(company, instructions)
    return instructions
