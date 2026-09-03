import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Close, Descend, Rendered, Sheet, Source, Spinner } from "./Glyph";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { saveBlob, slugify } from "../lib/export";

/**
 * The draft opens here rather than in a card at the bottom of the page: it is the artefact
 * the whole pipeline exists to produce, and it needs the room to be read and edited.
 */
export function DraftDialog({
  open,
  onClose,
  title,
  value,
  onChange,
  generated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChange: (value: string) => void;
  generated: string;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<"rendered" | "source">("rendered");
  const [exporting, setExporting] = useState(false);

  const exportMarkdown = () =>
    saveBlob(new Blob([value], { type: "text/markdown" }), `${slugify(title)}.md`);

  const exportDocx = async () => {
    setExporting(true);
    try {
      // Loaded on demand: the Word writer is larger than the rest of the app and most
      // sessions never export one.
      const { markdownToDocx } = await import("../lib/docx");
      saveBlob(await markdownToDocx(value, title), `${slugify(title)}.docx`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "The Word export could not be built.");
    } finally {
      setExporting(false);
    }
  };

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="flex h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden rounded-xs border border-rule-strong bg-canvas p-0 text-ink shadow-overlay sm:max-w-5xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-rule bg-rail px-5 py-3.5">
          <>
            <div className="min-w-0">
              <p className="t-caps">Generated article</p>
              <h2 className="t-display-sm mt-1 truncate text-ink">{title}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* A two-state segmented control, ruled rather than pill-shaped, so it
                shares an edge with the dialog's own rules. */}
              <div className="flex divide-x divide-rule border border-rule" role="tablist">
                {(
                  [
                    ["rendered", "Rendered", Rendered],
                    ["source", "Source", Source],
                  ] as const
                ).map(([option, label, Icon]) => (
                  <Button
                    key={option}
                    type="button"
                    variant={mode === option ? "default" : "ghost"}
                    size="sm"
                    role="tab"
                    aria-selected={mode === option}
                    onClick={() => setMode(option)}
                    className={`t-ui-sm rounded-none px-2.5 ${
                      mode === option
                        ? "bg-brand text-brand-fg hover:bg-brand-hover"
                        : "bg-sheet text-ink-3 hover:bg-inset hover:text-ink"
                    }`}
                  >
                    <Icon size={13} />
                    {label}
                  </Button>
                ))}
              </div>
              <Button variant="secondary" onClick={exportMarkdown}>
                <Descend size={14} /> .md
              </Button>
              <Button variant="secondary" onClick={exportDocx} disabled={exporting}>
                {exporting ? <Spinner size={14} /> : <Sheet size={14} />} .docx
              </Button>
            </div>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto border border-rule text-ink-3 hover:border-rule-strong hover:text-ink"
                  aria-label="Close"
                />
              }
            >
              <Close size={13} />
            </DialogClose>
          </>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {mode === "rendered" ? (
            /* The reading view gets the sheet surface, so the draft is literally the one
               sheet of paper in the app and the chrome around it stays on the darker levels.
               No drop cap here, though index.css offers one: the first word of a generated
               article is not known in advance, and the first draft this ran on opened on
               "AI support copilots", where ::first-letter takes the A and strands the I. */
            <div className="h-full overflow-auto bg-sheet px-6 py-8 sm:px-10">
              <MarkdownPreview source={value} className="mx-auto" />
            </div>
          ) : (
            <MarkdownEditor value={value} onChange={onChange} className="h-full bg-inset" />
          )}
        </div>
        <DialogFooter className="-mx-0 -mb-0 flex-none border-rule bg-rail px-5 py-2.5 sm:justify-start">
          <div className="t-meta flex flex-wrap items-center justify-between gap-3">
            <span className="t-data-sm">{words.toLocaleString()} words</span>
            {value !== generated && (
              <span className="flex items-center gap-3">
                Edited locally, and the exports carry your changes.
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() => onChange(generated)}
                  className="h-auto p-0 text-brand decoration-brand/35 hover:decoration-brand"
                >
                  Revert to generated
                </Button>
              </span>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
