import { useCallback, useMemo, useState } from "react";
import { api, type Profile, type Requirements } from "../lib/api";
import { useAlert } from "./useAlert";

/** The blank, valid brief a project starts with. */
const initialBrief: Omit<Requirements, "company"> = {
  topic: "",
  target_audience: "",
  target_word_count: 400,
  key_points: [],
  required_sections: [],
  include_table: false,
  table_instructions: "",
  include_flowchart: false,
  llm_provider: "openai",
};

type Brief = Omit<Requirements, "company">;
type ProjectBriefs = Record<string, Brief>;
type VisualKey = "include_table" | "include_flowchart";
type VisualOverrides = Record<string, Partial<Record<VisualKey, boolean>>>;

const STORED_BRIEFS_KEY = "vryse.briefs";
const STORED_VISUAL_OVERRIDES_KEY = "vryse.visual-overrides";

const projectVisualDefaults = (profile: Profile | null): Pick<Brief, VisualKey> => ({
  include_table: profile?.visual_defaults.include_table ?? false,
  include_flowchart: profile?.visual_defaults.include_flowchart ?? false,
});

const emptyBrief = (profile: Profile | null = null): Brief => ({
  ...initialBrief,
  ...projectVisualDefaults(profile),
  key_points: [],
  required_sections: [],
});

const readStoredBriefs = (): ProjectBriefs => {
  try {
    const stored = window.localStorage.getItem(STORED_BRIEFS_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ProjectBriefs)
      : {};
  } catch {
    // A corrupted browser draft should never stop the studio from opening.
    return {};
  }
};

const storeBriefs = (briefs: ProjectBriefs) => {
  try {
    window.localStorage.setItem(STORED_BRIEFS_KEY, JSON.stringify(briefs));
  } catch {
    // Persistence is a convenience; editing remains available if storage is full.
  }
};

const readVisualOverrides = (): VisualOverrides => {
  try {
    const stored = window.localStorage.getItem(STORED_VISUAL_OVERRIDES_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as VisualOverrides)
      : {};
  } catch {
    return {};
  }
};

const storeVisualOverrides = (overrides: VisualOverrides) => {
  try {
    window.localStorage.setItem(STORED_VISUAL_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    /* Editing remains available when persistence is unavailable. */
  }
};

const isVisualKey = (key: keyof Brief): key is VisualKey =>
  key === "include_table" || key === "include_flowchart";

/**
 * Keeps the editable brief scoped to its project. Switching projects reads that
 * project's draft (or a blank one), without briefly showing another project's values.
 */
export function useBrief(project: string, profile: Profile | null) {
  const { showAlert } = useAlert();
  const [briefs, setBriefs] = useState<ProjectBriefs>(readStoredBriefs);
  const [visualOverrides, setVisualOverrides] = useState<VisualOverrides>(readVisualOverrides);
  const [suggestingTopic, setSuggestingTopic] = useState(false);
  const brief = useMemo<Brief>(() => {
    const recommendedVisuals = projectVisualDefaults(profile);
    const projectOverrides = visualOverrides[project] ?? {};
    return {
      ...(briefs[project] ?? emptyBrief(profile)),
      include_table: projectOverrides.include_table ?? recommendedVisuals.include_table,
      include_flowchart: projectOverrides.include_flowchart ?? recommendedVisuals.include_flowchart,
    };
  }, [briefs, profile, project, visualOverrides]);

  const update = useCallback(
    <K extends keyof Brief>(key: K, value: Brief[K]) => {
      if (!project) return;
      if (isVisualKey(key)) {
        setVisualOverrides((current) => {
          const next = {
            ...current,
            [project]: { ...current[project], [key]: value as boolean },
          };
          storeVisualOverrides(next);
          return next;
        });
      }
      setBriefs((current) => {
        const next = {
          ...current,
          [project]: { ...(current[project] ?? emptyBrief(profile)), [key]: value },
        };
        storeBriefs(next);
        return next;
      });
    },
    [profile, project],
  );

  const reset = useCallback(() => {
    if (!project) return;
    setBriefs((current) => {
      const next = { ...current };
      delete next[project];
      storeBriefs(next);
      return next;
    });
    setVisualOverrides((current) => {
      const next = { ...current };
      delete next[project];
      storeVisualOverrides(next);
      return next;
    });
  }, [project]);

  const suggestFromReferences = useCallback(
    async (targetProject: string) => {
      if (!targetProject) {
        showAlert("Choose a project with uploaded references first.");
        return;
      }

      setSuggestingTopic(true);
      try {
        const suggestion = await api.suggestTopic({
          company: targetProject,
          llm_provider: brief.llm_provider,
          llm_model: brief.llm_model,
          topic: brief.topic || undefined,
          target_audience: brief.target_audience || undefined,
          target_word_count: brief.target_word_count || undefined,
          key_points: brief.key_points.filter((point) => point.trim()),
          required_sections: brief.required_sections.filter((section) => section.trim()),
        });
        setBriefs((current) => {
          // A slow response still updates only the project it was requested for.
          const currentBrief = current[targetProject] ?? emptyBrief(profile);
          const nextBrief = {
            ...currentBrief,
            topic: currentBrief.topic.trim() ? currentBrief.topic : suggestion.topic,
            target_audience: currentBrief.target_audience.trim()
              ? currentBrief.target_audience
              : suggestion.target_audience,
            target_word_count:
              currentBrief.target_word_count > 0
                ? currentBrief.target_word_count
                : suggestion.target_word_count,
            key_points: currentBrief.key_points.some((point) => point.trim())
              ? currentBrief.key_points
              : suggestion.key_points,
            required_sections: currentBrief.required_sections.some((section) => section.trim())
              ? currentBrief.required_sections
              : suggestion.required_sections,
          };
          const next = { ...current, [targetProject]: nextBrief };
          storeBriefs(next);
          return next;
        });
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "Could not suggest a topic.");
      } finally {
        setSuggestingTopic(false);
      }
    },
    [brief, profile, showAlert],
  );

  return { brief, update, reset, suggestingTopic, suggestFromReferences };
}
