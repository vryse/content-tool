let configured = false;
let counter = 0;

async function loadMermaid() {
  const { default: mermaid } = await import("mermaid");
  if (!configured) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        primaryColor: "#f5e9e3",
        primaryTextColor: "#2e2926",
        primaryBorderColor: "#8e3f35",
        lineColor: "#665d58",
        tertiaryColor: "#eee7df",
        fontFamily: "Archivo Variable, sans-serif",
      },
      // Flowchart-v2's label renderer only respects the top-level flag; the nested
      // `flowchart.htmlLabels` is deprecated and silently ignored by newer Mermaid releases.
      // Without this, node labels render as <foreignObject><div> HTML, which taints the canvas
      // used to rasterize the diagram for the .docx export.
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true, curve: "basis" },
    });
    configured = true;
  }
  return mermaid;
}

/** Shared with MermaidDiagram's preview render, so the .docx export draws the same diagram. */
export async function renderMermaidToSvg(source: string, id?: string): Promise<string> {
  const mermaid = await loadMermaid();
  const { svg } = await mermaid.render(id ?? `mermaid-export-${counter++}`, source.trim());
  return svg;
}
