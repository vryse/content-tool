#!/usr/bin/env python3
"""List the projects the database holds, with what each one owns."""

from __future__ import annotations

import argparse
import asyncio

from app.store import close_database, initialise_database, list_projects


async def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    await initialise_database()
    try:
        projects = await list_projects()
        if not projects:
            print("No projects yet. Upload reference documents to create the first one.")
            return
        width = max(len(project.company) for project in projects)
        for project in projects:
            profile = (
                f"profile from {project.profile_source_count} docs"
                if project.has_profile
                else "no profile"
            )
            print(
                f"{project.company.ljust(width)}  "
                f"{project.reference_count:>3} refs  "
                f"{project.document_word_count:>8,} words  "
                f"{project.run_count:>3} runs  {profile}"
            )
    finally:
        await close_database()


if __name__ == "__main__":
    asyncio.run(main())
