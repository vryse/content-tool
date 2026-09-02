import { request, stream, type OnProgress } from "./client";
import type {
  ArticleRequirements,
  CrawlResult,
  GenerationRun,
  ProjectSummary,
  ReferenceRecord,
  RevisionInstruction,
  RunSummary,
  StyleProfile,
  TopicSuggestion,
} from "./types";

const company = (name: string) => encodeURIComponent(name);

export const api = {
  health: () => request<{ status: string }>("/api/health"),

  /** Every project the backend holds anything for, newest spelling and counts. */
  projects: () => request<ProjectSummary[]>("/api/projects"),

  /** Removes the project's R2 objects, references, profile, preferences and runs. */
  deleteProject: (name: string) =>
    request<{ deleted: boolean; removed: Record<string, number> }>(
      `/api/projects/${company(name)}`,
      { method: "DELETE" },
    ),

  renameProject: (name: string, nextName: string) =>
    request<{ company: string }>(`/api/projects/${company(name)}`, {
      method: "PUT",
      body: JSON.stringify({ name: nextName }),
    }),

  /** Resolves to null when no profile has been cached for the project. */
  profile: (name: string) => request<StyleProfile | null>(`/api/profile/${company(name)}`),

  /** The R2 keys the cached profile was built from. */
  profileSources: (name: string) => request<string[]>(`/api/profile/${company(name)}/sources`),

  deleteProfile: (name: string) =>
    request<{ deleted: boolean }>(`/api/profile/${company(name)}`, { method: "DELETE" }),

  /**
   * Always forces a rebuild server-side: N+1 real LLM calls. Confirm before calling.
   * `referenceKeys` selects which stored documents to build from; an empty list
   * means every reference held for the company.
   */
  buildProfile: (
    name: string,
    provider?: ArticleRequirements["llm_provider"],
    model?: string,
    onProgress?: OnProgress,
    referenceKeys: string[] = [],
  ) =>
    stream<StyleProfile>(
      `/api/profile/${company(name)}/build`,
      {
        method: "POST",
        body: JSON.stringify({
          reference_keys: referenceKeys,
          llm_provider: provider ?? null,
          llm_model: model ?? null,
        }),
      },
      onProgress,
    ),

  references: (name?: string) =>
    request<ReferenceRecord[]>(`/api/references${name ? `?company=${company(name)}` : ""}`),

  /**
   * Multipart, so the Content-Type header the JSON client sets by default has to be
   * dropped: the browser must supply its own boundary parameter.
   */
  uploadReferences: (name: string, files: File[]) => {
    const form = new FormData();
    form.set("company", name);
    for (const file of files) form.append("files", file);
    return request<ReferenceRecord[]>("/api/references", {
      method: "POST",
      body: form,
      headers: {},
    });
  },

  crawlReferences: (
    payload: { company: string; client_url: string; blog_path: string; limit: number },
    onProgress?: OnProgress,
  ) =>
    stream<CrawlResult>(
      "/api/references/crawl",
      { method: "POST", body: JSON.stringify(payload) },
      onProgress,
    ),

  deleteReference: (key: string) =>
    request<{ deleted: boolean }>(
      `/api/references/${key.split("/").map(encodeURIComponent).join("/")}`,
      { method: "DELETE" },
    ),

  suggestTopic: (
    payload: Pick<
      ArticleRequirements,
      "company" | "llm_provider" | "llm_model" | "key_points" | "required_sections"
    > &
      Partial<Pick<ArticleRequirements, "topic" | "target_audience" | "target_word_count">>,
  ) =>
    request<TopicSuggestion>("/api/topics/suggest", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  generate: (requirements: ArticleRequirements, onProgress?: OnProgress) =>
    stream<GenerationRun>(
      "/api/generate",
      { method: "POST", body: JSON.stringify(requirements) },
      onProgress,
    ),

  feedback: (payload: { run_id: string; feedback: string; rating?: number }) =>
    request<{ run_id: string; instructions: RevisionInstruction[] }>("/api/feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  regenerate: (runId: string, instructions: RevisionInstruction[], onProgress?: OnProgress) =>
    stream<GenerationRun>(
      `/api/runs/${encodeURIComponent(runId)}/regenerate`,
      { method: "POST", body: JSON.stringify({ instructions }) },
      onProgress,
    ),

  summary: (runId: string) => request<RunSummary>(`/api/runs/${encodeURIComponent(runId)}/summary`),
};

export type Api = typeof api;
