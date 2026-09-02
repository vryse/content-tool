# UPGRADE_PLAN.md — from working pipeline to defensible system

Written 2026-09-02, against the tree as it stands after the R2 + database
migration (`StyleProfileRecord`, `ReferenceDocument`, profiles served from
Postgres rather than `data/profiles`).

---

## 0. The diagnosis

The pipeline works. It is not yet *distinctive*, and the reason is narrow:

**Embeddings are used in exactly one shallow way.** There is one vector per
document. `_source_text` (`backend/app/utils/retrieve.py:26`) concatenates the
title, every heading, and the first 300 words of body prose into a single
string, and that string becomes the document's only representation. Everything
downstream reads from that one vector:

- `retrieve()` ranks whole documents against a topic query and returns skeletons.
- `reference_centroid()` averages those vectors.
- `_embedding_fit()` (`backend/app/agents/quality.py:132`) scores the draft
  against that centroid and reports the result as a **style** signal.

That last step is the problem in miniature. A vector built mostly from body
prose encodes *topic*, so `_embedding_fit` largely measures "is this article
about the same things the corpus is about" while the evaluation UI presents it
as stylistic fit. It is not wrong so much as mislabelled, and a reviewer who
looks at `_source_text` will notice.

The second gap is that the **feedback loop does not actually accumulate
knowledge**. `merge_instructions` (`backend/app/feedback.py:131`) deduplicates
on a lowercased, whitespace-normalised instruction string, and
`LearnedPreference` enforces `unique_together` on the exact instruction text
(`backend/app/db/models.py:44`). So:

> "make the intro less salesy" and "cut the marketing tone from the opening"

are stored as two unrelated preferences, forever, and both get injected into
every subsequent generation prompt for that company. The store grows; the
signal does not sharpen. Since the brief weights the feedback loop heavily,
this is the highest-value thing in the document.

**The fix is not more tech stacks.** No Pinecone, no Qdrant, no LlamaIndex, no
GraphRAG. Postgres is already provisioned and already holds every other durable
artifact. The upgrade is to use vectors in more places, at the right
granularity, and to *measure* the retrieval instead of trusting it.

Phases are ordered by grading impact. Each is independently shippable.

---

## Phase 1 — Semantic memory over feedback

**Grading weight: highest.** This is what makes "the system learns" a claim
rather than a bullet point.

### What changes

1. New table `preference_vectors` (or an `embedding` column on
   `LearnedPreference`) holding the instruction embedding plus an
   `observation_count` and `last_seen_at`.
2. `remember_preferences()` stops being a blind `get_or_create`. It embeds the
   incoming instruction, compares against existing preferences for that company
   **and the same `change_type`**, and:
   - cosine ≥ 0.90 → treat as the same preference; increment
     `observation_count`, refresh `last_seen_at`, keep the *earlier* wording,
     promote priority if the new one is more urgent;
   - otherwise → insert as new.
3. `merge_instructions()` gains the same treatment within a single run, so two
   near-identical instructions — one from the human, one derived from the
   evaluator — collapse into one, with the human wording winning.
4. `learned_preferences()` gains a `topic` / `section` argument and returns
   **top-k by relevance**, not the entire company history. Ranking blends
   cosine-to-section against a recurrence weight, so a preference stated in five
   separate runs outranks a one-off.

### Why

Prompt budget is finite and preference lists only grow. Retrieving the six
preferences relevant to *this section of this article* is both cheaper and more
likely to be obeyed than pasting forty, most of which concern a section that
does not exist in the current draft. The recurrence count also gives the UI
something honest to show: "this company has asked for this 5 times."

### Verified by

Run the feedback cycle three times with differently-worded but equivalent
feedback. `learned_preferences` returns one entry with `observation_count = 3`,
not three entries. Record the before/after row counts in the README.

---

## Phase 2 — Source-leakage detector

**The single most distinctive feature available, because it audits the
project's own central claim.**

The README's strongest promise is that raw source documents never enter a
generation prompt — only the derived profile and short skeletons. Nothing in
the system currently *verifies* that promise holds in the output. Paraphrase
leakage would be invisible.

### What changes

1. New module `backend/app/utils/leakage.py`.
2. Split both the generated draft and every reference article into sentences
   (or ~2-sentence windows; sentence-level alone is noisy for short sentences).
