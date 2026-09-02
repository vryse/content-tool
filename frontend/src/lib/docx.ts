import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
} from "docx";
import { normalizeMarkdown } from "./markdown";
import { renderMermaidToSvg } from "./mermaid";

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

// Warm, oxblood-and-paper palette lifted from the app's design tokens (index.css), so an
// exported Word doc reads as the same publication rather than Word's default blue theme.
const INK = "2E2926";
const BRAND = "8E3F35";
const RULE = "D8CFC5";
const HEADER_TINT = "F5E9E3";

/** Inline emphasis, in the same precedence the highlighter uses: code wins over emphasis. */
const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\n]+\*|_[^_\n]+_)|(\[([^\]]*)\]\(([^)]*)\))/g;

function runs(text: string, options: { italic?: boolean; bold?: boolean } = {}): TextRun[] {
  const { italic = false, bold = false } = options;
  const output: TextRun[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor)
      output.push(new TextRun({ text: text.slice(cursor, index), italics: italic, bold }));
    const [whole, code, strong, emphasis, link, linkText] = match;
    if (code)
      output.push(
        new TextRun({ text: whole.slice(1, -1), font: "Consolas", italics: italic, bold }),
      );
    else if (strong)
      output.push(new TextRun({ text: whole.slice(2, -2), bold: true, italics: italic }));
    else if (emphasis) output.push(new TextRun({ text: whole.slice(1, -1), italics: true, bold }));
    else if (link)
      output.push(new TextRun({ text: linkText, underline: {}, italics: italic, bold }));
    cursor = index + whole.length;
  }
  if (cursor < text.length)
    output.push(new TextRun({ text: text.slice(cursor), italics: italic, bold }));
  return output.length ? output : [new TextRun({ text: "", bold })];
}

