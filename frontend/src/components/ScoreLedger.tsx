import { RuleLabel } from "./Press";

/**
 * The nine evaluation dimensions, grouped by how each score was arrived at.
 *
 * This is the whole argument of the panel. A score's provenance decides what a reader
 * can do about it: a deterministic score is arithmetic over the text and is not worth
 * arguing with, an embedding score is a distance to the reference corpus, and a judge
 * score is a model's opinion and is the only kind a human should push back on. The old
 * build rendered seven of these as identical boxes and filtered the computed and
 * embedding dimensions out entirely, which threw away the one distinction that tells
 * you whether a low number is a bug or a disagreement.
 *
 * One hue per family, not per dimension. index.css carries graded variants
 * (`--viz-*-2`, `-3`, `-4`) and those are for charts where bars of one family stack
 * and have to be told apart; here the family is the signal and nine hues would only
 * reintroduce the rainbow the grouping exists to avoid.
 */
const FAMILIES = [
  {
    id: "rule",
    label: "Deterministic",
    note: "Computed from the text. Not arguable.",
    color: "var(--viz-rule-2)",
    keys: ["structure", "readability", "computed_fit"],
  },
  {
    id: "embed",
    label: "Embedding",
    note: "Distance to the reference corpus.",
    color: "var(--viz-embed-1)",
    keys: ["embedding_style_fit"],
  },
  {
    id: "judge",
    label: "Model judge",
    note: "An opinion. Push back with feedback.",
    color: "var(--viz-judge-2)",
    keys: ["style", "relevance", "tone_consistency", "completeness", "content_quality"],
  },
] as const;

const readable = (key: string) => key.replaceAll("_", " ").replace(/\bfit\b/, "fit");

/**
 * One row. The bar runs the full 0–100 axis rather than a window around the values:
 * these scores cluster in the 60s to 90s, and zooming the axis to that band would make
 * a six-point spread look like the difference between failure and perfection.
 */
function Row({
  label,
  value,
  delta,
  color,
  comparing,
}: {
  label: string;
  value: number;
  delta?: number;
  color: string;
  /** True only once a previous run exists to compare against. */
  comparing: boolean;
}) {
  const moved = delta !== undefined && Math.abs(delta) >= 0.05;
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 py-1.5">
      <span className="t-ui-sm truncate font-normal text-ink-2 first-letter:uppercase">
        {readable(label)}
      </span>
      <span className="flex items-baseline gap-2 tabular-nums">
        <span className="t-data text-ink">{value.toFixed(0)}</span>
        {/* The sign is part of the text, never colour alone: a red 2.0 and a green 2.0
            are the same glyph to a reader who cannot separate the two hues. */}
        {comparing && (
          <span
            className={`t-data-sm w-12 shrink-0 text-right ${
              !moved ? "text-ink-3" : delta! > 0 ? "text-positive" : "text-negative"
            }`}
          >
            {moved ? `${delta! > 0 ? "+" : "−"}${Math.abs(delta!).toFixed(1)}` : "0.0"}
          </span>
        )}
      </span>
      <div className="col-span-2 h-[3px] bg-inset" role="presentation">
        <div
          className="h-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function ScoreLedger({
  scores,
  deltas,
}: {
  scores: Record<string, number>;
  deltas: Record<string, number>;
}) {
  const comparing = Object.keys(deltas).length > 0;
  const claimed = new Set(FAMILIES.flatMap((family) => family.keys as readonly string[]));
  // A dimension the backend adds later must still appear. The old build's allow-list
  // silently dropped anything it did not recognise, which is the worst failure mode for
  // a panel whose job is to be complete.
  const unclaimed = Object.keys(scores).filter((key) => !claimed.has(key));
  const groups = [
    ...FAMILIES.map((family) => ({
      ...family,
      keys: (family.keys as readonly string[]).filter((key) => key in scores),
    })),
    ...(unclaimed.length
      ? [
          {
            id: "other",
            label: "Unclassified",
            note: "Reported by the evaluator, provenance unknown.",
            color: "var(--ink-3)",
            keys: unclaimed,
          },
        ]
      : []),
  ].filter((group) => group.keys.length > 0);

  return (
    <div className="grid gap-5">
      {groups.map((group) => (
        <div key={group.id}>
          <RuleLabel>{group.label}</RuleLabel>
          <p className="t-meta mt-1.5">{group.note}</p>
          <div className="mt-2">
            {group.keys.map((key) => (
              <Row
                key={key}
                label={key}
                value={scores[key]}
                delta={deltas[key]}
                color={group.color}
                comparing={comparing}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
