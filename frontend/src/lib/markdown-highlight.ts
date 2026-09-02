const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};
const escapeHtml = (value: string) => value.replace(/[&<>]/g, (char) => ESCAPES[char]);

const span = (token: string, value: string) =>
  `<span class="md-${token}">${escapeHtml(value)}</span>`;

/** Inline spans, applied inside a single line of prose. Order matters: code first, so a
 *  `**` inside backticks is never read as emphasis. */
const INLINE =
  /(`[^`]+`)|(!?\[[^\]]*\]\([^)]*\))|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\n]+\*|_[^_\n]+_)|(~~[^~]+~~)/g;

function highlightInline(line: string): string {
  let result = "";
  let cursor = 0;
  for (const match of line.matchAll(INLINE)) {
    const index = match.index ?? 0;
    result += escapeHtml(line.slice(cursor, index));
    const [text, code, link, strong, emphasis, strike] = match;
    if (code) result += span("code", text);
    else if (link) result += span("link", text);
    else if (strong) result += span("strong", text);
    else if (emphasis) result += span("em", text);
    else if (strike) result += span("strike", text);
    cursor = index + text.length;
  }
  return result + escapeHtml(line.slice(cursor));
}

/**
 * Line-oriented Markdown highlighter producing HTML for the layer painted underneath the
 * textarea. It has to emit exactly one output line per input line — the overlay only stays
 * registered with the caret while the two share a line count and metrics.
 */
export function highlightMarkdown(source: string): string {
  let inFence = false;
  return source
    .split("\n")
    .map((line) => {
      const fence = /^\s*(```|~~~)/.test(line);
      if (fence) {
        inFence = !inFence;
        return span("fence", line);
      }
      if (inFence) return span("code", line);
      if (/^\s*#{1,6}\s/.test(line)) return span("heading", line);
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return span("rule", line);
      if (/^\s*>/.test(line)) return span("quote", line);

      // Literal glyph bullets are coloured as markers too, so the editor agrees with the
      // preview about what is a list.
      const bullet = line.match(/^(\s*)([-*+•‣▪◦]|\d+[.)])(\s+)(.*)$/);
      if (bullet) {
        const [, indent, marker, gap, rest] = bullet;
        return (
          escapeHtml(indent) + span("marker", marker) + escapeHtml(gap) + highlightInline(rest)
        );
      }
      return highlightInline(line);
    })
    .join("\n");
}
