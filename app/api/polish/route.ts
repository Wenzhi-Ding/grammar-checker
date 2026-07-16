// app/api/polish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createGeminiProvider } from "@/lib/providers/gemini/adapter";
import { createOpenAICompatibleProvider } from "@/lib/providers/openai-compatible/adapter";
import type { ProviderConfig } from "@/lib/providers/shared/schema";
import type { AdapterKind } from "@/lib/providers/shared/presets";

export const runtime = "nodejs";
// Stateless: no caching, no persistence.
export const dynamic = "force-dynamic";

interface ProxyRequest {
  providerId: string;
  adapter: AdapterKind;
  payload: { text: string; config: ProviderConfig };
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

  try {
    const impl =
      adapter === "gemini"
        ? createGeminiProvider()
        : createOpenAICompatibleProvider({ id: providerId });
    const result = await impl.polish(payload.text, payload.config);
    return NextResponse.json(result);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "proxy polish failed";
    // SECURITY: never include the apiKey in the response or logs.
    return NextResponse.json({ error: message }, { status });
  }
}
