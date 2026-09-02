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
    renameProject,
    renamingProject,
  } = useIngest();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
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
    setRenaming(null);
    setRenameDraft("");
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
                const editing = renaming === item.company;
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
                      className={`flex w-full items-start gap-2 border-l-2 py-2 pl-2 pr-32 text-left transition-colors duration-100 hover:bg-inset ${
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
                    <div className="absolute right-1.5 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(null);
                          setRenaming(editing ? null : item.company);
                          setRenameDraft(item.company);
                        }}
                        disabled={
                          renamingProject === item.company || deletingProject === item.company
                        }
                        className="rounded-[2px] px-1.5 py-1 text-[0.6875rem] font-medium text-ink-3 transition-colors duration-100 hover:bg-inset hover:text-ink focus-visible:bg-inset focus-visible:text-ink disabled:opacity-40"
                      >
                        {renamingProject === item.company ? <Spinner size={13} /> : "Rename"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming(null);
                          setConfirming(pending ? null : item.company);
                        }}
                        disabled={
                          deletingProject === item.company || renamingProject === item.company
                        }
                        aria-label={`Delete project ${item.company}`}
                        className="inline-flex items-center gap-1 rounded-[2px] px-1.5 py-1 text-[0.6875rem] font-medium text-ink-3 transition-colors duration-100 hover:bg-negative/10 hover:text-negative focus-visible:bg-negative/10 focus-visible:text-negative disabled:opacity-40"
                      >
                        {deletingProject === item.company ? (
                          <Spinner size={13} />
                        ) : (
                          <>
                            <Discard size={13} />
                            Delete
                          </>
                        )}
                      </button>
                    </div>
                    {editing && (
                      <form
                        className="grid gap-2 border-t border-rule-faint bg-inset px-3 py-2.5"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void renameProject(item.company, renameDraft).then((renamed) => {
                            if (renamed) close();
                          });
                        }}
                      >
                        <label className="t-meta leading-[1.5]" htmlFor={`rename-${item.company}`}>
                          Rename project
                        </label>
                        <Input
                          id={`rename-${item.company}`}
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="submit"
                            className="flex-1"
                            disabled={!renameDraft.trim() || renamingProject === item.company}
                          >
                            Save name
                          </Button>
                          <Button
                            type="button"
                            variant="quiet"
                            className="flex-1"
                            onClick={() => setRenaming(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}
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
