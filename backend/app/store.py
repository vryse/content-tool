"""Async PostgreSQL persistence for repeatable runs and learned preferences."""

from __future__ import annotations

from datetime import datetime, timezone

from tortoise import Tortoise
from tortoise.transactions import in_transaction

from app.utils.config import tortoise_config
from app.db.models import (
    AnalysisOutcomeRecord,
    Feedback,
    FeedbackOutcomeRecord,
    GenerationOutcomeRecord,
    LearnedPreference,
    ReferenceDocument,
    Run,
    StyleProfileRecord,
)
from app.models import (
    AnalysisOutcome,
    AnalyticsReport,
    FeedbackOutcome,
    GenerationOutcome,
    GenerationRun,
    ProjectSummary,
    ReferenceRecord,
    RevisionInstruction,
    RunListItem,
)
from app.utils.metrics import article_from_markdown
from app.models import ArticlePlan, ArticleRequirements, DraftArticle, EvaluationResult, StyleProfile


async def initialise_database() -> None:
    """Open the configured PostgreSQL connection; migrations own schema changes."""
    await Tortoise.init(config=tortoise_config())


async def close_database() -> None:
    """Release connection-pool resources at application or CLI shutdown."""
    await Tortoise.close_connections()


async def save_run(run: GenerationRun) -> None:
    """Persist inputs and outputs together so a later comparison is reproducible."""
    await Run.update_or_create(
        run_id=run.run_id,
        defaults={
            "company": run.requirements.company,
            "requirements_json": run.requirements.model_dump(mode="json"),
            "plan_json": run.plan.model_dump(mode="json"),
            "article_json": run.article.model_dump(mode="json"),
            "article_markdown": run.article.markdown,
            "evaluation_json": run.evaluation.model_dump(mode="json") if run.evaluation else None,
            "parent_run_id": run.parent_run_id,
        },
    )


async def load_run(run_id: str) -> GenerationRun | None:
    """Rehydrate a persisted run so feedback revisions survive process restarts."""
    row = await Run.get_or_none(run_id=run_id)
    if row is None:
        return None
    requirements = ArticleRequirements.model_validate(row.requirements_json)
    plan = ArticlePlan.model_validate(row.plan_json)
    if row.article_json:
        draft = DraftArticle.model_validate(row.article_json)
    else:
        article = article_from_markdown(row.article_markdown, title=plan.title, company=requirements.company)
        draft = DraftArticle(
            title=article.title,
            sections=[
                {"heading": section.heading, "level": section.level, "markdown": "\n\n".join(section.paragraphs)}
                for section in article.sections
                if section.heading != "__intro__"
            ],
        )
    evaluation = EvaluationResult.model_validate(row.evaluation_json) if row.evaluation_json else None
    return GenerationRun(
        run_id=row.run_id,
        requirements=requirements,
        plan=plan,
        article=draft,
        evaluation=evaluation,
        parent_run_id=row.parent_run_id,
    )


async def list_runs(company: str) -> list[RunListItem]:
    """Every saved run for a project, lightest fields only, newest first.

    Deliberately not a join against ``generation_outcomes``: ``runs`` already
    carries everything a list needs (title, topic, score), and staying keyed
    off the one table that is guaranteed to exist for every run means a
    project's history is never short a row because the analytics table
    lagged behind it.
    """
    rows = await Run.filter(company__iexact=company).order_by("-created_at")
    items: list[RunListItem] = []
    for row in rows:
        requirements = ArticleRequirements.model_validate(row.requirements_json)
        plan = ArticlePlan.model_validate(row.plan_json)
        evaluation = EvaluationResult.model_validate(row.evaluation_json) if row.evaluation_json else None
        if row.article_json:
            draft = DraftArticle.model_validate(row.article_json)
            word_count = len(draft.markdown.split())
            section_count = len(draft.sections)
        else:
            word_count = len(row.article_markdown.split())
            section_count = len(plan.sections)
        items.append(
            RunListItem(
                run_id=row.run_id,
                parent_run_id=row.parent_run_id,
                title=plan.title,
                topic=requirements.topic,
                target_word_count=requirements.target_word_count,
                word_count=word_count,
                section_count=section_count,
                overall_score=evaluation.overall_score if evaluation else None,
                created_at=row.created_at,
            )
        )
    return items


