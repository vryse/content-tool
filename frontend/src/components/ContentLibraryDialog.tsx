import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { DraftDialog } from "./DraftDialog";
import { Frame, Spinner } from "./Glyph";
import { assembleMarkdown } from "../lib/markdown";
import { formatDateTime } from "../lib/utils";
import { api, type Run, type RunListItem } from "../lib/api";

/**
 * Every run `/api/generate` and `/api/runs/{id}/regenerate` have ever saved is
 * already durable in the `runs` table — that part needed no new plumbing.
 * What was missing was a way back to it: the studio only ever shows the run
 * currently in memory. This lists every saved run for the project and opens
 * any one of them in the same read/export viewer the active run uses.
 */
export function ContentLibraryDialog({
  open,
  onClose,
  company,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  company: string;
  onError: (message: string) => void;
}) {
  const [list, setList] = useState<RunListItem[] | null>(null);
  const [listFor, setListFor] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Run | null>(null);
  const [edited, setEdited] = useState<{ base: string; text: string } | null>(null);

  useEffect(() => {
    if (!open || !company) return;
    let current = true;
    void api
      .runs(company)
      .then((result) => {
        if (current) {
          setList(result);
          setListFor(company);
        }
      })
      .catch((error) => {
        if (current) {
          onError(error instanceof Error ? error.message : "Saved content could not be loaded.");
        }
      });
    return () => {
      current = false;
    };
  }, [open, company, onError]);

  // Stale rows from a previous project (or a still-loading list) are not shown at
  // all, matching the analytics dialog's loading convention.
  const showing = listFor === company ? list : null;
  const loading = open && !showing;

  const openRun = async (runId: string) => {
    setOpeningId(runId);
    try {
      setViewing(await api.getRun(runId));
    } catch (error) {
      onError(error instanceof Error ? error.message : "That run could not be opened.");
    } finally {
      setOpeningId(null);
    }
  };

  const generated = useMemo(() => (viewing ? assembleMarkdown(viewing.article) : ""), [viewing]);
  const draft = edited?.base === generated ? edited.text : generated;

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DialogContent
          className="flex h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-xs border border-rule-strong bg-canvas p-0 text-ink shadow-overlay sm:max-w-3xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Saved content — {company}</DialogTitle>
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-rule bg-rail px-5 py-3.5">
            <>
              <div className="min-w-0">
                <p className="t-caps">Saved content</p>
                <h2 className="t-display-sm mt-1 truncate text-ink">{company}</h2>
              </div>
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10">
                <Spinner size={16} className="text-ink-3" />
                <span className="t-meta">Loading saved runs</span>
              </div>
            ) : showing && showing.length > 0 ? (
              <ol className="divide-y divide-rule-faint border-y border-rule">
                {showing.map((item) => (
                  <li key={item.run_id} className="grid gap-1 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="t-ui-sm min-w-0 truncate font-normal text-ink">
                        {item.title}
                      </span>
                      <span className="t-data-sm shrink-0 text-ink-3">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <p className="t-meta truncate leading-[1.5]">{item.topic}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {item.overall_score !== null && (
                        <span className="t-data-sm text-ink-3">
                          {item.overall_score.toFixed(1)}/100
                        </span>
                      )}
                      <span className="t-data-sm text-ink-3">
                        {item.section_count} sections · {item.word_count.toLocaleString()} words
                      </span>
                      {item.parent_run_id && <Badge>Regeneration</Badge>}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="ml-auto"
                        disabled={openingId === item.run_id}
                        onClick={() => void openRun(item.run_id)}
                      >
                        {openingId === item.run_id ? <Spinner size={13} /> : <Frame size={13} />}
                        Open
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex items-center justify-center py-10">
                <p className="t-meta">Nothing generated yet.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {viewing && (
        <DraftDialog
          open={Boolean(viewing)}
          onClose={() => {
            setViewing(null);
            setEdited(null);
          }}
          title={viewing.plan.title}
          value={draft}
          onChange={(text) => setEdited({ base: generated, text })}
          generated={generated}
          onError={onError}
        />
      )}
    </>
  );
}
