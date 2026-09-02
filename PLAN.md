# PLAN.md — VRYSE Blog Writing System

Build guide for Codex. Work through phases in order. Do not start a phase
until the previous phase's acceptance criteria pass.

---

## 0. Context

We are building an AI content generation system for a take-home assessment.
Reference material: human-written blog articles from **Protecto AI** (an AI data
privacy / PII-protection company), supplied as `.docx` files.

The system must:

1. Analyse reference articles and extract a reusable **style profile**
2. Generate a new article from user requirements + that profile
3. Evaluate the output with quantitative + qualitative signals
4. Accept human feedback, regenerate, and show measurable improvement

**The grading weight is on stages 1 and 3, and on the feedback loop.** A great
article from a single fat prompt scores badly. A mediocre article produced by a
well-instrumented pipeline scores well. Optimise accordingly.

**Hard rule:** raw reference documents must never be dumped into the generation
prompt. Only the derived style profile and short retrieved excerpts may flow
forward. This is explicitly called out in the brief.

---

## Current implementation status (2026-08-31)

The repository is a substantial scaffold, but it is not yet a complete,
demonstrable implementation. The original layout in this document uses `src/`;
the implementation uses the equivalent `backend/app/` package and a separate
`frontend/` package.

| Phase | Status | Evidence / remaining gap |
| --- | --- | --- |
| 1. Ingestion + metrics | Implemented, not acceptance-tested | `backend/app/ingest.py` and `metrics.py` exist and compile. The load check currently returns `0` because no `.docx` files are in `backend/data/reference/`. |
| 2. Style analysis | Implemented, blocked by inputs | `backend/app/analyze.py` has per-article plus synthesis calls, profile caching, and structured models. Live `N + 1` call count and profile quality need references and an API key. |
| 3. Retrieval | Implemented | `backend/app/retrieve.py` provides cached embeddings, cosine retrieval, company filtering, and skeleton-only results. A real corpus run is still needed. |
| 4. Generation | Implemented | `backend/app/generate.py` has planner, section writer, self-critique, and targeted rewrite logic. Live word/section acceptance checks are outstanding. |
| 5. Evaluation | Implemented, not sanity-tested | `backend/app/evaluate.py` has deterministic, computed, and LLM-judge scoring. Reference `>80`, off-topic `<40`, and reproducibility checks need fixtures and a live judge call. |
| 6. Feedback loop | Implemented, live acceptance pending | Feedback transformation, persistence, `POST /api/feedback`, targeted regeneration, parent-run linkage, and `POST /api/runs/{run_id}/regenerate` are wired. A live score delta and database-backed cycle still need inputs. |
| 7. React UI | Implemented, browser acceptance pending | Profile inspection, download, detailed findings, feedback/rating, instruction preview, regeneration, telemetry, and revision delta views are wired. A browser cycle still needs a running backend and live inputs. |
| 8. Observability | Implemented, browser acceptance pending | Call records, `summarize_run()`, `GET /api/runs/{run_id}/summary`, and a telemetry panel are wired. Database execution remains environment-dependent. |
| 9. Documentation + example | Mostly present, live evidence missing | `README.md` and `examples/before_after.md` exist; the example is explicitly a fixture, not a captured run. |

### Completion estimate

By code coverage, the project is approximately **95% complete**: all planned
phases are now wired, with live-input and browser acceptance still outstanding.
By acceptance criteria, it is **not yet complete** because the reference corpus
is empty and no end-to-end cycle has been demonstrated. This
percentage is a planning estimate, not a test score.

### Evidence gathered

- `backend/.venv/bin/python -m compileall -q app scripts` passes.
- `from app.ingest import load_all; print(len(load_all()))` prints `0`.
- In `frontend/`, `bun run lint` and `bun run build` pass.
- Focused project-owned backend contract tests now pass (`3/3`).
- Playwright smoke test passes for the rendered UI shell and primary controls.
- Aerich parent-run migration was generated successfully; applying it requires
  the configured PostgreSQL service.
