/**
 * Dev-only fixtures. Enabled with `?mock=1` or VITE_MOCK=1.
 *
 * The profile is copied verbatim from backend/data/profiles/protecto-ai.json; the two runs
 * reproduce examples/before_after.md, including the guarantee that "Map the exposure" and
 * "Build the control plane" are byte-identical between v1 and v2. Two linked runs are
 * required to exercise deltas, revised-section markers and the value-change animations.
 */
import type {
  AnalyticsReport,
  ArticleRequirements,
  GenerationRun,
  ProjectSummary,
  ReferenceRecord,
  RevisionInstruction,
  RunListItem,
  RunSummary,
  StyleProfile,
} from "./types";

export const MOCK_PROFILE: StyleProfile = {
  company: "Protecto AI",
  source_article_count: 3,
  visual_defaults: {
    include_table: true,
    include_flowchart: false,
    table_reference_count: 2,
    flowchart_reference_count: 1,
    source_count: 3,
  },
  structure: {
    typical_section_count: [4, 4],
    typical_word_count: [124, 162],
    heading_style:
      "Short, declarative noun phrases or imperative clauses at H2 only; no rhetorical questions, no clever wordplay, no hype",
    common_section_themes: [
      "Risk or problem framing that names a specific failure mode",
      "Classification, inventory, or mapping of data paths before applying controls",
      "Tokenisation, masking, or access control as the operational privacy mechanism",
      "Reversibility, auditability, and exception handling as maturity indicators",
      "Outcome framing: capability retained alongside exposure reduced",
    ],
    intro_pattern:
      "Opens with a sharp one- or two-sentence problem statement that reframes where real risk sits or names the gap between policy and operational reality; no preamble before the core tension",
    conclusion_pattern:
      "Closes the final section by elevating a technical detail into a broader compliance or business outcome, using a short definitive sentence or a paired capability-plus-gain structure; occasionally replaced by a numbered imperative checklist",
    uses_bullets: false,
    uses_subheadings: false,
  },
  voice: {
    tone_descriptors: ["pragmatic", "precise", "direct", "practitioner-focused", "instructional"],
    person:
      "Third person for organisations and roles; implied second person through imperative verbs (Start, Use, Measure, Choose); no first-person singular",
    sentence_rhythm:
      "Short declarative sentences dominate; occasional two-clause sentences where the first states a rule and the second qualifies or contrasts it; no long compound-complex or periodic constructions; rhythm is clipped and deliberately unhurried",
    technical_depth:
      "Moderate to moderate-high; assumes familiarity with PII, tokenisation, LLM pipelines, classifiers, and audit logs; defines concepts through use rather than formal definition; no code, formulas, or over-explanation of standard terms",
    example_usage:
      "Single concrete operational example embedded mid-paragraph per section; examples are specific and policy-grounded (named roles, time-bounded exceptions, concrete field types) rather than hypothetical or illustrative storytelling",
    evidence_usage:
      "No cited sources, statistics, or external studies; authority derives from logical structure, precise terminology, and realistic operational scenarios",
    signature_moves: [
      "Contrast structure: problem or failure mode stated first, corrective principle follows immediately in the next sentence",
      "Reframes a technical control as a business or compliance outcome in the closing line of a section",
      "Three-part specificity pattern to define maturity (e.g., who / why / how long)",
      "Defines terms through contextual use rather than formal glossary entry",
      "Pairs a capability-retained statement with a risk-reduced statement in the conclusion",
      "Uses 'evidence', 'path', 'control', and 'policy' as recurring structural anchor words across sections",
    ],
    avoid_list: [
      "First-person pronouns (I, we, our)",
      "Marketing language, superlatives, or hype (e.g., 'revolutionary', 'best-in-class')",
      "Hedging qualifiers (e.g., 'might', 'could possibly', 'perhaps')",
      "Passive-voice constructions that obscure the actor",
      "Rhetorical questions in headings or body prose",
      "Fear-based or urgency-driven framing",
      "Named vendors, third-party products, or external statistics",
      "Definitions of standard technical terms the audience already knows",
      "Bullet or numbered lists within flowing prose sections (checklists only in conclusion)",
    ],
  },
  vocabulary: [
    "tokenisation",
    "re-identification",
    "PII",
    "masking",
    "control plane",
    "sensitive fields",
    "classifier",
    "exception path",
    "evidence",
    "audit trail",
    "least privilege",
    "policy service",
    "authorised workflow",
    "inventory",
    "data discovery",
    "exposure",
    "enforcement",
    "repeatable path",
    "service roles",
    "regulated records",
    "downstream traces",
    "prompt assembly",
    "nested JSON payloads",
    "retrieval source",
    "inference",
    "boundary",
    "expiry",
    "purpose",
    "resolution",
    "identifiers",
    "continuous checks",
    "baseline",
    "mature program",
    "operational",
  ],
  formatting_conventions: [
    "H2 headings only — no H3 or deeper nesting observed across any article",
    "Each section is one self-contained paragraph of two to three sentences; sections are roughly equal in length and density",
    "No bullet points within body prose; numbered lists appear only in checklist-style conclusions",
    "No bold, italics, or any inline emphasis within paragraph text",
    "No external hyperlinks embedded in body text",
    "Conclusion given its own headed section (e.g., 'The result') or closed with a numbered imperative checklist",
  ],
  quantitative_baseline: {
    word_count: 143,
    section_count: 4,
    max_heading_depth: 2,
    avg_words_per_sentence: 12.85,
    avg_words_per_paragraph: 20.5,
    avg_paragraphs_per_section: 1.47,
    bullet_list_count: 0,
    numbered_list_count: 0,
    external_link_count: 0,
    numeric_stat_count: 0,
    flesch_reading_ease: 37.34,
    gunning_fog: 15.19,
    intro_word_count: 4,
    conclusion_word_count: 26,
  },
  quantitative_stddev: {
    word_count: 18.8326,
    section_count: 0.0,
    max_heading_depth: 0.0,
    avg_words_per_sentence: 2.7211,
    avg_words_per_paragraph: 3.8219,
    avg_paragraphs_per_section: 0.411,
    bullet_list_count: 0.0,
    numbered_list_count: 0.0,
    external_link_count: 0.0,
    numeric_stat_count: 0.0,
    flesch_reading_ease: 7.737,
    gunning_fog: 1.5164,
    intro_word_count: 0.0,
    conclusion_word_count: 2.1602,
  },
  generated_at: "2025-07-14T00:00:00Z",
  outliers: [
    "tokenisation-control-plane-ai-privacy uses a numbered imperative checklist as its conclusion rather than the prose outcome statement used in the other two articles — the only instance of a numbered list in the corpus",
    "tokenisation-control-plane-ai-privacy reaches moderate-to-high technical depth (references JSON payloads, service roles, classifiers by name) compared to the moderate depth of the other two articles",
    "keeping-pii-out-of-llm-workflows uses a labelled conclusion section ('The result') as a distinct heading, while the other articles close within a thematically named final section without a generic label",
  ],
};

