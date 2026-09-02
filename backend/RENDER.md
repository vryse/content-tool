# Deploy the backend on Render

The repository root contains `render.yaml`, which creates only the FastAPI web
service. Its Render root directory is `backend`, so frontend changes do not
participate in backend builds.

## Deploy

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Render, choose **New > Blueprint**, connect the repository, and apply the
   detected `render.yaml`.
3. Enter the environment variables Render requests during the first Blueprint
   sync. Secret values are intentionally not stored in the YAML.
4. Wait for `/api/health` to return `{"status":"ok"}`. API documentation is at
   `/docs` on the service URL.

The service uses the committed `uv.lock`, applies Aerich migrations on startup,
and binds Uvicorn to Render's `$PORT`. Python is pinned to the latest available
3.11 patch with `.python-version`.

## Required environment variables

- `DATABASE_URL`: the Neon PostgreSQL connection string.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`:
  Cloudflare R2 storage credentials.
- `LLM_PROVIDER`: `anthropic`, `openai`, or `google`.
- The API key for the selected provider: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  or `GOOGLE_API_KEY`. Unused provider key prompts can be left blank.
- `CORS_ORIGINS`: exact frontend origin, for example
  `https://studio.example.com`. Separate multiple origins with commas.

`FIRECRAWL_API_KEY` is required only for importing a client blog. Optional model,
R2 endpoint, and R2 prefix overrides are documented in `.env.example` and can be
added in the Render dashboard.

## Compute note

The Blueprint starts on Render's free plan. This API loads a sentence-transformer
model and the free service has limited memory, an ephemeral filesystem, and idle
spin-downs. If model loading exceeds memory or cold starts are too slow, change
the service to a paid plan with at least 2 GB RAM. PostgreSQL and R2 remain the
durable stores; the local embedding cache can be rebuilt after restarts.

For a paid service, move `uv run aerich upgrade` from `startCommand` into Render's
pre-deploy command and leave the start command as:

```sh
uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Render currently provides pre-deploy commands only for paid services.
