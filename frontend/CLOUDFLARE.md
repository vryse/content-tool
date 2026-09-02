# Cloudflare frontend deployment

This directory deploys the Vite SPA as Cloudflare Worker static assets. A small
Worker forwards same-origin `/api/*` requests to the separately deployed FastAPI
service, so the browser does not need a cross-origin API configuration.

## Required Cloudflare setting

`VITE_API_PROXY_TARGET` is configured in `wrangler.jsonc` as the public **origin
only** of the Railway backend, without `/api` or another path:

```text
https://content-tool-production-9869.up.railway.app
```

Update that value before deploying if the Railway service hostname changes. The
same name is used by Vite's local proxy, where `.env` can override it with
`http://localhost:8000`.

## Deploy from this directory

```bash
bun install --frozen-lockfile
bun run deploy:dry-run
bun run deploy
```

`deploy` keeps any additional variables already configured in the Cloudflare
dashboard.

## Deploy with Cloudflare Builds

When the Git repository root contains both `frontend/` and `backend/`, use:

- Root directory: `frontend`
- Build command: `bun run build`
- Deploy command: `bunx wrangler deploy --keep-vars`

Do not use the repository root or `frontend/src` as the asset directory. Wrangler
serves `frontend/dist` and falls back to `index.html` for SPA routes.

## Cloudflare-style local check

Copy the example variables once, then start the asset server and API proxy:

```bash
cp .dev.vars.example .dev.vars
bun run dev:cloudflare
```

The normal `bun run dev` command still uses `VITE_API_PROXY_TARGET` from `.env`
for the faster Vite development loop.