3. Embed both sides, compute the cross-similarity matrix, and return the top-5
   highest-scoring `(draft_span, reference_span, score, source_filename)`
   tuples plus the global maximum.
4. Surface as a `LeakageReport` on `EvaluationResult`, rendered in the frontend
   beside the existing scores, with a three-band verdict:
   - max < 0.80 — clean, independently phrased
   - 0.80–0.88 — review these spans
   - ≥ 0.88 — probable paraphrase, flag loudly

### Why

Every submission asserts it respects the no-raw-source rule. This one produces
evidence, span by span, with a number attached. It also has genuine defensive
value: if the profile or a skeleton ever does start carrying too much source
text forward, this is the alarm that catches it.

Note the honest failure mode to document: a shared corpus vocabulary
("differential privacy", "PII redaction") will produce moderate similarity on
technical sentences regardless of leakage. That is why the thresholds are
calibrated against reference-to-reference similarity rather than fixed by fiat.

### Verified by

Deliberately paste a paragraph from a reference article into a draft and
confirm the detector places it in the top band. Then run a genuine draft and
record the actual maximum in the README.

---

## Phase 3 — Measure the retriever

**Almost nobody does this in a take-home. It reads as more senior than any
additional feature.**

### What changes

1. A small labelled fixture: ~15 `(topic, expected_best_reference)` pairs
   derived from the real corpus, checked in as JSON.
2. `backend/scripts/eval_retrieval.py` reporting **recall@2** and **MRR**.
3. A results table in the README, with a row per configuration.

### Why

Retrieval quality is currently asserted, not shown. Once a number exists, every
later change in this document becomes falsifiable — Phase 4's chunking and
Phase 6's model swap are only justified if the table moves. Without it they are
taste.

### Verified by

The script runs and prints a table. Baseline recorded before Phase 4 begins.

---

## Phase 4 — Section-level chunks; split topic from structure

### What changes

1. Replace the single per-document vector with **two indices**:
   - a **topic index** over individual sections (heading + body), for finding
     content-relevant material;
   - a **structure index** over the heading sequence rendered as text, for
     finding articles whose *shape* fits the requested piece.
2. `retrieve()` draws from both, so a returned skeleton set can honestly be
   "the intro pattern from A, the section arc from B" instead of hoping one
   blended vector serves both purposes.
3. `reference_centroid()` is rebuilt from the structure index, which makes
   `_embedding_fit` a defensible style signal and lets the UI label stop
   lying.
4. Drop the 300-word truncation in `_source_text` — chunking makes it
   unnecessary.

### Why

This is the root cause identified in §0. It also directly serves the two
highest-weighted grading stages: better structural retrieval improves the
generated plan, and an honest style metric improves evaluation.

### Verified by

Phase 3's table, re-run. If recall@2 does not improve, keep the change only for
the metric-honesty argument and say so explicitly rather than claiming a win
that did not happen.

---

## Phase 5 — Embedding-based feedback localisation

### What changes

`locate_in_draft` (`backend/app/feedback.py:49`) currently localises feedback
only when a heading appears verbatim in the text, or when a ≥25-character quote
is a literal substring of a section body. Both are brittle: an evaluator that
paraphrases the passage it dislikes, or refers to "the pricing discussion"
when the heading reads "What it costs", falls through to `__global__`.

Replace with: embed the feedback text, score against the section vectors from
Phase 4, take the argmax above a threshold (~0.45), and fall back to
`__global__` below it. **Keep the existing substring path as a first, cheap,
high-precision check** — when a verbatim quote matches, that is stronger
evidence than any cosine score.

### Why

Every instruction that degrades to `__global__` turns a targeted section
rewrite into a whole-article rewrite. That is more tokens, more regression risk,
and a worse before/after diff — the exact artifact the brief asks to see.

### Verified by

Count `__global__` instructions per run before and after across the recorded
feedback cycles. The number should fall.

---

## Phase 6 — Cheaper wins, once the harness exists

These are small and only worth doing *after* Phase 3 can prove they helped.