- Three mock Protecto-style `.docx` references are now present locally, the
  profile build completed with 4 LLM calls, and `scripts.run_mock_cycle` completed
  a persisted generate/evaluate/feedback/regenerate cycle. Its observed score
  delta was `-5.83`, which is retained as an honest regression fixture.
- The backend requires `ANTHROPIC_API_KEY` and `DATABASE_URL` for live profile,
  generation, evaluation, and persistence runs.

## Remaining setup and completion plan

Execute these steps in order. Do not call the project complete until the
acceptance checks at the end of each step have evidence.

### A. Supply runnable inputs and verify the existing backend

1. Put the supplied Protecto AI `.docx` files in `backend/data/reference/` and
   confirm they remain ignored by Git. Do not commit source documents or
   secrets.
2. Copy `backend/.env.example` to `backend/.env`, set `ANTHROPIC_API_KEY`, and
   set a reachable PostgreSQL `DATABASE_URL`.
3. Run the migration, then run ingestion and inspect parsed titles, sections,
   and non-zero metrics. Add local tests for a normal document, a no-heading
   document, and a document containing an image/table.
4. Run `uv run --directory backend python -m scripts.build_profile` and record
   the source count, valid JSON profile, `N + 1` call count, non-empty
   `avoid_list`, and Protecto-domain vocabulary. Only then mark Phases 1–2
   acceptance criteria complete.

### B. Prove retrieval, generation, and evaluation

1. Build the reference index and verify the embedding cache is reused and
   retrieved results contain only title, headings, and intro.
2. Run one generation inside the profile range and one outside it. Confirm the
   UI/API reports the length conflict, output stays within ±15% when possible,
   headings are present, and no placeholders or meta-commentary leak out.
3. Add deterministic tests for rule/computed scoring, required-section fuzzy
   matching, list usage, zero standard deviation, and no-index fallback.
4. Run the evaluator against a real reference-derived article and deliberately
   off-topic text; capture the required `>80` and `<40` sanity results.

### C. Finish the feedback loop before UI polish

1. Add an endpoint accepting `run_id`, raw feedback, optional rating, and the
   current draft/evaluation. It must call `process_feedback()`, persist raw
   feedback and human instructions, and return merged instructions.
2. Add a regeneration endpoint using those instructions and the original run.
   Rewrite only targeted sections, preserve untouched Markdown byte-for-byte,
   persist the child run linked to its parent, and re-evaluate it.
3. Add tests for the intro scenario, human-priority ordering, deduplication,
   learned preferences, untouched-section identity, and honest regressions.

### D. Complete the demonstration UI

1. Show each backend stage: profiling, planning, section writing, critique,
   evaluation, feedback transformation, and regeneration.
2. Add profile JSON/details, article download, full evaluation findings, quoted
   generic passages, feedback text, rating, and instruction preview.
3. Add regenerate, side-by-side/diff comparison, and a score-delta table.
4. Add a run-summary panel backed by an API route for `summarize_run()` showing
   calls, input/output tokens, estimated cost, and wall time.
5. Re-run `bun run lint`, `bun run build`, and complete one browser cycle against
   the configured backend. Without a browser/session or live inputs, report the
   UI criteria as unverified rather than passed.

### E. Final evidence package

1. Replace the fixture-only claims in `examples/before_after.md` with one
   captured run: requirements, scores, transformed instructions, and diff.
2. Update README setup commands if endpoint or environment behavior changes.
3. Add focused backend tests and document which checks require an API key,
   PostgreSQL, source documents, or a browser session.
4. Re-run static checks, the backend test suite, frontend lint/build, and
   `git diff --check` from the actual Git repository once one is available.

### Definition of done

- A real reference corpus produces a cached, inspected profile.
- One complete generate → evaluate → feedback → regenerate cycle is persisted.
- The revised article has a visible score delta and auditable instructions;
  regressions remain visible.
- Untargeted sections are byte-identical after revision.
- The UI exposes profile, stages, article, evaluation, feedback, comparison, and
  observability summary.
- README and `examples/before_after.md` evidence the same behavior.

---

## 1. Tech stack

Fixed — do not substitute without asking.

