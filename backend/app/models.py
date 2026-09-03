"""Validated contracts shared by every pipeline stage.

Keeping these models together prevents prompt responses, persistence, and UI state
from quietly drifting into incompatible shapes.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import AliasChoices, BaseModel, Field, model_validator

LLMProvider = Literal["anthropic", "openai", "google"]


class Section(BaseModel):
    heading: str
    level: int = Field(ge=0)
    paragraphs: list[str]
    word_count: int = Field(ge=0)
    bullet_count: int = Field(default=0, ge=0)
    numbered_count: int = Field(default=0, ge=0)


class ParsedArticle(BaseModel):
    filename: str
    title: str
    sections: list[Section]
    full_text: str
    # Structural visuals are recorded at parse time so project defaults can be
    # derived from the corpus without asking the profiling model to guess.
    has_table: bool = False
    has_flowchart: bool = False
    # Required rather than defaulted: every corpus is namespaced by project, so a
    # parsed document that forgot to say which one it belongs to must not silently
    # join whichever project happened to be the first one built.
    company: str


class TextMetrics(BaseModel):
    word_count: int = 0
    section_count: int = 0
    max_heading_depth: int = 0
    avg_words_per_sentence: float = 0.0
    avg_words_per_paragraph: float = 0.0
    avg_paragraphs_per_section: float = 0.0
    bullet_list_count: int = 0
    numbered_list_count: int = 0
    external_link_count: int = 0
    numeric_stat_count: int = 0
    flesch_reading_ease: float = 0.0
    gunning_fog: float = 0.0
    intro_word_count: int = 0
    conclusion_word_count: int = 0


class StructurePattern(BaseModel):
    typical_section_count: tuple[int, int]
    typical_word_count: tuple[int, int]
    heading_style: str
    common_section_themes: list[str]
    intro_pattern: str
    conclusion_pattern: str
    uses_bullets: bool
    uses_subheadings: bool


class VoicePattern(BaseModel):
    tone_descriptors: list[str] = Field(min_length=3, max_length=5)
    person: str
    sentence_rhythm: str
    technical_depth: str
    example_usage: str
    evidence_usage: str
    signature_moves: list[str]
    avoid_list: list[str] = Field(min_length=1)


class VisualDefaults(BaseModel):
    """Majority-backed defaults for the next article in a project."""

    include_table: bool = False
    include_flowchart: bool = False
    table_reference_count: int = Field(default=0, ge=0)
    flowchart_reference_count: int = Field(default=0, ge=0)
    source_count: int = Field(default=0, ge=0)


class ArticleObservation(BaseModel):
    filename: str
    heading_style: str
    section_themes: list[str]
    intro_pattern: str
    conclusion_pattern: str
    tone_descriptors: list[str]
    person: str
    sentence_rhythm: str
    technical_depth: str
    example_usage: str
    evidence_usage: str
    signature_moves: list[str]
    avoid_list: list[str]
    vocabulary: list[str]
    formatting_conventions: list[str]


class StyleProfile(BaseModel):
    company: str
    source_article_count: int = Field(ge=1)
    structure: StructurePattern
    voice: VoicePattern
    vocabulary: list[str] = Field(min_length=1)
    formatting_conventions: list[str]
    quantitative_baseline: TextMetrics
    quantitative_stddev: dict[str, float]
    # A default keeps profiles stored before this feature readable. Rebuilding
    # the profile fills this with deterministic counts from the selected corpus.
    visual_defaults: VisualDefaults = Field(default_factory=VisualDefaults)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    outliers: list[str] = Field(default_factory=list)


class ReferenceSkeleton(BaseModel):
    filename: str
    company: str
    title: str
    headings: list[str]
    intro: str
    similarity: float = 0.0


class ReferenceRecord(BaseModel):
    """A reference document stored in R2 and indexed in PostgreSQL.

    ``parse_error`` is carried rather than raised so a corrupt upload stays
    visible in the ingest UI, where it can be replaced, instead of failing the
    whole listing.
    """

    key: str
    filename: str
    company: str
    size_bytes: int
    content_hash: str
    title: str | None = None
    word_count: int | None = None
    section_count: int | None = None
    parse_error: str | None = None
    uploaded_at: datetime | None = None


class BulkReferenceDeleteRequest(BaseModel):
    """Delete an explicit, bounded selection from one project's library."""

    company: str = Field(min_length=1)
    reference_keys: list[str] = Field(min_length=1, max_length=500)