/** Splits a GFM pipe-table row into cells, honouring `\|` as a literal pipe. */
function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i++;
    } else if (trimmed[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += trimmed[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function isTableSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  // Requiring 2+ cells keeps a bare `---` horizontal rule from being mistaken for a
  // one-column table separator whenever the prose line above happens to contain a "|".
  return cells.length > 1 && cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

function cellAlignment(separator: string): (typeof AlignmentType)[keyof typeof AlignmentType] {
  const left = separator.startsWith(":");
  const right = separator.endsWith(":");
  if (left && right) return AlignmentType.CENTER;
  if (right) return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };

/** A boxed grid would clash with the newspaper-rule table the preview renders (index.css
 *  `.prose-press table`), so this keeps only a header rule and faint row dividers. */
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

function buildTable(
  header: string[],
  aligns: (typeof AlignmentType)[keyof typeof AlignmentType][],
  rows: string[][],
): Table {
  // Percentage widths, not a fixed DXA total: a fixed twip width has to be guessed against
  // the page's printable area (page width minus margins) and silently overflows it if guessed
  // too wide, which is what made the table blow past the margin instead of fitting the page.
  const columnWidth = Math.floor(100 / header.length);
  const headerRow = new TableRow({
    tableHeader: true,
    children: header.map(
      (cell, index) =>
        new TableCell({
          width: { size: columnWidth, type: WidthType.PERCENTAGE },
          margins: CELL_MARGINS,
          shading: { fill: HEADER_TINT },
          children: [
            new Paragraph({ alignment: aligns[index], children: runs(cell, { bold: true }) }),
          ],
        }),
    ),
  });
  const bodyRows = rows.map(
    (row) =>
      new TableRow({
        children: header.map(
          (_, index) =>
            new TableCell({
              width: { size: columnWidth, type: WidthType.PERCENTAGE },
              margins: CELL_MARGINS,
              children: [
                new Paragraph({
                  alignment: aligns[index] ?? AlignmentType.LEFT,
                  children: runs(row[index] ?? ""),
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [headerRow, ...bodyRows],
  });
}

function svgIntrinsicSize(svg: string): { width: number; height: number } {
  const viewBox = svg.match(/viewBox="[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/);
  if (viewBox) return { width: parseFloat(viewBox[1]), height: parseFloat(viewBox[2]) };
  const width = svg.match(/\swidth="([\d.]+)"/);
  const height = svg.match(/\sheight="([\d.]+)"/);
  return { width: width ? parseFloat(width[1]) : 800, height: height ? parseFloat(height[1]) : 480 };
}

// Fits within the printable width of a Letter page with 1" margins (8.5in - 2in, at 96dpi).
const MAX_DIAGRAM_WIDTH = 620;

/** Rasterizes a rendered Mermaid SVG to PNG bytes: docx embeds bitmap images far more
 *  reliably across Word versions than it does inline SVG. */
async function rasterizeSvg(svg: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  const { width: intrinsicWidth, height: intrinsicHeight } = svgIntrinsicSize(svg);
  const displayWidth = Math.min(MAX_DIAGRAM_WIDTH, intrinsicWidth);
  const displayHeight = Math.max(1, Math.round(displayWidth * (intrinsicHeight / intrinsicWidth || 0.6)));
  const scale = 2; // oversample so the embedded raster stays crisp at document scale

  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not rasterize the diagram."));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = displayWidth * scale;
    canvas.height = displayHeight * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not rasterize the diagram.");
    return { data: new Uint8Array(await blob.arrayBuffer()), width: displayWidth, height: displayHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Renders a fenced ```mermaid block to an embedded image, matching what the preview shows.
 *  Invalid syntax falls back to the raw source as a code block, same as an unrecognised fence,
 *  so a broken diagram degrades instead of vanishing. */
async function mermaidParagraphs(source: string): Promise<(Paragraph | Table)[]> {
  try {
    const svg = await renderMermaidToSvg(source);
    const image = await rasterizeSvg(svg);
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 160 },
        children: [
          new ImageRun({
            type: "png",
            data: image.data,
            transformation: { width: image.width, height: image.height },
          }),
        ],
      }),
    ];
  } catch {
    return [
      new Paragraph({
        children: runs("This flowchart has invalid Mermaid syntax and could not be rendered:", {
          italic: true,
        }),
      }),
      ...source.split("\n").map(
        (line) => new Paragraph({ children: [new TextRun({ text: line, font: "Consolas" })] }),
      ),
    ];
  }
}

/**
 * Markdown → Word, covering what the writer actually emits: headings, paragraphs, bullet and
 * numbered lists, quotes, rules, GFM tables, fenced code, and fenced Mermaid flowcharts (as an
 * embedded image). Anything unrecognised falls through as body text rather than being dropped,
 * so an export never silently loses a line.
 */
async function blocks(markdown: string): Promise<(Paragraph | Table)[]> {
  const output: (Paragraph | Table)[] = [];
  const lines = normalizeMarkdown(markdown).split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^\s*(```|~~~)(\w*)\s*$/);
    if (fence) {
      const language = fence[2].toLowerCase();
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence
      if (language === "mermaid") {
        output.push(...(await mermaidParagraphs(body.join("\n"))));
      } else {
        for (const codeLine of body)
          output.push(new Paragraph({ children: [new TextRun({ text: codeLine, font: "Consolas" })] }));
      }
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1])) {
      const header = splitTableRow(line);
      const aligns = splitTableRow(lines[i + 1]).map(cellAlignment);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      output.push(buildTable(header, aligns, rows));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      output.push(
        new Paragraph({ children: runs(heading[2]), heading: HEADINGS[heading[1].length - 1] }),
      );
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      output.push(new Paragraph({ text: "", border: { bottom: { style: "single", size: 6 } } }));
      i++;
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      // Indent and italics rather than Word's Quote style: that style is not defined in this
      // document, and a dangling style reference renders as plain body text.
      output.push(
        new Paragraph({ children: runs(quote[1], { italic: true }), indent: { left: 480 } }),
      );
      i++;
      continue;
    }
    const bullet = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (bullet) {
      output.push(
        new Paragraph({
          children: runs(bullet[3]),
          bullet: { level: Math.min(Math.floor(bullet[1].length / 2), 4) },
        } as IParagraphOptions),
      );
      i++;
      continue;
    }
    const numbered = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (numbered) {
      output.push(
        new Paragraph({
          children: runs(numbered[2]),
          numbering: { reference: "ordered", level: 0 },
        }),
      );
      i++;
      continue;
    }
    output.push(new Paragraph({ children: runs(line) }));
    i++;
  }
  return output;
}

export async function markdownToDocx(markdown: string, title: string): Promise<Blob> {
  const document = new Document({
    title,
    styles: {
      default: {
        document: {
          run: { font: "Georgia", size: 22, color: INK },
          paragraph: { spacing: { line: 320, after: 160 } },
        },
        heading1: {
          run: { font: "Georgia", size: 40, bold: true, color: INK },
          paragraph: { spacing: { before: 0, after: 240 } },
        },
        heading2: {
          run: { font: "Georgia", size: 30, bold: true, color: INK },
          paragraph: {
            spacing: { before: 360, after: 160 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
          },
        },
        heading3: {
          run: { font: "Calibri", size: 22, bold: true, color: BRAND },
          paragraph: { spacing: { before: 280, after: 120 } },
        },
        heading4: {
          run: { font: "Calibri", size: 20, bold: true, italics: true, color: INK },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children: await blocks(markdown),
      },
    ],
  });
  return Packer.toBlob(document);
}