export const MOCK_RUNS: Record<string, GenerationRun> = {
  "run-v1-0001": {
    run_id: "run-v1-0001",
    parent_run_id: null,
    requirements: {
      company: "Protecto AI",
      topic: "Reducing PII exposure in AI support copilots",
      target_audience: "Security and privacy leaders",
      target_word_count: 420,
      key_points: [
        "Map PII before it reaches the model",
        "Tokenise sensitive identifiers at the application boundary",
        "Keep the re-identification path under policy control",
      ],
      required_sections: ["Map the exposure", "Build the control plane"],
      include_table: true,
      include_flowchart: true,
      tone_override: null,
      llm_provider: "openai",
      llm_model: null,
      notes:
        "Approved scenario: an address change request contains a name, phone number, and account number.",
    },
    plan: {
      title: "Treat the boundary as the control",
      sections: [
        {
          heading: "Why support copilots need a privacy boundary",
          intent: "Establish that speed is not a control and name the fields at risk.",
          target_words: 110,
          key_points_covered: ["Map PII before it reaches the model"],
          level: 2,
        },
        {
          heading: "Map the exposure",
          intent: "Give the reader a concrete inventory procedure for the request path.",
          target_words: 105,
          key_points_covered: ["Map PII before it reaches the model"],
          level: 2,
        },
        {
          heading: "Build the control plane",
          intent: "Explain tokenisation at the application boundary.",
          target_words: 100,
          key_points_covered: ["Tokenise sensitive identifiers at the application boundary"],
          level: 2,
        },
        {
          heading: "The operating model",
          intent: "Assign ownership of the re-identification path.",
          target_words: 105,
          key_points_covered: ["Keep the re-identification path under policy control"],
          level: 2,
        },
      ],
      constraint_notes: [
        "Requested length 420 words sits above the corpus range of 124–162 words; the plan targets the low end of the request and keeps sections short.",
        "Profile allows 4–4 sections; the plan uses exactly 4.",
      ],
    },
    article: {
      title: "Treat the boundary as the control",
      sections: [
        {
          heading: "Why support copilots need a privacy boundary",
          level: 2,
          markdown:
            "AI support copilots can make ordinary service work faster, but speed is not a control. An address-change request can contain a name, phone number, and account number in one short message. If that message reaches a model unchanged, the organization has already expanded the system that can see personal data.\n\nThe useful question is not whether the copilot is helpful. It is which fields it needs to complete the task and which fields it does not. That distinction gives privacy teams something they can govern.",
        },
        {
          heading: "Map the exposure",
          level: 2,
          markdown:
            "Start with the request path. Record where the message enters, where it is classified, what is sent to the model, and where the resulting answer is stored. The map should include logs, analytics tools, and evaluation datasets—not only the production prompt.\n\nA field-level map makes policy review concrete. It also makes it possible to test whether a change to the copilot introduced a new route for sensitive data.",
        },
        {
          heading: "Build the control plane",
          level: 2,
          markdown:
            "Tokenisation can replace a customer account number with a stable reference before the prompt is assembled. The application can retrieve the real value only where a policy permits it. The model remains useful because it can reason about the request and the reference without receiving the identifier itself.",
        },
        {
          heading: "The operating model",
          level: 2,
          markdown:
            "A privacy boundary needs ownership. Product, security, and support teams should agree on the approved fields, the exception path, and the evidence retained for review. Without that operating model, controls become implementation details that disappear in the next integration.",
        },
      ],
    },
    evaluation: {
      overall_score: 80.6,
      dimension_scores: {
        structure: 92.0,
        readability: 74.0,
        computed_fit: 72.5,
        embedding_style_fit: 66.0,
        style: 70.0,
        relevance: 82.0,
        tone_consistency: 78.0,
        completeness: 88.0,
        content_quality: 76.0,
      },
      strengths: [
        "Clear control sequence from exposure to enforcement.",
        "Both required sections are present and correctly ordered.",
      ],
      weaknesses: [
        "The opening explains the risk but starts abstractly.",
        "The operating model section is generic about accountability.",
      ],
      missing_requirements: [],
      generic_sounding_passages: ["A privacy boundary needs ownership."],
      recommendations: [
        "Open on the approved address-change scenario rather than a general claim about speed.",
        "Match the corpus habit of naming the artefact that records a decision.",
        "Hold the instructional register through the closing section.",
        "State who approves re-identification, not just that ownership is needed.",
        "Replace governance abstractions with the concrete fields under control.",
      ],
    },
  },
  "run-v2-0002": {
    run_id: "run-v2-0002",
    parent_run_id: "run-v1-0001",
    requirements: {
      company: "Protecto AI",
      topic: "Reducing PII exposure in AI support copilots",
      target_audience: "Security and privacy leaders",
      target_word_count: 420,
      key_points: [
        "Map PII before it reaches the model",
        "Tokenise sensitive identifiers at the application boundary",
        "Keep the re-identification path under policy control",
      ],
      required_sections: ["Map the exposure", "Build the control plane"],
      include_table: true,
      include_flowchart: true,
      tone_override: null,
      llm_provider: "openai",
      llm_model: null,
      notes:
        "Approved scenario: an address change request contains a name, phone number, and account number.",
    },
    plan: {
      title: "Treat the boundary as the control",
      sections: [
        {
          heading: "Why support copilots need a privacy boundary",
          intent: "Establish that speed is not a control and name the fields at risk.",
          target_words: 110,
          key_points_covered: ["Map PII before it reaches the model"],
          level: 2,
        },
        {
          heading: "Map the exposure",
          intent: "Give the reader a concrete inventory procedure for the request path.",
          target_words: 105,
          key_points_covered: ["Map PII before it reaches the model"],
          level: 2,
        },
        {
          heading: "Build the control plane",
          intent: "Explain tokenisation at the application boundary.",
          target_words: 100,
          key_points_covered: ["Tokenise sensitive identifiers at the application boundary"],
          level: 2,
        },
        {
          heading: "The operating model",
          intent: "Assign ownership of the re-identification path.",
          target_words: 105,
          key_points_covered: ["Keep the re-identification path under policy control"],
          level: 2,
        },
      ],
      constraint_notes: [
        "Requested length 420 words sits above the corpus range of 124–162 words; the plan targets the low end of the request and keeps sections short.",
        "Profile allows 4–4 sections; the plan uses exactly 4.",
      ],
    },
    article: {
      title: "Treat the boundary as the control",
      sections: [
        {
          heading: "Why support copilots need a privacy boundary",
          level: 2,
          markdown:
            "A customer asks support to change an address and includes their name, phone number, and account number in the same message. If a copilot sends that message to a model unchanged, three identifiers cross the boundary before anyone has decided whether the task needs them.\n\nTokenisation changes that decision point. The application can replace the account number with a stable reference, retain the identifying fields in the approved system of record, and give the model only the task context it needs to draft a useful response.",
        },
        {
          heading: "Map the exposure",
          level: 2,
          markdown:
            "Start with the request path. Record where the message enters, where it is classified, what is sent to the model, and where the resulting answer is stored. The map should include logs, analytics tools, and evaluation datasets—not only the production prompt.\n\nA field-level map makes policy review concrete. It also makes it possible to test whether a change to the copilot introduced a new route for sensitive data.",
        },
        {
          heading: "Build the control plane",
          level: 2,
          markdown:
            "Tokenisation can replace a customer account number with a stable reference before the prompt is assembled. The application can retrieve the real value only where a policy permits it. The model remains useful because it can reason about the request and the reference without receiving the identifier itself.",
        },
        {
          heading: "The operating model",
          level: 2,
          markdown:
            "The privacy owner approves the fields that can be re-identified and names the service role allowed to request it. Each exception records the request purpose, approver, reference token, and retention period in the review log. Product teams can then change the copilot without quietly turning a one-time exception into a default data path.",
        },
      ],
    },
    evaluation: {
      overall_score: 85.5,
      dimension_scores: {
        structure: 92.0,
        readability: 76.0,
        computed_fit: 74.0,
        embedding_style_fit: 71.5,
        style: 78.0,
        relevance: 88.0,
        tone_consistency: 83.0,
        completeness: 91.0,
        content_quality: 85.0,
      },
      strengths: [
        "Opens on the approved scenario with the three identifiers named.",
        "The re-identification path now has a named approver and a review record.",
        "Both required sections remain intact and byte-identical.",
      ],
      weaknesses: ["The closing section could still state a review cadence."],
      missing_requirements: [],
      generic_sounding_passages: [],
      recommendations: [
        "Name the review cadence for the exception log.",
        "Keep the sentence rhythm tighter in the control-plane section.",
      ],
    },
  },
};

