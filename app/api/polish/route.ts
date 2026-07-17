// app/api/polish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createGeminiProvider, buildStreamRequest as buildGeminiStreamRequest } from "@/lib/providers/gemini/adapter";
import { createOpenAICompatibleProvider, buildStreamRequest as buildOpenAIStreamRequest } from "@/lib/providers/openai-compatible/adapter";
import type { ProviderConfig } from "@/lib/providers/shared/schema";
import type { AdapterKind } from "@/lib/providers/shared/presets";
import { PolishParseError } from "@/lib/providers/shared/parse";

export const runtime = "nodejs";
// Stateless: no caching, no persistence.
export const dynamic = "force-dynamic";

interface ProxyRequest {
  providerId: string;
  adapter: AdapterKind;
  payload: { text: string; config: ProviderConfig };
  stream?: boolean;
}

export async function POST(req: NextRequest) {
  let body: ProxyRequest;
  try {
    body = (await req.json()) as ProxyRequest;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { providerId, adapter, payload } = body;
  if (!providerId || !adapter || !payload?.config?.apiKey || typeof payload?.text !== "string") {
    return NextResponse.json(
      { error: "missing providerId, adapter, payload.config.apiKey, or payload.text" },
      { status: 400 },
    );
  }

  // Streaming passthrough: relay the upstream SSE byte stream untouched.
  // Nothing is parsed, stored, cached, or logged — same stateless contract.
  if (body.stream) {
    try {
      const { url, init } =
        adapter === "gemini"
          ? buildGeminiStreamRequest(payload.text, payload.config)
          : buildOpenAIStreamRequest(payload.text, payload.config);
      const upstream = await fetch(url, init);
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "");
        return NextResponse.json(
          { error: `upstream returned ${upstream.status}: ${detail.slice(0, 300)}` },
          { status: upstream.ok ? 502 : upstream.status },
        );
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "proxy stream failed";
      // SECURITY: never include the apiKey in the response or logs.
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  try {
    const impl =
      adapter === "gemini"
        ? createGeminiProvider()
        : createOpenAICompatibleProvider({ id: providerId });
    const result = await impl.polish(payload.text, payload.config);
    return NextResponse.json(result);
  } catch (err) {
    // Parse failures get kind:"schema" so the client classifies them the same
    // as client-side parse failures (format issue — retry / stronger model).
    const isParse = err instanceof PolishParseError;
    const status = (err as Error & { status?: number }).status ?? (isParse ? 422 : 500);
    const message = err instanceof Error ? err.message : "proxy polish failed";
    // SECURITY: never include the apiKey in the response or logs.
    return NextResponse.json({ error: message, ...(isParse ? { kind: "schema" } : {}) }, { status });
  }
}