async def save_feedback(
    run_id: str,
    raw_feedback: str,
    rating: int | None,
    instructions: list[RevisionInstruction],
) -> None:
    """Store the original human signal beside its structured interpretation."""
    await Feedback.create(
        run_id=run_id,
        raw_feedback=raw_feedback,
        rating=rating,
        instructions_json=[item.model_dump(mode="json") for item in instructions],
    )


async def remember_preferences(company: str, instructions: list[RevisionInstruction]) -> None:
    """Only accepted human instructions become durable company-specific preferences."""
    for item in (instruction for instruction in instructions if instruction.source == "human"):
        await LearnedPreference.get_or_create(
            company=company,
            target=item.target,
            change_type=item.change_type,
            instruction=item.instruction,
            defaults={"priority": item.priority},
        )


async def learned_preferences(company: str) -> list[RevisionInstruction]:
    """Return preferences in the same shape used by the generation prompt."""
    rows = await LearnedPreference.filter(company__iexact=company).order_by("priority", "id")
    return [
        RevisionInstruction(
            target=row.target,
            change_type=row.change_type,
            instruction=row.instruction,
            source="human",
            priority=row.priority,
        )
        for row in rows
    ]


# --- Style profiles -------------------------------------------------------
# Company names are matched case-insensitively everywhere else in the pipeline
# (retrieval, reference filtering), so profile lookup follows the same rule
# rather than making "Protecto AI" and "protecto ai" two different profiles.


async def save_profile(profile: StyleProfile, source_keys: list[str] | None = None) -> None:
    """Replace the cached profile for a company with a freshly built one."""
    existing = await _profile_row(profile.company)
    defaults = {
        "profile_json": profile.model_dump(mode="json"),
        "source_keys": source_keys or [],
        "source_article_count": profile.source_article_count,
    }
    await StyleProfileRecord.update_or_create(
        company=existing.company if existing else profile.company, defaults=defaults
    )


async def _profile_row(company: str) -> StyleProfileRecord | None:
    return await StyleProfileRecord.filter(company__iexact=company).first()


async def load_profile(company: str) -> StyleProfile | None:
    """Return the cached profile, or None when the company has never been built."""
    row = await _profile_row(company)
    return StyleProfile.model_validate(row.profile_json) if row else None


async def profile_sources(company: str) -> list[str]:
    """The R2 keys the cached profile was built from, for display in the UI."""
    row = await _profile_row(company)
    return list(row.source_keys or []) if row else []


async def delete_profile(company: str) -> bool:
    deleted = await StyleProfileRecord.filter(company__iexact=company).delete()
    return bool(deleted)


async def profile_companies() -> list[str]:
    rows = await StyleProfileRecord.all().order_by("company").values("company")
    return [row["company"] for row in rows]


# --- Projects -------------------------------------------------------------
# A project is the ``company`` value that references, profiles, preferences and
# runs are all keyed by. Nothing creates one explicitly, so the list of projects
# is whatever those tables collectively mention. Grouping is case-insensitive to
# match the ``iexact`` lookups used everywhere else; the profile's spelling wins
# as the display name because that is the one the user confirmed by building.


async def list_projects() -> list[ProjectSummary]:
    """Every project the database knows about, with enough detail to choose one."""
    projects: dict[str, ProjectSummary] = {}

    def slot(company: str) -> ProjectSummary:
        name = company.strip()
        return projects.setdefault(name.casefold(), ProjectSummary(company=name))

    for row in await ReferenceDocument.all().values("company", "word_count"):
        entry = slot(row["company"])
        entry.reference_count += 1
        entry.document_word_count += row["word_count"] or 0

    for row in await StyleProfileRecord.all().values("company", "source_keys", "updated_at"):
        entry = slot(row["company"])
        entry.company = row["company"].strip()
        entry.has_profile = True
        entry.profile_source_count = len(row["source_keys"] or [])
        entry.profile_updated_at = row["updated_at"]

    for row in await Run.all().values("company", "created_at"):
        entry = slot(row["company"])
        entry.run_count += 1
        if entry.last_run_at is None or row["created_at"] > entry.last_run_at:
            entry.last_run_at = row["created_at"]

    return sorted(projects.values(), key=lambda project: project.company.casefold())


async def canonical_company(company: str) -> str:
    """Return the spelling an existing project is already stored under.

    Without this, typing "protecto ai" into the project field would file new
    documents under a second spelling that every ``iexact`` lookup treats as the
    same project but every listing renders as a separate row.
    """
    name = company.strip()
    if not name:
        return name
    profile = await StyleProfileRecord.filter(company__iexact=name).first()
    if profile:
        return profile.company
    reference = await ReferenceDocument.filter(company__iexact=name).first()
    if reference:
        return reference.company
    run = await Run.filter(company__iexact=name).first()
    return run.company if run else name


