import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { assembleMarkdown } from "./lib/markdown";
import { acknowledgeHaptic } from "./lib/haptics";
import { AnalyticsDialog } from "./components/AnalyticsDialog";
import { ContentLibraryDialog } from "./components/ContentLibraryDialog";
import { DraftDialog } from "./components/DraftDialog";
import { Field, Head, RuleLabel, StatCell } from "./components/Press";
import { ScoreLedger } from "./components/ScoreLedger";
import {
  Archive,
  Chart,
  Close,
  Cycle,
  Discard,
  Descend,
  Frame,
  Grip,
  Library,
  Mark,
  Plus,
  Sheet,
  Spinner,
} from "./components/Glyph";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { ProgressButton } from "./components/ProgressButton";
import { Input } from "./components/ui/input";
import { Slider } from "./components/ui/slider";
import { Textarea } from "./components/ui/textarea";
import { useAlert } from "./hooks/useAlert";
import { useBrief } from "./hooks/useBrief";
import { usePipeline } from "./hooks/usePipeline";
import { useIngest } from "./hooks/useIngest";

/** The artefact chain, in the order the pipeline produces it. */
const STAGES = [
  "Reference profile",
  "Plan",
  "Write",
  "Critique",
  "Evaluate",
  "Feedback loop",
] as const;

const MotionButton = motion.create(Button);

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

