# VRYSE Blog Writing System

## 1. Project overview

A transparent AI writing workflow that learns a reusable editorial profile from a client's reference articles, creates a structured draft, evaluates it with independent signals, and applies human feedback as targeted, durable revision instructions.

The system holds any number of **projects** side by side. A project is one client or company: its reference documents, style profile, learned preferences and runs are namespaced under its name and never mix. The studio's project switcher decides which one everything below it is looking at.

The goal is not a single impressive prompt. The system exposes the artifacts that make a generated article defensible: corpus metrics, an LLM-derived style profile, an article plan, retrieved structural skeletons, per-dimension evaluation, and a before/after revision record.

Raw source documents never enter a generation prompt. The system uses only a derived style profile and top-ranked structural skeletons (title, headings, and intro).

## 2. Architecture

Everything below the first line happens per project. The selected project decides
which references are read, which profile is loaded, which learned preferences apply
and which run history is written.

```text
Selected project's Markdown and Word references
        │
        ├── ingest.py ──> ParsedArticle ──> metrics.py ──> corpus baseline
        │                       │                    │
        │                       └── short excerpts ──┼──> agents/analysis.py
        │                                             │
        │                                      StyleProfile (JSON)
        │                                             │
User requirements ──> retrieve.py ──> safe skeletons ┤
        │                                             ▼
        └────────────────────────────> plan → section writer → critique → revision
                                                               │
Draft + profile + requirements ──> rule scorer + computed scorer + LLM judge
                                                               │
Human feedback ──> RevisionInstruction[] ──> targeted section rewrite
                                               │
                                    Neon PostgreSQL, keyed by project:
                                    runs, feedback, learned preferences,
                                    call log, style profiles, reference index
                                               │
                                    Cloudflare R2: reference Markdown and Word bytes
                                    under a per-project key prefix
                                               ▲
React / Vite frontend ──> FastAPI backend ─────┘
   (project switcher)        (/api/projects)
```

## 3. Technology choices

- Python 3.11+ keeps the document/NLP stack straightforward and type-friendly.
- LangChain routes structured calls to Anthropic Claude, OpenAI/ChatGPT, or Google Gemini through `backend/app/utils/llm.py`. The selected provider keeps Pydantic validation, retries, and usage accounting.
- Pydantic v2 describes every exchange between stages, which prevents a prompt response from quietly changing an internal contract.
- `python-docx` preserves paragraph styles and heading levels during ingestion; tables and images are safely ignored rather than causing parser failures.
- `textstat` supplies reproducible readability measures.
- `sentence-transformers` with `all-MiniLM-L6-v2` creates local embeddings; numpy cosine search is sufficient for a ~20-document corpus.
- Every table carries the project (`company`) it belongs to, and lookups are case-insensitive, so a project is created simply by filing the first document under a new name — there is no project table to keep in sync, and `GET /api/projects` derives the list from what is actually stored.
- Tortoise ORM persists runs, feedback, learned preferences, LLM telemetry, and cached style profiles in Neon-hosted PostgreSQL through a portable `DATABASE_URL`. A pasted Neon connection string is translated for asyncpg at startup, so its `sslmode`/`channel_binding` parameters need no hand-editing.
- Cloudflare R2 holds reference `.md`, `.docx`, and `.doc` bytes, addressed through the S3 API with boto3, under a per-project key prefix so two projects cannot collide on a filename. PostgreSQL indexes them, so the corpus is shared by every process instead of living in one machine's `data/reference` folder. Objects are mirrored into a content-hash-keyed local cache, so an unchanged document is downloaded once.
- FastAPI exposes the pipeline as a separate service; a Bun + Vite React frontend makes the workflow inspectable.
- `python-dotenv` keeps the API key out of source control.

Deliberately not used:

- LangChain: the pipeline is short and explicit; an orchestration framework would hide the exact prompts and calls that are being assessed.
- Pinecone or another vector database: a local cached matrix is faster to explain and operate for this corpus. `ReferenceIndex` keeps the retrieval boundary swappable if it grows.

## 4. Setup instructions