async def project_exists(company: str) -> bool:
    """Whether anything at all is stored under this project name."""
    name = company.strip()
    if not name:
        return False
    return (
        await ReferenceDocument.filter(company__iexact=name).exists()
        or await StyleProfileRecord.filter(company__iexact=name).exists()
        or await Run.filter(company__iexact=name).exists()
    )


async def delete_project(company: str) -> dict[str, int]:
    """Remove every database row a project owns and report what went.

    Reference *objects* in R2 are deleted by the caller, which owns the bucket
    client; this function is only responsible for the index and the derived
    artefacts, so the two cannot drift apart silently.
    """
    name = company.strip()
    return {
        "references": await ReferenceDocument.filter(company__iexact=name).delete(),
        "profiles": await StyleProfileRecord.filter(company__iexact=name).delete(),
        "preferences": await LearnedPreference.filter(company__iexact=name).delete(),
        "runs": await Run.filter(company__iexact=name).delete(),
    }


async def rename_project(company: str, new_name: str) -> str:
    """Move a project's database namespace without moving immutable R2 object keys.

    Reference keys are opaque storage identifiers. Keeping them stable avoids a
    copy/delete operation where a partial R2 failure could lose a source document;
    all project lookups instead use the database ``company`` fields updated here.
    """
    old_name = await canonical_company(company)
    target = new_name.strip()
    if not old_name or not target:
        raise ValueError("A project name is required.")
    if old_name.casefold() != target.casefold() and await project_exists(target):
        raise ValueError(f"A project named {target!r} already exists.")

    async with in_transaction() as connection:
        runs = await Run.filter(company__iexact=old_name).using_db(connection)
        for run in runs:
            requirements = dict(run.requirements_json)
            requirements["company"] = target
            await Run.filter(run_id=run.run_id).using_db(connection).update(
                company=target,
                requirements_json=requirements,
            )

        profile = await StyleProfileRecord.filter(company__iexact=old_name).using_db(connection).first()
        if profile:
            profile_json = dict(profile.profile_json)
            profile_json["company"] = target
            await StyleProfileRecord.filter(company__iexact=old_name).using_db(connection).update(
                company=target,
                profile_json=profile_json,
            )

        await ReferenceDocument.filter(company__iexact=old_name).using_db(connection).update(company=target)
        await LearnedPreference.filter(company__iexact=old_name).using_db(connection).update(company=target)

    return target


# --- Reference documents --------------------------------------------------


def _to_record(row: ReferenceDocument) -> ReferenceRecord:
    return ReferenceRecord(
        key=row.key,
        filename=row.filename,
        company=row.company,
        size_bytes=row.size_bytes,
        content_hash=row.content_hash,
        title=row.title,
        word_count=row.word_count,
        section_count=row.section_count,
        parse_error=row.parse_error,
        uploaded_at=row.uploaded_at,
    )


async def save_reference(record: ReferenceRecord) -> ReferenceRecord:
    """Record an uploaded document; re-uploading the same key updates it in place."""
    await ReferenceDocument.update_or_create(
        key=record.key,
        defaults={
            "filename": record.filename,
            "company": record.company,
            "size_bytes": record.size_bytes,
            "content_hash": record.content_hash,
            "title": record.title,
            "word_count": record.word_count,
            "section_count": record.section_count,
            "parse_error": record.parse_error,
            "uploaded_at": record.uploaded_at or datetime.now(timezone.utc),
        },
    )
    row = await ReferenceDocument.get(key=record.key)
    return _to_record(row)


async def list_references(company: str | None = None) -> list[ReferenceRecord]:
    query = ReferenceDocument.all()
    if company:
        query = query.filter(company__iexact=company)
    return [_to_record(row) for row in await query.order_by("company", "filename")]


async def get_references(keys: list[str]) -> list[ReferenceRecord]:
    """Preserve the caller's ordering so a selection renders as the user made it."""
    rows = {row.key: row for row in await ReferenceDocument.filter(key__in=keys)}
    return [_to_record(rows[key]) for key in keys if key in rows]


async def delete_reference(key: str) -> bool:
    deleted = await ReferenceDocument.filter(key=key).delete()
    return bool(deleted)


async def reference_companies() -> list[str]:
    rows = await ReferenceDocument.all().distinct().order_by("company").values("company")
    return [row["company"] for row in rows]


