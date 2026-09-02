import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";

import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource-variable/archivo/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";

import App from "./App";
import { AlertProvider } from "./components/AlertProvider";
import { IngestProvider } from "./components/IngestProvider";
import { IngestDialog } from "./components/IngestDialog";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* reducedMotion="user" makes every transform and layout animation respect the OS
        setting without a per-component branch. The few animations that still need an
        explicit branch say so at their definition. */}
    <MotionConfig reducedMotion="user">
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        storageKey="vryse-theme"
        disableTransitionOnChange
      >
        <AlertProvider>
          {/* The provider sits above the dialog on purpose: a profile build survives
              the dialog being closed. */}
          <IngestProvider>
            <App />
            <IngestDialog />
          </IngestProvider>
        </AlertProvider>
      </ThemeProvider>
    </MotionConfig>
  </StrictMode>,
);