Use Python 3.11 or newer and [uv](https://docs.astral.sh/uv/).

```bash
cd /Users/arupb/dev/interview/vryse
uv sync --directory backend
```

Reference documents live in Cloudflare R2, uploaded through the **Ingest** dialog in the
studio (or with the seeding script below). Nothing needs to be copied into the
repository. Each upload is filed under the project selected at the time.

## 5. Environment variables

Create a local `.env` from the example:

```bash
cp backend/.env.example backend/.env
```

- `LLM_PROVIDER` — default provider: `anthropic`, `openai`, or `google`.
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY` — the key for the selected provider.
- `ANTHROPIC_MODEL`, `OPENAI_MODEL`, or `GOOGLE_MODEL` — optional provider model overrides. Requests may also send `llm_provider` and `llm_model` to switch per run.

Example per-run selection:

```json
{
  "company": "Protecto AI",
  "topic": "Reducing PII exposure in AI support copilots",
  "target_audience": "Security and privacy leaders",
  "target_word_count": 900,
  "key_points": ["Map PII before it reaches the model"],
  "llm_provider": "google",
  "llm_model": "gemini-3.7-flash"
}
```

Use `GET /api/llm/providers` to see configured providers (only booleans are returned; keys are never exposed). `POST /api/profile/{company}/build` accepts a body of `{"reference_keys": [...], "llm_provider": "openai", "llm_model": "gpt-4o-mini"}`; an empty `reference_keys` builds from every document stored for the project, and a non-empty one must name only that project's documents.
- `ANTHROPIC_MODEL` — optional; defaults to `claude-sonnet-4-6`.
- `DATABASE_URL` — required Neon PostgreSQL connection string. Paste the console value as-is; the pooled endpoint is preferred.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` — Cloudflare R2 credentials for the reference bucket. Create an R2 API token with **Object Read & Write** scoped to that bucket.
- `R2_ENDPOINT`, `R2_PREFIX` — optional overrides for the derived endpoint and the in-bucket key prefix.
- `FIRECRAWL_API_KEY` — required only for **Import a client blog**. It remains server-side; the browser never receives it.

### Schema

On a fresh Neon branch, create the tables:

```bash
uv run --directory backend python -m scripts.setup_db
```

If the database already carries the earlier Aerich history, apply it instead:

```bash
uv run --directory backend aerich upgrade
```

For a later schema change, edit the Tortoise models, then generate and apply a migration:

```bash
uv run --directory backend aerich migrate --name describe_change
uv run --directory backend aerich upgrade
```

Tables: `runs`, `feedback`, `learned_preferences`, `llm_calls`, `style_profiles`,
`reference_documents`. Each is keyed or filtered by the project it belongs to; no
migration is needed to add a project.

### Seeding references

To push a local folder of `.docx` files into R2 and index them in one step:

```bash
uv run --directory backend python -m scripts.seed_references --company "Protecto AI"
```

`--company` is the project the documents are filed under and is required, so a seed
run cannot silently land in the wrong one. It reads `backend/data/reference` by
default and is safe to re-run — both the upload and the index row are upserts keyed
by a deterministic object key.

To see what projects exist and what each one holds:

```bash
uv run --directory backend python -m scripts.projects
```

## 6. How to run

Build the profile once after uploading reference documents. It makes exactly _N + 1_ LLM calls for _N_ documents: one compact observation per article, then one synthesis call. Rebuilding requires `--force`. The profile is written to PostgreSQL, so it is available to every process pointed at the same database.

The **Ingest** dialog does the same thing interactively for the selected project, and lets you choose which stored documents the profile is built from. A selection is validated against the project it is built for, so one project's documents cannot be used to build another's profile. The build runs in the background: closing the dialog does not cancel it, and the header reports the running stage and accumulated cost until it finishes.

```bash
cd backend
uv run python -m scripts.build_profile --company "Protecto AI"
uv run uvicorn app.main:app --reload

# in a second terminal
cd frontend
bun install
bun run dev
```

For a repeatable service-backed demo using the bundled mock corpus, run:

```bash
uv run --directory backend python -m scripts.run_mock_cycle
```

This persists an initial run, transforms sample human feedback, performs a
targeted revision, evaluates both versions, and prints the score delta plus
telemetry. The score may regress; that result is intentionally reported rather
than hidden.

The frontend lives in `frontend/` and proxies `/api` requests to the backend during development. It uses Tailwind CSS with local shadcn-style primitives in `frontend/src/components/ui/`; the API remains independently runnable at `http://localhost:8000`.

For a quick ingestion check:

```bash
uv run --directory backend python -c "
import asyncio
from app.ingest import load_references
from app.store import close_database, initialise_database, list_references

async def main():
    await initialise_database()
    try:
        records = await list_references('Protecto AI')
        print(len(await load_references(records)), 'of', len(records), 'documents parsed')
    finally:
        await close_database()

asyncio.run(main())
"
```

## 7. How to use

1. Pick a project in the rail's switcher, or create one with **+ New project**. A project comes into existence when its first document is uploaded, so nothing is written until then; the switcher shows each project's reference count and whether it has a profile yet, and the selection survives a reload.
2. Open the studio's **Ingest** dialog and either upload `.md`, `.docx`, or `.doc` references, or use **Import a client blog**. Enter the client URL and the blog path (such as `/blog`; use `/` for a root-level blog); Firecrawl collects only that site section, and each page is stored as a selectable Markdown reference. Tick the sources the profile should learn from, then build it. The build continues if you close the dialog. Inspect the profile before generating.
3. In **Requirements**, enter the topic, audience, word count, key points, any mandatory headings, and approved facts.
4. Generate. The UI shows planning, section-level drafting, critique application, and evaluation as visible stages.
5. Read the Markdown article and its evaluation. The evaluator quotes generic passages and lists missing requirements rather than only emitting a number.
6. Enter human feedback and a rating. The system displays the derived `RevisionInstruction` objects, rewrites only the targeted sections, preserves untouched section markdown byte-for-byte, and shows score deltas plus a diff.
7. Accepted human instructions are retained under that project in PostgreSQL and become future generation constraints for it alone.

Projects are exposed through `GET /api/projects`, which lists every project with its
reference count, profile state and run count, and `DELETE /api/projects/{company}`,
which removes a project's R2 objects, references, profile, learned preferences and
runs together. There is no create endpoint: a project exists once a document is filed
under its name.

The feedback workflow is exposed through `POST /api/feedback`,
`POST /api/runs/{run_id}/regenerate`, and `GET /api/runs/{run_id}/summary`.
Run backend contract tests with `uv run --directory backend python -m unittest discover -s tests -v`.

A complete worked cycle is in [`examples/before_after.md`](examples/before_after.md).

## 8. Evaluation methodology

The evaluator keeps three signals independent.

- **Rule-based structure score (20%)**: section count is full marks inside the observed profile range and degrades linearly outside it; word count is checked against ±15% of the requested length; heading depth, mandatory headings (fuzzy matching), and list usage are also scored.
- **Computed readability score (15%)**: Flesch Reading Ease distance from the corpus mean is normalized by corpus standard deviation. Matching the reference is the goal, not maximizing readability.
- **Computed style component**: average sentence length is scored with the same z-score fit. Local embedding cosine compares the draft against the reference centroid, rescaled from the lowest reference-to-reference similarity.
- **LLM judge**: Claude independently scores relevance, style similarity, tone consistency, completeness, and content quality on anchored 20/50/80 rubrics. It sees requirements and the profile, never the writing prompt.
- **Composite**:

```text
overall = 0.20 × structure
        + 0.15 × readability
        + 0.15 × style (embedding fit + judge style)/2
        + 0.20 × judge relevance
        + 0.15 × completeness (judge + required-heading check)/2
        + 0.15 × judge quality
```

The weights are a defensible starting point, not empirical truth. Because LLM-judge scores commonly compress into the 70–85 range, iteration deltas are more meaningful than absolute values. A genuine regression is kept visible for investigation rather than obscured.

## 9. Design decisions

1. **Style profile before generation**: the profile is a reusable, inspectable artifact, not a one-off prompt attachment.
2. **Two-track analysis**: deterministic corpus metrics set measurable targets while qualitative observations preserve voice and rhetorical patterns.
3. **Bounded source context**: analysis receives section openings; generation receives only profile data and structural skeletons. This prevents accidental reference-body copying.
4. **Section-by-section writing**: each call has a limited task and prior-paragraph continuity, improving controllability and making revisions cheap.
5. **Hybrid evaluation**: deterministic checks prevent the LLM judge from being the sole authority.
6. **Structured feedback**: free text is transformed into priorities, targets, and change types before it reaches a writer.
7. **Honest preference memory**: only accepted human instructions are stored per company; the system does not imply unreviewed model judgments are user preferences.

## 10. Known limitations

- A small reference corpus can overfit to a handful of authors.
- LLM-judge scores are not calibrated absolutes; deltas are more useful.
- Judge and writer use the same model family, so self-preference bias is likely and unmeasured.
- Regex sentence splitting mishandles abbreviations and decimals.
- Embedding similarity rewards topical overlap, which is not the same as style.
- Composite weights are hand-set rather than empirically fitted.
- Evaluation weights were tuned against one project's corpus; they are applied unchanged to every project, and cross-project generalization is untested.
- Deleting a project removes its R2 objects before its index rows, so a failed object delete leaves the project listed and recoverable rather than orphaning bucket contents. The reverse order would be unrecoverable, but this order can still leave a partially emptied project.
- The bundled repository contains no source `.docx` files or API key, so a live profile build and full Anthropic run must be performed after those inputs are supplied.
- Cost estimates are approximate snapshots of token pricing, not billing records.

## 11. Future improvements

- Add a blinded human-rating calibration set and fit the composite weights to it.
- Compare a second, independent judge model to quantify model-family bias.
- Track source-document fingerprints and invalidate profiles when the corpus changes.
- Add richer document extraction for tables, links, and citations.
- Move the `ReferenceIndex` implementation behind a remote-vector-store adapter only when corpus scale warrants it.
- Add editorial approval controls before learned preferences become active.
