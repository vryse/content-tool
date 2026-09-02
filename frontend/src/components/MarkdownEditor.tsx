import { useLayoutEffect, useRef } from "react";
import { highlightMarkdown } from "../lib/markdown-highlight";
import { cn } from "../lib/utils";

/**
 * A textarea with a highlighted copy of its own text painted behind it. The two layers must
 * share every metric that affects wrapping (font, size, padding, whitespace mode) or the
 * colours drift away from the caret. That shared set lives in `layer` below.
 */
const layer =
  "m-0 w-full whitespace-pre-wrap break-words border-0 p-6 font-mono text-xs leading-6 tracking-normal";

export function MarkdownEditor({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const highlight = useRef<HTMLPreElement>(null);
  // Trailing newline: without it the last line of the highlight layer collapses and the
  // final line scrolls a row out of step with the caret.
  const painted = `${highlightMarkdown(value)}\n`;
  const sync = () => {
    if (!textarea.current || !highlight.current) return;
    highlight.current.scrollTop = textarea.current.scrollTop;
    highlight.current.scrollLeft = textarea.current.scrollLeft;
  };
  useLayoutEffect(sync, [value]);

  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      <pre
        ref={highlight}
        aria-hidden
        className={cn(layer, "pointer-events-none absolute inset-0 overflow-hidden md-code-layer")}
        dangerouslySetInnerHTML={{ __html: painted }}
      />
      <textarea
        ref={textarea}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={sync}
        spellCheck={false}
        aria-label="Markdown source"
        className={cn(
          layer,
          "relative h-full resize-none bg-transparent text-transparent caret-brand outline-none selection:bg-brand-tint-2 selection:text-transparent",
        )}
      />
    </div>
  );
}
