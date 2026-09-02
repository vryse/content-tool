import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { Close, Info, Mark, Notice } from "./Glyph";
import { AlertContext, type AlertOptions, type AlertVariant } from "../hooks/useAlert";

type AlertItem = {
  id: string;
  message: string;
  variant: AlertVariant;
};

/**
 * Toasts are the one surface that has to read at a glance, so each variant is
 * distinguished by its mark, its title and its left rule together, not by colour alone.
 */
const PRESENTATION: Record<
  AlertVariant,
  { title: string; icon: typeof Notice; rule: string; tint: string }
> = {
  error: { title: "Error", icon: Notice, rule: "border-l-negative", tint: "text-negative" },
  info: { title: "Heads up", icon: Info, rule: "border-l-rule-strong", tint: "text-ink-2" },
  success: { title: "Done", icon: Mark, rule: "border-l-positive", tint: "text-positive" },
};

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const sequence = useRef(0);

  const showAlert = useCallback((message: string, options: AlertOptions = {}) => {
    const id = `alert-${Date.now()}-${sequence.current++}`;
    setAlerts((current) => [...current, { id, message, variant: options.variant ?? "error" }]);
    return id;
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  const value = useMemo(
    () => ({ showAlert, dismissAlert, clearAlerts }),
    [clearAlerts, dismissAlert, showAlert],
  );

  return (
    <AlertContext.Provider value={value}>
      {children}
      {/* Anchored bottom-right rather than top-right. The top-right corner now holds
          the ingest dialog's close button; a toast landing there swallows the click on
          it. Nothing at the bottom edge is interactive, so an overlap there costs nothing. */}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-[min(26rem,calc(100vw-2rem))]">
        {alerts.map((alert) => {
          const { title, icon: Icon, rule, tint } = PRESENTATION[alert.variant];
          return (
            <div
              key={alert.id}
              role="alert"
              className={`pointer-events-auto grid w-full grid-cols-[1rem_1fr_1rem] items-start gap-x-2.5 border border-rule-strong border-l-2 bg-sheet px-3 py-2.5 shadow-overlay ${rule}`}
            >
              <Icon size={14} className={`mt-0.5 ${tint}`} />
              <div className="min-w-0">
                <p className={`t-ui-sm ${tint}`}>{title}</p>
                <p className="t-ui-sm mt-0.5 font-normal leading-[1.5] text-ink-2">
                  {alert.message}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss alert"
                className="mt-0.5 text-ink-3 transition-colors duration-100 hover:text-ink"
                onClick={() => dismissAlert(alert.id)}
              >
                <Close size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </AlertContext.Provider>
  );
}
