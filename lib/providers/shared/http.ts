export interface DirectResponse<T = unknown> {
  ok: boolean;
  status: number;
  body: T;
}

export interface ProxyBody {
  [key: string]: unknown;
}

/**
 * Run `direct()`. On a TypeError (browser CORS/network opaque failure — distinct
 * from an HTTP status), retry once through the stateless /api/polish route.
 * `proxyFetch` is injectable for tests; defaults to global fetch. It must return
 * a Response-shaped object (with `.ok`, `.status`, `.json()`).
 */
export async function callWithFallback<T = unknown>(
  direct: () => Promise<DirectResponse<T>>,
  opts: { proxyBody: ProxyBody },
  proxyFetch?: (url: string, init: RequestInit) => Promise<Response>,
): Promise<DirectResponse<T>> {
  try {
    return await direct();
  } catch (err) {
    const isCorsOrNetwork = err instanceof TypeError;
    if (!isCorsOrNetwork) throw err;
    const fetcher = proxyFetch ?? globalThis.fetch;
    const res = await fetcher("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.proxyBody),
    });
    const body = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      const err = new Error(body.error ?? `proxy returned ${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return { ok: true, status: res.status, body };
  }
}

/**
 * Streaming variant of callWithFallback. `direct()` returns the raw SSE
 * Response as-is (ok or not — the caller inspects it). Only a TypeError
 * (browser CORS/network opaque failure, thrown BEFORE any stream bytes are
 * consumed) triggers one proxy retry via /api/polish with `stream: true`
 * added to the body. Mid-stream failures must NOT be retried here.
 */
export async function callStreamWithFallback(
  direct: () => Promise<Response>,
  opts: { proxyBody: ProxyBody },
  proxyFetch?: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  try {
    return await direct();
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    const fetcher = proxyFetch ?? globalThis.fetch;
    const res = await fetcher("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...opts.proxyBody, stream: true }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const err2 = new Error(body.error ?? `proxy returned ${res.status}`) as Error & { status: number };
      err2.status = res.status;
      throw err2;
    }
    return res;
  }
}
