import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Caret, Discard, Mark, Spinner } from "./Glyph";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useIngest } from "../hooks/useIngest";

/**
 * Picks which project the studio is looking at.
 *
 * Everything downstream — the reference library, the style profile, the learned
 * preferences, the brief's company — is namespaced by this one value, so it is
 * placed at the top of the rail: it is the widest-scoped control in the app and
 * reads as the thing every panel below it is qualified by.
 *
 * A native `<select>` would not carry the counts, and the counts are the reason
 * this list is worth opening: "3 refs · no profile" is what tells you a project
 * cannot generate yet, which is otherwise only discoverable by trying.
 */
export function ProjectSwitcher({ compact }: { compact?: boolean }) {
  const {
    projects,
    projectsLoading,
    project,
    selectProject,
    createProject,
    removeProject,
    deletingProject,
  } = useIngest();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  // Reopening should not resume a half-typed name or a pending confirmation.
  // Resetting is what closing *does*, so it happens here rather than in an effect
  // watching `open`; memoised only so the dismiss listeners below are attached
  // once per open instead of on every keystroke.
  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
    setDraft("");
    setConfirming(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [close, open]);

  useEffect(() => {
    if (creating) field.current?.focus();
  }, [creating]);

  const taken = projects.some((item) => item.company.toLowerCase() === draft.trim().toLowerCase());

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    // Typing the name of a project that already exists is a switch, not a
    // collision: there is nothing to create, so say nothing and go there.
    if (taken) {
      const existing = projects.find((item) => item.company.toLowerCase() === name.toLowerCase());
      selectProject(existing?.company ?? name);
    } else {
      createProject(name);
    }
    close();
  };

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-[3px] border border-rule px-2.5 py-1.5 text-left transition-colors duration-100 hover:bg-inset ${
          open ? "border-rule-strong bg-inset" : "bg-sheet"
        }`}
      >
        <span className="min-w-0 flex-1">
          {!compact && <span className="t-caps block text-ink-3">Project</span>}
          <span className="t-ui-sm block truncate font-normal text-ink">
            {projectsLoading ? "Loading" : project || "No project"}
          </span>
        </span>
        <Caret size={12} className={`shrink-0 text-ink-3 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            className="absolute left-0 right-0 z-30 mt-1 border border-rule-strong bg-sheet shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
          >
            <ul className="max-h-72 overflow-y-auto divide-y divide-rule-faint">
              {projects.length === 0 && !projectsLoading && (
                <li className="t-meta px-3 py-4 leading-[1.5]">
                  No projects yet. Name one below, then upload its reference documents.
                </li>
              )}
              {projects.map((item) => {
                const active = item.company === project;
                const pending = confirming === item.company;
                return (
                  <li key={item.company} className="group relative">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        selectProject(item.company);
                        close();
                      }}
                      className={`flex w-full items-start gap-2 border-l-2 py-2 pl-2 pr-8 text-left transition-colors duration-100 hover:bg-inset ${
                        active ? "border-brand bg-brand-tint/40" : "border-transparent"
                      }`}
                    >
                      <span className="flex w-4 shrink-0 justify-center pt-0.5">
                        {active && <Mark size={11} className="text-brand" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="t-ui-sm block truncate font-normal text-ink">
                          {item.company}
                        </span>
                        {/* The counts are the point of the list: they say which
                            projects can generate and which still need a build. */}
                        <span className="t-data-sm block truncate text-ink-3">
                          {[
                            `${item.reference_count} ref${item.reference_count === 1 ? "" : "s"}`,
                            item.has_profile ? "profile" : "no profile",
                            item.run_count > 0
                              ? `${item.run_count} run${item.run_count === 1 ? "" : "s"}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(pending ? null : item.company)}
                      disabled={deletingProject === item.company}
                      aria-label={`Delete project ${item.company}`}
                      className="absolute right-1.5 top-2 rounded-[2px] p-1 text-ink-3 opacity-0 transition-opacity duration-100 hover:text-negative focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                    >
                      {deletingProject === item.company ? (
                        <Spinner size={13} />
                      ) : (
                        <Discard size={13} />
                      )}
                    </button>
                    {pending && (
                      <div className="border-t border-rule-faint bg-inset px-3 py-2.5">
                        <p className="t-meta leading-[1.5]">
                          Deletes {item.reference_count} document
                          {item.reference_count === 1 ? "" : "s"} from R2 along with the profile,
                          learned preferences and {item.run_count} run
                          {item.run_count === 1 ? "" : "s"}. This cannot be undone.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            variant="secondary"
                            className="flex-1 border-negative/50 text-negative"
                            onClick={() => {
                              close();
                              void removeProject(item.company);
                            }}
                          >
                            Delete
                          </Button>
                          <Button
                            variant="quiet"
                            className="flex-1"
                            onClick={() => setConfirming(null)}
                          >
                            Keep
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-rule p-2">
              {creating ? (
                <div className="grid gap-2">
                  <Input
                    ref={field}
                    value={draft}
                    placeholder="Company or client name"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submit();
                      if (event.key === "Escape") setCreating(false);
                    }}
                  />
                  <p className="t-meta leading-[1.5]">
                    {taken
                      ? "That project already exists — this will switch to it."
                      : "The project is created by its first upload; nothing is written yet."}
                  </p>
                  <Button onClick={submit} disabled={!draft.trim()}>
                    {taken ? "Switch to it" : "Create and open library"}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="quiet"
                  className="w-full justify-start"
                  onClick={() => setCreating(true)}
                >
                  + New project
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