| Upgrade | Change | Rationale |
| --- | --- | --- |
| **Intra-draft redundancy** | Pairwise cosine between the draft's own sections; flag > 0.80 as "these two sections make the same point" and emit a `RevisionInstruction`. | A real editorial defect that LLM judges routinely miss. ~20 lines, no new dependency. |
| **Computed generic-language score** | Keep a small anchor set of filler sentences ("In today's fast-paced digital landscape…"); score each draft sentence's max cosine against it. | Turns `generic_sounding_passages` from an LLM opinion into a reproducible metric with a defensible threshold, and lets the two corroborate or disagree. |
| **Model swap** | `all-MiniLM-L6-v2` → `bge-small-en-v1.5` or `gte-small`. | Same cost class, materially better retrieval. Do it after Phase 3 so the delta is a number in the table. |
| **pgvector** | Move vectors out of `data/embeddings.pkl` into Postgres. | Deletes the pickle-plus-fingerprint cache in `build_reference_index`, matches where every other artifact now lives after the R2 migration, and unlocks Phase 7. |

---

## Phase 7 — Cross-run semantic search (only after pgvector)

With vectors in Postgres, runs become searchable alongside references:

- "Which past runs are semantically near this topic?" — surfaces prior art
  before generating, so the system stops silently rewriting the same article.
- "Has this company already covered this?" — an editorial-planning answer the
  pipeline currently cannot give.
- Highly-rated past drafts become retrievable few-shot exemplars, which closes
  the learning loop started in Phase 1: the system improves from what worked,
  not only from what was criticised.

This is genuinely a feature rather than plumbing, but it is last because it
depends on Phase 6's storage change and delivers nothing until several runs
exist.

---

## Deliberately not doing

Stating these — and the corpus size at which each flips — is part of the
deliverable. Restraint that is explained reads as judgement; restraint that is
silent reads as ignorance.

| Rejected | Why | When it would flip |
| --- | --- | --- |
| **Hybrid BM25 + vector with reciprocal rank fusion** | At ~20 documents, recall is not the bottleneck — every relevant document is already in the candidate set. RRF would be measurable effort for an unmeasurable gain. | Low thousands of documents, or a corpus with heavy exact-term requirements (product names, error codes). |
| **Cross-encoder reranking** (`ms-marco-MiniLM`) | Reranking a top-20 that is already the entire corpus is a no-op with extra latency. | Same threshold as above, once top-k is a genuine subset. |
| **A dedicated vector database** (Pinecone, Qdrant, Weaviate) | Postgres is already provisioned, already holds runs, profiles, and reference metadata, and pgvector covers this scale comfortably. A second datastore adds an operational dependency and a consistency problem in exchange for nothing at this size. | Millions of vectors, or a need for filtered ANN at latencies Postgres cannot hold. |
| **GraphRAG / knowledge-graph extraction** | The corpus is ~20 topically homogeneous articles by one publisher. There is no entity graph of interest to traverse. | A multi-company corpus where cross-document entity relationships are the actual question. |
| **Fine-tuning an embedding model on the corpus** | ~20 documents is far too few; it would overfit and the evaluation set would be the training set. | Thousands of labelled relevance pairs. |

---

## Sequencing

```
Phase 1  Semantic feedback memory      ← highest grading weight, independent
Phase 2  Leakage detector              ← highest distinctiveness, independent
Phase 3  Retrieval evaluation harness  ← must precede 4 and 6 to prove them
Phase 4  Section chunking + dual index ← depends on 3 for justification
Phase 5  Embedding localisation        ← depends on 4's section vectors
Phase 6  Redundancy, generic score, model swap, pgvector
Phase 7  Cross-run search              ← depends on 6's pgvector
```

Phases 1 and 2 share the embedding plumbing and can be built together. If time
runs short, **1, 2, and 3 alone** are the difference between a competent
submission and a memorable one — 1 because the brief weights the feedback loop,
2 because it audits the project's own central claim, and 3 because it makes
every other claim in this document checkable.

---

## Documentation debt to clear alongside

`README.md` §3 states that LangChain routes structured calls to Claude, OpenAI,
and Gemini through `backend/app/utils/llm.py` — and then the "Deliberately not
used" list immediately below names LangChain. `langchain-anthropic`,
`langchain-openai`, and `langchain-google-genai` are all in
`backend/pyproject.toml`, so the first statement is the true one. Delete the
contradicting bullet.