export const MOCK_INSTRUCTIONS: RevisionInstruction[] = [
  {
    target: "__intro__",
    change_type: "rewrite",
    instruction:
      "Open with the approved address-change scenario, then explain that tokenisation keeps the name, phone number, and account number outside the model boundary.",
    source: "human",
    priority: 1,
  },
  {
    target: "The operating model",
    change_type: "expand",
    instruction:
      "Name the accountable approver for re-identification and state how exceptions are recorded for review.",
    source: "human",
    priority: 2,
  },
  {
    target: "__global__",
    change_type: "tone",
    instruction: "Replace generic governance language with concrete operating responsibilities.",
    source: "evaluator",
    priority: 4,
  },
];

export const MOCK_SUMMARIES: Record<string, RunSummary> = {
  "run-v1-0001": {
    run_id: "run-v1-0001",
    total_calls: 8,
    input_tokens: 24180,
    output_tokens: 5642,
    estimated_cost_usd: 0.15717,
    wall_time_seconds: 41.83,
  },
  "run-v2-0002": {
    run_id: "run-v2-0002",
    total_calls: 4,
    input_tokens: 11305,
    output_tokens: 2118,
    estimated_cost_usd: 0.065685,
    wall_time_seconds: 18.44,
  },
};

export const MOCK_REQUIREMENTS: ArticleRequirements = {
  company: "Protecto AI",
  topic: "Reducing PII exposure in AI support copilots",
  target_audience: "Security and privacy leaders",
  target_word_count: 420,
  key_points: [
    "Map PII before it reaches the model",
    "Tokenise sensitive identifiers at the application boundary",
    "Keep the re-identification path under policy control",
  ],
  required_sections: ["Map the exposure", "Build the control plane"],
  include_table: true,
  include_flowchart: true,
  tone_override: null,
  llm_provider: "openai",
  llm_model: null,
  notes:
    "Approved scenario: an address change request contains a name, phone number, and account number.",
};

