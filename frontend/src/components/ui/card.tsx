import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * A ruled region.
 *
 * Kept under the old name so the import sites do not all have to change, but it is
 * no longer a card: no radius, no shadow. Structure comes from the rule and from
 * sitting on a different surface level than its container, which is how the four
 * `--paper-*` levels in index.css are meant to be spent. A page of identical
 * rounded, shadowed rectangles was the single biggest reason the old layout read as
 * generated: every region claimed the same importance and none of them aligned.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("border border-rule bg-sheet text-ink", className)} {...props} />;
}
