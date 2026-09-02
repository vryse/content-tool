"""Database records kept separate from the Pydantic pipeline contracts."""

from tortoise import fields, models


class Run(models.Model):
    run_id = fields.CharField(max_length=128, pk=True)
    company = fields.CharField(max_length=255)
    requirements_json = fields.JSONField()
    plan_json = fields.JSONField()
    article_json = fields.JSONField(null=True)
    article_markdown = fields.TextField()
    evaluation_json = fields.JSONField(null=True)
    parent_run_id = fields.CharField(max_length=128, null=True, index=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "runs"


class Feedback(models.Model):
    id = fields.IntField(pk=True)
    run_id = fields.CharField(max_length=128, index=True)
    raw_feedback = fields.TextField()
    rating = fields.IntField(null=True)
    instructions_json = fields.JSONField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "feedback"


class LearnedPreference(models.Model):
    id = fields.IntField(pk=True)
    company = fields.CharField(max_length=255, index=True)
    target = fields.CharField(max_length=255)
    change_type = fields.CharField(max_length=32)
    instruction = fields.TextField()
    priority = fields.IntField()
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "learned_preferences"
        unique_together = ("company", "target", "change_type", "instruction")


class LLMCall(models.Model):
    id = fields.IntField(pk=True)
    run_id = fields.CharField(max_length=128, index=True)
    stage = fields.CharField(max_length=128)
    model = fields.CharField(max_length=255)
    input_tokens = fields.IntField()
    output_tokens = fields.IntField()
    latency_seconds = fields.FloatField()
    estimated_cost_usd = fields.FloatField()
    success = fields.BooleanField()
    error = fields.TextField(null=True)
    created_at = fields.DatetimeField()

    class Meta:
        table = "llm_calls"


class StyleProfileRecord(models.Model):
    """One cached style profile per company.

    Profiles used to be JSON files under ``data/profiles``, which tied a built
    profile to whichever machine built it. Holding the whole document in a JSONB
    column keeps the profile shape owned by the Pydantic model while making it
    readable from any process pointed at the same database.
    """

    company = fields.CharField(max_length=255, pk=True)
    profile_json = fields.JSONField()
    source_keys = fields.JSONField(default=list)
    source_article_count = fields.IntField(default=0)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "style_profiles"


class ReferenceDocument(models.Model):
    """Metadata for a reference .docx whose bytes live in Cloudflare R2.

    The bucket is the store; this table is the index the UI lists and the
    profile builder selects from. ``content_hash`` is what lets a parsed copy be
    cached on disk without ever serving stale bytes after a re-upload.
    """

    key = fields.CharField(max_length=512, pk=True)
    filename = fields.CharField(max_length=255)
    company = fields.CharField(max_length=255, index=True)
    size_bytes = fields.IntField()
    content_hash = fields.CharField(max_length=64)
    title = fields.CharField(max_length=512, null=True)
    word_count = fields.IntField(null=True)
    section_count = fields.IntField(null=True)
    parse_error = fields.TextField(null=True)
    uploaded_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "reference_documents"
