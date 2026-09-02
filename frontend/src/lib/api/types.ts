/**
 * Mirrors backend/app/models.py.
 *
 * `DraftArticle.markdown` is assembled client-side because the backend exposes the
 * section data as the serialized contract.
 */

export type TextMetrics = {
  word_count: number;
  section_count: number;
  max_heading_depth: number;
  avg_words_per_sentence: number;
  avg_words_per_paragraph: number;
  avg_paragraphs_per_section: number;
  bullet_list_count: number;
  numbered_list_count: number;
  external_link_count: number;
  numeric_stat_count: number;
  flesch_reading_ease: number;
  gunning_fog: number;
  intro_word_count: number;
  conclusion_word_count: number;
};

export type StructurePattern = {
  typical_section_count: [number, number];
  typical_word_count: [number, number];
  heading_style: string;
  common_section_themes: string[];
  intro_pattern: string;
  conclusion_pattern: string;
  uses_bullets: boolean;
  uses_subheadings: boolean;
};

export type VoicePattern = {
  tone_descriptors: string[];
  person: string;
  sentence_rhythm: string;
  technical_depth: string;
  example_usage: string;
  evidence_usage: string;
  signature_moves: string[];
  avoid_list: string[];
};

export type StyleProfile = {
  company: string;
  source_article_count: number;
  structure: StructurePattern;
  voice: VoicePattern;
  vocabulary: string[];
  formatting_conventions: string[];
  quantitative_baseline: TextMetrics;
  quantitative_stddev: Partial<Record<keyof TextMetrics, number>>;
  generated_at: string;
  outliers: string[];
};

/**
 * A project is not a stored entity: it is the `company` value that reference
 * documents, the style profile, learned preferences and runs are all keyed by.
 * The backend assembles this summary from those tables so the UI can list and
 * switch between projects.
 */
export type ProjectSummary = {
  company: string;
  reference_count: number;
  document_word_count: number;
  has_profile: boolean;
  profile_source_count: number;
  profile_updated_at: string | null;
  run_count: number;
  last_run_at: string | null;
};

export type LLMProvider = "anthropic" | "openai" | "google";

export type TopicSuggestion = {
  topic: string;
};

export type ArticleRequirements = {
  company: string;
  topic: string;
  target_audience: string;
  target_word_count: number;
  key_points: string[];
  required_sections: string[];
  include_table: boolean;
  include_flowchart: boolean;
  tone_override?: string | null;
  notes?: string | null;
  llm_provider: LLMProvider;
  llm_model?: string | null;
};

export type PlannedSection = {
  heading: string;
  intent: string;
  target_words: number;
  key_points_covered: string[];
  level: number;
};

export type ArticlePlan = {
  title: string;
  sections: PlannedSection[];
  constraint_notes: string[];
};

export type WrittenSection = {
  heading: string;
  level: number;
  /** Body prose only — the heading is NOT repeated inside this string. */
  markdown: string;
};

export type DraftArticle = {
  title: string;
  sections: WrittenSection[];
};

export type EvaluationResult = {
  overall_score: number;
  dimension_scores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  missing_requirements: string[];
  generic_sounding_passages: string[];
  /**
   * Emitted in judge-dimension order but then filtered for empty strings, so the index
   * is NOT a reliable mapping back to a dimension. Never label these by dimension.
   */
  recommendations: string[];
};

export type GenerationRun = {
  run_id: string;
  parent_run_id: string | null;
  requirements: ArticleRequirements;
  plan: ArticlePlan;
  article: DraftArticle;
  evaluation: EvaluationResult | null;
};

export type ChangeType =
  "rewrite" | "expand" | "condense" | "tone" | "add" | "remove" | "restructure";

export type RevisionInstruction = {
  /** "__global__" | "__intro__" | an exact section heading. */
  target: string;
  change_type: ChangeType;
  instruction: string;
  source: "human" | "evaluator";
  priority: number;
};

export type RunSummary = {
  run_id: string;
  total_calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  /** Sum of per-call latencies, not true wall clock. */
  wall_time_seconds: number;
};

/**
 * A reference document: the bytes live in Cloudflare R2, this row lives in
 * PostgreSQL. `key` is the R2 object key and the stable identifier the ingest
 * UI selects by.
 */
export type ReferenceRecord = {
  key: string;
  filename: string;
  company: string;
  size_bytes: number;
  content_hash: string;
  title: string | null;
  word_count: number | null;
  section_count: number | null;
  parse_error: string | null;
  uploaded_at: string | null;
};

export type CrawlResult = {
  job_id: string;
  stored: ReferenceRecord[];
};
