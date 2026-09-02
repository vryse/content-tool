import type { DraftArticle } from "./api/types";

/**
 * The backend's DraftArticle.markdown is a bare Python @property, so Pydantic never
 * serializes it and `article.markdown` is undefined in every response. This reproduces
 * backend/app/models.py:150 exactly.
 */
export function assembleMarkdown(article: DraftArticle): string {
  const chunks = [`# ${article.title}`];
  for (const section of article.sections) {
    chunks.push(`${"#".repeat(section.level)} ${section.heading}\n\n${section.markdown.trim()}`);
  }
  return `${chunks.join("\n\n").trim()}\n`;
}

/** Bullet glyphs writers emit as literal characters. Markdown has no idea they are list
 *  markers, so a run of them parses as one paragraph and the points vanish into prose. */
export const UNICODE_BULLET = /^(\s*)[•‣▪◦·–—]\s+(?=\S)/;

/**
 * Rewrites literal-glyph bullets into real Markdown list items before rendering. A list is
 * only a list to a parser if a blank line separates it from the paragraph above, so this
 * inserts one where a run of bullets starts mid-block.
 */
export function normalizeMarkdown(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  for (const line of lines) {
    const bullet = line.match(UNICODE_BULLET);
    if (!bullet) {
      output.push(line);
      continue;
    }
    // `previous` has already been rewritten, so test it as a Markdown item — testing it as
    // a glyph bullet would never match and would space every item apart into a loose list.
    const previous = output.at(-1);
    if (previous !== undefined && previous.trim() !== "" && !/^\s*([-*+]|\d+[.)])\s/.test(previous))
      output.push("");
    output.push(line.replace(UNICODE_BULLET, `${bullet[1]}- `));
  }
  return output.join("\n");
}
