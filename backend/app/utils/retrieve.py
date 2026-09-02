"""Local semantic retrieval that deliberately returns structural, not source, context."""

from __future__ import annotations

import hashlib
import pickle
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.utils.config import EMBEDDING_CACHE_PATH, ensure_directories
from app.models import ParsedArticle, ReferenceSkeleton


# Each entry is one float32 matrix of (documents x 384); twenty of them is a few
# megabytes, which is the right order for a disk cache shared by every project.
_MAX_CACHED_CORPORA = 20


@dataclass
class ReferenceIndex:
    """A swappable in-memory index is enough for a corpus of roughly twenty documents."""

    articles: list[ParsedArticle]
    matrix: np.ndarray
    fingerprints: list[str]


def _source_text(article: ParsedArticle) -> str:
    openings = " ".join(" ".join(section.paragraphs) for section in article.sections)
    return f"{article.title}\n" + "\n".join(section.heading for section in article.sections) + "\n" + " ".join(openings.split()[:300])


def _fingerprint(article: ParsedArticle) -> str:
    return hashlib.sha256(_source_text(article).encode()).hexdigest()


@lru_cache(maxsize=1)
def _model():
    """Load the local model once per process.

    Constructing SentenceTransformer costs 3-8s on a warm disk, and both retrieval
    and evaluation embed text on every request, so an uncached call made the model
    load the dominant latency in a generation run. Cached here rather than at the
    call sites so every embedding path shares one instance.
    """
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as error:  # pragma: no cover - setup failure path
        raise RuntimeError("Run `uv sync` in the backend directory before using semantic retrieval.") from error
    return SentenceTransformer("all-MiniLM-L6-v2")


def warm_embedding_model() -> None:
    """Pay the model load during startup instead of inside the first user request."""
    _model()


def embed_text(text: str) -> np.ndarray:
    """Centralize model use so evaluation and retrieval share one embedding contract."""
    return np.asarray(_model().encode([text], normalize_embeddings=True))[0]


def _corpus_id(fingerprints: list[str]) -> str:
    """One stable id for an ordered corpus, used as the cache key."""
    return hashlib.sha256("\n".join(fingerprints).encode()).hexdigest()


def _load_cache(cache_path: Path) -> dict[str, object]:
    """Read the corpus cache, upgrading the single-corpus format written before.

    The file used to hold one ``{fingerprints, matrix}`` pair, which was adequate
    while there was one project. With several, every switch between them
    overwrote the other's entry, so a corpus that had not changed at all was
    re-embedded on each generation. Keying by corpus lets them coexist.
    """
    if not cache_path.exists():
        return {}
    try:
        with cache_path.open("rb") as handle:
            cached = pickle.load(handle)
    except Exception:  # a truncated or stale pickle is a cache miss, not a failure
        return {}
    if not isinstance(cached, dict):
        return {}
    if "corpora" in cached:
        return dict(cached["corpora"])
    if "fingerprints" in cached and "matrix" in cached:
        return {_corpus_id(list(cached["fingerprints"])): cached["matrix"]}
    return {}


def build_reference_index(
    articles: list[ParsedArticle], cache_path: Path = EMBEDDING_CACHE_PATH
) -> ReferenceIndex:
    """Cache a corpus matrix only when its compact source representation matches.

    Entries are held per corpus, so alternating between projects keeps both warm
    instead of each evicting the other.
    """
    if not articles:
        raise ValueError("At least one reference article is required for retrieval.")
    fingerprints = [_fingerprint(article) for article in articles]
    corpus_id = _corpus_id(fingerprints)
    corpora = _load_cache(cache_path)
    cached = corpora.get(corpus_id)
    if cached is not None:
        return ReferenceIndex(articles, np.asarray(cached), fingerprints)
    model = _model()
    matrix = np.asarray(model.encode([_source_text(article) for article in articles], normalize_embeddings=True))
    corpora[corpus_id] = matrix
    # Bounded so a long-lived deployment with many projects and re-uploads does not
    # grow the file without limit; the evicted entry costs one re-embed to rebuild.
    if len(corpora) > _MAX_CACHED_CORPORA:
        for stale in list(corpora)[: len(corpora) - _MAX_CACHED_CORPORA]:
            corpora.pop(stale)
    ensure_directories()
    with cache_path.open("wb") as handle:
        pickle.dump({"corpora": corpora}, handle)
    return ReferenceIndex(articles, matrix, fingerprints)


def retrieve(
    topic: str,
    index: ReferenceIndex,
    *,
    company: str | None = None,
    top_k: int = 2,
) -> list[ReferenceSkeleton]:
    """Return only title, headings, and introductory prose to enforce source restraint."""
    if top_k < 1:
        return []
    candidates = [
        position
        for position, article in enumerate(index.articles)
        if company is None or article.company.casefold() == company.casefold()
    ]
    if not candidates:
        return []
    query = embed_text(topic)
    scores = index.matrix[candidates] @ query
    ranked = sorted(zip(candidates, scores), key=lambda item: float(item[1]), reverse=True)[:top_k]
    skeletons: list[ReferenceSkeleton] = []
    for position, score in ranked:
        article = index.articles[position]
        intro = next((section for section in article.sections if section.heading == "__intro__"), None)
        skeletons.append(
            ReferenceSkeleton(
                filename=article.filename,
                company=article.company,
                title=article.title,
                headings=[section.heading for section in article.sections if section.level > 0],
                intro=" ".join(intro.paragraphs) if intro else "",
                similarity=round(float(score), 4),
            )
        )
    return skeletons


def reference_centroid(index: ReferenceIndex, company: str | None = None) -> np.ndarray:
    """Expose a stable centroid for computed style similarity without a vector database."""
    rows = [
        index.matrix[position]
        for position, article in enumerate(index.articles)
        if company is None or article.company.casefold() == company.casefold()
    ]
    if not rows:
        raise ValueError("No references match the requested company.")
    centroid = np.mean(rows, axis=0)
    return centroid / max(float(np.linalg.norm(centroid)), 1e-12)
