import { createContext, useContext } from "react";

export type AlertVariant = "error" | "info" | "success";

export type AlertOptions = {
  variant?: AlertVariant;
};

export type AlertContextValue = {
  showAlert: (message: string, options?: AlertOptions) => string;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
};

export const AlertContext = createContext<AlertContextValue | null>(null);

export function useAlert(): AlertContextValue {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used inside <AlertProvider>.");
  }
  return context;
}
