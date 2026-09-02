class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "http" | "validation" | "network" | "parse",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ValidationDetail = { loc?: (string | number)[]; msg?: string; type?: string };

/**
 * FastAPI returns `{detail: string}` for raised HTTPExceptions but
 * `{detail: [{loc, msg, type}, …]}` for 422 request-validation failures. Reading
 * `body.detail` blindly renders "[object Object]", which is what the previous client did.
 */
function describe(body: unknown, status: number): { message: string; kind: ApiError["kind"] } {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;

    if (typeof detail === "string" && detail.trim()) {
      return { message: detail, kind: "http" };
    }

    if (Array.isArray(detail)) {
      const parts = (detail as ValidationDetail[])
        .map((entry) => {
          const field = (entry.loc ?? []).filter((part) => part !== "body").join(".");
          const msg = entry.msg ?? "is invalid";
          return field ? `${field}: ${msg}` : msg;
        })
        .filter(Boolean);
      if (parts.length) {
        return { message: parts.join("; "), kind: "validation" };
      }
    }
  }
  return { message: `The service returned ${status}.`, kind: "http" };
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError("Could not reach the API. Is the backend running on :8000?", 0, "network");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const { message, kind } = describe(body, response.status);
    throw new ApiError(message, response.status, kind);
  }

  // 200 with a literal `null` body is valid here — GET /api/profile/{company} does exactly
  // that when no profile is cached.
  const text = await response.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("The API returned a malformed response.", response.status, "parse");
  }
}

/**
 * The three long-running endpoints (`/api/generate`, `/api/profile/{c}/build`,
 * `/api/runs/{id}/regenerate`) answer with `application/x-ndjson`, not a JSON body:
 * one progress object per line while the pipeline runs, then a terminal
 * `{type: "result", run}` or `{type: "error", detail}`. Feeding that whole body to
 * `JSON.parse` is what produced "The API returned a malformed response."
 */
export type ProgressEvent =
  | {
      type: "stage";
      key: string;
      label: string;
      status: "running" | "done" | "error";
      index: number | null;
      total: number | null;
      elapsed_s: number;
      markdown?: string;
    }
  | {
      type: "cost";
      calls: number;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
      elapsed_s: number;
    }
  | { type: "result"; elapsed_s: number; run: unknown }
  | { type: "error"; stage: string; detail: string; elapsed_s: number };

export type OnProgress = (event: ProgressEvent) => void;

export async function stream<T>(
  path: string,
  init: RequestInit,
  onProgress?: OnProgress,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError("Could not reach the API. Is the backend running on :8000?", 0, "network");
  }

  // Validation and routing failures still come back as a normal JSON error body: the
  // stream only opens once FastAPI has accepted the request.
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    const { message, kind } = describe(body, response.status);
    throw new ApiError(message, response.status, kind);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // A box rather than two locals: TypeScript cannot narrow a variable assigned
  // inside the closure below.
  const result: { found: boolean; value?: T } = { found: false };

  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: ProgressEvent;
    try {
      event = JSON.parse(trimmed) as ProgressEvent;
    } catch {
      throw new ApiError("The API returned a malformed response.", response.status, "parse");
    }
    // A pipeline failure arrives mid-stream, so the response status is already 200.
    if (event.type === "error") {
      throw new ApiError(event.detail, response.status, "http");
    }
    if (event.type === "result") {
      result.found = true;
      result.value = event.run as T;
      return;
    }
    onProgress?.(event);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) consume(line);
    }
    buffer += decoder.decode();
    consume(buffer);
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (!result.found) {
    throw new ApiError("The pipeline ended without returning a result.", response.status, "parse");
  }
  return result.value as T;
}