class CrawlRequest(BaseModel):
    """A bounded, same-site Firecrawl collection request."""

    company: str = Field(min_length=1)
    portfolio_url: str = Field(
        min_length=1,
        validation_alias=AliasChoices("portfolio_url", "client_url"),
    )
    blog_slug: str = Field(
        min_length=1,
        validation_alias=AliasChoices("blog_slug", "blog_path"),
    )
    limit: int = Field(default=50, ge=1, le=500)


class CrawlResult(BaseModel):
    job_id: str
    stored: list[ReferenceRecord]


class ProjectSummary(BaseModel):
    """One project (company) and what the system holds for it.

    A project is not its own table. It is the distinct ``company`` value shared by
    reference documents, the cached style profile, learned preferences, and runs,
    so this summary is assembled from those rather than read from a row. That keeps
    a project weightless to create — uploading the first document under a new name
    is all it takes — while still giving the UI something concrete to list.
    """

    company: str
    reference_count: int = 0
    document_word_count: int = 0
    has_profile: bool = False
    profile_source_count: int = 0
    profile_updated_at: datetime | None = None
    run_count: int = 0
    last_run_at: datetime | None = None


class ProfileBuildRequest(BaseModel):
    """Build a profile from an explicit selection of stored references."""

    reference_keys: list[str] = Field(default_factory=list)
    llm_provider: LLMProvider | None = None
    llm_model: str | None = None


class TopicSuggestionRequest(BaseModel):
    """Ask for a complete article brief grounded in one project's references."""

    company: str = Field(min_length=1)
    llm_provider: LLMProvider = "anthropic"
    llm_model: str | None = None
    topic: str | None = None
    target_audience: str | None = None
    target_word_count: int | None = Field(default=None, gt=0)
    key_points: list[str] = Field(default_factory=list)
    required_sections: list[str] = Field(default_factory=list)


class TopicSuggestion(BaseModel):
    """A ready-to-use article brief, proposed from the reference corpus."""

    topic: str = Field(min_length=1, max_length=180)
    target_audience: str = Field(min_length=1, max_length=180)
    target_word_count: int = Field(ge=100, le=5_000)
    key_points: list[str] = Field(min_length=2, max_length=6)
    required_sections: list[str] = Field(min_length=2, max_length=8)


class ProjectRenameRequest(BaseModel):
    """A replacement display name for every artefact in a project namespace."""

    name: str = Field(min_length=1, max_length=255)



class ArticleRequirements(BaseModel):
    company: str
    topic: str = Field(min_length=1)
    target_audience: str = Field(min_length=1)
    target_word_count: int = Field(gt=0)
    key_points: list[str]
    required_sections: list[str] = Field(default_factory=list)
    include_table: bool = False
    table_instructions: str | None = Field(default=None, max_length=500)
    include_flowchart: bool = False
    tone_override: str | None = None
    notes: str | None = None
    llm_provider: LLMProvider = "anthropic"
    llm_model: str | None = None


class PlannedSection(BaseModel):
    heading: str
    intent: str
    target_words: int = Field(gt=0)
    key_points_covered: list[str]
    level: int = Field(default=2, ge=1)


class ArticlePlan(BaseModel):
    title: str
    sections: list[PlannedSection] = Field(min_length=1)
    constraint_notes: list[str] = Field(default_factory=list)

    @property
    def target_words(self) -> int:
        return sum(section.target_words for section in self.sections)


class WrittenSection(BaseModel):
    heading: str
    level: int = Field(default=2, ge=1)
    markdown: str


class DraftArticle(BaseModel):
    title: str
    sections: list[WrittenSection]

    @property
    def markdown(self) -> str:
        chunks = [f"# {self.title}"]
        for section in self.sections:
            prefix = "#" * section.level
            chunks.append(f"{prefix} {section.heading}\n\n{section.markdown.strip()}")
        return "\n\n".join(chunks).strip() + "\n"


class Critique(BaseModel):
    strengths: list[str]
    edits: list[str]
    revised_draft: str | None = None


class RevisedSection(BaseModel):
    """A constrained rewrite keeps the feedback loop section-local and auditable."""

    heading: str
    markdown: str


class ScoreDetail(BaseModel):
    score: float = Field(ge=0, le=100)
    justification: str
    improvement: str


class JudgeResult(BaseModel):
    relevance: ScoreDetail
    style_similarity: ScoreDetail
    tone_consistency: ScoreDetail
    completeness: ScoreDetail
    content_quality: ScoreDetail
    strengths: list[str]
    weaknesses: list[str]
    generic_sounding_passages: list[str]