| Concern | Choice | Why |
| --- | --- | --- |
| Language | Python 3.11+ | Best doc-parsing + NLP ecosystem |
| LLM | Anthropic API (`claude-sonnet-4-6`) | Strong structured output |
| Structured output | Pydantic v2 models | Validation, self-documenting schema |
| Doc parsing | `python-docx` | Preserves heading levels and styles |
| Readability | `textstat` | Flesch, Gunning Fog, etc. |
| Embeddings | `sentence-transformers` (`all-MiniLM-L6-v2`) | Local, free, no vector DB needed |
| Vector store | numpy cosine over a pickled matrix | ~20 docs; a real vector DB is overkill and looks like over-engineering |
| Storage | PostgreSQL via Tortoise ORM | Managed, deployable persistence for runs and feedback |
| UI | Bun + Vite React | Separate, production-ready frontend |
| Config | `python-dotenv` | `ANTHROPIC_API_KEY` |

Note the deliberate omissions in the README: no LangChain, no Pinecone, no
FastAPI. Justify each as scope discipline, not ignorance.

---

## 2. Repository layout

```
vryse-blog-system/
├── README.md
├── PLAN.md
├── pyproject.toml
├── uv.lock
├── .env.example
├── data/
│   ├── reference/            # input .docx files (gitignored contents)
│   ├── profiles/             # generated style profiles as JSON
├── examples/
│   └── before_after.md       # deliverable #6
├── src/
│   ├── __init__.py
│   ├── config.py
│   ├── llm.py                # Anthropic wrapper: retries, token accounting
│   ├── models.py             # ALL Pydantic schemas
│   ├── ingest.py             # .docx -> ParsedArticle
│   ├── metrics.py            # deterministic text statistics
│   ├── analyze.py            # ParsedArticle[] -> StyleProfile
│   ├── retrieve.py           # embeddings + top-k reference selection
│   ├── generate.py           # plan -> draft -> self-critique
│   ├── evaluate.py           # rule + computed + LLM judge -> EvaluationResult
│   ├── feedback.py           # raw feedback -> RevisionInstruction[]
│   ├── store.py              # Tortoise/PostgreSQL persistence
│   └── observability.py      # call log: latency, tokens, cost
├── app/main.py               # FastAPI entrypoint
└── scripts/
    └── build_profile.py      # CLI: ingest + analyse + cache profile
```

---

## 3. Phase 1 — Ingestion and deterministic metrics

### 3.1 `src/models.py` (start here)

Define every schema up front. Downstream phases import from this file only.

```python
class Section(BaseModel):
    heading: str
    level: int              # 1 = H1, 2 = H2, ...
    paragraphs: list[str]
    word_count: int

class ParsedArticle(BaseModel):
    filename: str
    title: str
    sections: list[Section]
    full_text: str
    company: str = "Protecto AI"

class TextMetrics(BaseModel):
    word_count: int
    section_count: int
    max_heading_depth: int
    avg_words_per_sentence: float
    avg_words_per_paragraph: float
    avg_paragraphs_per_section: float
    bullet_list_count: int
    numbered_list_count: int
    external_link_count: int
    numeric_stat_count: int      # regex: percentages, "$1.2M", "3x", years
    flesch_reading_ease: float
    gunning_fog: float
    intro_word_count: int
    conclusion_word_count: int
```

### 3.2 `src/ingest.py`

- Walk `data/reference/*.docx`
- Use `python-docx`; map `paragraph.style.name` — `Heading 1`/`Heading 2`/`Title`
  become section boundaries, `List Bullet`/`List Number` are tracked separately
- Text before the first heading is the intro; assign it a synthetic
  `heading="__intro__"`, `level=0`
- Skip empty paragraphs; strip whitespace
- If a file has no headings at all, fall back to a single section — log a warning,
  do not crash

### 3.3 `src/metrics.py`

Pure functions, no LLM calls, fully unit-testable.

- Sentence split: `re.split(r'(?<=[.!?])\s+', text)` — good enough, note it as a
  limitation in the README
- `numeric_stat_count`: regex for `\d+%`, `\$[\d,.]+[KMB]?`, `\d+x`, `\b(19|20)\d{2}\b`
- Conclusion = last section whose heading matches
  `conclusion|final|wrap|takeaway|summary`, else last section

