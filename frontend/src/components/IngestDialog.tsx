import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, RuleLabel, StatCell } from "./Press";
import { Ascend, Discard, Notice, Sheet, Spinner } from "./Glyph";
import { ProgressButton } from "./ProgressButton";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useIngest } from "../hooks/useIngest";

const formatBytes = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "n/a";

/**
 * The reference library: upload .docx sources into Cloudflare R2, review what is
 * stored, and build a company style profile from an explicit selection.
 *
 * Selection is the point of the dialog. Profile quality depends on which documents
 * the corpus contains, so choosing them is a deliberate act here rather than the
 * implicit "whatever is in the folder" the old filesystem corpus imposed. That makes
 * the document list the primary object, which is why it is a dense ruled table and not
 * a grid of cards: the reader is comparing word counts down a column.
 *
 * Every piece of state is read from the ingest context, so this component can be
 * unmounted mid-build without stopping the build.
 */
export function IngestDialog() {
  const {
    open,
    setOpen,
    project,
    references,
    loading,
    uploading,
    crawling,
    deleting,
    selected,
    toggle,
    selectAll,
    clearSelection,
    profile,
    profileKeys,
    building,
    progress,
    upload,
    crawl,
    remove,
    build,
  } = useIngest();
  const [dragging, setDragging] = useState(false);
  const [clientUrl, setClientUrl] = useState("");
  const [blogPath, setBlogPath] = useState("/blog");
  const [crawlLimit, setCrawlLimit] = useState("50");
  const fileInput = useRef<HTMLInputElement>(null);

  const usable = useMemo(() => references.filter((item) => !item.parse_error), [references]);
  const allSelected = usable.length > 0 && usable.every((item) => selected.has(item.key));
  const selectedWords = useMemo(
    () =>
      references
        .filter((item) => selected.has(item.key))
        .reduce((total, item) => total + (item.word_count ?? 0), 0),
    [references, selected],
  );
  // A profile built from a selection that has since changed is stale in a way the
  // studio's rail would not reveal, so it is called out where the fix lives.
  const stale =
    profile !== null &&
    profileKeys.length > 0 &&
    (profileKeys.length !== selected.size || profileKeys.some((key) => !selected.has(key)));

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Reference library"
      className="h-[92vh]"
      header={
        <div className="flex min-w-0 items-baseline gap-3">
          <div className="min-w-0">
            <p className="t-caps">Reference library</p>
            <h2 className="t-display-sm mt-1 truncate text-ink">{project || "Ingest"}</h2>
          </div>
          <Badge>{references.length} stored</Badge>
        </div>
      }
      footer={
        <p className="t-meta">
          {building
            ? "The build continues if you close this dialog, and the profile updates when it finishes."
            : "Documents are stored in Cloudflare R2. The profile they produce is written to PostgreSQL."}
        </p>
      }
    >
      <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_20rem] lg:overflow-hidden">
        <div className="flex min-h-0 flex-col gap-6 p-5 lg:overflow-y-auto">
          {/* The same control as the rail's, repeated here because this dialog is
              where a project is created and where its documents are filed: the
              destination of an upload must be visible at the drop target. */}
          <Field
            label="Project"
            hint="documents, profiles and learned preferences are namespaced per project"
          >
            <div className="max-w-sm">
              <ProjectSwitcher compact />
            </div>
          </Field>

          {/* The drop target is dashed because a dashed rule is the one convention that
              says "this boundary is a target, not a division" without any extra chrome. */}
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void upload([...event.dataTransfer.files]);
            }}
            aria-disabled={!project || undefined}
            className={`grid place-items-center border border-dashed px-6 py-8 text-center transition-colors duration-100 ${
              dragging ? "border-brand bg-brand-tint" : "border-rule-strong bg-inset"
            }`}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".md,.markdown,.docx,.doc"
              multiple
              hidden
              onChange={(event) => {
                void upload([...(event.target.files ?? [])]);
                // Clear the value so re-picking the same file fires change again.
                event.target.value = "";
              }}
            />
            {uploading ? (
              <Spinner size={18} className="text-brand" />
            ) : (
              <Ascend size={18} className="text-ink-3" />
            )}
            <p className="t-display-sm mt-3 text-ink">
              {uploading
                ? "Uploading to R2"
                : project
                  ? `Drop Markdown or Word references for ${project}`
                  : "Choose a project first"}
            </p>
            <p className="t-meta mt-1.5 max-w-md leading-[1.5]">
              Supports .md, .docx and .doc. Each file is parsed before it is stored, so a source
              that will not open is rejected now rather than mid-build. 25MB maximum.
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              disabled={uploading || !project}
              onClick={() => fileInput.current?.click()}
            >
              Choose files
            </Button>
          </div>

          <div className="border border-rule bg-inset p-4">
            <RuleLabel>Import a client blog</RuleLabel>
            <p className="t-meta mt-2 leading-[1.5]">
              Firecrawl collects the selected site section in the background and stores each page as Markdown.
              Use <code>/</code> when the blog lives at the site root.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Client URL">
                <Input value={clientUrl} onChange={(event) => setClientUrl(event.target.value)} placeholder="https://client.com" />
              </Field>
              <Field label="Blog path">
                <Input value={blogPath} onChange={(event) => setBlogPath(event.target.value)} placeholder="/blog or /" />
              </Field>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <Field label="Page limit" className="w-28">
                <Input type="number" min="1" max="500" value={crawlLimit} onChange={(event) => setCrawlLimit(event.target.value)} />
              </Field>
              <ProgressButton
                idleLabel="Fetch blog pages"
                icon={<Ascend size={14} />}
                running={crawling}
                status={progress?.label}
                cost={0}
                step={progress?.step}
                total={progress?.total}
                disabled={!project || !clientUrl.trim() || !blogPath.trim() || crawling}
                onClick={() => void crawl(clientUrl, blogPath, Math.max(1, Math.min(500, Number(crawlLimit) || 50)))}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <RuleLabel className="flex-1">Stored references</RuleLabel>
              {usable.length > 0 && (
                <button
                  className="t-ui-sm shrink-0 text-brand hover:underline"
                  onClick={() =>
                    allSelected ? clearSelection() : selectAll(usable.map((item) => item.key))
                  }
                >
                  {allSelected ? "Clear selection" : "Select all"}
                </button>
              )}
            </div>

            {loading ? (
              <p className="t-meta py-10 text-center">Loading</p>
            ) : references.length === 0 ? (
              <p className="t-meta py-10 text-center">
                {project
                  ? `Nothing stored for ${project} yet. Upload a few reference articles above.`
                  : "Choose a project above, or create one, then upload its reference articles."}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-rule-faint border-y border-rule">
                <AnimatePresence initial={false}>
                  {references.map((record) => {
                    const checked = selected.has(record.key);
                    return (
                      <motion.li
                        key={record.key}
                        layout
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        /* Selection is marked by a filled left rule rather than a row
                           wash: these rows are ticked in bulk, and a wash that covers the
                           whole table is indistinguishable from a background. */
                        className={`flex items-center gap-3 border-l-2 py-2 pl-2 pr-2 ${
                          checked ? "border-brand" : "border-transparent"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="size-3.5 shrink-0 rounded-[2px] accent-brand"
                          checked={checked}
                          disabled={Boolean(record.parse_error)}
                          onChange={() => toggle(record.key)}
                          aria-label={`Use ${record.filename} for the profile`}
                        />
                        {record.parse_error ? (
                          <Notice size={14} className="shrink-0 text-negative" />
                        ) : (
                          <Sheet size={14} className="shrink-0 text-ink-3" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="t-ui-sm truncate font-normal text-ink">
                            {record.title || record.filename}
                          </p>
                          <p className="t-data-sm truncate text-ink-3">
                            {record.parse_error ? (
                              <span className="text-negative">{record.parse_error}</span>
                            ) : (
                              [
                                `${record.word_count?.toLocaleString() ?? "0"} words`,
                                `${record.section_count ?? 0} sections`,
                                formatBytes(record.size_bytes),
                                formatDate(record.uploaded_at),
                              ].join("  ·  ")
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => void remove(record.key)}
                          disabled={deleting === record.key}
                          className="shrink-0 rounded-[2px] p-1 text-ink-3 transition-colors duration-100 hover:text-negative disabled:opacity-40"
                          aria-label={`Delete ${record.filename}`}
                        >
                          {deleting === record.key ? <Spinner size={14} /> : <Discard size={14} />}
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-7 border-rule bg-inspector p-5 max-lg:border-t lg:overflow-y-auto lg:border-l">
          <div>
            <RuleLabel>Build a profile</RuleLabel>
            <div className="mt-3.5 grid grid-cols-2 gap-3">
              <StatCell label="Selected" value={selected.size} />
              <StatCell label="Words" value={selectedWords.toLocaleString()} />
            </div>
            <ProgressButton
              idleLabel={`Build from ${selected.size} doc${selected.size === 1 ? "" : "s"}`}
              icon={<Sheet size={14} />}
              running={building}
              status={progress?.label}
              cost={progress?.cost}
              step={progress?.step}
              total={progress?.total}
              disabled={building || selected.size === 0 || !project}
              onClick={() => void build()}
              className="mt-4 w-full"
            />
            <p className="t-meta mt-3 leading-[1.5]">
              One LLM call per document plus one synthesis. The result is written to PostgreSQL and
              replaces the cached profile for {project || "the selected project"}. Other projects
              are untouched.
            </p>
          </div>

          <div>
            <RuleLabel>Cached profile</RuleLabel>
            {profile ? (
              <>
                <div className="mt-3.5 grid grid-cols-2 gap-3">
                  <StatCell label="Sources" value={profile.source_article_count} />
                  <StatCell label="Terms" value={profile.vocabulary.length} />
                </div>
                <div className="mt-3.5 flex flex-wrap gap-1">
                  {profile.voice.tone_descriptors.slice(0, 6).map((tone) => (
                    <Badge key={tone}>{tone}</Badge>
                  ))}
                </div>
                {stale && (
                  <p className="t-ui-sm mt-4 flex items-start gap-2 border border-caution/40 bg-caution/12 p-2.5 font-normal leading-[1.5] text-ink-2">
                    <Notice size={13} className="mt-0.5 shrink-0 text-caution" />
                    The cached profile was built from a different selection. Rebuild it to match
                    what is ticked.
                  </p>
                )}
                <Button variant="secondary" className="mt-4 w-full" onClick={() => setOpen(false)}>
                  Back to the studio
                </Button>
              </>
            ) : (
              <p className="t-meta mt-2.5 leading-[1.5]">
                No profile cached for {project || "this project"}. Select references and build one,
                because generation is blocked until a profile exists.
              </p>
            )}
          </div>
        </aside>
      </div>
    </Dialog>
  );
}