export const MOCK_ROOT_RUN_ID = "run-v1-0001";
export const MOCK_CHILD_RUN_ID = "run-v2-0002";

/** Mirrors the seven documents the reference corpus shipped with. */
const reference = (
  project: string,
  slug: string,
  [filename, words, sections]: [string, number, number],
  index: number,
): ReferenceRecord => ({
  key: `references/${slug}/${filename.replaceAll(" ", "_")}`,
  filename,
  company: project,
  size_bytes: 24_000 + index * 3_100,
  content_hash: `mock-${slug}-${index}`,
  title: filename.replace(/\.docx$/i, ""),
  word_count: words,
  section_count: sections,
  parse_error: null,
  uploaded_at: new Date(Date.now() - index * 86_400_000).toISOString(),
});

/**
 * Two projects, not one. The offline fixtures are the only way the project
 * switcher gets exercised without a database, so a single-project corpus would
 * leave the switching path unrepresented.
 */
export const MOCK_REFERENCES: ReferenceRecord[] = [
  ...(
    [
      ["What is Data Masking.docx", 1_480, 6],
      ["What Is Format-Preserving Encryption (FPE).docx", 1_210, 5],
      ["What is Prompt Injection Attack.docx", 1_640, 7],
      ["How to Implement Zero Trust.docx", 1_920, 8],
      ["AI Data Governance Framework_ A Step-by-Step Implementation Guide.docx", 2_310, 9],
      ["7 Generative AI Security Risks and How to Defend Your Organization.docx", 2_050, 8],
      ["IdeationTechnicalFormat.docx", 860, 4],
    ] as [string, number, number][]
  ).map((row, index) => reference("Protecto AI", "protecto-ai", row, index)),
  ...(
    [
      ["Observability for Payment Rails.docx", 1_720, 7],
      ["Designing an Idempotent Ledger.docx", 2_140, 8],
      ["What Merchants Ask Before Switching PSP.docx", 1_360, 6],
    ] as [string, number, number][]
  ).map((row, index) => reference("Northwind Payments", "northwind-payments", row, index)),
];

