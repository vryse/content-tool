import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type Instruction,
  type ProgressEvent,
  type Requirements,
  type Run,
  type Summary,
} from "../lib/api";
import { useAlert } from "./useAlert";

export type PipelineTask = "generate" | "feedback" | "regenerate";

export type PipelineProgress = {
  label: string;
  cost: number;
  step: number | null;
  total: number | null;
};

const FALLBACK_MESSAGE: Record<PipelineTask, string> = {
  generate: "The pipeline could not complete that request.",
  feedback: "Feedback could not be transformed.",
  regenerate: "Regeneration could not complete.",
};

/**
 * Owns every call to the generation API and the state each call moves: what is in flight,
 * the NDJSON progress the long-running endpoints stream, and the run/evaluation data they
 * resolve to. Components read the result and render it.
 *
 * The reference corpus and the style profile are not here: they belong to the ingest
 * context, which outlives this hook's consumers so a profile build survives the dialog
 * closing.
 */
export function usePipeline() {
  const { showAlert, clearAlerts } = useAlert();
  const [online, setOnline] = useState<boolean | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [previousRun, setPreviousRun] = useState<Run | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [busy, setBusy] = useState<PipelineTask | null>(null);
  // The long-running endpoints stream NDJSON progress while they work; without this the
  // UI would sit on a spinner for the two minutes a generation takes.
  const [progress, setProgress] = useState<PipelineProgress | null>(null);

  const onProgress = useCallback((event: ProgressEvent) => {
    setProgress((current) => ({
      label: event.type === "stage" ? event.label : (current?.label ?? ""),
      cost: event.type === "cost" ? event.cost_usd : (current?.cost ?? 0),
      step: event.type === "stage" ? event.index : (current?.step ?? null),
      total: event.type === "stage" ? event.total : (current?.total ?? null),
    }));
  }, []);

  useEffect(() => {
    api
      .health()
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    if (run)
      api
        .summary(run.run_id)
        .then(setSummary)
        .catch(() => undefined);
  }, [run]);

  /**
   * Runs one task at a time, reporting failures through the alert channel. Resolves to
   * whether the task succeeded, so callers can gate follow-up UI on it.
   */
  const perform = useCallback(
    async (task: PipelineTask, work: () => Promise<void>) => {
      setBusy(task);
      setProgress(null);
      clearAlerts();
      try {
        await work();
        return true;
      } catch (e) {
        showAlert(e instanceof Error ? e.message : FALLBACK_MESSAGE[task]);
        return false;
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [clearAlerts, showAlert],
  );

  const generate = useCallback(
    (brief: Requirements) =>
      perform("generate", async () => {
        setPreviousRun(null);
        setRun(await api.generate(brief, onProgress));
      }),
    [onProgress, perform],
  );

  const submitFeedback = useCallback(
    (feedback: string, rating: number) => {
      if (!run || !feedback.trim()) return Promise.resolve(false);
      return perform("feedback", async () => {
        const result = await api.feedback({
          run_id: run.run_id,
          feedback,
          rating: rating || undefined,
        });
        setInstructions(result.instructions);
      });
    },
    [perform, run],
  );

  const regenerate = useCallback(() => {
    if (!run || !instructions.length) return Promise.resolve(false);
    return perform("regenerate", async () => {
      setPreviousRun(run);
      setRun(await api.regenerate(run.run_id, instructions, onProgress));
    });
  }, [instructions, onProgress, perform, run]);

  /** Score movement between the previous run and the current one, per dimension. */
  const deltas = useMemo(() => {
    if (!previousRun?.evaluation || !run?.evaluation) return {} as Record<string, number>;
    return Object.fromEntries(
      Object.entries(run.evaluation.dimension_scores).map(([key, value]) => [
        key,
        value - (previousRun.evaluation?.dimension_scores[key] ?? value),
      ]),
    );
  }, [previousRun, run]);

  return {
    online,
    run,
    previousRun,
    summary,
    instructions,
    busy,
    progress,
    deltas,
    generate,
    submitFeedback,
    regenerate,
  };
}