**Acceptance criteria for Phase 1**

- [ ] `python -c "from src.ingest import load_all; print(len(load_all()))"` prints
      the correct file count
- [ ] Printing metrics for each article gives plausible, non-zero values
- [ ] No crash on a `.docx` with images, tables, or no headings

---

## 4. Phase 2 — Style analysis

The centrepiece. Two independent tracks that merge into one profile.

### 4.1 Schema

```python
class StructurePattern(BaseModel):
    typical_section_count: tuple[int, int]     # (min, max) observed
    typical_word_count: tuple[int, int]
    heading_style: str          # e.g. "sentence case, question-led, no numbering"
    common_section_themes: list[str]
    intro_pattern: str          # how articles open, 1-2 sentences
    conclusion_pattern: str
    uses_bullets: bool
    uses_subheadings: bool

class VoicePattern(BaseModel):
    tone_descriptors: list[str]        # 3-5, e.g. "authoritative", "practitioner-facing"
    person: str                        # "second person", "first person plural"
    sentence_rhythm: str
    technical_depth: str               # "assumes familiarity with X, explains Y"
    example_usage: str
    evidence_usage: str                # how stats/citations appear
    signature_moves: list[str]         # recurring rhetorical habits
    avoid_list: list[str]              # what these articles never do

class StyleProfile(BaseModel):
    company: str
    source_article_count: int
    structure: StructurePattern
    voice: VoicePattern
    vocabulary: list[str]              # 15-25 recurring domain terms
    formatting_conventions: list[str]
    quantitative_baseline: TextMetrics # aggregated MEAN across corpus
    quantitative_stddev: dict[str, float]
    generated_at: datetime
```

### 4.2 `src/analyze.py`

**Track A — quantitative.** Mean and stddev of every `TextMetrics` field across
the corpus. No LLM. These become the tolerance bands the evaluator scores against.

**Track B — qualitative.** Two-step, not one:

1. **Per-article extraction.** For each article, one LLM call returning a compact
   observation object. Send only headings + the first 150 words of each section,
   never the whole document. Keeps context small and parallelisable.
2. **Synthesis.** One LLM call taking all per-article observations (plus the
   Track A numbers, so the model can reference real figures) and emitting the
   final `StyleProfile`. Prompt it to report only patterns appearing in a
   majority of articles, and to name the outliers separately.

Cache the profile to `data/profiles/{company}.json`. Re-analysis only on
explicit request — it is the most expensive step.

**Acceptance criteria for Phase 2**

- [ ] `python -m scripts.build_profile` writes a valid `StyleProfile` JSON
- [ ] `vocabulary` contains real Protecto-domain terms (PII, tokenisation,
      masking, compliance, etc.), not generic marketing words
- [ ] `avoid_list` is non-empty and specific
- [ ] Total LLM calls = N + 1 for N articles. Log and confirm.

---

## 5. Phase 3 — Retrieval

`src/retrieve.py`

- Embed each reference article once (title + headings + first 300 words),
  cache the matrix to disk
- At generation time, embed the user's topic and return top-k (k=2 or 3) articles
- Return only **structural skeletons**: title, heading list, intro paragraph.
  Never full bodies. This is the key restraint.
- Also support metadata filtering by company for when the corpus has several

Justify in the README: 20 documents does not warrant a vector database, but the
retrieval interface is deliberately swappable if the corpus grows.

---

## 6. Phase 4 — Generation

`src/generate.py` — three chained calls, each with structured output.

### 6.1 Input schema

```python
class ArticleRequirements(BaseModel):
    company: str
    topic: str
    target_audience: str
    target_word_count: int
    key_points: list[str]
    required_sections: list[str] = []
    tone_override: str | None = None
    notes: str | None = None
```

### 6.2 Step 1 — Planner

Input: requirements + `StyleProfile.structure` + retrieved skeletons.
Output: `ArticlePlan` — title, list of `(heading, intent, target_words,
key_points_covered)`.

Constrain section count and total words to the profile's observed ranges. If the
user's requested length falls outside that range, honour the user but flag the
conflict in the UI.