class EvaluationResult(BaseModel):
    overall_score: float = Field(ge=0, le=100)
    dimension_scores: dict[str, float]
    strengths: list[str]
    weaknesses: list[str]
    missing_requirements: list[str]
    generic_sounding_passages: list[str]
    recommendations: list[str]


class RevisionInstruction(BaseModel):
    target: str
    change_type: Literal[
        "rewrite", "expand", "condense", "tone", "add", "remove", "restructure"
    ]
    instruction: str
    source: Literal["human", "evaluator"]
    priority: int = Field(ge=1)


class RevisionInstructions(BaseModel):
    instructions: list[RevisionInstruction]


class FeedbackSubmission(BaseModel):
    run_id: str = Field(min_length=1)
    feedback: str = Field(min_length=1)
    rating: int | None = Field(default=None, ge=1, le=5)


class FeedbackResponse(BaseModel):
    run_id: str
    instructions: list[RevisionInstruction]


class RegenerationRequest(BaseModel):
    instructions: list[RevisionInstruction] = Field(min_length=1)


class RunSummary(BaseModel):
    run_id: str
    total_calls: int
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float
    wall_time_seconds: float
    model_time_seconds: float = 0.0
    failed_calls: int = 0


class CallRecord(BaseModel):
    """One durable LLM-call record, used for run-level cost and latency reporting."""

    run_id: str
    stage: str
    model: str
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    latency_seconds: float = Field(ge=0)
    estimated_cost_usd: float = Field(ge=0)
    success: bool
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AnalysisOutcome(BaseModel):
    """One style-profile build, flattened for cross-run analytics.

    The full ``StyleProfile`` already lives in ``style_profiles``; this is a
    queryable summary alongside it so cost and corpus trends can be read
    without parsing every stored profile's JSON.
    """

    company: str
    source_article_count: int = Field(ge=0)
    vocabulary_size: int = 0
    outlier_count: int = 0
    tone_descriptors: list[str] = Field(default_factory=list)
    total_cost_usd: float = Field(default=0.0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    wall_time_seconds: float = Field(default=0.0, ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GenerationOutcome(BaseModel):
    """One generation run, flattened for cross-run analytics.

    Mirrors what already sits inside ``runs.evaluation_json``; this row exists
    so scores, cost, and revision lineage can be trended and compared across
    runs without parsing that JSON per row.
    """

    run_id: str
    company: str
    parent_run_id: str | None = None
    overall_score: float | None = Field(default=None, ge=0, le=100)
    dimension_scores: dict[str, float] = Field(default_factory=dict)
    section_count: int = 0
    word_count: int = 0
    missing_requirement_count: int = 0
    total_cost_usd: float = Field(default=0.0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    wall_time_seconds: float = Field(default=0.0, ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FeedbackOutcome(BaseModel):
    """One human-feedback cycle, flattened for cross-run analytics.

    Captures the split between human-authored and evaluator-derived
    instructions and how many were ultimately accepted as durable
    preferences, so feedback volume and rating trends are queryable directly.
    """

    run_id: str
    company: str
    rating: int | None = Field(default=None, ge=1, le=5)
    human_instruction_count: int = Field(default=0, ge=0)
    evaluator_instruction_count: int = Field(default=0, ge=0)
    accepted_instruction_count: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AnalyticsReport(BaseModel):
    """Everything stored for a project, assembled for export/sharing."""

    company: str
    analysis_outcomes: list[AnalysisOutcome] = Field(default_factory=list)
    generation_outcomes: list[GenerationOutcome] = Field(default_factory=list)
    feedback_outcomes: list[FeedbackOutcome] = Field(default_factory=list)


class GenerationRun(BaseModel):
    run_id: str
    requirements: ArticleRequirements
    plan: ArticlePlan
    article: DraftArticle
    evaluation: EvaluationResult | None = None
    parent_run_id: str | None = None

    @model_validator(mode="after")
    def ensure_unique_headings(self) -> "GenerationRun":
        headings = [section.heading.casefold() for section in self.article.sections]
        if len(headings) != len(set(headings)):
            raise ValueError("Draft section headings must be unique")
        return self


class RunListItem(BaseModel):
    """One saved run, light enough to list every run a project has without
    shipping every run's full plan and article markdown in the same response."""

    run_id: str
    parent_run_id: str | None = None
    title: str
    topic: str
    target_word_count: int
    word_count: int
    section_count: int
    overall_score: float | None = None
    created_at: datetime