/**
 * Mirrors what the backend derives from the reference, profile and run tables.
 * Only the first project has a cached profile, so the "generation is blocked
 * until a profile exists" state is reachable by switching to the second.
 */
/**
 * Derived from the fixtures above rather than hand-authored again: the profile
 * build, the two linked runs and the feedback cycle between them are what the
 * live backend would have written as outcome rows for the same activity.
 */
export const MOCK_ANALYTICS: AnalyticsReport = {
  company: "Protecto AI",
  analysis_outcomes: [
    {
      company: "Protecto AI",
      source_article_count: MOCK_PROFILE.source_article_count,
      vocabulary_size: MOCK_PROFILE.vocabulary.length,
      outlier_count: MOCK_PROFILE.outliers.length,
      tone_descriptors: MOCK_PROFILE.voice.tone_descriptors,
      total_cost_usd: 0.0842,
      total_tokens: 18_420,
      wall_time_seconds: 26.4,
      created_at: MOCK_PROFILE.generated_at,
    },
  ],
  generation_outcomes: [
    {
      run_id: "run-v1-0001",
      company: "Protecto AI",
      parent_run_id: null,
      overall_score: 80.6,
      dimension_scores: MOCK_RUNS["run-v1-0001"].evaluation!.dimension_scores,
      section_count: MOCK_RUNS["run-v1-0001"].article.sections.length,
      word_count: MOCK_RUNS["run-v1-0001"].article.sections.reduce(
        (total, section) => total + section.markdown.trim().split(/\s+/).length,
        0,
      ),
      missing_requirement_count: MOCK_RUNS["run-v1-0001"].evaluation!.missing_requirements.length,
      total_cost_usd: MOCK_SUMMARIES["run-v1-0001"].estimated_cost_usd,
      total_tokens:
        MOCK_SUMMARIES["run-v1-0001"].input_tokens + MOCK_SUMMARIES["run-v1-0001"].output_tokens,
      wall_time_seconds: MOCK_SUMMARIES["run-v1-0001"].wall_time_seconds,
      created_at: new Date(Date.now() - 3_600_000).toISOString(),
    },
    {
      run_id: "run-v2-0002",
      company: "Protecto AI",
      parent_run_id: "run-v1-0001",
      overall_score: 85.5,
      dimension_scores: MOCK_RUNS["run-v2-0002"].evaluation!.dimension_scores,
      section_count: MOCK_RUNS["run-v2-0002"].article.sections.length,
      word_count: MOCK_RUNS["run-v2-0002"].article.sections.reduce(
        (total, section) => total + section.markdown.trim().split(/\s+/).length,
        0,
      ),
      missing_requirement_count: MOCK_RUNS["run-v2-0002"].evaluation!.missing_requirements.length,
      total_cost_usd: MOCK_SUMMARIES["run-v2-0002"].estimated_cost_usd,
      total_tokens:
        MOCK_SUMMARIES["run-v2-0002"].input_tokens + MOCK_SUMMARIES["run-v2-0002"].output_tokens,
      wall_time_seconds: MOCK_SUMMARIES["run-v2-0002"].wall_time_seconds,
      created_at: new Date(Date.now() - 1_800_000).toISOString(),
    },
  ],
  feedback_outcomes: [
    {
      run_id: "run-v1-0001",
      company: "Protecto AI",
      rating: 4,
      human_instruction_count: MOCK_INSTRUCTIONS.filter((item) => item.source === "human").length,
      evaluator_instruction_count: MOCK_INSTRUCTIONS.filter((item) => item.source === "evaluator")
        .length,
      accepted_instruction_count: MOCK_INSTRUCTIONS.filter((item) => item.source === "human")
        .length,
      created_at: new Date(Date.now() - 2_700_000).toISOString(),
    },
  ],
};

