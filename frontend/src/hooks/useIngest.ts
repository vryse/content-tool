import { createContext, useContext } from "react";
import type { Profile, Project, Reference } from "../lib/api";

export type BuildProgress = {
  label: string;
  cost: number;
  step: number | null;
  total: number | null;
};

export type IngestContextValue = {
  /** Dialog visibility, owned here so the header and the dialog agree on it. */
  open: boolean;
  setOpen: (open: boolean) => void;

  /**
   * Projects.
   *
   * Every artefact the system holds — reference documents, the style profile,
   * learned preferences, runs — is namespaced by project, so the active project
   * decides what the whole studio is looking at. It is held here rather than in
   * the studio because the ingest library is where a project is created, and a
   * switch has to invalidate the library and the profile together.
   */
  projects: Project[];
  projectsLoading: boolean;
  /** The active project. Empty only before the first one exists. */
  project: string;
  /** Switch to a project that already exists. */
  selectProject: (name: string) => void;
  /**
   * Adopt a name that has nothing stored under it yet. Nothing is written: a
   * project comes into existence when its first document is uploaded, so this
   * only points the studio at the name and opens the library.
   */
  createProject: (name: string) => void;
  /** Delete a project and everything filed under it. */
  removeProject: (name: string) => Promise<void>;
  deletingProject: string | null;

  references: Reference[];
  loading: boolean;
  uploading: boolean;
  crawling: boolean;
  deleting: string | null;

  selected: Set<string>;
  toggle: (key: string) => void;
  selectAll: (keys: string[]) => void;
  clearSelection: () => void;

  profile: Profile | null;
  /** The reference keys the cached profile was built from. */
  profileKeys: string[];

  building: boolean;
  progress: BuildProgress | null;

  upload: (files: File[]) => Promise<void>;
  crawl: (clientUrl: string, blogPath: string, limit: number) => Promise<void>;
  remove: (key: string) => Promise<void>;
  build: () => Promise<void>;
};

export const IngestContext = createContext<IngestContextValue | null>(null);

export function useIngest(): IngestContextValue {
  const context = useContext(IngestContext);
  if (!context) {
    throw new Error("useIngest must be used inside <IngestProvider>.");
  }
  return context;
}
