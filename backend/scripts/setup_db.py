#!/usr/bin/env python3
"""Create any missing tables on a fresh Neon database.

Aerich still owns incremental schema changes. This exists for the first run
against an empty Neon branch, where generating a migration would require the
database the migration is meant to create.
"""

from __future__ import annotations

import asyncio

from tortoise import Tortoise

from app.store import close_database, initialise_database


async def main() -> None:
    await initialise_database()
    try:
        await Tortoise.generate_schemas(safe=True)
        connection = Tortoise.get_connection("default")
        _, rows = await connection.execute_query(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        )
        print("Tables present:")
        for row in rows:
            print(f"  - {row['tablename']}")
    finally:
        await close_database()


if __name__ == "__main__":
    asyncio.run(main())