### 6.3 Step 2 — Writer

Section by section, not all at once. Each call receives: the plan, this
section's spec, the full `VoicePattern` + vocabulary, and the *previous section's
last paragraph* for continuity. This keeps each output focused and makes style
adherence measurably better than one monolithic call.

### 6.4 Step 3 — Self-critique

One call. The model reads its own assembled draft against the style profile and
returns targeted edits, which are applied in a fourth call. Cheap, and it lifts
the first-pass evaluation score noticeably — worth reporting that delta in the README.

**Acceptance criteria for Phase 4**

- [ ] Output word count within ±15% of target
- [ ] Section count within the profile's observed range
- [ ] Draft contains no placeholder text or meta-commentary

---

## 7. Phase 5 — Evaluation

`src/evaluate.py` — three independent scorers, then a weighted combination.
Deliberately hybrid so the score does not rest entirely on the model's opinion of
its own work.

### 7.1 Rule-based (deterministic, 0–100)

- Section count inside profile range → full marks, degrade linearly outside
- Word count within ±15% of requested
- Heading depth matches
- All `required_sections` present (fuzzy match)
- Bullet/list usage consistent with profile

### 7.2 Computed (deterministic, 0–100)

- **Readability**: Flesch score distance from the reference mean, normalised by
  the reference stddev — *matching* the reference is the goal, not maximising
- **Sentence-length fit**: same z-score approach
- **Embedding similarity**: cosine between generated article and reference
  centroid, rescaled from the observed reference-to-reference floor

### 7.3 LLM judge (0–100 per dimension)

One call, structured output, explicit rubric with anchors at 20/50/80. Dimensions:
`relevance`, `style_similarity`, `tone_consistency`, `completeness`,
`content_quality`. For each, require: score, one-sentence justification, and one
concrete improvement.

Feed the judge the style profile and the requirements, **not** the generation
prompt — it must not simply agree with the writer's own instructions.

### 7.4 Combination

```python
overall = (
    0.20 * structure_score      # rule-based
    0.15 * readability_score    # computed
    0.15 * style_score          # computed similarity + judge style, averaged
    0.20 * relevance_score      # judge
    0.15 * completeness_score   # judge + required-section check
    0.15 * quality_score        # judge
)
```

Weights are a defensible starting point, not truth. State that in the README and
name the limitation: LLM-judge scores are known to compress into the 70–85 band,
so **deltas between iterations matter more than absolute values.**

### 7.5 Output schema

```python
class EvaluationResult(BaseModel):
    overall_score: float
    dimension_scores: dict[str, float]
    strengths: list[str]
    weaknesses: list[str]
    missing_requirements: list[str]
    generic_sounding_passages: list[str]   # verbatim quotes from the draft
    recommendations: list[str]
```

`generic_sounding_passages` is the highest-value field — it makes the feedback
loop concrete rather than vague.

**Acceptance criteria for Phase 5**

- [ ] Feeding a real Protecto reference article through the evaluator scores > 80
      (sanity check — the evaluator should approve of the ground truth)
- [ ] Feeding deliberately off-topic text scores < 40
- [ ] Rule and computed scores are reproducible across runs

---

## 8. Phase 6 — Feedback loop

`src/feedback.py`. **The differentiator. Do not shortcut this.**

Raw human feedback must not be appended to the next prompt. Transform it:

```python
class RevisionInstruction(BaseModel):
    target: str            # section heading, or "__global__"
    change_type: Literal["rewrite", "expand", "condense", "tone", "add", "remove", "restructure"]
    instruction: str       # imperative, specific
    source: Literal["human", "evaluator"]
    priority: int          # 1 = highest
```

Pipeline:

1. One LLM call converts free-text human feedback → `RevisionInstruction[]`
2. Auto-derive further instructions from `EvaluationResult.weaknesses` and
   `missing_requirements`
3. Merge, dedupe, sort by priority; human-sourced instructions always outrank
   evaluator-sourced ones
4. Regeneration re-runs the writer **only for targeted sections**, leaving
   untouched sections byte-identical. Cheaper, and it makes the before/after diff
   readable
