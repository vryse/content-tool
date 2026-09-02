"""Constrained multi-stage article generation; prompts are inspectable module constants."""

from __future__ import annotations

import json

from app.utils.llm import LLMClient
from app.utils.progress import NullBus, ProgressBus
from app.models import (
    ArticlePlan,
    ArticleRequirements,
    Critique,
    DraftArticle,
    ReferenceSkeleton,
    RevisionInstruction,
    RevisedSection,
    StyleProfile,
    WrittenSection,
)

PLANNER_PROMPT = """Create an article plan from the requirements, reference style structure, and retrieved structural skeletons.
The plan must cover every key point and required section. Keep the section count and total planned words inside the profile range when possible. If the requested length conflicts with the profile, preserve the requested length and state the conflict in constraint_notes. Do not copy source prose.

REQUIREMENTS:
{requirements}

STRUCTURE PROFILE:
{structure}

RETRIEVED SKELETONS (not source bodies):
{skeletons}
"""

WRITER_PROMPT = """Write exactly one Markdown article section. Use the provided voice profile, observed vocabulary, and plan. Produce body prose only: do not repeat the heading, add meta-commentary, cite the prompt, or invent sourcing. Use any claimed statistic only if it was explicitly supplied in requirements.notes.

When include_table is true, include one concise GitHub-flavoured Markdown table only where it makes a comparison clearer. When include_flowchart is true, include one valid Mermaid flowchart only where it clarifies a process, using a fenced ```mermaid block with `flowchart TD` and short, factual node labels. Never use either visual as filler, and never put a Mermaid block inside a table.

FULL PLAN:
{plan}

CURRENT SECTION:
{section}

VOICE PROFILE:
{voice}

PREFERRED VOCABULARY:
{vocabulary}

LEARNED PREFERENCES:
{preferences}

PREVIOUS SECTION'S FINAL PARAGRAPH:
{previous_paragraph}
"""

SELF_CRITIQUE_PROMPT = """Audit this draft against the supplied style profile and requirements. Identify concrete, high-value edits only. Do not praise generic adequacy; every edit must name a specific improvement.

REQUIREMENTS:
{requirements}

STYLE PROFILE:
{profile}

DRAFT:
{draft}
"""

CRITIQUE_APPLY_PROMPT = """Revise this complete draft using the critique while preserving its intent, title, and plan. Return a complete DraftArticle. Remove placeholders, meta-commentary, and unsupported facts. Do not add sections not in the plan.

PLAN:
{plan}

CRITIQUE:
{critique}

DRAFT:
{draft}
"""

TARGETED_REVISION_PROMPT = """Rewrite only the target article section in response to the supplied revision instructions. Return body Markdown only, without the heading. Preserve factual claims unless an instruction explicitly changes them. The caller will leave all other sections byte-identical.

ARTICLE REQUIREMENTS:
{requirements}

STYLE PROFILE:
{profile}

TARGET SECTION:
{section}

CURRENT SECTION BODY:
{current_markdown}

APPLICABLE INSTRUCTIONS:
{instructions}

PREVIOUS SECTION'S FINAL PARAGRAPH:
{previous_paragraph}
"""


def _json(value: object) -> str:
    return json.dumps(value, default=lambda item: item.model_dump(mode="json"), indent=2)


def _profile_range(profile: StyleProfile) -> tuple[int, int]:
    return profile.structure.typical_section_count


async def plan_article(
    requirements: ArticleRequirements,
    profile: StyleProfile,
    skeletons: list[ReferenceSkeleton],
    llm: LLMClient,
    bus: ProgressBus | None = None,
) -> ArticlePlan:
    """Plan before prose so structure is an explicit, evaluable intermediate artifact."""
    bus = bus or NullBus()
    bus.stage("generation_plan")
    plan = await llm.structured(
        "generation_plan",
        PLANNER_PROMPT.format(
            requirements=_json(requirements),
            structure=_json(profile.structure),
            skeletons=_json(skeletons),
        ),
        ArticlePlan,
    )
    if not plan.sections:
        raise ValueError("Planner returned no sections.")
    # A section count outside the observed range is a reportable conflict, not a
    # failure: the user's brief outranks the corpus, and a narrow corpus (a profile
    # range of 4-4, say) would otherwise make every request a 500.
    minimum, maximum = _profile_range(profile)
    if not (minimum <= len(plan.sections) <= maximum):
        conflict = (
            f"Plan uses {len(plan.sections)} sections; reference articles use "
            f"{minimum}-{maximum}. The requested brief was preserved."
        )
        plan = plan.model_copy(update={"constraint_notes": [*plan.constraint_notes, conflict]})
        bus.stage("generation_plan", "done", detail=conflict)
    else:
        bus.stage("generation_plan", "done")
    return plan


def _last_paragraph(markdown: str) -> str:
    paragraphs = [part.strip() for part in markdown.split("\n\n") if part.strip()]
    return paragraphs[-1] if paragraphs else ""


