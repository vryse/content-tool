"""Hybrid evaluation combines reproducible fit checks with an independent editorial judge."""

from __future__ import annotations

import asyncio
import difflib
import json
import math

import numpy as np

from app.utils.llm import LLMClient
from app.utils.metrics import article_from_markdown, calculate_metrics
from app.utils.progress import NullBus, ProgressBus
from app.models import (
    ArticleRequirements,
    DraftArticle,
    EvaluationResult,
    JudgeResult,
    ParsedArticle,
    StyleProfile,
)
from app.utils.retrieve import ReferenceIndex, embed_text, reference_centroid

JUDGE_PROMPT = """You are an independent editorial judge. Score the article against the requirements and the derived style profile, not against an unseen generation prompt. For every dimension, use this rubric: 20 = seriously deficient, 50 = mixed/partially met, 80 = strong and specific. Return a one-sentence justification and one concrete improvement for each score. Quote only exact generic-sounding passages from the supplied draft.

REQUIREMENTS:
{requirements}

STYLE PROFILE:
{profile}

ARTICLE:
{article}
"""


def _fit_score(value: float, lower: float, upper: float, softness: float = 1.0) -> float:
    """Award 100 in range and degrade linearly beyond it with a transparent slope."""
    if lower <= value <= upper:
        return 100.0
    distance = lower - value if value < lower else value - upper
    return round(max(0.0, 100.0 - 100.0 * distance / max(softness, 1.0)), 2)


# A homogeneous corpus reports a near-zero stddev, which makes the z-score below
# hypersensitive: a few points of Flesch drift reads as a catastrophic mismatch and
# the score collapses. Floor the spread at a fraction of the baseline so a narrow
# corpus produces a strict metric rather than a broken one.
MIN_RELATIVE_STDDEV = 0.15


def _z_fit(value: float, baseline: float, stddev: float) -> float:
    """Matching the corpus, not maximising a readability metric, is the objective."""
    spread = max(stddev, MIN_RELATIVE_STDDEV * abs(baseline), 0.01)
    z_score = abs(value - baseline) / spread
    return round(100 * math.exp(-0.5 * z_score * z_score), 2)


def _heading_match(requirement: str, headings: list[str]) -> bool:
    return max((difflib.SequenceMatcher(None, requirement.casefold(), h.casefold()).ratio() for h in headings), default=0.0) >= 0.7


def missing_required_sections(requirements: ArticleRequirements, headings: list[str]) -> list[str]:
    return [item for item in requirements.required_sections if not _heading_match(item, headings)]


def rule_based_score(
    generated: ParsedArticle, requirements: ArticleRequirements, profile: StyleProfile
) -> tuple[float, list[str]]:
    """Expose the deterministic structure score and its missing requirements for tests/UI."""
    metrics = calculate_metrics(generated)
    expected_sections = profile.structure.typical_section_count
    section_score = _fit_score(metrics.section_count, *expected_sections, softness=max(expected_sections))
    tolerance = requirements.target_word_count * 0.15
    word_score = _fit_score(
        metrics.word_count,
        requirements.target_word_count - tolerance,
        requirements.target_word_count + tolerance,
        softness=max(requirements.target_word_count * 0.25, 1),
    )
    depth_score = _fit_score(
        metrics.max_heading_depth,
        max(1, int(round(profile.quantitative_baseline.max_heading_depth)) - 1),
        max(1, int(round(profile.quantitative_baseline.max_heading_depth)) + 1),
        softness=2,
    )
    headings = [section.heading for section in generated.sections if section.level > 0]
    missing = missing_required_sections(requirements, headings)
    required_score = 100.0 * (1 - len(missing) / max(len(requirements.required_sections), 1))
    profile_uses_lists = profile.structure.uses_bullets
    generated_uses_lists = metrics.bullet_list_count > 0 or metrics.numbered_list_count > 0
    list_score = 100.0 if profile_uses_lists == generated_uses_lists else 50.0
    return round((section_score + word_score + depth_score + required_score + list_score) / 5, 2), missing


def reference_similarity_band(index: ReferenceIndex, company: str) -> tuple[float, float]:
    """Return the (lower, upper) cosine band the reference articles occupy.

    The upper bound is the mean reference-to-reference similarity: an article as
    close to the corpus centroid as the references are to each other has fully
    matched the corpus, and there is nothing above that worth rewarding. The lower
    bound sits two standard deviations below it, which is where an article stops
    resembling the corpus at all.
    """
    candidates = [
        position
        for position, article in enumerate(index.articles)
        if article.company.casefold() == company.casefold()
    ]
    matrix = index.matrix[candidates]
    if len(matrix) < 2:
        # With a single reference there is no observed spread to calibrate against.
        return 0.3, 0.8
    pairwise = matrix @ matrix.T
    similarities = pairwise[np.triu_indices_from(pairwise, k=1)]
    mean = float(np.mean(similarities))
    spread = float(np.std(similarities))
    return max(0.0, mean - 2 * spread), mean


