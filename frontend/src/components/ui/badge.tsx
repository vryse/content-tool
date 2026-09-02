import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * A tag, set square and in sentence case.
 *
 * It was a fully rounded pill of 10px uppercase letterspaced text. Two problems: a
 * pill is the one shape in the system with no straight edge to align to anything,
 * and uppercase 10px is unreadable at the density these appear in. Square corners
 * let a row of tags share a baseline grid with the rules around them.
 */
export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "brand" | "positive" | "caution" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[2px] border px-1.5 py-0.5 t-data-sm whitespace-nowrap",
        tone === "neutral" && "border-rule bg-inset text-ink-2",
        tone === "brand" && "border-brand-rule bg-brand-tint text-brand",
        tone === "positive" && "border-positive/35 bg-positive-tint text-positive",
        tone === "caution" && "border-caution/40 bg-caution/12 text-ink-2",
        className,
      )}
      {...props}
    />
  );
}
