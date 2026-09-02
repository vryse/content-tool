# Deploy the backend on Railway

Railway should deploy this repository as one backend service with the service
**Root Directory** set to `/backend`. The root-level `railway.json` supplies the
Railpack builder, database migration, start command, and health check.

Docker is not required. With `/backend` selected, Railpack detects the Python
project from `pyproject.toml`, installs the locked `uv` dependencies, and reads
the Python 3.11 pin from `.python-version`.

## Deploy

1. Create a Railway service from this repository.
2. In **Service > Settings > Build**, set **Root Directory** to `/backend`.
3. Add the required service variables listed below.
4. Generate a public domain under **Settings > Networking**.
5. Deploy and confirm that `/api/health` returns `{"status":"ok"}`. API
   documentation is available at `/docs` on the generated domain.

The pre-deploy command runs `aerich upgrade` before Railway starts the new
deployment. Uvicorn binds to Railway's injected `$PORT`, and Railway waits for
the health endpoint before considering the deployment ready.

## Required service variables

- `DATABASE_URL`: the Neon PostgreSQL connection string.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`:
  Cloudflare R2 storage credentials.
- `LLM_PROVIDER`: `anthropic`, `openai`, or `google`.
- The API key for the selected provider: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  or `GOOGLE_API_KEY`.
- `CORS_ORIGINS`: exact frontend origin, such as
  `https://studio.example.com`. Separate multiple origins with commas.

`FIRECRAWL_API_KEY` is required only for importing a client blog. Optional model,
R2 endpoint, and R2 prefix overrides are documented in `.env.example`.

The sentence-transformer model and its Python runtime can be memory intensive.
If the deployment is terminated while loading the model, increase the service's
memory allocation; Docker would not resolve a memory limit.