def _embedding_fit(generated: ParsedArticle, index: ReferenceIndex, company: str) -> float:
    """Score semantic proximity to the corpus on a band with usable gradient.

    The previous version rescaled from the *minimum* pairwise reference similarity.
    On a topically homogeneous corpus that floor sits above anything a new article
    reaches, so the metric saturated at exactly 0.0 for every draft: it contributed
    nothing to iteration while still dragging the composite down by roughly eight
    points. A mean-and-spread band degrades smoothly instead of cliff-edging.
    """
    candidates = [
        position
        for position, article in enumerate(index.articles)
        if article.company.casefold() == company.casefold()
    ]
    if not candidates:
        return 0.0
    generated_vector = embed_text(generated.full_text)
    similarity = float(generated_vector @ reference_centroid(index, company))
    lower, upper = reference_similarity_band(index, company)
    scaled = 100 * (similarity - lower) / max(upper - lower, 1e-6)
    return round(max(0.0, min(100.0, scaled)), 2)


def computed_score(
    generated: ParsedArticle, profile: StyleProfile, index: ReferenceIndex | None = None
) -> tuple[float, float, float]:
    """Return overall computed fit plus its readability and semantic components."""
    metrics = calculate_metrics(generated)
    readability = _z_fit(
        metrics.flesch_reading_ease,
        profile.quantitative_baseline.flesch_reading_ease,
        profile.quantitative_stddev.get("flesch_reading_ease", 0.0),
    )
    sentence_fit = _z_fit(
        metrics.avg_words_per_sentence,
        profile.quantitative_baseline.avg_words_per_sentence,
        profile.quantitative_stddev.get("avg_words_per_sentence", 0.0),
    )
    semantic = _embedding_fit(generated, index, profile.company) if index else 50.0
    return round((readability + sentence_fit + semantic) / 3, 2), readability, semantic


def _json(value: object) -> str:
    return json.dumps(value, default=lambda item: item.model_dump(mode="json"), indent=2)


async def evaluate_draft(
    draft: DraftArticle,
    requirements: ArticleRequirements,
    profile: StyleProfile,
    llm: LLMClient,
    index: ReferenceIndex | None = None,
    bus: ProgressBus | None = None,
) -> EvaluationResult:
    """Combine independent score families; judge deltas matter more than absolute scores."""
    bus = bus or NullBus()
    generated = article_from_markdown(draft.markdown, title=draft.title, company=requirements.company)

    def deterministic() -> tuple[tuple[float, list[str]], tuple[float, float, float]]:
        return (
            rule_based_score(generated, requirements, profile),
            computed_score(generated, profile, index),
        )

    bus.stage("score_deterministic")
    bus.stage("evaluation_judge")
    # The deterministic scorers are pure and independent of the judge, and one of
    # them embeds the whole article, so running them off the event loop alongside
    # the judge call removes their latency from the critical path entirely.
    deterministic_task = asyncio.to_thread(deterministic)
    judge_task = llm.structured(
        "evaluation_judge",
        JUDGE_PROMPT.format(
            requirements=_json(requirements), profile=_json(profile), article=draft.markdown
        ),
        JudgeResult,
    )
    (rule_result, computed_result), judge = await asyncio.gather(deterministic_task, judge_task)
    structural, missing = rule_result
    computed, readability, semantic = computed_result
    bus.stage("score_deterministic", "done")
    bus.stage("evaluation_judge", "done")
    style = round((semantic + judge.style_similarity.score) / 2, 2)
    completeness = round((judge.completeness.score + (100.0 if not missing else 0.0)) / 2, 2)
    overall = round(
        0.20 * structural
        + 0.15 * readability
        + 0.15 * style
        + 0.20 * judge.relevance.score
        + 0.15 * completeness
        + 0.15 * judge.content_quality.score,
        2,
    )
    recommendations = [
        judge.relevance.improvement,
        judge.style_similarity.improvement,
        judge.tone_consistency.improvement,
        judge.completeness.improvement,
        judge.content_quality.improvement,
    ]
    return EvaluationResult(
        overall_score=overall,
        dimension_scores={
            "structure": structural,
            "readability": readability,
            "computed_fit": computed,
            "embedding_style_fit": semantic,
            "style": style,
            "relevance": judge.relevance.score,
            "tone_consistency": judge.tone_consistency.score,
            "completeness": completeness,
            "content_quality": judge.content_quality.score,
        },
        strengths=judge.strengths,
        weaknesses=judge.weaknesses,
        missing_requirements=missing,
        generic_sounding_passages=judge.generic_sounding_passages,
        recommendations=[item for item in recommendations if item],
    )
