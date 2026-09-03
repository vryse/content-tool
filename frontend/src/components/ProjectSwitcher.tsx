import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Caret, Discard, Edit, Mark, Spinner } from "./Glyph";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useIngest } from "../hooks/useIngest";

const MotionButton = motion.create(Button);

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
      <MotionButton
        type="button"
        variant="secondary"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        whileTap={{ scale: 0.99 }}
        className={`h-auto w-full justify-start gap-2 rounded-xs border border-rule px-2.5 py-1.5 text-left ${
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
      </MotionButton>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xs border border-rule-strong bg-sheet shadow-overlay"
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
                    <MotionButton
                      type="button"
                      variant="ghost"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        selectProject(item.company);
                        close();
                      }}
                      initial={false}
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.995 }}
                      transition={{ type: "spring", stiffness: 500, damping: 34 }}
                      className={`h-auto w-full justify-start gap-2 rounded-none border-l-2 py-2 pl-2 pr-3 text-left hover:bg-inset ${
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
                    </MotionButton>
                    {/* Project management stays out of the way until the row is
                        hovered or focused. One icon opens a single panel for both
                        renaming and deletion, leaving project selection as the
                        row's clear primary action. */}
                    <div
                      className={`absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center rounded-xs border border-rule-strong bg-sheet p-0.5 shadow-overlay transition-opacity duration-100 ${
                        pending || editing
                          ? "opacity-100"
                          : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                      }`}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setConfirming(null);
                          setRenaming(editing ? null : item.company);
                          setRenameDraft(item.company);
                        }}
                        disabled={
                          renamingProject === item.company || deletingProject === item.company
                        }
                        aria-label={`Edit project ${item.company}`}
                        title={`Edit ${item.company}`}
                        className="size-7 rounded-xs px-0 text-ink-3 hover:bg-inset hover:text-ink"
                      >
                        {renamingProject === item.company || deletingProject === item.company ? (
                          <Spinner size={13} />
                        ) : (
                          <Edit size={14} />
                        )}
                      </Button>
                    </div>
                    {editing && !pending && (
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
                            variant="ghost"
                            className="flex-1"
                            onClick={() => setRenaming(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                        <div className="mt-1 flex items-center justify-between border-t border-rule-faint pt-2">
                          <span className="t-meta text-ink-3">Project and all stored data</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => setConfirming(item.company)}
                            className="gap-1 rounded-xs px-1.5 text-negative hover:bg-negative/10 hover:text-negative focus-visible:bg-negative/10 focus-visible:text-negative"
                          >
                            <Discard size={13} />
                            Delete
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
                            variant="ghost"
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
                  variant="ghost"
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
