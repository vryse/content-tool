import { api as liveApi } from "./endpoints";
import { MOCK_ENABLED, mockApi } from "./mock";

export const api = MOCK_ENABLED ? mockApi : liveApi;
export type {
  ArticleRequirements as Requirements,
  GenerationRun as Run,
  RevisionInstruction as Instruction,
  RunSummary as Summary,
  StyleProfile as Profile,
  ReferenceRecord as Reference,
  CrawlResult,
  ProjectSummary as Project,
} from "./types";
export type { OnProgress, ProgressEvent } from "./client";
