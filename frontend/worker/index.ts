interface Env {
  VITE_API_PROXY_TARGET?: string;
}

const jsonError = (detail: string, status: number) =>
  Response.json({ detail }, { status, headers: { "Cache-Control": "no-store" } });

function apiOrigin(value: string | undefined): URL | null {
  if (!value) return null;

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    // Keeping this value origin-only makes path forwarding predictable. The
    // incoming `/api/...` path is always passed to FastAPI unchanged.
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);
    if (!incoming.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    const origin = apiOrigin(env.VITE_API_PROXY_TARGET);
    if (!origin) {
      return jsonError(
        "The frontend API proxy is not configured. Set VITE_API_PROXY_TARGET to the public FastAPI origin.",
        503,
      );
    }

    const upstream = new URL(incoming.pathname + incoming.search, origin);
    const upstreamRequest = new Request(upstream, request);
    upstreamRequest.headers.delete("host");
    upstreamRequest.headers.set("X-Forwarded-Host", incoming.host);
    upstreamRequest.headers.set("X-Forwarded-Proto", incoming.protocol.slice(0, -1));

    try {
      return await fetch(upstreamRequest);
    } catch {
      return jsonError("The API service could not be reached.", 502);
    }
  },
};
