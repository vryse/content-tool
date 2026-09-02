import { useEffect, useId, useState } from "react";
import { renderMermaidToSvg } from "../lib/mermaid";

/** Render Mermaid only when a draft actually contains a flowchart. */
export function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replaceAll(":", "-");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    renderMermaidToSvg(source, `mermaid-${id}`)
      .then((svg) => {
        if (active) {
          setSvg(svg);
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError("This flowchart has invalid Mermaid syntax. Switch to Source to edit it.");
      });
    return () => {
      active = false;
    };
  }, [id, source]);

  if (error) return <p className="mermaid-diagram-error">{error}</p>;
  return (
    <div
      className="mermaid-diagram"
      role="img"
      aria-label="Article flowchart"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
