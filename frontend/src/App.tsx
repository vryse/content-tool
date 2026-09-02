import { useMemo, useState } from "react";
import { api, type Requirements } from "./lib/api";
import { assembleMarkdown } from "./lib/markdown";
import { DraftDialog } from "./components/DraftDialog";
import { Field, Head, RuleLabel, StatCell } from "./components/Press";
import { ScoreLedger } from "./components/ScoreLedger";
import { Cycle, Descend, Frame, Library, Mark, Sheet, Spinner } from "./components/Glyph";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { ProgressButton } from "./components/ProgressButton";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { useAlert } from "./hooks/useAlert";
import { usePipeline } from "./hooks/usePipeline";
import { useIngest } from "./hooks/useIngest";

/**
 * The brief's `company` is filled from the active project at submit time, so it is
 * absent here: a literal would be a second source of truth for which project the
 * run belongs to, and the wrong one whenever the studio is pointed elsewhere.
 */
const initialBrief: Omit<Requirements, "company"> = {
  topic: "",
  target_audience: "Security and privacy leaders",
  target_word_count: 900,
  key_points: [
    "Map PII before it reaches the model",
    "Use tokenisation at the application boundary",
  ],
  required_sections: ["What changes with AI copilots", "A practical control plane"],
  include_table: false,
  include_flowchart: false,
  llm_provider: "openai",
};

/** The artefact chain, in the order the pipeline produces it. */
const STAGES = [
  "Reference profile",
  "Plan",
  "Write",
  "Critique",
  "Evaluate",
  "Feedback loop",
] as const;

/**
 * A few lines of the draft, for the card that stands in for it before it is opened.
 * The section bodies are markdown, and printing them raw put `**` and `##` on screen in
 * a face chosen for reading prose, so the syntax is stripped rather than rendered: this
 * is a two-line orientation cue, and mounting the full markdown renderer to produce one
 * would drag the measure and heading rules of `.prose-press` into a card that is 3 lines tall.
 */
const excerpt = (markdown: string) =>
  markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

