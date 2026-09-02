import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

/**
 * Three weights of the same control.
 *
 * The label is sentence case. It used to be `text-xs font-bold uppercase
 * tracking-[.14em]`, which is the treatment index.css reserves for four specific
 * captioning sites; spending it on every button flattened the page, because when
 * everything is a caps label nothing reads as the primary action. Weight and the
 * oxblood fill carry the hierarchy instead.
 *
 * Radius is 3px. Enough to stop the corner looking like a rendering error at the
 * size these sit at, not enough to read as a pill.
 */
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" }
>(({ className, variant = "primary", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-[3px] px-3.5 py-2 t-ui-sm",
      "transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40",
      "focus-visible:ring-2 focus-visible:ring-brand/45 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
      variant === "primary" && "bg-brand text-brand-fg hover:bg-brand-hover",
      variant === "secondary" && "border border-rule-strong bg-sheet text-ink hover:bg-inset",
      variant === "quiet" && "text-ink-2 hover:bg-inset hover:text-ink",
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";
