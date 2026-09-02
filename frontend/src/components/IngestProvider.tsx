import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Profile, type Project, type ProgressEvent, type Reference } from "../lib/api";
import { IngestContext, type BuildProgress } from "../hooks/useIngest";
import { useAlert } from "../hooks/useAlert";

/** Survives a reload, so returning to the studio returns to the project you left. */
const STORED_PROJECT_KEY = "vryse.project";

const readStoredProject = (): string => {
  try {
    return window.localStorage.getItem(STORED_PROJECT_KEY)?.trim() ?? "";
  } catch {
    // Private-mode Safari and storage-blocking settings throw on access rather
    // than returning null; a forgotten selection is not worth failing a mount.
    return "";
  }
};

const writeStoredProject = (name: string) => {
  try {
    if (name) window.localStorage.setItem(STORED_PROJECT_KEY, name);
    else window.localStorage.removeItem(STORED_PROJECT_KEY);
  } catch {
    /* see readStoredProject */
  }
};

/**
 * Everything the studio holds for one project, tagged with whose it is.
 *
 * Tagged rather than cleared on switch. Clearing means an effect that writes
 * four pieces of state the moment the project changes, and it still leaves the
 * window in which a slow response for the project you just left lands on the one
 * you switched to. Carrying the owner instead makes a mismatch unrenderable.
 */
type Library = {
  project: string;
  references: Reference[];
  profile: Profile | null;
  profileKeys: string[];
};

const EMPTY_LIBRARY: Library = { project: "", references: [], profile: null, profileKeys: [] };
const NO_SELECTION: { project: string; keys: Set<string> } = { project: "", keys: new Set() };

/**
 * Owns the project list, the active project, its reference library and its
 * profile build.
 *
 * The system holds several projects, and every artefact it stores is namespaced
 * by one, so the active project is the single value the studio, the library and
 * the brief all have to agree on. It lives here because a switch has to
 * invalidate the reference list, the selection and the cached profile together.
 *
 * The build lives here for a different reason: it is one LLM call per document
 * plus a synthesis, which takes tens of seconds. Closing the ingest dialog
 * unmounts only the view, so the stream keeps being consumed and the finished
 * profile lands in state whether or not anyone is looking at it. Holding it in
 * the dialog would tie an expensive, paid operation to the lifetime of a modal.
 */
