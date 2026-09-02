import type { OnProgress } from "./client";
import type { Api } from "./endpoints";
import type { ReferenceRecord } from "./types";
import {
  MOCK_CHILD_RUN_ID,
  MOCK_INSTRUCTIONS,
  MOCK_PROFILE,
  MOCK_PROJECTS,
  MOCK_REFERENCES,
  MOCK_ROOT_RUN_ID,
  MOCK_RUNS,
  MOCK_SUMMARIES,
} from "./fixtures";

export const MOCK_ENABLED =
  import.meta.env.VITE_MOCK === "1" ||
  (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mock"));

const wait = <T>(value: T, ms: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Walks the stage labels the live endpoints stream, so the running UI (which reads them) can
 * be exercised without a backend. Cost accumulates the way the real meter does.
 */
async function walk<T>(value: T, stages: string[], ms: number, onProgress?: OnProgress) {
  const step = ms / stages.length;
  let cost = 0;
  let calls = 0;
  for (const [index, label] of stages.entries()) {
    onProgress?.({
      type: "stage",
      key: label.toLowerCase().replaceAll(" ", "-"),
      label,
      status: "running",
      index: index + 1,
      total: stages.length,
      elapsed_s: Number(((index * step) / 1000).toFixed(1)),
    });
    await wait(null, step);
    cost += 0.018 + Math.random() * 0.012;
    calls += 1;
    onProgress?.({
      type: "cost",
      calls,
      input_tokens: calls * 2_600,
      output_tokens: calls * 900,
      cost_usd: Number(cost.toFixed(4)),
      elapsed_s: Number(((calls * step) / 1000).toFixed(1)),
    });
  }
  return value;
}

/**
 * Latencies are deliberately slow enough to exercise the running states and skeletons —
 * the real pipeline takes tens of seconds.
 */
/** Mutable so the ingest page's upload and delete actions are exercisable offline. */
let mockReferences: ReferenceRecord[] = MOCK_REFERENCES;

/** Recomputed from the mutable reference list so uploads move the project counts. */
const mockProjects = () =>
  MOCK_PROJECTS.map((project) => {
    const owned = mockReferences.filter((item) => item.company === project.company);
    return {
      ...project,
      reference_count: owned.length,
      document_word_count: owned.reduce((total, item) => total + (item.word_count ?? 0), 0),
    };
  }).concat(
    // A project created offline exists only as documents filed under a new name,
    // which is exactly how the backend derives one.
    [...new Set(mockReferences.map((item) => item.company))]
      .filter((name) => !MOCK_PROJECTS.some((project) => project.company === name))
      .map((company) => {
        const owned = mockReferences.filter((item) => item.company === company);
        return {
          company,
          reference_count: owned.length,
          document_word_count: owned.reduce((total, item) => total + (item.word_count ?? 0), 0),
          has_profile: false,
          profile_source_count: 0,
          profile_updated_at: null,
          run_count: 0,
          last_run_at: null,
        };
      }),
  );

export const mockApi: Api = {
  health: () => wait({ status: "ok" }, 180),
  projects: () => wait(mockProjects(), 240),
  deleteProject: (name) => {
    mockReferences = mockReferences.filter(
      (item) => item.company.toLowerCase() !== name.toLowerCase(),
    );
    return wait({ deleted: true, removed: {} }, 320);
  },
  /** Only the first fixture project has one, so the second exercises the empty state. */
  profile: (name) =>
    wait(name.toLowerCase() === MOCK_PROFILE.company.toLowerCase() ? MOCK_PROFILE : null, 260),
  profileSources: (name) =>
    wait(
      name.toLowerCase() === MOCK_PROFILE.company.toLowerCase()
        ? mockReferences
            .filter((item) => item.company === MOCK_PROFILE.company)
            .slice(0, 3)
            .map((item) => item.key)
        : [],
      200,
    ),
  deleteProfile: () => wait({ deleted: true }, 200),
  references: (name) =>
    wait(
      name
        ? mockReferences.filter((item) => item.company.toLowerCase() === name.toLowerCase())
        : mockReferences,
      280,
    ),
  uploadReferences: (name, files) => {
    const added = files.map((file) => ({
      key: `references/${name.toLowerCase().replaceAll(" ", "-")}/${file.name}`,
      filename: file.name,
      company: name,
      size_bytes: file.size,
      content_hash: `mock-${file.name}`,
      title: file.name.replace(/\.docx$/i, ""),
      word_count: 900 + Math.round(Math.random() * 1200),
      section_count: 4 + Math.round(Math.random() * 4),
      parse_error: null,
      uploaded_at: new Date().toISOString(),
    }));
    mockReferences = [
      ...mockReferences.filter((item) => !added.some((a) => a.key === item.key)),
      ...added,
    ];
    return wait(added, 700);
  },
  crawlReferences: (payload, onProgress) => {
    const slug = payload.blog_path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
    const added: ReferenceRecord[] = [
      {
        key: `references/${payload.company.toLowerCase().replaceAll(" ", "-")}/${slug}-mock-crawl.md`,
        filename: `${slug}-mock-crawl.md`,
        company: payload.company,
        size_bytes: 4_800,
        content_hash: `mock-crawl-${slug}`,
        title: `${payload.company} blog import`,
        word_count: 760,
        section_count: 5,
        parse_error: null,
        uploaded_at: new Date().toISOString(),
      },
    ];
    mockReferences = [
      ...mockReferences.filter((item) => !added.some((entry) => entry.key === item.key)),
      ...added,
    ];
    return walk({ job_id: "mock-firecrawl-job", stored: added }, ["Queuing crawl", "Collecting pages", "Saving Markdown"], 1_200, onProgress);
  },
  deleteReference: (key) => {
    mockReferences = mockReferences.filter((item) => item.key !== key);
    return wait({ deleted: true }, 320);
  },
  buildProfile: (_name, _provider, _model, onProgress) =>
    walk(
      MOCK_PROFILE,
      [
        "Reading reference corpus",
        "Extracting voice signals",
        "Deriving structural skeletons",
        "Caching profile",
      ],
      2_600,
      onProgress,
    ),
  suggestTopic: (payload) =>
    wait(
      {
        topic: `A practical guide to ${payload.company} next editorial opportunity`,
      },
      700,
    ),
  generate: (_requirements, onProgress) =>
    walk(
      MOCK_RUNS[MOCK_ROOT_RUN_ID],
      [
        "Planning sections",
        "Writing section 1 of 4",
        "Writing section 2 of 4",
        "Writing section 3 of 4",
        "Writing section 4 of 4",
        "Critiquing draft",
        "Evaluating against profile",
      ],
      4_200,
      onProgress,
    ),
  feedback: (payload) => wait({ run_id: payload.run_id, instructions: MOCK_INSTRUCTIONS }, 1_400),
  regenerate: (_runId, _instructions, onProgress) =>
    walk(
      MOCK_RUNS[MOCK_CHILD_RUN_ID],
      ["Applying instructions", "Rewriting targeted sections", "Re-evaluating"],
      3_000,
      onProgress,
    ),
  summary: (runId) => wait(MOCK_SUMMARIES[runId] ?? MOCK_SUMMARIES[MOCK_ROOT_RUN_ID], 320),
};
