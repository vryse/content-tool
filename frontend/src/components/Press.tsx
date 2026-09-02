import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * The shared display language: a heading that is a rule, a caption under a figure,
 * and a labelled field. Three pieces, because every panel in the app is built from
 * some arrangement of exactly these.
 */

/**
 * A section heading set in the serif with a rule beneath it, mirroring `.prose-press h2`
 * in index.css. The rule is the heading's weight, which is why nothing here needs a
 * heavier font or an icon beside it to register as a boundary.
 */
export function Head({
  children,
  aside,
  className,
}: {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-rule pb-2",
        className,
      )}
    >
      <h2 className="t-display-sm text-ink">{children}</h2>
      {aside ? <div className="flex shrink-0 items-baseline gap-2">{aside}</div> : null}
    </div>
  );
}

/**
 * A rule with a caption sitting in it. One of the four sites index.css permits
 * uppercase, and it earns it: the caption has to read as part of the rule rather than
 * as content, and at 11px/650 with the tracking it does exactly that.
 */
export function RuleLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="t-caps shrink-0">{children}</span>
      <span className="h-px min-w-4 flex-1 bg-rule" aria-hidden />
    </div>
  );
}

/**
 * A figure and its caption. The figure is mono with tabular numerals so a column of
 * these stays aligned as the values change, and the caption sits under it in caps.
 * Setting figures in the serif (as the old build did, at `font-display text-5xl`) gave
 * proportional digits, so numbers jittered sideways every time a run updated them.
 */
export function StatCell({
  label,
  value,
  unit,
  size = "md",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className={cn("text-ink truncate", size === "lg" ? "t-data-xl" : "t-data-lg")}>
        {value}
        {unit ? <span className="t-data-sm ml-0.5 text-ink-3">{unit}</span> : null}
      </p>
      <p className="t-caps mt-1.5 truncate">{label}</p>
    </div>
  );
}

/** A labelled field. The label is sentence case at 12px/600, per index.css `t-label`. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="t-label flex items-baseline gap-1.5">
        {label}
        {hint ? <span className="t-meta font-normal">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
