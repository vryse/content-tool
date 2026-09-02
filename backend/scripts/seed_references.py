#!/usr/bin/env python3
"""Upload the checked-in reference documents to Cloudflare R2 and index them.

A one-off migration: before this change the corpus lived in
``backend/data/reference`` on whichever machine ran the pipeline. Running it
again is safe, since each document is addressed by a deterministic key and both
the upload and the index row are written as upserts.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
from pathlib import Path

from app.ingest import load_article
from app.models import ReferenceRecord, StyleProfile
from app.utils import storage
from app.utils.config import DATA_DIR, PROFILE_DIR
from app.store import close_database, initialise_database, save_profile, save_reference


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company", required=True, help="Project the documents belong to.")
    parser.add_argument(
        "--source",
        type=Path,
        default=DATA_DIR / "reference",
        help="Directory of .docx files to upload.",
    )
    parser.add_argument(
        "--import-profiles",
        action="store_true",
        help="Also load any profile JSON left in data/profiles into the database.",
    )
    args = parser.parse_args()

    paths = sorted(args.source.glob("*.docx"))
    if not paths:
        raise SystemExit(f"No .docx files found in {args.source}")

    await initialise_database()
    try:
        for path in paths:
            data = path.read_bytes()
            key = storage.object_key(args.company, path.name)
            content_hash = hashlib.sha256(data).hexdigest()
            article = load_article(path, args.company)
            await storage.put_object(key, data)
            await storage.store_cached(key, content_hash, data)
            await save_reference(
                ReferenceRecord(
                    key=key,
                    filename=path.name,
                    company=args.company,
                    size_bytes=len(data),
                    content_hash=content_hash,
                    title=article.title,
                    word_count=sum(section.word_count for section in article.sections),
                    section_count=sum(1 for section in article.sections if section.level > 0),
                )
            )
            print(f"uploaded {path.name} -> {key}")
        print(f"\n{len(paths)} reference documents are now in R2 for {args.company}.")

        if args.import_profiles:
            # Profiles used to be written as JSON next to the corpus. Loading them
            # here saves rebuilding an unchanged profile, which costs N+1 LLM calls.
            uploaded = [storage.object_key(args.company, path.name) for path in paths]
            for profile_file in sorted(PROFILE_DIR.glob("*.json")):
                profile = StyleProfile.model_validate_json(profile_file.read_text())
                await save_profile(profile, source_keys=uploaded)
                print(f"imported profile for {profile.company} from {profile_file.name}")
    finally:
        await close_database()


if __name__ == "__main__":
    asyncio.run(main())