/** The content library's listing, newest first — a run's title/topic without its full markdown. */
export const MOCK_RUN_LIST: RunListItem[] = [MOCK_CHILD_RUN_ID, MOCK_ROOT_RUN_ID].map(
  (runId, index) => {
    const run = MOCK_RUNS[runId];
    const wordCount = run.article.sections.reduce(
      (total, section) => total + section.markdown.trim().split(/\s+/).length,
      0,
    );
    return {
      run_id: run.run_id,
      parent_run_id: run.parent_run_id,
      title: run.article.title,
      topic: run.requirements.topic,
      target_word_count: run.requirements.target_word_count,
      word_count: wordCount,
      section_count: run.article.sections.length,
      overall_score: run.evaluation?.overall_score ?? null,
      created_at: new Date(Date.now() - (index === 0 ? 1_800_000 : 3_600_000)).toISOString(),
    };
  },
);

export const MOCK_PROJECTS: ProjectSummary[] = ["Protecto AI", "Northwind Payments"].map(
  (company, index) => {
    const owned = MOCK_REFERENCES.filter((item) => item.company === company);
    return {
      company,
      reference_count: owned.length,
      document_word_count: owned.reduce((total, item) => total + (item.word_count ?? 0), 0),
      has_profile: index === 0,
      profile_source_count: index === 0 ? 3 : 0,
      profile_updated_at: index === 0 ? new Date(Date.now() - 86_400_000).toISOString() : null,
      run_count: index === 0 ? 2 : 0,
      last_run_at: index === 0 ? new Date(Date.now() - 3_600_000).toISOString() : null,
    };
  },
);