export function IngestProvider({ children }: { children: ReactNode }) {
  const { showAlert, clearAlerts } = useAlert();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [project, setProject] = useState("");
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [library, setLibrary] = useState<Library>(EMPTY_LIBRARY);
  const [selection, setSelection] = useState(NO_SELECTION);
  // Which project the loaded library belongs to. Loading is derived from it rather
  // than tracked separately, keeping the fetch effect free of the synchronous
  // setState that would cascade a render on every switch.
  const [loadedFor, setLoadedFor] = useState("");
  const [uploading, setUploading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  // A project whose first document has not been uploaded yet is not in the list
  // the backend derives, so it has to be remembered to stay selectable.
  const [pendingProject, setPendingProject] = useState<string | null>(null);

  // Read by callbacks that outlive the render they started in — a profile build
  // finishing after a switch has to compare against the project shown *now*.
  const activeProject = useRef(project);
  useEffect(() => {
    activeProject.current = project;
  }, [project]);

  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    try {
      const found = await api.projects();
      setProjects(found);
      return found;
    } catch (error) {
      showAlert(error instanceof Error ? error.message : "The project list could not be loaded.");
      return [];
    } finally {
      setProjectsLoading(false);
    }
  }, [showAlert]);

  // The stored project only counts if the backend still has it; a project deleted
  // from another session would otherwise leave the studio pointing at nothing.
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void (async () => {
      const found = await refreshProjects();
      const stored = readStoredProject();
      const match = found.find((item) => item.company.toLowerCase() === stored.toLowerCase());
      // Prefer the last project used, then the one furthest along: a project with a
      // profile can generate immediately, which is the more useful place to land.
      const fallback =
        found.find((item) => item.has_profile) ?? found.find((item) => item.reference_count > 0);
      const chosen = match?.company ?? fallback?.company ?? found[0]?.company ?? "";
      setProject(chosen);
      writeStoredProject(chosen);
    })();
  }, [refreshProjects]);

  useEffect(() => {
    if (!project) return;
    // The project can change again while a load is in flight; the guard stops a
    // slower earlier response from being applied at all, and tagging the result
    // stops it from being rendered even if it were.
    let current = true;
    const load = async () => {
      try {
        const [references, profile, profileKeys] = await Promise.all([
          api.references(project),
          api.profile(project).catch(() => null),
          api.profileSources(project).catch(() => [] as string[]),
        ]);
        if (!current) return;
        setLibrary({ project, references, profile, profileKeys });
        // Pre-select what the cached profile was built from; otherwise everything
        // readable, which is the sensible default for a first build.
        const preferred = profileKeys.length
          ? profileKeys
          : references.filter((item) => !item.parse_error).map((item) => item.key);
        setSelection({
          project,
          keys: new Set(preferred.filter((key) => references.some((item) => item.key === key))),
        });
      } catch (error) {
        if (!current) return;
        setLibrary({ ...EMPTY_LIBRARY, project });
        setSelection({ project, keys: new Set() });
        showAlert(
          error instanceof Error ? error.message : "The reference library could not be loaded.",
        );
      } finally {
        if (current) setLoadedFor(project);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [project, showAlert]);

  // A library belonging to another project is not shown at all, so a switch reads
  // as empty-and-loading rather than as the previous project's documents.
  const owned = library.project === project ? library : EMPTY_LIBRARY;
  const selected = selection.project === project ? selection.keys : NO_SELECTION.keys;

  /** Apply a change to the library only while it is still the one on screen. */
  const updateLibrary = useCallback((target: string, change: (library: Library) => Library) => {
    setLibrary((current) => (current.project === target ? change(current) : current));
  }, []);

  const updateSelection = useCallback(
    (target: string, change: (keys: Set<string>) => Set<string>) => {
      setSelection((current) =>
        current.project === target ? { project: target, keys: change(current.keys) } : current,
      );
    },
    [],
  );

  const switchTo = useCallback((name: string) => {
    const next = name.trim();
    setProject((current) => (current === next ? current : next));
    writeStoredProject(next);
  }, []);

  const selectProject = useCallback(
    (name: string) => {
      clearAlerts();
      switchTo(name);
    },
    [clearAlerts, switchTo],
  );

  const createProject = useCallback(
    (name: string) => {
      const next = name.trim();
      if (!next) return;
      clearAlerts();
      // Nothing is written here. A project exists once a document is filed under
      // its name, so the library is opened on an empty one and the upload creates it.
      setPendingProject(next);
      switchTo(next);
      setOpen(true);
    },
    [clearAlerts, switchTo],
  );

  const removeProject = useCallback(
    async (name: string) => {
      setDeletingProject(name);
      try {
        await api.deleteProject(name);
        setPendingProject((current) => (current === name ? null : current));
        const remaining = await refreshProjects();
        if (activeProject.current.toLowerCase() === name.toLowerCase()) {
          switchTo(remaining[0]?.company ?? "");
        }
        showAlert(`Deleted ${name} and everything stored for it.`, { variant: "success" });
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "The project could not be deleted.");
      } finally {
        setDeletingProject(null);
      }
    },
    [refreshProjects, showAlert, switchTo],
  );

  const upload = useCallback(
    async (files: File[]) => {
      const target = project;
      if (!target) {
        showAlert("Choose or create a project before uploading.");
        return;
      }
      const documents = files.filter((file) => /\.(md|markdown|docx|doc)$/i.test(file.name));
      const rejected = files.length - documents.length;
      if (rejected > 0) {
        showAlert(
          `${rejected} file${rejected === 1 ? "" : "s"} skipped. Use .md, .docx, or .doc.`,
          { variant: "info" },
        );
      }
      if (!documents.length) return;
      setUploading(true);
      try {
        const stored = await api.uploadReferences(target, documents);
        // The backend answers with the spelling an existing project is filed under,
        // so a differently-cased name joins that project instead of forking it.
        const canonical = stored[0]?.company ?? target;
        setLibrary((current) =>
          current.project === target || current.project === canonical
            ? {
                ...current,
                project: canonical,
                references: [
                  ...current.references.filter(
                    (item) => !stored.some((added) => added.key === item.key),
                  ),
                  ...stored,
                ].sort((a, b) => a.filename.localeCompare(b.filename)),
              }
            : current,
        );
        setSelection((current) =>
          current.project === target || current.project === canonical
            ? {
                project: canonical,
                keys: new Set([...current.keys, ...stored.map((item) => item.key)]),
              }
            : current,
        );
        if (canonical !== target) {
          setLoadedFor(canonical);
          switchTo(canonical);
        }
        setPendingProject(null);
        void refreshProjects();
        showAlert(
          `Stored ${stored.length} document${stored.length === 1 ? "" : "s"} for ${canonical}.`,
          { variant: "success" },
        );
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "The upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [project, refreshProjects, showAlert, switchTo],
  );

  const remove = useCallback(
    async (key: string) => {
      const target = project;
      setDeleting(key);
      try {
        await api.deleteReference(key);
        updateLibrary(target, (current) => ({
          ...current,
          references: current.references.filter((item) => item.key !== key),
        }));
        updateSelection(target, (keys) => {
          const next = new Set(keys);
          next.delete(key);
          return next;
        });
        void refreshProjects();
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "The document could not be deleted.");
      } finally {
        setDeleting(null);
      }
    },
    [project, refreshProjects, showAlert, updateLibrary, updateSelection],
  );

  const onProgress = useCallback((event: ProgressEvent) => {
    setProgress((current) => ({
      label: event.type === "stage" ? event.label : (current?.label ?? ""),
      cost: event.type === "cost" ? event.cost_usd : (current?.cost ?? 0),
      step: event.type === "stage" ? event.index : (current?.step ?? null),
      total: event.type === "stage" ? event.total : (current?.total ?? null),
    }));
  }, []);

  const crawl = useCallback(
    async (clientUrl: string, blogPath: string, limit: number) => {
      const target = project;
      if (!target || crawling) return;
      setCrawling(true);
      setProgress(null);
      clearAlerts();
      try {
        const result = await api.crawlReferences(
          { company: target, client_url: clientUrl, blog_path: blogPath, limit },
          onProgress,
        );
        const stored = result.stored;
        const canonical = stored[0]?.company ?? target;
        setLibrary((current) =>
          current.project === target || current.project === canonical
            ? {
                ...current,
                project: canonical,
                references: [
                  ...current.references.filter((item) => !stored.some((added) => added.key === item.key)),
                  ...stored,
                ].sort((a, b) => a.filename.localeCompare(b.filename)),
              }
            : current,
        );
        setSelection((current) =>
          current.project === target || current.project === canonical
            ? { project: canonical, keys: new Set([...current.keys, ...stored.map((item) => item.key)]) }
            : current,
        );
        setPendingProject(null);
        void refreshProjects();
        showAlert(`Crawl complete: stored ${stored.length} Markdown reference${stored.length === 1 ? "" : "s"}.`, { variant: "success" });
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "The site crawl failed.");
      } finally {
        setCrawling(false);
        setProgress(null);
      }
    },
    [clearAlerts, crawling, onProgress, project, refreshProjects, showAlert],
  );

  const build = useCallback(async () => {
    const keys = [...selected];
    // The build is slow enough to outlive a switch, and it writes the profile for
    // the project it started on, so the target is captured rather than read back.
    const target = project;
    if (!keys.length || building || !target) return;
    setBuilding(true);
    setProgress(null);
    clearAlerts();
    try {
      const built = await api.buildProfile(target, undefined, undefined, onProgress, keys);
      // Landing a profile for a project the user has since left would replace the
      // one on screen with another project's.
      updateLibrary(target, (current) => ({ ...current, profile: built, profileKeys: keys }));
      void refreshProjects();
      // Announced through the alert channel rather than inside the dialog, so the
      // result is visible even when the build finished with the dialog closed.
      showAlert(`${target}: profile rebuilt from ${built.source_article_count} references.`, {
        variant: "success",
      });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : "The profile could not be built.");
    } finally {
      setBuilding(false);
      setProgress(null);
    }
  }, [
    building,
    clearAlerts,
    onProgress,
    project,
    refreshProjects,
    selected,
    showAlert,
    updateLibrary,
  ]);

  const toggle = useCallback(
    (key: string) => {
      updateSelection(project, (keys) => {
        const next = new Set(keys);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [project, updateSelection],
  );

  const selectAll = useCallback(
    (keys: string[]) => setSelection({ project, keys: new Set(keys) }),
    [project],
  );
  const clearSelection = useCallback(() => setSelection({ project, keys: new Set() }), [project]);

  // A project being created has no row yet, so it is merged in to stay listed and
  // selectable until its first upload makes it real.
  const listed = useMemo(() => {
    if (!pendingProject) return projects;
    if (projects.some((item) => item.company.toLowerCase() === pendingProject.toLowerCase())) {
      return projects;
    }
    return [
      ...projects,
      {
        company: pendingProject,
        reference_count: 0,
        document_word_count: 0,
        has_profile: false,
        profile_source_count: 0,
        profile_updated_at: null,
        run_count: 0,
        last_run_at: null,
      },
    ].sort((a, b) => a.company.localeCompare(b.company));
  }, [pendingProject, projects]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      projects: listed,
      projectsLoading,
      project,
      selectProject,
      createProject,
      removeProject,
      deletingProject,
      references: owned.references,
      loading: Boolean(project) && loadedFor !== project,
      uploading,
      crawling,
      deleting,
      selected,
      toggle,
      selectAll,
      clearSelection,
      profile: owned.profile,
      profileKeys: owned.profileKeys,
      building,
      progress,
      upload,
      crawl,
      remove,
      build,
    }),
    [
      build,
      building,
      crawl,
      crawling,
      clearSelection,
      createProject,
      deleting,
      deletingProject,
      listed,
      loadedFor,
      open,
      owned,
      progress,
      project,
      projectsLoading,
      remove,
      removeProject,
      selectAll,
      selectProject,
      selected,
      toggle,
      upload,
      uploading,
    ],
  );

  return <IngestContext.Provider value={value}>{children}</IngestContext.Provider>;
}
