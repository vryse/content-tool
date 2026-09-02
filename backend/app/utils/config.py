"""Backend-only configuration and runtime paths."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv

# This module lives at ``backend/app/utils/config.py``.  Runtime configuration
# and data belong to the backend root, not the Python package directory.
ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
DATA_DIR = ROOT_DIR / "data"
PROFILE_DIR = DATA_DIR / "profiles"
# Reference documents live in Cloudflare R2. Parsing still wants a real file on
# disk, so objects are mirrored here on demand and reused while the hash matches.
REFERENCE_CACHE_DIR = DATA_DIR / "cache" / "reference"
EMBEDDING_CACHE_PATH = DATA_DIR / "embeddings.pkl"
_configured_provider = os.getenv("LLM_PROVIDER", "anthropic").lower()
DEFAULT_LLM_PROVIDER = _configured_provider if _configured_provider in {"anthropic", "openai", "google"} else "openai"
LLM_MODELS = {
    "anthropic": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
    "openai": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    "google": os.getenv("GOOGLE_MODEL", "gemini-3.7-flash"),
}
# Final drafts and their revisions benefit more from a stronger prose model than
# the short structured work used to build profiles and suggest topics.
OPENAI_WRITING_MODEL = os.getenv("OPENAI_WRITING_MODEL", "gpt-4.1")
DEFAULT_LLM_MODEL = LLM_MODELS.get(DEFAULT_LLM_PROVIDER, LLM_MODELS["openai"])
# Kept as a compatibility export for scripts and deployments that import it.
ANTHROPIC_MODEL = LLM_MODELS["anthropic"]
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")


def _cors_origins() -> list[str]:
    """Return browser origins allowed to call the API.

    ``CORS_ORIGINS`` is comma-separated so one Render deployment can serve a
    production frontend and any explicitly approved preview URL without opening
    the API to every website.
    """
    configured = os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    return origins or ["http://localhost:5173"]


CORS_ORIGINS = _cors_origins()


def _normalise_postgres_url(url: str | None) -> str | None:
    """Make a Neon connection string usable by Tortoise's asyncpg backend.

    Neon hands out libpq-style URLs carrying ``sslmode=require`` and a
    ``channel_binding`` parameter. asyncpg understands neither: it takes ``ssl``
    and rejects unknown keywords, so a pasted Neon URL fails at connect time
    with a confusing error. Translate rather than ask the user to hand-edit a
    string the Neon console told them to copy verbatim.
    """
    if not url:
        return None
    parts = urlsplit(url)
    if parts.scheme not in {"postgres", "postgresql"}:
        return url
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    sslmode = query.pop("sslmode", None)
    query.pop("channel_binding", None)
    if sslmode and "ssl" not in query:
        # asyncpg treats anything but ``disable``/``allow`` as "negotiate TLS".
        query["ssl"] = "false" if sslmode in {"disable", "allow"} else "true"
    # Neon pooled endpoints sit behind PgBouncer in transaction mode, which
    # cannot serve the prepared statements asyncpg caches by default.
    if "-pooler." in (parts.hostname or "") and "statement_cache_size" not in query:
        query["statement_cache_size"] = "0"
    # Tortoise recognises ``postgres://`` for its asyncpg backend, whereas Neon
    # often supplies the interchangeable libpq spelling ``postgresql://``.
    scheme = "postgres" if parts.scheme == "postgresql" else parts.scheme
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


DATABASE_URL = _normalise_postgres_url(os.getenv("DATABASE_URL"))

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
# Explicit override wins so an S3-compatible stand-in can be used in tests.
R2_ENDPOINT = os.getenv("R2_ENDPOINT") or (
    f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else None
)
R2_PREFIX = os.getenv("R2_PREFIX", "references/")

TORTOISE_ORM = {
    "connections": {"default": DATABASE_URL},
    "apps": {
        "models": {
            "models": ["app.db.models", "aerich.models"],
            "default_connection": "default",
        }
    },
}


def ensure_directories() -> None:
    """Create runtime directories so first-run commands need no manual setup."""
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    REFERENCE_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def tortoise_config() -> dict[str, object]:
    """Return the database configuration only when a hosted URL is configured."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required for PostgreSQL persistence.")
    return {
        "connections": {"default": DATABASE_URL},
        "apps": {
            "models": {
                "models": ["app.db.models", "aerich.models"],
                "default_connection": "default",
            }
        },
    }


def r2_config() -> dict[str, str]:
    """Fail loudly and specifically when object storage is half-configured."""
    missing = [
        name
        for name, value in (
            ("R2_ACCOUNT_ID or R2_ENDPOINT", R2_ENDPOINT),
            ("R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID),
            ("R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY),
            ("R2_BUCKET", R2_BUCKET),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(f"Cloudflare R2 is not configured; missing {', '.join(missing)}.")
    return {
        "endpoint_url": str(R2_ENDPOINT),
        "aws_access_key_id": str(R2_ACCESS_KEY_ID),
        "aws_secret_access_key": str(R2_SECRET_ACCESS_KEY),
        "bucket": str(R2_BUCKET),
    }
