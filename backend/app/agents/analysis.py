"""Turn a compact corpus into a reusable, evidence-backed writing style profile."""

from __future__ import annotations

import asyncio
import json
import statistics

from app.store import load_profile, save_profile
from app.utils.llm import LLMClient
from app.utils.metrics import calculate_metrics
from app.utils.progress import NullBus, ProgressBus
from app.models import (
    ArticleObservation,
    ParsedArticle,
    StyleProfile,
    TextMetrics,
    VisualDefaults,
)

ARTICLE_OBSERVATION_PROMPT = """You are analysing one reference article for a reusable writing-style profile.
Use only the supplied headings and short section openings. Do not infer facts that are not present.
Return compact observations about voice, structure, vocabulary, recurring rhetorical moves, and specific things the author avoids.

ARTICLE:
{article_excerpt}
"""

STYLE_SYNTHESIS_PROMPT = """You are a rigorous editorial analyst. Synthesize a StyleProfile for {company} from per-article observations and deterministic corpus statistics.
Report only patterns found in a majority of articles; identify any outliers separately. Vocabulary must be concrete domain terms observed in the source, never generic marketing language. Keep the avoid list specific and non-empty.

DETERMINISTIC STATISTICS:
{statistics}

PER-ARTICLE OBSERVATIONS:
{observations}
"""


def article_excerpt(article: ParsedArticle, words_per_section: int = 150) -> str:
    """Bound context on purpose: style evidence needs openings, not full source bodies."""
    chunks = [f"Title: {article.title}"]
    for section in article.sections:
        prose = " ".join(section.paragraphs)
        clipped = " ".join(prose.split()[:words_per_section])
        chunks.append(f"H{section.level} {section.heading}: {clipped}")
    return "\n\n".join(chunks)


def quantitative_summary(articles: list[ParsedArticle]) -> tuple[TextMetrics, dict[str, float]]:
    """Use population deviation because this complete small corpus is the reference set."""
    if not articles:
        raise ValueError("At least one reference article is required to build a style profile.")
    metric_rows = [calculate_metrics(article).model_dump() for article in articles]
    means: dict[str, float] = {}
    deviations: dict[str, float] = {}
    for field in TextMetrics.model_fields:
        values = [float(row[field]) for row in metric_rows]
        means[field] = sum(values) / len(values)
        deviations[field] = statistics.pstdev(values) if len(values) > 1 else 0.0
    # ``TextMetrics`` models one article, so its count fields are integers.
    # The corpus baseline is an average, but must retain that model's contract;
    # round counts to the nearest whole count while preserving decimal precision
    # for rate/readability metrics.
    baseline = TextMetrics(
        **{
            key: int(round(value))
            if TextMetrics.model_fields[key].annotation is int
            else round(value, 2)
            for key, value in means.items()
        }
    )
    return baseline, {key: round(value, 4) for key, value in deviations.items()}


def visual_defaults(articles: list[ParsedArticle]) -> VisualDefaults:
    """Recommend a visual only when more than half of the corpus uses it."""
    if not articles:
        return VisualDefaults()
    table_reference_count = sum(article.has_table for article in articles)
    flowchart_reference_count = sum(article.has_flowchart for article in articles)
    return VisualDefaults(
        include_table=table_reference_count > len(articles) / 2,
        include_flowchart=flowchart_reference_count > len(articles) / 2,
        table_reference_count=table_reference_count,
        flowchart_reference_count=flowchart_reference_count,
        source_count=len(articles),
    )


async def build_style_profile(
    articles: list[ParsedArticle],
    llm: LLMClient,
    *,
    force: bool = False,
    bus: ProgressBus | None = None,
    source_keys: list[str] | None = None,
) -> StyleProfile:
    """Run exactly N article observations plus one synthesis, then cache the result.

    Caching is intentional: repeated profile rebuilding adds cost without
    improving an unchanged corpus, so callers must request ``force=True``.
    """
    if not articles:
        raise ValueError("No readable reference documents were supplied.")
    company = articles[0].company
    cached = await load_profile(company)
    if cached and not force:
        return cached
    if any(article.company != company for article in articles):
        raise ValueError("Build one style profile per company at a time.")

    bus = bus or NullBus()
    baseline, stddev = quantitative_summary(articles)
    project_visual_defaults = visual_defaults(articles)
    bus.stage("style_observation", total=len(articles), index=len(articles))
    # Per-article observations are independent by construction, so the profile build
    # costs one round trip instead of N. Only the synthesis below needs them all.
    observations = await asyncio.gather(
        *(
            llm.structured(
                "style_observation",
                ARTICLE_OBSERVATION_PROMPT.format(article_excerpt=article_excerpt(article)),
                ArticleObservation,
            )
            for article in articles
        )
    )
    bus.stage("style_observation", "done", total=len(articles), index=len(articles))
    bus.stage("style_synthesis")
    synthesis_prompt = STYLE_SYNTHESIS_PROMPT.format(
        company=company,
        statistics=json.dumps(
            {
                "baseline": baseline.model_dump(),
                "stddev": stddev,
                "visual_defaults": project_visual_defaults.model_dump(),
            },
            indent=2,
        ),
        observations=json.dumps([item.model_dump() for item in observations], indent=2),
    )
    draft_profile = await llm.structured("style_synthesis", synthesis_prompt, StyleProfile)
    profile = draft_profile.model_copy(
        update={
            "company": company,
            "source_article_count": len(articles),
            "quantitative_baseline": baseline,
            "quantitative_stddev": stddev,
            "visual_defaults": project_visual_defaults,
        }
    )
    bus.stage("style_synthesis", "done", detail=f"{len(profile.vocabulary)} terms")
    await save_profile(profile, source_keys=source_keys)
    return profile
