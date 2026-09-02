from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "analysis_outcomes" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "company" VARCHAR(255) NOT NULL,
    "source_article_count" INT NOT NULL,
    "vocabulary_size" INT NOT NULL DEFAULT 0,
    "outlier_count" INT NOT NULL DEFAULT 0,
    "tone_descriptors_json" JSONB NOT NULL,
    "total_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_tokens" INT NOT NULL DEFAULT 0,
    "wall_time_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_analysis_ou_company_2b6c58" ON "analysis_outcomes" ("company");
CREATE TABLE IF NOT EXISTS "generation_outcomes" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "run_id" VARCHAR(128) NOT NULL UNIQUE,
    "company" VARCHAR(255) NOT NULL,
    "parent_run_id" VARCHAR(128),
    "overall_score" DOUBLE PRECISION,
    "dimension_scores_json" JSONB NOT NULL,
    "section_count" INT NOT NULL DEFAULT 0,
    "word_count" INT NOT NULL DEFAULT 0,
    "missing_requirement_count" INT NOT NULL DEFAULT 0,
    "total_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_tokens" INT NOT NULL DEFAULT 0,
    "wall_time_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_generation__run_id_6f2e5a" ON "generation_outcomes" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_generation__company_9d1c3b" ON "generation_outcomes" ("company");
CREATE INDEX IF NOT EXISTS "idx_generation__parent__c4a8e7" ON "generation_outcomes" ("parent_run_id");
CREATE TABLE IF NOT EXISTS "feedback_outcomes" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "run_id" VARCHAR(128) NOT NULL,
    "company" VARCHAR(255) NOT NULL,
    "rating" INT,
    "human_instruction_count" INT NOT NULL DEFAULT 0,
    "evaluator_instruction_count" INT NOT NULL DEFAULT 0,
    "accepted_instruction_count" INT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_feedback_ou_run_id_1a9f4d" ON "feedback_outcomes" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_feedback_ou_company_5e3b2c" ON "feedback_outcomes" ("company");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "analysis_outcomes";
        DROP TABLE IF EXISTS "generation_outcomes";
        DROP TABLE IF EXISTS "feedback_outcomes";"""
