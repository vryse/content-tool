import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion } from "motion/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button, buttonVariants } from "./ui/button";
import { Badge } from "./ui/badge";
import { RuleLabel, StatCell } from "./Press";
import { Chart, Descend, Spinner } from "./Glyph";
import { api, type Analytics } from "../lib/api";
import { formatDateTime } from "../lib/utils";

const MotionAnchor = motion.create("a");

/**
 * Score across runs, over time. One series, so no legend is needed — the
 * section heading above it already names it — but it still gets the hover
 * crosshair a line chart is expected to answer "what was the value here"
 * with. The y-axis is fixed at 0–100 rather than zoomed to the run's own
 * spread, matching `ScoreLedger`'s reasoning: a six-point run-to-run swing
 * should not read as the difference between failure and perfection.
 */
function ScoreTrendChart({ points }: { points: { created_at: string; overall_score: number }[] }) {
  const width = 560;
  const height = 108;
  const padding = { top: 10, right: 10, bottom: 10, left: 10 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const coords = points.map((point, index) => ({
    x:
      padding.left +
      (points.length === 1 ? innerWidth / 2 : (innerWidth * index) / (points.length - 1)),
    y:
      padding.top +
      innerHeight -
      (innerHeight * Math.max(0, Math.min(100, point.overall_score))) / 100,
    point,
  }));
  const path = coords
    .map((c, index) => `${index === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const active = hoverIndex !== null ? coords[hoverIndex] : null;

  const handleMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let nearestDistance = Infinity;
    coords.forEach((coord, index) => {
      const distance = Math.abs(coord.x - relativeX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });
    setHoverIndex(nearest);
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full touch-none"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
        role="img"
        aria-label="Overall score across generation runs, in run order"
      >
        {[0, 50, 100].map((mark) => {
          const y = padding.top + innerHeight - (innerHeight * mark) / 100;
          return (
            <line
              key={mark}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="var(--rule-faint)"
              strokeWidth={1}
            />
          );
        })}
        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={padding.top}
            y2={height - padding.bottom}
            stroke="var(--rule-strong)"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        )}
        <path
          d={path}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((coord, index) => (
          <circle
            key={index}
            cx={coord.x}
            cy={coord.y}
            r={hoverIndex === index ? 4.5 : 3}
            fill={hoverIndex === index ? "var(--brand)" : "var(--paper-sheet)"}
            stroke="var(--brand)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap border border-rule-strong bg-sheet px-2 py-1 shadow-overlay"
          style={{ left: `${(active.x / width) * 100}%` }}
        >
          <p className="t-data-sm text-ink">{active.point.overall_score.toFixed(1)}/100</p>
          <p className="t-data-sm text-ink-3">{formatDateTime(active.point.created_at)}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Reads back what every pipeline stage already writes as it completes — a
 * style-profile build, a generation run, a feedback cycle — as three durable
 * histories rather than the single latest artefact each panel elsewhere shows.
 * The export button hands the same rows to whoever the numbers need sharing with.
 */
export function AnalyticsDialog({
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
  const [report, setReport] = useState<Analytics | null>(null);

  useEffect(() => {
    if (!open || !company) return;
    let current = true;
    void api
      .analytics(company)
      .then((result) => {
        if (current) setReport(result);
      })
      .catch((error) => {
        if (current) {
          onError(error instanceof Error ? error.message : "Analytics could not be loaded.");
        }
      });
    return () => {
      current = false;
    };
  }, [open, company, onError]);

  // A report left over from a previous project (or a still-loading one) is not
  // shown at all, so switching projects reads as "loading" rather than as stale
  // numbers from whatever was open before.
  const showing = report?.company === company ? report : null;
  const loading = open && !showing;

  // Recomputed only when the loaded report changes, not on every render — the mock
  // client mints a fresh object URL each call, and re-minting one per keystroke
  // elsewhere in the app would leak them.
  const exportHref = useMemo(
    () => (showing ? api.analyticsExportUrl(showing.company) : null),
    [showing],
  );

  const totals = useMemo(() => {
    if (!showing) return null;
    const scored = showing.generation_outcomes.filter((item) => item.overall_score !== null);
    const avgScore = scored.length
      ? scored.reduce((sum, item) => sum + (item.overall_score ?? 0), 0) / scored.length
      : null;
    return { avgScore };
  }, [showing]);

  // A trend needs at least two points to say anything; one score is just a number,
  // already shown in the row list below.
  const scoreTrend = useMemo(
    () =>
      (showing?.generation_outcomes ?? [])
        .filter(
          (item): item is typeof item & { overall_score: number } => item.overall_score !== null,
        )
        .map((item) => ({ created_at: item.created_at, overall_score: item.overall_score })),
    [showing],
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="flex h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-xs border border-rule-strong bg-canvas p-0 text-ink shadow-overlay sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Analytics — {company}</DialogTitle>
        <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-rule bg-rail px-5 py-3.5">
          <>
            <div className="min-w-0">
              <p className="t-caps">Stored outcomes</p>
              <h2 className="t-display-sm mt-1 truncate text-ink">{company}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {exportHref ? (
                <MotionAnchor
                  href={exportHref}
                  download={`${company.replaceAll(" ", "_")}_analytics.csv`}
                  whileTap={{ scale: 0.97 }}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  <Descend size={14} /> Export CSV
                </MotionAnchor>
              ) : (
                <Button variant="secondary" disabled>
                  <Descend size={14} /> Export CSV
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center gap-2 py-10 justify-center">
              <Spinner size={16} className="text-ink-3" />
              <span className="t-meta">Loading stored outcomes</span>
            </div>
          ) : showing ? (
            <div className="grid gap-7">
              {totals && (
                <div className="grid grid-cols-3 gap-3 border-b border-rule pb-5">
                  <StatCell label="Profile builds" value={showing.analysis_outcomes.length} />
                  <StatCell label="Generation runs" value={showing.generation_outcomes.length} />
                  <StatCell
                    label="Avg score"
                    value={totals.avgScore !== null ? totals.avgScore.toFixed(1) : "—"}
                  />
                </div>
              )}

              <section>
                <RuleLabel>Analytics outcomes · style-profile builds</RuleLabel>
                {showing.analysis_outcomes.length === 0 ? (
                  <p className="t-meta mt-3 leading-[1.5]">No profile has been built yet.</p>
                ) : (
                  <ol className="mt-3 divide-y divide-rule-faint border-y border-rule">
                    {showing.analysis_outcomes.map((item, index) => (
                      <li key={index} className="grid gap-1 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="t-ui-sm font-normal text-ink">
                            {item.source_article_count} reference
                            {item.source_article_count === 1 ? "" : "s"} · {item.vocabulary_size}{" "}
                            vocab terms
                          </span>
                          <span className="t-data-sm text-ink-3">
                            {formatDateTime(item.created_at)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.tone_descriptors.slice(0, 4).map((tone) => (
                            <Badge key={tone}>{tone}</Badge>
                          ))}
                          {item.outlier_count > 0 && (
                            <span className="t-data-sm text-ink-3">
                              {item.outlier_count} outlier{item.outlier_count === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <p className="t-data-sm text-ink-3">
                          ${item.total_cost_usd.toFixed(4)} · {item.total_tokens.toLocaleString()}{" "}
                          tokens · {item.wall_time_seconds.toFixed(1)}s
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section>
                <RuleLabel>Generation outcomes · runs</RuleLabel>
                {scoreTrend.length >= 2 && (
                  <div className="mt-3">
                    <ScoreTrendChart points={scoreTrend} />
                  </div>
                )}
                {showing.generation_outcomes.length === 0 ? (
                  <p className="t-meta mt-3 leading-[1.5]">No article has been generated yet.</p>
                ) : (
                  <ol className="mt-3 divide-y divide-rule-faint border-y border-rule">
                    {showing.generation_outcomes.map((item) => (
                      <li key={item.run_id} className="grid gap-1 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="t-ui-sm font-normal text-ink">
                            {item.overall_score !== null ? item.overall_score.toFixed(1) : "—"}
                            <span className="t-data-sm text-ink-3">/100</span>
                            {item.parent_run_id && <Badge className="ml-2">Regeneration</Badge>}
                          </span>
                          <span className="t-data-sm text-ink-3">
                            {formatDateTime(item.created_at)}
                          </span>
                        </div>
                        <p className="t-data-sm text-ink-3">
                          {item.section_count} sections · {item.word_count.toLocaleString()} words
                          {item.missing_requirement_count > 0
                            ? ` · ${item.missing_requirement_count} missing requirement${
                                item.missing_requirement_count === 1 ? "" : "s"
                              }`
                            : ""}
                        </p>
                        <p className="t-data-sm text-ink-3">
                          ${item.total_cost_usd.toFixed(4)} · {item.total_tokens.toLocaleString()}{" "}
                          tokens · {item.wall_time_seconds.toFixed(1)}s
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section>
                <RuleLabel>Feedback outcomes · human cycles</RuleLabel>
                {showing.feedback_outcomes.length === 0 ? (
                  <p className="t-meta mt-3 leading-[1.5]">No feedback has been submitted yet.</p>
                ) : (
                  <ol className="mt-3 divide-y divide-rule-faint border-y border-rule">
                    {showing.feedback_outcomes.map((item, index) => (
                      <li key={index} className="grid gap-1 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="t-ui-sm font-normal text-ink">
                            {item.rating !== null ? `Rated ${item.rating}/5` : "Unrated"}
                          </span>
                          <span className="t-data-sm text-ink-3">
                            {formatDateTime(item.created_at)}
                          </span>
                        </div>
                        <p className="t-data-sm text-ink-3">
                          {item.human_instruction_count} human · {item.evaluator_instruction_count}{" "}
                          evaluator-derived · {item.accepted_instruction_count} accepted as
                          preferences
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-10 justify-center text-ink-3">
              <Chart size={16} />
              <span className="t-meta">Nothing stored yet.</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
