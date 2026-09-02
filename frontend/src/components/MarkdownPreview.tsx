import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "./MermaidDiagram";
import { normalizeMarkdown } from "../lib/markdown";
import { cn } from "../lib/utils";

/** Render tables with remark-gfm and Mermaid fences as accessible process diagrams. */
export function MarkdownPreview({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("prose-press", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const language = /language-(\w+)/.exec(className ?? "")?.[1];
            if (language === "mermaid") {
              return <MermaidDiagram source={String(children).trimEnd()} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {normalizeMarkdown(source)}
      </ReactMarkdown>
    </div>
  );
}
