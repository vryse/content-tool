"""Deterministic metrics provide a reproducible counterweight to LLM judgments."""

from __future__ import annotations

import re
from functools import lru_cache

import textstat

from app.models import ParsedArticle, Section, TextMetrics

SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
LINK_RE = re.compile(r"https?://\S+|\[[^]]+\]\(https?://[^)]+\)")
NUMERIC_STAT_RE = re.compile(r"\d+%|\$[\d,.]+[KMB]?|\d+x\b|\b(?:19|20)\d{2}\b", re.I)
CONCLUSION_RE = re.compile(r"conclusion|final|wrap|takeaway|summary", re.I)
MARKDOWN_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.M)


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text))


def _conclusion(sections: list[Section]) -> Section | None:
    matches = [section for section in sections if CONCLUSION_RE.search(section.heading)]
    return matches[-1] if matches else (sections[-1] if sections else None)


def _fallback_syllables(word: str) -> int:
    """Approximate syllables when textstat's optional cmudict corpus is unavailable."""
    normalized = re.sub(r"[^a-z]", "", word.casefold())
    if not normalized:
        return 0
    groups = len(re.findall(r"[aeiouy]+", normalized))
    if normalized.endswith("e") and groups > 1:
        groups -= 1
    return max(groups, 1)


@lru_cache(maxsize=1)
def _has_cmudict() -> bool:
    """Probe locally only; never make a metrics call trigger an implicit download."""
    try:
        import nltk

        nltk.data.find("corpora/cmudict")
        return True
    except (ImportError, LookupError):
        return False


def _readability(text: str, words: int, sentences: list[str]) -> tuple[float, float]:
    """Keep metrics runnable in minimal deployments without downloading NLTK data."""
    try:
        if not _has_cmudict():
            raise LookupError("optional NLTK cmudict corpus is unavailable")
        return (
            round(float(textstat.flesch_reading_ease(text)), 2),
            round(float(textstat.gunning_fog(text)), 2),
        )
    except LookupError:
        tokens = re.findall(r"\b[\w'-]+\b", text)
        syllables = sum(_fallback_syllables(token) for token in tokens)
        complex_words = sum(_fallback_syllables(token) >= 3 for token in tokens)
        avg_sentence = words / max(len(sentences), 1)
        avg_syllables = syllables / max(words, 1)
        flesch = 206.835 - (1.015 * avg_sentence) - (84.6 * avg_syllables)
        fog = 0.4 * (avg_sentence + 100 * complex_words / max(words, 1))
        return round(flesch, 2), round(fog, 2)


def calculate_metrics(article: ParsedArticle) -> TextMetrics:
    """Measure visible prose; synthetic intro sections do not inflate section depth."""
    text = article.full_text.strip()
    sentences = [item for item in SENTENCE_RE.split(text) if item.strip()]
    paragraphs = [p for section in article.sections for p in section.paragraphs if p.strip()]
    content_sections = [section for section in article.sections if section.level > 0]
    intro = next((section for section in article.sections if section.heading == "__intro__"), None)
    conclusion = _conclusion(article.sections)
    words = word_count(text)
    flesch, fog = _readability(text, words, sentences) if text else (0.0, 0.0)
    return TextMetrics(
        word_count=words,
        section_count=len(content_sections) or len(article.sections),
        max_heading_depth=max((section.level for section in article.sections), default=0),
        avg_words_per_sentence=round(words / max(len(sentences), 1), 2),
        avg_words_per_paragraph=round(words / max(len(paragraphs), 1), 2),
        avg_paragraphs_per_section=round(len(paragraphs) / max(len(article.sections), 1), 2),
        bullet_list_count=sum(section.bullet_count for section in article.sections),
        numbered_list_count=sum(section.numbered_count for section in article.sections),
        external_link_count=len(LINK_RE.findall(text)),
        numeric_stat_count=len(NUMERIC_STAT_RE.findall(text)),
        flesch_reading_ease=flesch,
        gunning_fog=fog,
        intro_word_count=intro.word_count if intro else 0,
        conclusion_word_count=conclusion.word_count if conclusion else 0,
    )


def article_from_markdown(markdown: str, title: str = "Generated article", company: str = "") -> ParsedArticle:
    """Normalize generated Markdown into the same representation as reference docs."""
    matches = list(MARKDOWN_HEADING_RE.finditer(markdown))
    sections: list[Section] = []
    cursor = 0
    current_heading, current_level = "__intro__", 0
    for match in matches:
        body = markdown[cursor:match.start()].strip()
        if body:
            paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
            sections.append(_markdown_section(current_heading, current_level, paragraphs))
        current_heading, current_level = match.group(2).strip(), len(match.group(1))
        cursor = match.end()
    body = markdown[cursor:].strip()
    if body or not sections:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
        sections.append(_markdown_section(current_heading, current_level, paragraphs))
    full_text = "\n\n".join(_strip_markdown(p) for s in sections for p in s.paragraphs)
    return ParsedArticle(filename="generated.md", title=title, sections=sections, full_text=full_text, company=company)


def _markdown_section(heading: str, level: int, paragraphs: list[str]) -> Section:
    bullets = sum(1 for p in paragraphs for line in p.splitlines() if re.match(r"^\s*[-*+]\s+", line))
    numbered = sum(1 for p in paragraphs for line in p.splitlines() if re.match(r"^\s*\d+[.)]\s+", line))
    return _section_from_text(heading, level, paragraphs, bullets, numbered)


def _section_from_text(heading: str, level: int, paragraphs: list[str], bullets: int, numbered: int) -> Section:
    return Section(heading=heading, level=level, paragraphs=paragraphs, word_count=sum(word_count(_strip_markdown(p)) for p in paragraphs), bullet_count=bullets, numbered_count=numbered)


def _strip_markdown(text: str) -> str:
    return re.sub(r"[`*_>#\[\]()]", "", text)
