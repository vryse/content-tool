import type { SVGProps } from "react";

/**
 * The icon set, drawn here rather than taken from a library.
 *
 * The whole system is hairline-based: a 1px rule divides, a 1px rule encloses, and
 * nothing carries a shadow. A general-purpose icon library draws on a 24px grid with
 * a 2px round-capped stroke, which lands about twice the optical weight of every rule
 * it sits beside, so its marks always read as pasted on top of the layout instead of
 * belonging to it. These are 16px, 1.25px, square-capped and unfilled, which puts
 * them on the same weight as the rules.
 *
 * Decorative icons are not in here on purpose. A mark appears only where it labels
 * something the pointer can act on; section headings are set in type and divided by a
 * rule, which is what a press page does and what stops the chrome reading as a toolbar.
 */

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 16, children, ...props }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="square"
      strokeLinejoin="miter"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Shelved spines. The reference library. */
export const Library = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M4.5 4.25v8M8 3.25v9M11.5 5.25v7M2.25 13.5h11.5" />
  </Glyph>
);

/** A leaf of paper with its text rules. Documents, drafts, exports. */
export const Sheet = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M3.5 2.5h9v11h-9zM5.75 6h4.5M5.75 8.5h4.5M5.75 11h2.75" />
  </Glyph>
);

/** Down onto a baseline. Download. */
export const Descend = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M8 2.5v7.75M5 7.5 8 10.5l3-3M2.75 13.5h10.5" />
  </Glyph>
);

/** Up off a baseline. Upload. */
export const Ascend = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M8 13.5V5.75M5 8.75 8 5.75l3 3M2.75 2.5h10.5" />
  </Glyph>
);

/** Four corner brackets: a crop frame. Open to full size. */
export const Frame = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </Glyph>
);

/** Two opposed arcs closed by corner brackets. Run it again. */
export const Cycle = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M2.75 8a5.25 5.25 0 0 1 8.85-3.85" />
    <path d="M11.6 1.6v2.6H9" />
    <path d="M13.25 8a5.25 5.25 0 0 1-8.85 3.85" />
    <path d="M4.4 14.4v-2.6H7" />
  </Glyph>
);

/** Disclosure. */
export const Caret = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="m4 6.25 4 4 4-4" />
  </Glyph>
);

export const Close = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="m3.75 3.75 8.5 8.5M12.25 3.75l-8.5 8.5" />
  </Glyph>
);

export const Discard = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M2.5 4.5h11M4.75 4.5v9h6.5v-9M6.5 4.5v-2h3v2" />
  </Glyph>
);

/** Text set as rules: the rendered view. */
export const Rendered = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M2.5 3.5h11M2.5 6.5h11M2.5 9.5h8M2.5 12.5h5" />
  </Glyph>
);

/** Angle brackets: the source view. */
export const Source = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M6 3.75 2.5 8 6 12.25M10 3.75 13.5 8 10 12.25" />
  </Glyph>
);

/**
 * Three-quarter arc. The only glyph that moves, and it moves because a stalled
 * request and a working one have to look different.
 */
export const Spinner = ({ className = "", ...props }: GlyphProps) => (
  <Glyph className={`animate-spin ${className}`} {...props}>
    <path d="M8 2.25a5.75 5.75 0 1 1-5.75 5.75" />
  </Glyph>
);

/** A bang in a box: the marginal mark an editor makes against a problem. */
export const Notice = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M2.5 2.5h11v11h-11zM8 4.75v4.5M8 11.05v1" />
  </Glyph>
);

export const Info = (props: GlyphProps) => (
  <Glyph {...props}>
    <path d="M2.5 2.5h11v11h-11zM8 7v4.25M8 4.25v1" />
  </Glyph>
);

/**
 * A set square. Marks a completed stage and a settled state.
 *
 * It is filled, and it is the one filled mark in the set, which is the point: a stage
 * that is done is the only thing in the rail that wants to be read as a solid. A tick
 * would carry the wrong connotation here, since these stages are artefacts produced,
 * not items ticked off a list.
 */
export const Mark = ({ size = 16, ...props }: GlyphProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    stroke="none"
    shapeRendering="geometricPrecision"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <rect x="4.5" y="4.5" width="7" height="7" />
  </svg>
);
