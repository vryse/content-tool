from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "feedback" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "run_id" VARCHAR(128) NOT NULL,
    "raw_feedback" TEXT NOT NULL,
    "rating" INT,
    "instructions_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_feedback_run_id_ee1af4" ON "feedback" ("run_id");
CREATE TABLE IF NOT EXISTS "llm_calls" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "run_id" VARCHAR(128) NOT NULL,
    "stage" VARCHAR(128) NOT NULL,
    "model" VARCHAR(255) NOT NULL,
    "input_tokens" INT NOT NULL,
    "output_tokens" INT NOT NULL,
    "latency_seconds" DOUBLE PRECISION NOT NULL,
    "estimated_cost_usd" DOUBLE PRECISION NOT NULL,
    "success" BOOL NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_llm_calls_run_id_67ac9a" ON "llm_calls" ("run_id");
CREATE TABLE IF NOT EXISTS "learned_preferences" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "company" VARCHAR(255) NOT NULL,
    "target" VARCHAR(255) NOT NULL,
    "change_type" VARCHAR(32) NOT NULL,
    "instruction" TEXT NOT NULL,
    "priority" INT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uid_learned_pre_company_64af5d" UNIQUE ("company", "target", "change_type", "instruction")
);
CREATE INDEX IF NOT EXISTS "idx_learned_pre_company_4517e6" ON "learned_preferences" ("company");
CREATE TABLE IF NOT EXISTS "runs" (
    "run_id" VARCHAR(128) NOT NULL PRIMARY KEY,
    "company" VARCHAR(255) NOT NULL,
    "requirements_json" JSONB NOT NULL,
    "plan_json" JSONB NOT NULL,
    "article_markdown" TEXT NOT NULL,
    "evaluation_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "aerich" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "version" VARCHAR(255) NOT NULL,
    "app" VARCHAR(100) NOT NULL,
    "content" JSONB NOT NULL
);"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "feedback";
        DROP TABLE IF EXISTS "llm_calls";
        DROP TABLE IF EXISTS "learned_preferences";
        DROP TABLE IF EXISTS "runs";
    """


MODELS_STATE = (
    "eJztml1v2joYx78KylUn9Uwt7bbq3AGlZxxBqSg9m1ZVkUkM5ODYqe2sRVO/++y8kMQ4Ga"
    "mANiJ38Lwk9i+P7b+d/DJcYkPEPl5BaE+AtTD+bvwyMHCh+LHmO24YwPMSjzRwMEFB8DQd"
    "NWGcAosL+xQgBoXJhsyijscdgoUV+whJI7FEoINnicnHzqMPTU5mkM8hFY77B2F2sA2fIY"
    "v/egtz6kBkZ5rr2PLegd3kSy+w9TC/CgLl3SamRZDv4iTYW/I5watoB3NpnUEMKeBQXp5T"
    "XzZfti7qadyjsKVJSNjEVI4Np8BHPNXdDRlYBEt+ojUs6OBM3uWv5un5l/OLs8/nFyIkaM"
    "nK8uUl7F7S9zAxIHA9Nl4CP+AgjAgwJtyoj00du84cUD28JEMBKJqtAoxxFRGMDbtD6IJn"
    "E0E843Px97R5UQDsv9ao87U1OhJRH2RniKjksMSvI1cz9EmqKYrgyUyPgSzLMXzOKUQ1b1"
    "dEk4G4HaQFBMfd72PZaJexR5QGdzRofQ+YusvI0x9e/xOHp0B3+sP2Gl8um7P5CE8S/jzK"
    "NUijCtwj0e2M89R8KK/uW7IZzPyficaswfv3dnidMz/qkhWQd1h4723H4scN5DD+ULlKlf"
    "0vrlS1KCUFwviMBlcJLqBWqkWh7L8J+DrwS+Hhjgv10LOZCm07Sv0Y/3iftA3RB3uI0TIa"
    "Q0XzRG/QvR23BjeZR3DZGnelp5mZKGLr0Wflsawu0vjWG39tyL+NH8PrrvqkVnHjH4ZsE/"
    "A5MTF5MoGdWnBiawzmRaqN6SK1bkqDnKufALXNNQ9pkrzYdZfbdFULwGAWPBYJVzYz0mD9"
    "/qADENLJs9hVqM4Qck1LRLFantXy7BDlGeNiYJWBuEqoiiDbA8RgYikDcZVQTYjNT582gC"
    "iiciEGPlWWeT4XM+gCYlZmRlTSXiVq34LollUt8fmr+K3lHSpAJHqHraXJoLiRrUF4hQjI"
    "gajJVTBOZfL7BFlA6XJ41+53Gzejbqd324v2BCvpGTilSRgcHnRz1G31Fa6QCVEeyHdLyE"
    "7TZ5o1uwCtPr2mG6/fvmVBpqnWNiEIApyziCdZCsmJSKscyPZw2M/sldo99eTkbtDuinX9"
    "Qxbo+iwAKSW0zDnVKuFVS/n+T1P2fT512Lv+iuzy426/220+BBRD+4bCKaRipYWGbsO/Fn"
    "RcuPUPw01vFb+DQ4B7URCuB/AyvDUVHvnLmgM8g2ExH2cOFY2H+txgt+cGqQey6XYtlVLJ"
    "k4Od7NeSat4UY5JRb3uTcsxOBRuXZDatmkDPmhvwPGvm4pSu3Hc7ZUScklYVmvvWch51CH"
    "W4Zu7MXXjSKYd6snDYErh+8bULRTzysaHRwNJcqHqpj9/wXdfbv7PZuXrd1duGqgnaCkox"
    "Ch99h0IXiluW/jBEm1x/GKLOuroPQzwEcGnemaSa8yacAeWOyDFdQBc2eSqlkHW5VZk69i"
    "2T4U+AfCBbWbqqNalbqO13dcpcf1tWS+xKSOwWpI41NzQqO/IUCm2QxNSflW2z1nd8PPwT"
    "UqY9PcpX06mUqiyJe1DTcmiUgBiFVxPg6cnJJvu8k5P8fZ70KWsawRxizYKWLx9SKbUkzt"
    "MNb7q8vPwG0u5gvQ=="
)