5. Persist accepted instructions to a `learned_preferences` table keyed by
   company; inject them into all future generations for that company. That is the
   memory requirement satisfied honestly

**Acceptance criteria for Phase 6**

- [ ] Feedback "the intro is too generic, open with a concrete breach scenario"
      produces a targeted `rewrite` instruction on the intro, and the intro
      visibly changes while other sections do not
- [ ] `overall_score` increases across the cycle. If it does not, investigate
      rather than hiding it — a documented, explained regression beats a fake win

---

## 9. Phase 7 — React UI

The Vite React frontend calls the FastAPI service and keeps the workflow state in the browser.

1. **Setup** — company selector, profile viewer (render the JSON), rebuild button
2. **Requirements** — form for `ArticleRequirements`, generate button, progress
   indicator per pipeline step
3. **Article** — rendered markdown, word count, download button
4. **Evaluation** — score cards per dimension with delta vs previous iteration,
   expandable strengths/weaknesses, quoted generic passages
5. **Feedback & Compare** — free-text box, star rating, regenerate button,
   side-by-side diff (`difflib.HtmlDiff` or two columns), score-delta table

Keep long operations inside visible loading states so the pipeline stages are visible.
The UI is a demonstration of the workflow — visible stages are the point.

---

## 10. Phase 8 — Observability

`src/observability.py`. Wrap every LLM call. Log to PostgreSQL: stage name, model,
input/output tokens, latency, estimated cost, success/failure. Surface a run
summary in the React workspace: total calls, total tokens, cost, wall time.

Cheap to build, and it directly answers brief sections 6.9 and 6.10.

---

## 11. Phase 9 — Documentation

### `README.md` — required sections, in this order

1. Project overview
2. Architecture (include an ASCII data-flow diagram)
3. Technology choices — **including what was deliberately not used, and why**
4. Setup instructions
5. Environment variables
6. How to run
7. How to use (walk through one full cycle)
8. Evaluation methodology — every metric, its calculation, the weights, the
   improvement criterion
9. Design decisions — the seven the brief asks for
10. Known limitations — be specific and unflinching
11. Future improvements

### Limitations to state plainly

- Small reference corpus; the profile may overfit to a handful of authors
- LLM-judge scores are not calibrated absolutes; only deltas are meaningful
- The judge and the writer are the same model family — self-preference bias is
  likely and unmeasured
- Regex sentence splitting mishandles abbreviations and decimals
- Embedding similarity rewards topical overlap, which is not the same as style
- Weights in the composite score are hand-set, not empirically fitted
- Single-company evaluation; cross-company generalisation is untested

### `examples/before_after.md`

Capture one full cycle verbatim: requirements → v1 article → v1 scores →
human feedback text → derived revision instructions → v2 article → v2 scores →
delta table. Include the derived instructions; they show the mechanism, and the
mechanism is what is being assessed.

---

## 12. Build order and time budget

| Day | Work |
| --- | --- |
| 1 | Phases 1–2. Ingestion, metrics, style profile. Do not move on until the profile is genuinely good — everything downstream depends on it |
| 2 | Phases 3–5. Retrieval, generation, evaluation. Sanity-check the evaluator against reference articles |
| 3 morning | Phase 6. Feedback loop |
| 3 afternoon | Phases 7–9. UI, observability, docs, before/after capture |

If time runs short, cut in this order: observability dashboard → self-critique
step → retrieval (fall back to using all skeletons) → UI polish.

**Never cut:** the style profile, the hybrid evaluator, or the structured
feedback transformation. Those three are what is actually being graded.

---

## 13. Instructions for Codex

- Announce which phase you are starting before you begin
- Write `src/models.py` completely before any other module
- After each phase, run its acceptance criteria and report results honestly
- Keep every LLM prompt in a module-level constant named `*_PROMPT`, never
  inlined in a function body — they need to be readable and reviewable
- Every LLM call goes through `src/llm.py`. No direct SDK calls elsewhere
- Add docstrings explaining *why*, not what
- Do not add dependencies beyond the dependencies declared in `pyproject.toml` without asking
- If a design decision here looks wrong once you are in the code, say so and
  propose an alternative rather than silently deviating