export default function App() {
  const {
    online,
    run,
    previousRun,
    summary,
    instructions,
    busy,
    progress,
    deltas,
    generate,
    submitFeedback,
    regenerate,
  } = usePipeline();
  // The profile and its build live in the ingest context so the build outlives the
  // dialog; the studio only reads them.
  const {
    profile,
    project,
    projectsLoading,
    setOpen: setIngestOpen,
    building: buildingProfile,
    progress: profileProgress,
  } = useIngest();
  const { showAlert } = useAlert();
  const [brief, setBrief] = useState(initialBrief);
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState(0);
  // Hand edits are stored against the generated text they were made on, so a new run (or a
  // revert) drops them without an effect having to reset state.
  const [edited, setEdited] = useState<{ base: string; text: string } | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [suggestingTopic, setSuggestingTopic] = useState(false);

  const update = <K extends keyof typeof initialBrief>(key: K, value: (typeof initialBrief)[K]) =>
    setBrief((current) => ({ ...current, [key]: value }));
  // The project is the ingest library's, not the brief's. It decides which profile and
  // corpus the backend loads, so a copy held here could ask for a profile built from
  // another project's documents. It is shown read-only beside the topic for that reason.
  const runGeneration = async () => {
    if (!project) return;
    if (await generate({ ...brief, company: project })) setDraftOpen(true);
  };
  const suggestTopic = async () => {
    if (!project) {
      showAlert("Choose a project with uploaded references first.");
      return;
    }
    setSuggestingTopic(true);
    try {
      const suggestion = await api.suggestTopic({
        company: project,
        llm_provider: brief.llm_provider,
        llm_model: brief.llm_model,
      });
      update("topic", suggestion.topic);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : "Could not suggest a topic.");
    } finally {
      setSuggestingTopic(false);
    }
  };

  const runRegeneration = async () => {
    if (await regenerate()) setDraftOpen(true);
  };

  const generated = useMemo(() => (run ? assembleMarkdown(run.article) : ""), [run]);
  const draft = edited?.base === generated ? edited.text : generated;
  const setDraft = (text: string) => setEdited({ base: generated, text });
  const draftWords = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  const done = (index: number) =>
    index === 0 ? Boolean(profile) : index < 5 ? Boolean(run) : Boolean(instructions.length);
  const active = STAGES.findIndex((_, index) => !done(index));

  return (
    <div className="h-dvh overflow-hidden bg-canvas text-ink lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_23.5rem]">
      {/* ------------------------------------------------------------------ RAIL
          The masthead sits in the gutter rather than across a full-width bar. A
          broadsheet does the same thing, and it buys back the vertical band that a
          translucent blurred header used to spend on a wordmark and two controls. */}
      <aside className="flex flex-col border-rule bg-rail max-lg:border-b lg:min-h-0 lg:overflow-y-auto lg:border-r">
        <div className="flex items-center gap-3 px-5 py-4 max-lg:justify-between">
          <div>
            <p className="t-caps text-brand text-[0.8125rem] tracking-[0.14em]">Vryse</p>
            <p className="t-meta mt-0.5">Editorial systems</p>
          </div>
          {/* On the narrow layout the rail collapses to this strip, so the project
              switcher, the ingest control and the connection light come along with it. */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-40">
              <ProjectSwitcher compact />
            </div>
            <IngestControl
              building={buildingProfile}
              label={profileProgress?.label}
              onOpen={() => setIngestOpen(true)}
            />
            <Status online={online} />
          </div>
        </div>

        <div className="hidden flex-1 flex-col gap-6 px-5 pb-5 lg:flex">
          {/* The widest-scoped control in the app, so it sits above everything it
              qualifies rather than inside the library dialog it used to live in. */}
          <ProjectSwitcher />

          <div>
            <RuleLabel>Production</RuleLabel>
            <ol className="mt-2.5">
              {STAGES.map((stage, index) => (
                <li
                  key={stage}
                  className={`flex items-center gap-2.5 border-l py-[5px] pl-2.5 ${
                    index === active ? "border-brand" : "border-transparent"
                  }`}
                >
                  <span className="flex w-5 shrink-0 justify-center">
                    {done(index) ? (
                      <Mark size={11} className="text-ink-2" />
                    ) : (
                      <span className="t-data-sm text-ink-3">{`0${index + 1}`}</span>
                    )}
                  </span>
                  <span
                    className={`t-ui-sm truncate font-normal ${
                      done(index) ? "text-ink" : index === active ? "text-ink-2" : "text-ink-3"
                    }`}
                  >
                    {stage}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <RuleLabel>Reference profile</RuleLabel>
            {profile ? (
              <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatCell label="Sources" value={profile.source_article_count} />
                  <StatCell label="Terms" value={profile.vocabulary.length} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {profile.voice.tone_descriptors.slice(0, 4).map((tone) => (
                    <Badge key={tone}>{tone}</Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="t-meta mt-2.5 leading-[1.5]">
                {project
                  ? `No profile cached for ${project}. Generation stays closed until the corpus has produced one.`
                  : projectsLoading
                    ? "Loading projects."
                    : "No project selected. Create one, then upload its reference documents."}
              </p>
            )}
            <div className="mt-3">
              <IngestControl
                building={buildingProfile}
                label={profileProgress?.label}
                cost={profileProgress?.cost}
                onOpen={() => setIngestOpen(true)}
                wide
              />
            </div>
          </div>

          <div className="mt-auto border-t border-rule pt-3">
            <Status online={online} />
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- CANVAS */}
      <main className="min-w-0 lg:min-h-0 lg:overflow-y-auto max-lg:overflow-visible">
        <div className="mx-auto grid max-w-[46rem] gap-10 px-6 py-8 lg:px-10 lg:py-10">
          <section className="grid gap-5">
            <Head aside={<span className="t-data-sm text-ink-3">{project || "No project"}</span>}>
              The brief
            </Head>

            <Field label="Topic" hint="use your reference library for a fresh idea">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={brief.topic}
                  placeholder="Describe a topic, or generate one from your references"
                  onChange={(e) => update("topic", e.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void suggestTopic()}
                  disabled={suggestingTopic || busy !== null || !online || !project}
                  className="shrink-0"
                >
                  {suggestingTopic ? <Spinner size={14} /> : <Cycle size={14} />}
                  {suggestingTopic ? "Finding a topic" : "Suggest from references"}
                </Button>
              </div>
            </Field>

            <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
              <Field label="Target audience">
                <Input
                  value={brief.target_audience}
                  onChange={(e) => update("target_audience", e.target.value)}
                />
              </Field>
              <Field label="Target length">
                <Input
                  type="number"
                  min={100}
                  value={brief.target_word_count}
                  onChange={(e) => update("target_word_count", Number(e.target.value))}
                />
              </Field>
            </div>

            <Field label="Key points" hint="one per line">
              <Textarea
                rows={3}
                value={brief.key_points.join("\n")}
                onChange={(e) => update("key_points", e.target.value.split("\n").filter(Boolean))}
              />
            </Field>

            <Field label="Required sections" hint="one per line">
              <Textarea
                rows={2}
                value={brief.required_sections.join("\n")}
                onChange={(e) =>
                  update("required_sections", e.target.value.split("\n").filter(Boolean))
                }
              />
            </Field>

            <fieldset className="border-y border-rule py-4">
              <legend className="t-label">Optional visual aids</legend>
              <p className="t-meta mt-1.5 max-w-[62ch] leading-[1.5]">
                Add only when the subject benefits from a comparison or a process view. Flowcharts
                are rendered in the draft and remain editable as Mermaid source.
              </p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 border border-rule bg-inset p-3 transition-colors duration-100 hover:border-rule-strong has-[:focus-visible]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/25">
                  <input
                    type="checkbox"
                    checked={brief.include_table}
                    onChange={(event) => update("include_table", event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand"
                  />
                  <span>
                    <span className="t-ui-sm block font-normal text-ink">
                      Include a comparison table
                    </span>
                    <span className="t-meta mt-0.5 block leading-[1.45]">
                      Use a compact Markdown table when it makes the point clearer.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 border border-rule bg-inset p-3 transition-colors duration-100 hover:border-rule-strong has-[:focus-visible]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/25">
                  <input
                    type="checkbox"
                    checked={brief.include_flowchart}
                    onChange={(event) => update("include_flowchart", event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand"
                  />
                  <span>
                    <span className="t-ui-sm block font-normal text-ink">Include a flowchart</span>
                    <span className="t-meta mt-0.5 block leading-[1.45]">
                      Render a Mermaid process diagram in the draft.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
              <ProgressButton
                idleLabel="Generate traceable draft"
                icon={<Sheet size={14} />}
                running={busy === "generate"}
                status={progress?.label}
                cost={progress?.cost}
                step={progress?.step}
                total={progress?.total}
                onClick={runGeneration}
                disabled={busy !== null || !online || !profile || !project}
              />
              {!profile && (
                <p className="t-meta">
                  {project
                    ? `Build a reference profile for ${project} first.`
                    : "Choose a project first."}
                </p>
              )}
            </div>
          </section>

          {run && (
            <section className="grid gap-4">
              <Head
                aside={
                  <>
                    <Badge>{run.article.sections.length} sections</Badge>
                    <Badge>{draftWords.toLocaleString()} words</Badge>
                    {draft !== generated && <Badge tone="brand">Edited</Badge>}
                  </>
                }
              >
                The draft
              </Head>

              {/* The sheet is the only place `--paper-sheet` is spent, and it is spent
                  here because this is the artefact the rest of the app exists to make. */}
              <article className="border border-rule bg-sheet px-6 py-6 sm:px-8 sm:py-7">
                <h3 className="t-display-lg max-w-[34ch] text-ink">{run.article.title}</h3>
                <p className="prose-press mt-4 line-clamp-3 text-ink-2">
                  {excerpt(run.article.sections[0]?.markdown ?? "")}
                </p>
                <div className="mt-6 flex flex-wrap gap-2 border-t border-rule-faint pt-5">
                  <Button onClick={() => setDraftOpen(true)}>
                    <Frame size={14} /> Open draft
                  </Button>
                  <Button variant="secondary" onClick={() => setDraftOpen(true)}>
                    <Descend size={14} /> Export
                  </Button>
                </div>
              </article>

              <ol className="divide-y divide-rule-faint border-y border-rule">
                {run.article.sections.map((section, index) => (
                  <li
                    key={`${section.heading}-${index}`}
                    className="flex items-baseline gap-3 py-2"
                  >
                    <span className="t-data-sm w-5 shrink-0 text-ink-3">
                      {`${index + 1}`.padStart(2, "0")}
                    </span>
                    <span className="t-ui-sm min-w-0 flex-1 truncate font-normal text-ink-2">
                      {section.heading}
                    </span>
                    <span className="t-data-sm shrink-0 text-ink-3">
                      {section.markdown.trim().split(/\s+/).length} w
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </main>

      {/* ------------------------------------------------------------- INSPECTOR */}
      <aside className="flex flex-col border-rule bg-inspector max-lg:border-t lg:min-h-0 lg:overflow-y-auto lg:border-l">
        {run?.evaluation ? (
          <div className="grid gap-7 px-5 py-6">
            <div>
              <RuleLabel>{previousRun ? "Evaluation · child run" : "Evaluation"}</RuleLabel>
              <p className="t-data-2xl mt-4 text-ink">
                {run.evaluation.overall_score.toFixed(1)}
                <span className="t-data-lg text-ink-3">/100</span>
              </p>
              <p className="t-meta mt-2 leading-[1.5]">
                Weighted across {Object.keys(run.evaluation.dimension_scores).length} dimensions.
                {previousRun
                  ? " Movement is measured against the parent run. Only instruction-targeted sections were regenerated, so it is attributable to the instructions."
                  : ""}
              </p>
            </div>

            <ScoreLedger scores={run.evaluation.dimension_scores} deltas={deltas} />

            <Findings evaluation={run.evaluation} />

            {summary && (
              <div>
                <RuleLabel>Run cost</RuleLabel>
                <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-5">
                  <StatCell label="LLM calls" value={summary.total_calls} />
                  <StatCell
                    label="Tokens"
                    value={(summary.input_tokens + summary.output_tokens).toLocaleString()}
                  />
                  <StatCell label="Estimate" value={`$${summary.estimated_cost_usd.toFixed(4)}`} />
                  <StatCell label="Latency" value={summary.wall_time_seconds.toFixed(1)} unit="s" />
                </div>
              </div>
            )}

            <div>
              <RuleLabel>Feedback</RuleLabel>
              <Textarea
                className="mt-3"
                rows={4}
                placeholder="The intro is too generic. Open with a concrete breach scenario."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <Rating value={rating} onChange={setRating} />
                <Button
                  variant="secondary"
                  onClick={() => submitFeedback(feedback, rating)}
                  disabled={busy !== null || !feedback.trim()}
                >
                  {busy === "feedback" ? <Spinner size={14} /> : <Cycle size={14} />}
                  Transform
                </Button>
              </div>

              {instructions.length > 0 && (
                <div className="mt-5">
                  <RuleLabel>Derived instructions</RuleLabel>
                  <ol className="mt-3 grid gap-2.5">
                    {instructions.map((item, index) => (
                      <li
                        key={`${item.target}-${index}`}
                        className="border-l-2 border-brand-rule bg-sheet px-3 py-2.5"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <Badge tone="brand">{item.change_type}</Badge>
                          <span className="t-data-sm text-ink-3">
                            {item.source} · P{item.priority}
                          </span>
                        </div>
                        <p className="t-ui-sm mt-2 font-normal leading-[1.5] text-ink">
                          {item.instruction}
                        </p>
                        <p className="t-meta mt-1 truncate">Target: {item.target}</p>
                      </li>
                    ))}
                  </ol>
                  <ProgressButton
                    idleLabel="Regenerate targeted sections"
                    icon={<Cycle size={14} />}
                    running={busy === "regenerate"}
                    status={progress?.label}
                    cost={progress?.cost}
                    step={progress?.step}
                    total={progress?.total}
                    onClick={runRegeneration}
                    disabled={busy !== null}
                    className="mt-3.5 w-full"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-6 px-5 py-6">
            <div>
              <RuleLabel>The boundary</RuleLabel>
              <p className="t-display-md mt-3.5 max-w-[24ch] text-ink">
                Reference documents stay outside the writer.
              </p>
              <p className="t-ui-sm mt-3 font-normal leading-[1.55] text-ink-2">
                Only the derived style profile and the selected structural skeletons cross into
                generation. The source prose never does.
              </p>
            </div>
            <div>
              <RuleLabel>Then</RuleLabel>
              <p className="t-ui-sm mt-3 font-normal leading-[1.55] text-ink-2">
                Every draft is scored on nine dimensions, grouped by whether the number was
                computed, measured against the corpus, or judged by a model. The evaluation lands in
                this column.
              </p>
            </div>
          </div>
        )}
      </aside>

      {run && (
        <DraftDialog
          open={draftOpen}
          onClose={() => setDraftOpen(false)}
          title={run.article.title}
          value={draft}
          onChange={setDraft}
          generated={generated}
          onError={showAlert}
        />
      )}
    </div>
  );
}

/**
 * Opens the reference library, and doubles as the background build indicator: the build
 * continues with the dialog closed, so its progress has to stay legible from the studio.
 */
function IngestControl({
  building,
  label,
  cost,
  onOpen,
  wide,
}: {
  building: boolean;
  label?: string | null;
  cost?: number;
  onOpen: () => void;
  wide?: boolean;
}) {
  return (
    <Button
      variant="secondary"
      onClick={onOpen}
      aria-busy={building || undefined}
      className={`${wide ? "w-full justify-start" : ""} ${building ? "border-brand text-brand" : ""}`}
    >
      {building ? <Spinner size={14} /> : <Library size={14} />}
      <span className="min-w-0 truncate">{building ? (label ?? "Building") : "Ingest"}</span>
      {building && cost ? (
        <span className="t-data-sm ml-auto shrink-0 text-ink-3">${cost.toFixed(4)}</span>
      ) : null}
    </Button>
  );
}

/** Connection state. The dot is never the only cue; the word beside it says the same thing. */
function Status({ online }: { online: boolean | null }) {
  return (
    <p className="t-meta flex items-center gap-2">
      <span
        aria-hidden
        className={`size-1.5 ${
          online ? "bg-positive" : online === false ? "bg-negative" : "bg-ink-3"
        }`}
      />
      {online ? "API connected" : online === false ? "API offline" : "Checking API"}
    </p>
  );
}

/**
 * A five-step rating. It was five stars, which is the wrong instrument twice over: a star
 * is a review score for a product, and a filled glyph gives no read on where the value
 * sits in the range. Five ruled cells with the number in them do, and they match the mono
 * figures used everywhere else a quantity appears.
 */
function Rating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="t-caps">Rating</span>
      <div
        className="flex divide-x divide-rule border border-rule"
        role="radiogroup"
        aria-label="Rating out of five"
      >
        {[1, 2, 3, 4, 5].map((step) => (
          <button
            key={step}
            type="button"
            role="radio"
            aria-checked={value === step}
            aria-label={`${step} out of five`}
            onClick={() => onChange(step)}
            className={`t-data-sm size-6 transition-colors duration-100 ${
              step <= value ? "bg-brand text-brand-fg" : "bg-sheet text-ink-3 hover:bg-inset"
            }`}
          >
            {step}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Strengths, weaknesses and the passages the evaluator called generic. Kept in a
 * disclosure because the scores answer "how did it do" and this answers "why", which is
 * the second question and should not crowd the first.
 */
function Findings({
  evaluation,
}: {
  evaluation: NonNullable<import("./lib/api").Run["evaluation"]>;
}) {
  const groups = [
    { label: "Strengths", items: evaluation.strengths, prefix: "+" },
    { label: "Weaknesses", items: evaluation.weaknesses, prefix: "−" },
    { label: "Missing requirements", items: evaluation.missing_requirements, prefix: "!" },
  ].filter((group) => group.items.length > 0);

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between border-b border-rule pb-2">
        <span className="t-label">Editorial findings</span>
        <span className="t-data-sm text-ink-3 group-open:hidden">
          {groups.reduce((total, group) => total + group.items.length, 0)}
        </span>
        <span className="t-data-sm hidden text-ink-3 group-open:inline">Close</span>
      </summary>
      <div className="mt-3.5 grid gap-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="t-caps">{group.label}</p>
            <ul className="mt-1.5 grid gap-1.5">
              {group.items.map((item) => (
                <li
                  key={item}
                  className="t-ui-sm grid grid-cols-[0.75rem_1fr] gap-1.5 font-normal leading-[1.5] text-ink-2"
                >
                  <span className="t-data-sm text-ink-3">{group.prefix}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {evaluation.generic_sounding_passages.length > 0 && (
          <div>
            <p className="t-caps">Flagged as generic</p>
            <ul className="mt-1.5 grid gap-2">
              {evaluation.generic_sounding_passages.map((item) => (
                <li
                  key={item}
                  className="border-l-2 border-caution/60 pl-2.5 font-serif text-[0.875rem] italic leading-[1.5] text-ink-2"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
