from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "runs" ADD "parent_run_id" VARCHAR(128);
        CREATE INDEX IF NOT EXISTS "idx_runs_parent__5610bd" ON "runs" ("parent_run_id");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP INDEX IF EXISTS "idx_runs_parent__5610bd";
        ALTER TABLE "runs" DROP COLUMN "parent_run_id";"""


MODELS_STATE = (
    "eJztmutv2joUwP8VlE+dxJ1a2m3V/QaU3nHFo6L0blpVRSYxkItjp7azFk3932fnQR44Ga"
    "kIbUS+wXkk9i/Hx+c4+aXZxISIfbyG0JwBY6X93filYWBD8WNL12xowHEijRRwMEOe8Txu"
    "NWOcAoML+RwgBoXIhMyglsMtgoUUuwhJITGEoYUXkcjF1qMLdU4WkC8hFYr7ByG2sAmfIQ"
    "v/Oit9bkFkJoZrmfLenlzna8eT9TG/9gzl3Wa6QZBr48jYWfMlwRtrC3MpXUAMKeBQXp5T"
    "Vw5fji6YaTgjf6SRiT/EmI8J58BFPDbdHRkYBEt+YjTMm+BC3uWv1tnFl4vL888Xl8LEG8"
    "lG8uXFn140d9/RIzCaai+eHnDgW3gYI27UxbqKXXcJqBpe5JECKIadBhjiyiMYCspDaINn"
    "HUG84Evx96x1mQPsv/ak+7U9ORFWH+RkiIhkP8RHgarl6yTVGEXwpMfXQJLlFD5nBGLary"
    "yi0ULcD9IcgtPe96kctM3YI4qDOxm2v3tM7XWgGYxH/4TmMdDdwbizxZfL4ey+wiOHP69y"
    "BdIgAg9IdD/rPJYP5dVdQw6D6f8zMZgteP/ejkcZ+VHlnAJ5h4X23rQM3mwgi/GHykWqnH"
    "9+pKaDUlIgjC+odxXvAulINSiU89cB3wZ+JTTcsqEaetIzRdsMXD+GP94nbU3MwRxjtA7W"
    "UF6e6A97t9P28CbxCK7a057UtBKJIpSefE49ls1FGt/6068N+bfxYzzqpZ/Uxm76Q5NjAi"
    "4nOiZPOjBjG04oDcG8yGpjvortm1Igc/UToKa+pSEtkmW7rbJbdloCMFh4j0XClcMMarDB"
    "YNgFCKnKs1CVW50hZOuGsGJ1eVaXZ8dYnjEuFlYRiBuHqhRkB4DoJZYiEDcO1YTY+vRpB4"
    "jCKhOip0uXZY7LRQZdQcyKZMSU26uK2rcguueqlrj8Vfy2/I4VIBKzw8ZaZ1DcyFQgvEYE"
    "ZEBU+KYwzqXz+wSZQ+lqfNcZ9Bo3k163f9sPeoJN6ekppUgILO5Nc9JrD1JcIRNFuVe+G6"
    "Ls1F2m2LNz0Krda7rh/u0aBmSKaO0QgiDAGZt45JUiORNulQPZGY8HiV6p00+fnNwNOz2x"
    "r39IAt3OApBSQoucU20cXrWVH/405dDnU8fd9Vekyw+n/W7bfAgohuYNhXNIxU4LNVXDv2"
    "XUzG39fXPd2diXcAhwLwLCdgBe+7emQiN/GUuAF9AP5mbiUFF7qM8Nyj03iD2QXdu1mEsl"
    "Tw5K6deiaN4VY+RRt71ROCZTwc4hmXSrJtDz1g48z1uZOKUq891OkSIu5VYVmoeu5RxqEW"
    "pxRe7M3HjiLsd6snDcJXD94quMinjiYk1RA0txbtVLXfyG77re/p1N6dVrWW8bqlbQVrAU"
    "o/DRtSi0obhl4Q9DlM71hyHprKv6MMRBABfmnXCqOe/CGVBuCR/dBnRlkqdCFbLKtyqp49"
    "BlMvwJkAvkKAtHtcJ1D7H9rk6Zy0khgIrEqxevL7YcSzrGr0qZUXctdddSXtfShtQylpqi"
    "cQk0zbzeBUQ29Zd6+4z1kk/cf0LKlAdy2Wk55lKVKuMADYpcGgUgBubVBHh2errLnnZ6mr"
    "2nSV1qTyOYQ6zY0LIrsphL3WVklWJvur28/AZDWM22"
)