# --- Outcome analytics ------------------------------------------------------
# One durable row per completed pipeline stage, flattened for cross-run
# analysis. These are additive to the existing artefacts (style_profiles,
# runs, feedback) rather than a replacement: the full record stays wherever
# it already lived, and these rows exist so scores, cost, and volume can be
# trended without parsing that JSON per row.


async def save_analysis_outcome(outcome: AnalysisOutcome) -> None:
    await AnalysisOutcomeRecord.create(
        company=outcome.company,
        source_article_count=outcome.source_article_count,
        vocabulary_size=outcome.vocabulary_size,
        outlier_count=outcome.outlier_count,
        tone_descriptors_json=outcome.tone_descriptors,
        total_cost_usd=outcome.total_cost_usd,
        total_tokens=outcome.total_tokens,
        wall_time_seconds=outcome.wall_time_seconds,
        created_at=outcome.created_at,
    )


async def list_analysis_outcomes(company: str | None = None) -> list[AnalysisOutcome]:
    query = AnalysisOutcomeRecord.all()
    if company:
        query = query.filter(company__iexact=company)
    return [
        AnalysisOutcome(
            company=row.company,
            source_article_count=row.source_article_count,
            vocabulary_size=row.vocabulary_size,
            outlier_count=row.outlier_count,
            tone_descriptors=list(row.tone_descriptors_json or []),
            total_cost_usd=row.total_cost_usd,
            total_tokens=row.total_tokens,
            wall_time_seconds=row.wall_time_seconds,
            created_at=row.created_at,
        )
        for row in await query.order_by("created_at")
    ]


async def save_generation_outcome(outcome: GenerationOutcome) -> None:
    await GenerationOutcomeRecord.update_or_create(
        run_id=outcome.run_id,
        defaults={
            "company": outcome.company,
            "parent_run_id": outcome.parent_run_id,
            "overall_score": outcome.overall_score,
            "dimension_scores_json": outcome.dimension_scores,
            "section_count": outcome.section_count,
            "word_count": outcome.word_count,
            "missing_requirement_count": outcome.missing_requirement_count,
            "total_cost_usd": outcome.total_cost_usd,
            "total_tokens": outcome.total_tokens,
            "wall_time_seconds": outcome.wall_time_seconds,
            "created_at": outcome.created_at,
        },
    )


async def list_generation_outcomes(company: str | None = None) -> list[GenerationOutcome]:
    query = GenerationOutcomeRecord.all()
    if company:
        query = query.filter(company__iexact=company)
    return [
        GenerationOutcome(
            run_id=row.run_id,
            company=row.company,
            parent_run_id=row.parent_run_id,
            overall_score=row.overall_score,
            dimension_scores=dict(row.dimension_scores_json or {}),
            section_count=row.section_count,
            word_count=row.word_count,
            missing_requirement_count=row.missing_requirement_count,
            total_cost_usd=row.total_cost_usd,
            total_tokens=row.total_tokens,
            wall_time_seconds=row.wall_time_seconds,
            created_at=row.created_at,
        )
        for row in await query.order_by("created_at")
    ]


async def save_feedback_outcome(outcome: FeedbackOutcome) -> None:
    await FeedbackOutcomeRecord.create(
        run_id=outcome.run_id,
        company=outcome.company,
        rating=outcome.rating,
        human_instruction_count=outcome.human_instruction_count,
        evaluator_instruction_count=outcome.evaluator_instruction_count,
        accepted_instruction_count=outcome.accepted_instruction_count,
        created_at=outcome.created_at,
    )


async def list_feedback_outcomes(company: str | None = None) -> list[FeedbackOutcome]:
    query = FeedbackOutcomeRecord.all()
    if company:
        query = query.filter(company__iexact=company)
    return [
        FeedbackOutcome(
            run_id=row.run_id,
            company=row.company,
            rating=row.rating,
            human_instruction_count=row.human_instruction_count,
            evaluator_instruction_count=row.evaluator_instruction_count,
            accepted_instruction_count=row.accepted_instruction_count,
            created_at=row.created_at,
        )
        for row in await query.order_by("created_at")
    ]


async def analytics_report(company: str) -> AnalyticsReport:
    """Assemble every stored outcome for a project, ready to export and share."""
    return AnalyticsReport(
        company=company,
        analysis_outcomes=await list_analysis_outcomes(company),
        generation_outcomes=await list_generation_outcomes(company),
        feedback_outcomes=await list_feedback_outcomes(company),
    )