async def write_article(
    plan: ArticlePlan,
    requirements: ArticleRequirements,
    profile: StyleProfile,
    llm: LLMClient,
    preferences: list[RevisionInstruction] | None = None,
    bus: ProgressBus | None = None,
) -> DraftArticle:
    """Generate section by section to make continuity controlled and later edits local.

    Deliberately sequential: each section receives the previous section's final
    paragraph, and that continuity is what holds the voice together across the
    article. Parallelising would need a seam-repair pass that costs back the saving.
    """
    bus = bus or NullBus()
    preferences = preferences or []
    sections: list[WrittenSection] = []
    previous_paragraph = ""
    total = len(plan.sections)
    for position, planned in enumerate(plan.sections, start=1):
        bus.stage(
            "generation_write_section",
            detail=planned.heading,
            index=position,
            total=total,
        )
        result = await llm.structured(
            "generation_write_section",
            WRITER_PROMPT.format(
                plan=_json(plan),
                section=_json(planned),
                voice=_json(profile.voice),
                vocabulary=_json(profile.vocabulary),
                preferences=_json(preferences),
                previous_paragraph=previous_paragraph or "(first section)",
            ),
            WrittenSection,
        )
        section = result.model_copy(update={"heading": planned.heading, "level": planned.level})
        sections.append(section)
        previous_paragraph = _last_paragraph(section.markdown)
        bus.stage(
            "generation_write_section",
            "done",
            detail=planned.heading,
            index=position,
            total=total,
            markdown=section.markdown,
        )
    return DraftArticle(title=plan.title, sections=sections)


async def self_critique(
    draft: DraftArticle,
    requirements: ArticleRequirements,
    profile: StyleProfile,
    llm: LLMClient,
) -> Critique:
    """Make the model's own suggested improvements explicit rather than silently rewriting."""
    return await llm.structured(
        "generation_self_critique",
        SELF_CRITIQUE_PROMPT.format(
            requirements=_json(requirements), profile=_json(profile), draft=draft.markdown
        ),
        Critique,
    )


async def apply_critique(
    draft: DraftArticle, plan: ArticlePlan, critique: Critique, llm: LLMClient
) -> DraftArticle:
    """Use a distinct revision call so critique quality can be inspected independently."""
    return await llm.structured(
        "generation_apply_critique",
        CRITIQUE_APPLY_PROMPT.format(plan=_json(plan), critique=_json(critique), draft=draft.markdown),
        DraftArticle,
    )


async def generate_article(
    requirements: ArticleRequirements,
    profile: StyleProfile,
    skeletons: list[ReferenceSkeleton],
    llm: LLMClient,
    preferences: list[RevisionInstruction] | None = None,
    bus: ProgressBus | None = None,
) -> tuple[ArticlePlan, DraftArticle, Critique]:
    """Run the visible plan → focused prose → critique → apply sequence."""
    bus = bus or NullBus()
    plan = await plan_article(requirements, profile, skeletons, llm, bus)
    draft = await write_article(plan, requirements, profile, llm, preferences, bus)

    bus.stage("generation_self_critique")
    critique = await self_critique(draft, requirements, profile, llm)
    bus.stage("generation_self_critique", "done", detail=f"{len(critique.edits)} edits identified")

    bus.stage("generation_apply_critique")
    revised = await apply_critique(draft, plan, critique, llm)
    bus.stage("generation_apply_critique", "done")
    return plan, revised, critique


def _targets_section(instruction: RevisionInstruction, section: WrittenSection, position: int) -> bool:
    """True when an instruction names this section explicitly."""
    target = instruction.target.casefold()
    if target == "__intro__":
        return position == 0
    return target == section.heading.casefold()


def plan_revision(
    draft: DraftArticle, instructions: list[RevisionInstruction]
) -> list[list[RevisionInstruction]]:
    """Decide which sections get rewritten, and with which instructions.

    The rule that matters: an evaluator-derived ``__global__`` instruction never
    triggers a rewrite on its own. Previously ``__global__`` matched every section,
    so a single note about the intro rewrote the whole article — the revision lost
    600 characters, structure fell from 100 to 87, and the "untouched sections stay
    byte-identical" guarantee was silently void. Evaluator global advice now only
    rides along with sections that are already being revised for a specific reason.

    Human ``__global__`` instructions are uncapped: an explicit human request to
    change the whole article must still change the whole article.
    """
    human_global = [i for i in instructions if i.target.casefold() == "__global__" and i.source == "human"]
    evaluator_global = [
        i for i in instructions if i.target.casefold() == "__global__" and i.source != "human"
    ]
    per_section: list[list[RevisionInstruction]] = []
    for position, section in enumerate(draft.sections):
        specific = [
            i
            for i in instructions
            if i.target.casefold() != "__global__" and _targets_section(i, section, position)
        ]
        if not specific and not human_global:
            per_section.append([])  # untouched, and therefore byte-identical
            continue
        per_section.append([*specific, *human_global, *evaluator_global])
    return per_section


async def revise_targeted_sections(
    draft: DraftArticle,
    requirements: ArticleRequirements,
    profile: StyleProfile,
    instructions: list[RevisionInstruction],
    llm: LLMClient,
    bus: ProgressBus | None = None,
) -> DraftArticle:
    """Rewrite only instruction-targeted sections; untouched markdown remains byte-identical."""
    bus = bus or NullBus()
    revised = list(draft.sections)
    schedule = plan_revision(draft, instructions)
    total = sum(1 for group in schedule if group)
    completed = 0
    for position, section in enumerate(draft.sections):
        applicable = schedule[position]
        if not applicable:
            continue
        completed += 1
        bus.stage(
            "feedback_targeted_revision",
            detail=section.heading,
            index=completed,
            total=total,
        )
        previous = _last_paragraph(revised[position - 1].markdown) if position else "(first section)"
        result = await llm.structured(
            "feedback_targeted_revision",
            TARGETED_REVISION_PROMPT.format(
                requirements=_json(requirements),
                profile=_json(profile),
                section=_json(section),
                current_markdown=section.markdown,
                instructions=_json(applicable),
                previous_paragraph=previous,
            ),
            RevisedSection,
        )
        revised[position] = section.model_copy(update={"markdown": result.markdown})
        bus.stage(
            "feedback_targeted_revision",
            "done",
            detail=section.heading,
            index=completed,
            total=total,
            markdown=result.markdown,
        )
    return draft.model_copy(update={"sections": revised})
