import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * A field is an inset, not a raised box: the sheet is the paper and the field is
 * where it has been ruled for writing. So it takes the inset surface and a full
 * rule, and no shadow. The old version carried `shadow-sm`, which put a drop
 * shadow under something that is meant to sit below the surface.
 */
export const inputSurface =
  "w-full rounded-[3px] border border-rule bg-inset px-2.5 text-ink t-ui transition-colors duration-100 " +
  "placeholder:text-ink-3 hover:border-rule-strong " +
  "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(inputSurface, "h-9", className)} {...props} />
  ),
);
Input.displayName = "Input";