function EntryList({
  label,
  addLabel,
  values,
  onChange,
  sortable = false,
}: {
  label: string;
  addLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
  sortable?: boolean;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const updateEntry = (index: number, value: string) => {
    onChange(values.map((entry, entryIndex) => (entryIndex === index ? value : entry)));
  };

  const addEntry = () => {
    onChange([...values, ""]);
    requestAnimationFrame(() => inputRefs.current[values.length]?.focus());
  };

  const moveEntry = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const nextValues = [...values];
    const [movedEntry] = nextValues.splice(fromIndex, 1);
    nextValues.splice(toIndex, 0, movedEntry);
    onChange(nextValues);
  };

  return (
    <Field label={label} hint="add one at a time">
      <div className="grid gap-2">
        {values.map((value, index) => (
          <div
            key={index}
            onDragOver={
              sortable
                ? (event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                : undefined
            }
            onDrop={
              sortable
                ? (event) => {
                    event.preventDefault();
                    if (draggedIndex !== null) moveEntry(draggedIndex, index);
                    setDraggedIndex(null);
                  }
                : undefined
            }
            className={`flex items-center gap-2 ${draggedIndex === index ? "opacity-50" : ""}`}
          >
            {sortable && (
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                  setDraggedIndex(index);
                }}
                onDragEnd={() => setDraggedIndex(null)}
                aria-label={`Drag to reorder required section ${index + 1}`}
                title="Drag to reorder"
                className="shrink-0 cursor-grab rounded-xs text-ink-3 hover:text-ink active:cursor-grabbing"
              >
                <Grip size={14} />
              </Button>
            )}
            <Input
              ref={(input) => {
                inputRefs.current[index] = input;
              }}
              value={value}
              placeholder={label === "Key points" ? "State a key idea" : "Name a section"}
              onChange={(event) => updateEntry(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addEntry();
              }}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}
              aria-label={`Remove ${label.slice(0, -1).toLowerCase()} ${index + 1}`}
              className="size-9 shrink-0 px-0"
            >
              <Close size={14} />
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={addEntry} className="w-fit">
          <Plus size={14} />
          {addLabel}
        </Button>
      </div>
    </Field>
  );
}

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
  const { brief, update, reset, suggestingTopic, suggestFromReferences } = useBrief(
    project,
    profile,
  );
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState(0);
  // Hand edits are stored against the generated text they were made on, so a new run (or a
  // revert) drops them without an effect having to reset state.
  const [edited, setEdited] = useState<{ base: string; text: string } | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // The project is the ingest library's, not the brief's. It decides which profile and
  // corpus the backend loads, so a copy held here could ask for a profile built from
  // another project's documents. It is shown read-only beside the topic for that reason.
  const runGeneration = async () => {
    if (busy !== null || !online || !profile || !project) return;
    if (
      await generate({
        ...brief,
        company: project,
        key_points: brief.key_points.filter((point) => point.trim()),
        required_sections: brief.required_sections.filter((section) => section.trim()),
        table_instructions: brief.include_table ? brief.table_instructions?.trim() || null : null,
      })
    ) {
      setDraftOpen(true);
    }
  };
  const runRegeneration = async () => {
    if (await regenerate()) setDraftOpen(true);
  };

  const generated = useMemo(() => (run ? assembleMarkdown(run.article) : ""), [run]);
  const draft = edited?.base === generated ? edited.text : generated;
  const setDraft = (text: string) => setEdited({ base: generated, text });
  const draftWords = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const canGenerate = busy === null && Boolean(online && profile && project);

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 max-lg:justify-between">
          <div>
            <p className="t-caps text-brand text-[0.8125rem] tracking-[0.14em]">Vryse</p>
            <p className="t-meta mt-0.5">Editorial systems</p>
          </div>
          {/* On the narrow layout the rail collapses to this strip, so the project
              switcher, the ingest control and the connection light come along with it.
              `flex-wrap` on the row above lets this drop to its own line once it no
              longer fits beside the wordmark, rather than crushing the project name
              or clipping the connection status off the edge of the screen. */}
          <div className="flex flex-wrap items-center gap-2 lg:hidden">
            <div className="w-40">
              <ProjectSwitcher compact />
            </div>
            <IngestControl
              building={buildingProfile}
              label={profileProgress?.label}
              onOpen={() => setIngestOpen(true)}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              aria-label="View stored analytics"
              disabled={!project}
              onClick={() => setAnalyticsOpen(true)}
            >
              <Chart size={14} />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              aria-label="View saved content"
              disabled={!project}
              onClick={() => setLibraryOpen(true)}
            >
              <Archive size={14} />
            </Button>
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
                  className={`flex items-center gap-2.5 border-l py-[5px] pl-2.5 transition-colors duration-300 ${
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
                    className={`t-ui-sm truncate font-normal transition-colors duration-300 ${
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

          <div className="mt-auto grid gap-3 border-t border-rule pt-3">
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              disabled={!project}
              onClick={() => setAnalyticsOpen(true)}
            >
              <Chart size={14} />
              Analytics
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start"
              disabled={!project}
              onClick={() => setLibraryOpen(true)}
            >
              <Archive size={14} />
              Saved content
            </Button>
            <Status online={online} />
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- CANVAS */}
      <main className="min-w-0 lg:min-h-0 lg:overflow-y-auto max-lg:overflow-visible">
        <div className="mx-auto grid max-w-[46rem] gap-10 px-6 py-8 lg:px-10 lg:py-10">
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void runGeneration();
            }}
          >
            <Head
              aside={
                <>
                  <span className="t-data-sm text-ink-3">{project || "No project"}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={reset}
                    disabled={!project}
                    className="px-2 py-1"
                  >
                    <Discard size={13} /> Reset brief
                  </Button>
                </>
              }
            >
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
                  onClick={() => void suggestFromReferences(project)}
                  disabled={suggestingTopic || busy !== null || !online || !project}
                  className="shrink-0"
                >
                  {suggestingTopic ? <Spinner size={14} /> : <Cycle size={14} />}
                  {suggestingTopic ? "Finding a topic" : "Suggest from references"}
                </Button>
              </div>
            </Field>

            <Field label="Target audience">
              <Input
                value={brief.target_audience}
                onChange={(e) => update("target_audience", e.target.value)}
              />
            </Field>

            <Field label="Target length" hint={`${brief.target_word_count.toLocaleString()} words`}>
              <Slider
                min={400}
                max={3000}
                step={100}
                value={[brief.target_word_count]}
                aria-label="Target length in words"
                aria-valuetext={`${brief.target_word_count.toLocaleString()} words`}
                onValueChange={(value) => {
                  const nextWordCount = typeof value === "number" ? value : value[0];
                  if (nextWordCount === undefined) return;
                  update("target_word_count", nextWordCount);
                  acknowledgeHaptic();
                }}
                className="h-9 cursor-pointer"
              />
            </Field>

            <EntryList
              label="Key points"
              addLabel="Add key point"
              values={brief.key_points}
              onChange={(values) => update("key_points", values)}
            />

            <EntryList
              label="Required sections"
              addLabel="Add required section"
              values={brief.required_sections}
              onChange={(values) => update("required_sections", values)}
              sortable
            />

            <fieldset className="border-y border-rule py-4">
              <legend className="t-label">Optional visual aids</legend>
              <p className="t-meta mt-1.5 max-w-[62ch] leading-[1.5]">
                Add only when the subject benefits from a comparison or a process view. Flowcharts
                are rendered in the draft and remain editable as Mermaid source.
              </p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <div className="border border-rule bg-inset p-3 transition-colors duration-100 hover:border-rule-strong has-[:focus-visible]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/25">
                  <label className="flex cursor-pointer items-start gap-3" htmlFor="include-table">
                    <Input
                      id="include-table"
                      type="checkbox"
                      checked={brief.include_table}
                      onChange={(event) => update("include_table", event.target.checked)}
                      className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-xs accent-brand"
                    />
                    <span>
                      <span className="t-ui-sm block font-normal text-ink">
                        Include a comparison table
                      </span>
                      <span className="t-meta mt-0.5 block leading-[1.45]">
                        Use a compact Markdown table when it makes the point clearer.
                      </span>
                      {profile?.visual_defaults.source_count ? (
                        <span className="t-data-sm mt-1.5 block text-ink-3">
                          Project default: {profile.visual_defaults.include_table ? "on" : "off"}
                          {" · "}
                          {profile.visual_defaults.table_reference_count}/
                          {profile.visual_defaults.source_count} references use tables
                        </span>
                      ) : null}
                    </span>
                  </label>
                  {brief.include_table ? (
                    <div className="mt-3 border-t border-rule pt-3">
                      <label
                        htmlFor="table-instructions"
                        className="t-label flex items-center justify-between gap-3"
                      >
                        What should the table show?
                        <span className="t-data-sm normal-case tracking-normal text-ink-3">
                          Optional
                        </span>
                      </label>
                      <Textarea
                        id="table-instructions"
                        value={brief.table_instructions ?? ""}
                        maxLength={500}
                        rows={2}
                        placeholder="For example: Compare tokenisation, masking, and redaction by reversibility and best use case"
                        aria-label="Table content instructions"
                        onChange={(event) => update("table_instructions", event.target.value)}
                        className="mt-2 min-h-20 resize-y bg-paper"
                      />
                      <p className="t-meta mt-1.5 leading-[1.45]">
                        Leave blank and VRYSE will choose the most useful comparison automatically.
                      </p>
                    </div>
                  ) : null}
                </div>
                <label className="flex cursor-pointer items-start gap-3 border border-rule bg-inset p-3 transition-colors duration-100 hover:border-rule-strong has-[:focus-visible]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/25">
                  <Input
                    type="checkbox"
                    checked={brief.include_flowchart}
                    onChange={(event) => update("include_flowchart", event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-xs accent-brand"
                  />
                  <span>
                    <span className="t-ui-sm block font-normal text-ink">Include a flowchart</span>
                    <span className="t-meta mt-0.5 block leading-[1.45]">
                      Render a Mermaid process diagram in the draft.
                    </span>
                    {profile?.visual_defaults.source_count ? (
                      <span className="t-data-sm mt-1.5 block text-ink-3">
                        Project default: {profile.visual_defaults.include_flowchart ? "on" : "off"}
                        {" · "}
                        {profile.visual_defaults.flowchart_reference_count}/
                        {profile.visual_defaults.source_count} references use flowcharts
                      </span>
                    ) : null}
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
                disabled={!canGenerate}
                type="submit"
              />
              {!profile && (
                <p className="t-meta">
                  {project
                    ? `Build a reference profile for ${project} first.`
                    : "Choose a project first."}
                </p>
              )}
            </div>
          </form>

          {run && (
            <section className="grid gap-4">
              <Head
                aside={
                  <>
                    <Badge>{run.article.sections.length} sections</Badge>
                    <Badge>{draftWords.toLocaleString()} words</Badge>
                    {draft !== generated && <Badge>Edited</Badge>}
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

            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (busy === null && feedback.trim()) void submitFeedback(feedback, rating);
              }}
            >
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
                  type="submit"
                  disabled={busy !== null || !feedback.trim()}
                >
                  {busy === "feedback" ? <Spinner size={14} /> : <Cycle size={14} />}
                  Transform
                </Button>
              </div>
            </form>

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
                        <Badge>{item.change_type}</Badge>
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
                  type="button"
                  className="mt-3.5 w-full"
                />
              </div>
            )}
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

      {project && (
        <AnalyticsDialog
          open={analyticsOpen}
          onClose={() => setAnalyticsOpen(false)}
          company={project}
          onError={showAlert}
        />
      )}

      {project && (
        <ContentLibraryDialog
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          company={project}
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
    <p className="t-meta flex items-center gap-2 whitespace-nowrap">
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
          <MotionButton
            key={step}
            type="button"
            variant="ghost"
            size="icon-xs"
            role="radio"
            aria-checked={value === step}
            aria-label={`${step} out of five`}
            onClick={() => onChange(step)}
            initial={false}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 560, damping: 28 }}
            className={`t-data-sm rounded-none transition-colors duration-100 ${
              step <= value ? "bg-brand text-brand-fg" : "bg-sheet text-ink-3 hover:bg-inset"
            }`}
          >
            {step}
          </MotionButton>
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
