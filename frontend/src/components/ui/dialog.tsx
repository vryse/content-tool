import { useEffect, useRef, type ReactNode } from "react";
import { Close } from "../Glyph";
import { cn } from "../../lib/utils";

/**
 * Modal shell. Deliberately small: Escape closes, a backdrop click closes, the page behind
 * cannot scroll, and focus moves into the panel so the keyboard follows the dialog.
 */
export function Dialog({
  open,
  onClose,
  title,
  header,
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-ink/35" aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[3px] border border-rule-strong bg-canvas shadow-overlay outline-none",
          className,
        )}
      >
        <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-rule bg-rail px-5 py-3.5">
          {header}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid size-7 place-items-center rounded-[3px] border border-rule text-ink-3 transition-colors duration-100 hover:border-rule-strong hover:text-ink"
          >
            <Close size={13} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        {footer && (
          <div className="flex-none border-t border-rule bg-rail px-5 py-2.5">{footer}</div>
        )}
      </div>
    </div>
  );
}
