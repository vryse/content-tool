"""FastAPI service that keeps the VRYSE pipeline independent from its UI."""

from __future__ import annotations

import asyncio
import csv
import hashlib
import io
import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from typing import Any, Awaitable, Callable, Iterator
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.agents.analysis import build_style_profile
from app.agents.quality import evaluate_draft
from app.feedback import process_feedback
from app.agents.generation import generate_article, revise_targeted_sections
from app.ingest import load_article, load_references
from app.firecrawl import FirecrawlClient
from app.utils.llm import LLMClient
from app.models import (
    AnalysisOutcome,
    AnalyticsReport,
    ArticleRequirements,
    CrawlRequest,
    CrawlResult,
    FeedbackOutcome,
    FeedbackResponse,
    FeedbackSubmission,
    GenerationOutcome,
    GenerationRun,
    LLMProvider,
    ParsedArticle,
    ProfileBuildRequest,
    ProjectRenameRequest,
    ProjectSummary,
    ReferenceRecord,
    RegenerationRequest,
    RunListItem,
    StyleProfile,
    TopicSuggestion,
    TopicSuggestionRequest,
)
from app.utils.config import CORS_ORIGINS, DEFAULT_LLM_PROVIDER, OPENAI_WRITING_MODEL
from app.utils.observability import summarize_run
from app.utils.progress import ProgressBus
from app.utils import storage
from app.utils.retrieve import build_reference_index, retrieve, warm_embedding_model
from app.store import (
    analytics_report,
    canonical_company,
    close_database,
    delete_profile,
    delete_project,
    delete_reference,
    get_references,
    initialise_database,
    learned_preferences,
    list_projects,
    list_references,
    list_runs,
    load_profile,
    load_run,
    profile_sources,
    project_exists,
    rename_project,
    save_analysis_outcome,
    save_feedback_outcome,
    save_generation_outcome,
    save_reference,
    save_run,
)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
# .docx is a zip container, so every valid file starts with the zip local-file
# header. Checking it rejects a renamed .doc or .pdf at upload rather than
# letting it fail confusingly in the middle of a profile build.
ZIP_MAGIC = b"PK\x03\x04"
DOC_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
SUPPORTED_REFERENCE_SUFFIXES = {".doc", ".docx", ".md", ".markdown"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    await initialise_database()
    # Loading the sentence-transformer costs several seconds. Paying it here keeps it
    # off the first request, which is otherwise the slowest one a user ever sees.
    await asyncio.to_thread(warm_embedding_model)
    yield
    await close_database()


app = FastAPI(title="VRYSE Writing API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

# Streaming responses outlive the handler that created them, so the producing task
# needs a strong reference or the garbage collector may cancel it mid-run.
_background: set[asyncio.Task[Any]] = set()


def streamed(producer: Callable[[ProgressBus], Awaitable[Any]]) -> StreamingResponse:
    """Run a pipeline in the background and stream its progress as NDJSON.

    The response opens immediately and each stage announces itself as it starts, so
    a two-minute generation reports what it is doing instead of looking hung.
    """
    bus = ProgressBus()

    async def drive() -> None:
        try:
            bus.result(await producer(bus))
        except HTTPException as error:
            bus.fail("request", str(error.detail))
        except Exception as error:  # surfaced to the user, not swallowed
            bus.fail("pipeline", f"{type(error).__name__}: {error}")

    task = asyncio.create_task(drive())
    _background.add(task)
    task.add_done_callback(_background.discard)
    return StreamingResponse(bus.stream(), media_type="application/x-ndjson")


async def corpus_for(company: str) -> list[ParsedArticle]:
    """Parse the references a company's profile was built from.

    Retrieval must draw on the same documents the style profile describes, so
    the profile's recorded selection wins; a profile built before selections
    were recorded falls back to every reference stored for the company.
    """
    keys = await profile_sources(company)
    records = await get_references(keys) if keys else await list_references(company)
    return await load_references(records)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/llm/providers")
async def llm_providers() -> dict[str, object]:
    """Expose switchable providers without exposing secrets."""
    from app.utils.config import LLM_MODELS

    return {
        "default": DEFAULT_LLM_PROVIDER,
        "providers": [
            {"id": provider, "model": model, "configured": bool(os.getenv(key))}
            for provider, model, key in (
                ("anthropic", LLM_MODELS["anthropic"], "ANTHROPIC_API_KEY"),
                ("openai", LLM_MODELS["openai"], "OPENAI_API_KEY"),
                ("google", LLM_MODELS["google"], "GOOGLE_API_KEY"),
            )
        ],
    }


# --- Projects -------------------------------------------------------------
# Every artefact in the system is already namespaced by company; these endpoints
# make that namespace enumerable so the UI can offer a choice instead of assuming
# one. Creation is implicit: uploading the first document under a new name is
# what brings a project into existence.


@app.get("/api/projects", response_model=list[ProjectSummary])
async def projects() -> list[ProjectSummary]:
    return await list_projects()


@app.delete("/api/projects/{company}")
async def remove_project(company: str) -> dict[str, object]:
    """Delete a whole project: its R2 objects, its index rows, and its artefacts.

    The bucket goes first. A failed object delete leaves the index intact and the
    project still listed, which is recoverable; dropping the index first would
    orphan objects nothing can name.
    """
    name = company.strip()
    if not await project_exists(name):
        raise HTTPException(404, f"No project named {name!r}.")
    for record in await list_references(name):
        try:
            await storage.delete_object(record.key)
        except storage.StorageError as error:
            raise HTTPException(502, str(error)) from error
        await storage.forget_cached(record.key, record.content_hash)
    return {"deleted": True, "removed": await delete_project(name)}


@app.put("/api/projects/{company}")
async def update_project(company: str, request: ProjectRenameRequest) -> dict[str, str]:
    """Rename a project while preserving all of its stored artefacts."""
    if not await project_exists(company):
        raise HTTPException(404, f"No project named {company.strip()!r}.")
    try:
        return {"company": await rename_project(company, request.name)}
    except ValueError as error:
        raise HTTPException(409, str(error)) from error


# --- Reference library ----------------------------------------------------


@app.get("/api/references", response_model=list[ReferenceRecord])
async def references(company: str | None = None) -> list[ReferenceRecord]:
    return await list_references(company)


@app.post("/api/references", response_model=list[ReferenceRecord])
async def upload_references(
    files: list[UploadFile] = File(...),
    company: str = Form(...),
) -> list[ReferenceRecord]:
    """Store uploaded Word and Markdown files in R2 and index them in PostgreSQL.

    Metadata is extracted at upload time so the library can show what is in each
    document without re-reading the bucket on every page load.
    """
    if not company.strip():
        raise HTTPException(400, "A project name is required.")
    # Match the spelling an existing project already uses, so "protecto ai" adds to
    # "Protecto AI" rather than creating a second row that lists as its own project.
    company = await canonical_company(company)
    stored: list[ReferenceRecord] = []
    for upload in files:
        filename = upload.filename or "document.docx"
        suffix = os.path.splitext(filename)[1].casefold()
        if suffix not in SUPPORTED_REFERENCE_SUFFIXES:
            raise HTTPException(400, f"{filename} must be a .md, .docx, or .doc file.")
        data = await upload.read()
        if not data:
            raise HTTPException(400, f"{filename} is empty.")
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"{filename} exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit.")
        if suffix == ".docx" and not data.startswith(ZIP_MAGIC):
            raise HTTPException(400, f"{filename} is not a readable Word document.")
        if suffix == ".doc" and not data.startswith(DOC_MAGIC):
            raise HTTPException(400, f"{filename} is not a readable legacy Word document.")

        key = storage.object_key(company, filename)
        content_hash = hashlib.sha256(data).hexdigest()
        # Parse before upload: a document that cannot be opened should not
        # silently occupy a bucket slot the user believes is a usable reference.
        path = await storage.store_cached(key, content_hash, data)
        try:
            article = await asyncio.to_thread(load_article, path, company)
        except Exception as error:
            await storage.forget_cached(key, content_hash)
            raise HTTPException(400, f"{filename} could not be parsed: {error}") from error

        try:
            content_type = (
                storage.MARKDOWN_CONTENT_TYPE
                if suffix in {".md", ".markdown"}
                else storage.DOC_CONTENT_TYPE if suffix == ".doc" else storage.DOCX_CONTENT_TYPE
            )
            await storage.put_object(key, data, content_type)
        except storage.StorageError as error:
            # The cache entry was written to parse the document; without the object
            # behind it, a later read would serve bytes the bucket does not have.
            await storage.forget_cached(key, content_hash)
            raise HTTPException(502, str(error)) from error

        stored.append(
            await save_reference(
                ReferenceRecord(
                    key=key,
                    filename=filename,
                    company=company,
                    size_bytes=len(data),
                    content_hash=content_hash,
                    title=article.title,
                    word_count=sum(section.word_count for section in article.sections),
                    section_count=sum(1 for section in article.sections if section.level > 0),
                )
            )
        )
    return stored


def _crawl_scope(client_url: str, blog_path: str) -> tuple[str, str | None]:
    """Normalize the website and turn a literal blog path into Firecrawl's path regex."""
    url = client_url.strip().rstrip("/")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(400, "Client URL must be a full http(s) URL.")
    path = blog_path.strip() or "/"
    if not path.startswith("/"):
        path = f"/{path}"
    if path == "/":
        return url, None
    # Crawl from the section itself. Firecrawl matches includePaths against URL
    # pathnames, while `re.escape` keeps a URL containing dots or plus signs literal.
    escaped = re.escape(path.lstrip("/"))
    return f"{url}{path.rstrip('/')}", f"{escaped}(?:/.*)?"


async def _store_crawled_markdown(company: str, title: str, source_url: str, markdown: str) -> ReferenceRecord:
    """Store a Firecrawl page through the exact same reference contract as uploads."""
    digest = hashlib.sha256(markdown.encode()).hexdigest()
    parsed = urlparse(source_url)
    basename = (parsed.path.strip("/").replace("/", "-") or "home")[:120]
    filename = f"{basename}-{digest[:10]}.md"
    key = storage.object_key(company, filename)
    data = markdown.encode()
    path = await storage.store_cached(key, digest, data)
    try:
        article = await asyncio.to_thread(load_article, path, company)
    except Exception:
        await storage.forget_cached(key, digest)
        raise
    try:
        await storage.put_object(key, data, storage.MARKDOWN_CONTENT_TYPE)
    except storage.StorageError:
        await storage.forget_cached(key, digest)
        raise
    return await save_reference(
        ReferenceRecord(
            key=key,
            filename=filename,
            company=company,
            size_bytes=len(data),
            content_hash=digest,
            title=title or article.title,
            word_count=sum(section.word_count for section in article.sections),
            section_count=sum(1 for section in article.sections if section.level > 0),
        )
    )


@app.post("/api/references/crawl")
async def crawl_references(request: CrawlRequest) -> StreamingResponse:
    """Collect a site's blog section in the background and add pages as Markdown references."""
    async def producer(bus: ProgressBus) -> Any:
        company = await canonical_company(request.company)
        start_url, include_path = _crawl_scope(request.client_url, request.blog_path)
        client = FirecrawlClient()
        bus.stage("crawl_start", detail=start_url)
        job_id = await client.start(start_url, include_path, request.limit)
        bus.stage("crawl_start", "done", detail="Firecrawl job queued")
        while True:
            status = await client.status(job_id)
            completed, total = int(status.get("completed") or 0), int(status.get("total") or 0)
            bus.stage("crawl_pages", detail=f"{completed}/{total or '?'} pages")
            state = status.get("status")
            if state == "completed":
                break
            if state == "failed":
                raise HTTPException(502, "Firecrawl could not complete this crawl.")
            await asyncio.sleep(2)
        pages = await client.collect_pages(status)
        if not pages:
            raise HTTPException(400, "Firecrawl completed but returned no Markdown pages for that path.")
        bus.stage("crawl_pages", "done", detail=f"{len(pages)} pages")
        bus.stage("store_crawl", detail=f"Saving {len(pages)} Markdown references")
        stored: list[ReferenceRecord] = []
        for page in pages:
            if page.markdown.strip():
                stored.append(await _store_crawled_markdown(company, page.title, page.source_url, page.markdown))
        if not stored:
            raise HTTPException(400, "Firecrawl returned pages without usable Markdown content.")
        bus.stage("store_crawl", "done", detail=f"Stored {len(stored)} references")
        return CrawlResult(job_id=job_id, stored=stored).model_dump(mode="json")

    return streamed(producer)


@app.delete("/api/references/{key:path}")
async def remove_reference(key: str) -> dict[str, bool]:
    """Delete the object and its index row together."""
    existing = await get_references([key])
    if not existing:
        raise HTTPException(404, "Reference document not found.")
    try:
        await storage.delete_object(key)
    except storage.StorageError as error:
        raise HTTPException(502, str(error)) from error
    await storage.forget_cached(key, existing[0].content_hash)
    await delete_reference(key)
    return {"deleted": True}


# --- Style profiles -------------------------------------------------------


@app.get("/api/profile/{company}", response_model=StyleProfile | None)
async def profile(company: str) -> StyleProfile | None:
    return await load_profile(company)


@app.get("/api/profile/{company}/sources", response_model=list[str])
async def profile_source_keys(company: str) -> list[str]:
    """Which stored references the cached profile was built from."""
    return await profile_sources(company)


@app.delete("/api/profile/{company}")
async def remove_profile(company: str) -> dict[str, bool]:
    return {"deleted": await delete_profile(company)}


@app.post("/api/profile/{company}/build")
async def create_profile(
    company: str,
    body: ProfileBuildRequest | None = None,
    provider: LLMProvider = Query(DEFAULT_LLM_PROVIDER, pattern="^(anthropic|openai|google)$"),
    model: str | None = None,
) -> StreamingResponse:
    request = body or ProfileBuildRequest()

    async def producer(bus: ProgressBus) -> Any:
        bus.stage("parse_references")
        project = await canonical_company(company)
        if request.reference_keys:
            records = await get_references(request.reference_keys)
            missing = set(request.reference_keys) - {record.key for record in records}
            if missing:
                raise HTTPException(400, f"Unknown reference documents: {', '.join(sorted(missing))}")
            # A key names a document, not a project, so a selection assembled against
            # one project could otherwise be built — and saved — under another.
            foreign = sorted(
                {record.company for record in records if record.company.casefold() != project.casefold()}
            )
            if foreign:
                raise HTTPException(
                    400,
                    f"Selected documents belong to another project: {', '.join(foreign)}.",
                )
        else:
            records = await list_references(project)
        if not records:
            raise HTTPException(400, f"No reference documents are stored for {project}.")
        articles = await load_references(records)
        if not articles:
            raise HTTPException(400, "None of the selected documents could be parsed.")
        bus.stage("parse_references", "done", detail=f"{len(articles)} articles")
        profile_run_id = f"profile-{uuid.uuid4()}"
        built = await build_style_profile(
            articles,
            LLMClient(profile_run_id, provider=request.llm_provider or provider, model=request.llm_model or model, bus=bus),
            force=True,
            bus=bus,
            source_keys=[record.key for record in records],
        )
        summary = await summarize_run(profile_run_id)
        await save_analysis_outcome(
            AnalysisOutcome(
                company=project,
                source_article_count=len(articles),
                vocabulary_size=len(built.vocabulary),
                outlier_count=len(built.outliers),
                tone_descriptors=built.voice.tone_descriptors,
                total_cost_usd=summary.estimated_cost_usd,
                total_tokens=summary.input_tokens + summary.output_tokens,
                wall_time_seconds=summary.wall_time_seconds,
            )
        )
        return built.model_dump(mode="json")

    return streamed(producer)


@app.post("/api/topics/suggest", response_model=TopicSuggestion)
async def suggest_topic(request: TopicSuggestionRequest) -> TopicSuggestion:
    """Suggest a new blog topic from the active project's uploaded references."""
    company = await canonical_company(request.company)
    records = await list_references(company)
    if not records:
        raise HTTPException(400, f"No reference documents are stored for {company}.")
    articles = await load_references(records)
    if not articles:
        raise HTTPException(400, "None of the reference documents could be parsed.")

    # Titles and openings expose the corpus's subject matter without turning this
    # small convenience action into a full-document prompt or requiring a profile.
    corpus = "\n\n".join(
        f"Title: {article.title}\nExcerpt: {article.full_text[:900].strip()}"
        for article in articles[:20]
    )
    existing = {
        "topic": request.topic,
        "target_audience": request.target_audience,
        "target_word_count": request.target_word_count,
        "key_points": request.key_points,
        "required_sections": request.required_sections,
    }
    prompt = f"""You are an editorial strategist. Propose a complete, useful article brief for {company}.

Use the uploaded reference excerpts below to identify the client's domain and audience. The topic must be a fresh angle, not a paraphrase or retitle of an existing article. Return a concise topic, a specific target audience, a realistic target word count, 2–6 key points, and 2–8 required sections. Do not use markdown or explanations.

The editor may already have supplied part of the brief. Treat those values as context when proposing the remaining fields, but still return a complete brief. Do not replace the editor's choices:
{json.dumps(existing)}

References:
{corpus}
"""
    client = LLMClient(
        f"topic-suggestion-{uuid.uuid4()}",
        provider=request.llm_provider,
        model=request.llm_model,
    )
    return await client.structured("topic_suggestion", prompt, TopicSuggestion)


@app.post("/api/generate")
async def generate(requirements: ArticleRequirements) -> StreamingResponse:
    # Keep profile/topic work on the economical default, but record the stronger
    # writing model in the run so targeted regenerations use the same quality bar.
    if requirements.llm_provider == "openai" and not requirements.llm_model:
        requirements = requirements.model_copy(update={"llm_model": OPENAI_WRITING_MODEL})

    async def producer(bus: ProgressBus) -> Any:
        bus.stage("load_profile")
        profile = await load_profile(requirements.company)
        if profile is None:
            raise HTTPException(400, "Build a style profile before generating an article.")
        bus.stage("load_profile", "done", detail=f"{profile.source_article_count} references")

        bus.stage("parse_references")
        articles = await corpus_for(requirements.company)
        if not articles:
            raise HTTPException(400, "No reference documents are stored for this company.")
        bus.stage("parse_references", "done", detail=f"{len(articles)} articles")

        run_id = str(uuid.uuid4())
        bus.stage("embed_retrieve")
        index = build_reference_index(articles)
        skeletons = retrieve(requirements.topic, index, company=requirements.company)
        bus.stage(
            "embed_retrieve",
            "done",
            detail=", ".join(item.title for item in skeletons) or "no match",
        )

        client = LLMClient(run_id, provider=requirements.llm_provider, model=requirements.llm_model, bus=bus)
        plan, article, _ = await generate_article(
            requirements,
            profile,
            skeletons,
            client,
            await learned_preferences(requirements.company),
            bus,
        )
        evaluation = await evaluate_draft(article, requirements, profile, client, index, bus)
        run = GenerationRun(
            run_id=run_id,
            requirements=requirements,
            plan=plan,
            article=article,
            evaluation=evaluation,
        )
        bus.stage("persist")
        await save_run(run)
        summary = await summarize_run(run_id)
        await save_generation_outcome(
            GenerationOutcome(
                run_id=run_id,
                company=requirements.company,
                overall_score=evaluation.overall_score,
                dimension_scores=evaluation.dimension_scores,
                section_count=len(article.sections),
                word_count=len(article.markdown.split()),
                missing_requirement_count=len(evaluation.missing_requirements),
                total_cost_usd=summary.estimated_cost_usd,
                total_tokens=summary.input_tokens + summary.output_tokens,
                wall_time_seconds=summary.wall_time_seconds,
            )
        )
        bus.stage("persist", "done")
        return run.model_dump(mode="json")

    return streamed(producer)


@app.post("/api/feedback", response_model=FeedbackResponse)
async def feedback(submission: FeedbackSubmission) -> FeedbackResponse:
    run = await load_run(submission.run_id)
    if run is None:
        raise HTTPException(404, "Generation run not found.")
    if run.evaluation is None:
        raise HTTPException(400, "The run has no evaluation to guide revision.")
    instructions = await process_feedback(
        run.run_id,
        run.requirements.company,
        submission.feedback,
        submission.rating,
        run.article,
        run.evaluation,
        LLMClient(run.run_id, provider=run.requirements.llm_provider, model=run.requirements.llm_model),
    )
    human_count = sum(1 for item in instructions if item.source == "human")
    await save_feedback_outcome(
        FeedbackOutcome(
            run_id=run.run_id,
            company=run.requirements.company,
            rating=submission.rating,
            human_instruction_count=human_count,
            evaluator_instruction_count=len(instructions) - human_count,
            # Only human-sourced instructions become learned preferences (see
            # app.feedback.process_feedback / store.remember_preferences), so
            # the human count doubles as the accepted count.
            accepted_instruction_count=human_count,
        )
    )
    return FeedbackResponse(run_id=run.run_id, instructions=instructions)


@app.post("/api/runs/{run_id}/regenerate")
async def regenerate(run_id: str, request: RegenerationRequest) -> StreamingResponse:
    async def producer(bus: ProgressBus) -> Any:
        run = await load_run(run_id)
        if run is None:
            raise HTTPException(404, "Generation run not found.")
        profile = await load_profile(run.requirements.company)
        if profile is None:
            raise HTTPException(400, "Build a style profile before regenerating.")
        child_run_id = str(uuid.uuid4())
        client = LLMClient(
            child_run_id,
            provider=run.requirements.llm_provider,
            model=run.requirements.llm_model,
            bus=bus,
        )
        revised = await revise_targeted_sections(
            run.article, run.requirements, profile, request.instructions, client, bus
        )
        articles = await corpus_for(run.requirements.company)
        index = build_reference_index(articles) if articles else None
        evaluation = await evaluate_draft(revised, run.requirements, profile, client, index, bus)
        child = GenerationRun(
            run_id=child_run_id,
            requirements=run.requirements,
            plan=run.plan,
            article=revised,
            evaluation=evaluation,
            parent_run_id=run.run_id,
        )
        bus.stage("persist")
        await save_run(child)
        summary = await summarize_run(child_run_id)
        await save_generation_outcome(
            GenerationOutcome(
                run_id=child_run_id,
                company=run.requirements.company,
                parent_run_id=run.run_id,
                overall_score=evaluation.overall_score,
                dimension_scores=evaluation.dimension_scores,
                section_count=len(revised.sections),
                word_count=len(revised.markdown.split()),
                missing_requirement_count=len(evaluation.missing_requirements),
                total_cost_usd=summary.estimated_cost_usd,
                total_tokens=summary.input_tokens + summary.output_tokens,
                wall_time_seconds=summary.wall_time_seconds,
            )
        )
        bus.stage("persist", "done")
        return child.model_dump(mode="json")

    return streamed(producer)


@app.get("/api/runs", response_model=list[RunListItem])
async def runs(company: str) -> list[RunListItem]:
    """Every saved run for a project, so a past draft can be found and reopened."""
    return await list_runs(await canonical_company(company))


@app.get("/api/runs/{run_id}", response_model=GenerationRun)
async def get_run(run_id: str) -> GenerationRun:
    """The full plan, article and evaluation for one saved run."""
    run = await load_run(run_id)
    if run is None:
        raise HTTPException(404, "Generation run not found.")
    return run


@app.get("/api/runs/{run_id}/summary")
async def run_summary(run_id: str):
    run = await load_run(run_id)
    if run is None:
        raise HTTPException(404, "Generation run not found.")
    return await summarize_run(run_id)


# --- Analytics --------------------------------------------------------------
# Every pipeline stage (profile build, generation run, feedback cycle) writes a
# flattened outcome row as it completes; these endpoints read that history back
# for one project so it can be inspected or handed to someone else.


@app.get("/api/analytics/{company}", response_model=AnalyticsReport)
async def analytics(company: str) -> AnalyticsReport:
    if not await project_exists(company):
        raise HTTPException(404, f"No project named {company.strip()!r}.")
    return await analytics_report(company)


@app.get("/api/analytics/{company}/export")
async def analytics_export(company: str) -> StreamingResponse:
    """A single flat CSV across all three outcome kinds, for sharing outside the app."""
    if not await project_exists(company):
        raise HTTPException(404, f"No project named {company.strip()!r}.")
    report = await analytics_report(company)

    def rows() -> Iterator[str]:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "kind",
                "created_at",
                "run_id",
                "parent_run_id",
                "overall_score",
                "rating",
                "source_article_count_or_instruction_counts",
                "total_cost_usd",
                "total_tokens",
                "wall_time_seconds",
            ]
        )
        for item in report.analysis_outcomes:
            writer.writerow(
                [
                    "analysis",
                    item.created_at.isoformat(),
                    "",
                    "",
                    "",
                    "",
                    f"{item.source_article_count} articles, {item.vocabulary_size} vocab terms",
                    item.total_cost_usd,
                    item.total_tokens,
                    item.wall_time_seconds,
                ]
            )
        for item in report.generation_outcomes:
            writer.writerow(
                [
                    "generation",
                    item.created_at.isoformat(),
                    item.run_id,
                    item.parent_run_id or "",
                    item.overall_score if item.overall_score is not None else "",
                    "",
                    f"{item.section_count} sections, {item.word_count} words",
                    item.total_cost_usd,
                    item.total_tokens,
                    item.wall_time_seconds,
                ]
            )
        for item in report.feedback_outcomes:
            writer.writerow(
                [
                    "feedback",
                    item.created_at.isoformat(),
                    item.run_id,
                    "",
                    "",
                    item.rating if item.rating is not None else "",
                    f"{item.human_instruction_count} human / {item.evaluator_instruction_count} evaluator",
                    "",
                    "",
                    "",
                ]
            )
        yield buffer.getvalue()

    filename = f"{company.strip().replace(' ', '_')}_analytics.csv"
    return StreamingResponse(
        rows(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
