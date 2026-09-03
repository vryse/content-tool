import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useDropzone } from "react-dropzone";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, RuleLabel, StatCell } from "./Press";
import { Ascend, Discard, Library, Notice, Sheet, Spinner } from "./Glyph";
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
  const [dropMessage, setDropMessage] = useState("");
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlLimit, setCrawlLimit] = useState(50);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [referenceSearch, setReferenceSearch] = useState("");
  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    open: openFilePicker,
  } = useDropzone({
    accept: {
      "text/markdown": [".md", ".markdown"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
    },
    disabled: uploading || !project,
    maxSize: 25 * 1024 * 1024,
    multiple: true,
    noClick: true,
    onDropAccepted: (files) => {
      setDropMessage("");
      void upload(files);
    },
    onDropRejected: (rejections) => {
      const tooLarge = rejections.some((rejection) =>
        rejection.errors.some((error) => error.code === "file-too-large"),
      );
      setDropMessage(
        tooLarge
          ? "One or more files are larger than 25 MB."
          : "Use Markdown (.md) or Word (.docx, .doc) files.",
      );
    },
  });

  const usable = useMemo(() => references.filter((item) => !item.parse_error), [references]);
  const filteredReferences = useMemo(() => {
    const query = referenceSearch.trim().toLocaleLowerCase();
    if (!query) return references;

    return references.filter((item) => item.title?.toLocaleLowerCase().includes(query));
  }, [referenceSearch, references]);
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

  const startCrawl = () => {
    try {
      const url = new URL(crawlUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
      setCrawlMessage("");
      void crawl(url.origin, url.pathname || "/", crawlLimit);
    } catch {
      setCrawlMessage("Enter a full website URL, including https://.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && setOpen(false)}>
      <DialogContent className="flex h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden rounded-xs border border-rule-strong bg-canvas p-0 text-ink shadow-overlay sm:max-w-5xl">
        <DialogHeader className="border-b border-rule bg-rail px-5 py-3.5">
          <div className="flex min-w-0 items-baseline gap-3">
            <div className="min-w-0">
              <p className="t-caps">Reference library</p>
              <DialogTitle className="t-display-sm mt-1 truncate text-ink">
                {project || "Ingest"}
              </DialogTitle>
            </div>
            <Badge>{references.length} stored</Badge>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
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

              <Field
                label="Crawl a blog"
                hint="enter the full blog or content-library URL; discovered pages are stored as Markdown references"
              >
                <form
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startCrawl();
                  }}
                >
                  <Input
                    type="url"
                    value={crawlUrl}
                    onChange={(event) => {
                      setCrawlUrl(event.target.value);
                      if (crawlMessage) setCrawlMessage("");
                    }}
                    placeholder="https://example.com/blog"
                    aria-label="Blog URL"
                    disabled={crawling || !project}
                    required
                  />
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={crawlLimit}
                    onChange={(event) => setCrawlLimit(Number(event.target.value))}
                    aria-label="Maximum pages to crawl"
                    title="Maximum pages"
                    disabled={crawling || !project}
                  />
                  <ProgressButton
                    type="submit"
                    idleLabel="Crawl"
                    icon={<Library size={14} />}
                    running={crawling}
                    status={progress?.label}
                    cost={progress?.cost}
                    step={progress?.step}
                    total={progress?.total}
                    disabled={crawling || !project || !crawlUrl.trim()}
                    className="max-sm:w-full"
                  />
                </form>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className={crawlMessage ? "t-ui-sm text-negative" : "t-meta"}>
                    {crawlMessage || "Page limit"}
                  </p>
                  <p className="t-data-sm text-ink-3">1–500 pages</p>
                </div>
              </Field>

              {/* One ingestion action: drop supported references, or choose them from the
              native picker. Dropzone owns keyboard access and validation. */}
              <div
                {...getRootProps({
                  onClick: () => openFilePicker(),
                  onDragEnter: () => setDragging(true),
                  onDragLeave: () => setDragging(false),
                  onDrop: () => setDragging(false),
                })}
                className={`relative grid min-h-56 cursor-pointer place-items-center border border-dashed px-6 py-8 text-center focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 ${
                  isDragReject
                    ? "border-negative bg-negative-tint"
                    : dragging || isDragActive
                      ? "border-brand bg-brand-tint"
                      : !project
                        ? "cursor-not-allowed border-rule bg-inset opacity-65"
                        : "border-rule-strong bg-inset"
                }`}
              >
                <Input {...getInputProps()} />
                <div className="grid place-items-center">
                  <span className="grid size-10 place-items-center border border-rule-strong bg-sheet text-ink-3">
                    {uploading ? (
                      <Spinner size={18} className="text-brand" />
                    ) : (
                      <Ascend size={18} />
                    )}
                  </span>
                  <p className="t-display-sm mt-4 text-ink">
                    {uploading
                      ? "Importing references"
                      : !project
                        ? "Choose a project to add sources"
                        : isDragReject
                          ? "That file cannot be imported"
                          : isDragActive
                            ? "Release to add your sources"
                            : "Drop your source documents here"}
                  </p>
                  <p className="t-meta mt-1.5 max-w-md leading-[1.5]">
                    Import Word or Markdown source material for {project || "your project"}. Files
                    are parsed before they are stored, so invalid sources never reach a profile
                    build.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                    <Button
                      variant="secondary"
                      disabled={uploading || !project}
                      onClick={(event) => {
                        event.stopPropagation();
                        openFilePicker();
                      }}
                    >
                      Choose files
                    </Button>
                    <span className="t-data-sm text-ink-3">.md · .docx · .doc · up to 25 MB</span>
                  </div>
                  {dropMessage && <p className="t-ui-sm mt-3 text-negative">{dropMessage}</p>}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <RuleLabel className="flex-1">Stored references</RuleLabel>
                  {usable.length > 0 && (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="t-ui-sm h-auto shrink-0 p-0 text-brand"
                      onClick={() =>
                        allSelected ? clearSelection() : selectAll(usable.map((item) => item.key))
                      }
                    >
                      {allSelected ? "Clear selection" : "Select all"}
                    </Button>
                  )}
                </div>
                <Input
                  type="search"
                  value={referenceSearch}
                  onChange={(event) => setReferenceSearch(event.target.value)}
                  placeholder="Search titles"
                  aria-label="Search stored reference titles"
                  className="mt-3"
                  disabled={loading || references.length === 0}
                />

                {loading ? (
                  <p className="t-meta py-10 text-center">Loading</p>
                ) : references.length === 0 ? (
                  <p className="t-meta py-10 text-center">
                    {project
                      ? `Nothing stored for ${project} yet. Upload a few reference articles above.`
                      : "Choose a project above, or create one, then upload its reference articles."}
                  </p>
                ) : filteredReferences.length === 0 ? (
                  <p className="t-meta py-10 text-center">No reference titles match your search.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-rule-faint border-y border-rule">
                    <AnimatePresence initial={false}>
                      {filteredReferences.map((record) => {
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
                            <Input
                              type="checkbox"
                              className="size-3.5 shrink-0 rounded-xs accent-brand"
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => void remove(record.key)}
                              disabled={deleting === record.key}
                              className="shrink-0 rounded-xs text-ink-3 hover:bg-negative/10 hover:text-negative"
                              aria-label={`Delete ${record.filename}`}
                            >
                              {deleting === record.key ? (
                                <Spinner size={14} />
                              ) : (
                                <Discard size={14} />
                              )}
                            </Button>
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
                  One LLM call per document plus one synthesis. The result is written to PostgreSQL
                  and replaces the cached profile for {project || "the selected project"}. Other
                  projects are untouched.
                </p>
              </div>

              <div>
                <RuleLabel>Cached profile</RuleLabel>
                {profile ? (
                  <>
                    <div className="mt-3.5 grid grid-cols-2 gap-3">
                      <StatCell label="Sources" value={profile.source_article_count} />
                      <StatCell label="Terms" value={profile.vocabulary.length} />
                      {profile.visual_defaults.source_count > 0 && (
                        <>
                          <StatCell
                            label="Use tables"
                            value={`${profile.visual_defaults.table_reference_count}/${profile.visual_defaults.source_count}`}
                          />
                          <StatCell
                            label="Use flows"
                            value={`${profile.visual_defaults.flowchart_reference_count}/${profile.visual_defaults.source_count}`}
                          />
                        </>
                      )}
                    </div>
                    {profile.visual_defaults.source_count > 0 && (
                      <p className="t-meta mt-3 leading-[1.5]">
                        The next brief starts with each visual enabled only when more than half of
                        these sources use it. You can change either checkbox before generation.
                      </p>
                    )}
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
                  </>
                ) : (
                  <p className="t-meta mt-2.5 leading-[1.5]">
                    No profile cached for {project || "this project"}. Select references and build
                    one, because generation is blocked until a profile exists.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
        <DialogFooter className="-mx-0 -mb-0 flex-none border-rule bg-rail px-5 py-2.5 sm:justify-start">
          <p className="t-meta">
            {building
              ? "The build continues if you close this dialog, and the profile updates when it finishes."
              : "Documents are stored in Cloudflare R2. The profile they produce is written to PostgreSQL."}
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
