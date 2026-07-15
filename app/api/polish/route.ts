// app/api/polish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers/shared";
import type { ProviderConfig } from "@/lib/providers/shared/schema";
import type { ProviderPreset } from "@/lib/providers/shared/presets";

export const runtime = "nodejs";
// Stateless: no caching, no persistence.
export const dynamic = "force-dynamic";

interface ProxyRequest {
  provider: ProviderPreset["id"];
  text: string;
  config: ProviderConfig;
}

export async function POST(req: NextRequest) {
  let body: ProxyRequest;
  try {
    body = (await req.json()) as ProxyRequest;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { provider, text, config } = body;
  if (!provider || !config?.apiKey || typeof text !== "string") {
    return NextResponse.json({ error: "missing provider, config.apiKey, or text" }, { status: 400 });
  }

  try {
    const result = await getProvider(provider).polish(text, config);
    return NextResponse.json(result);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "proxy polish failed";
    // SECURITY: never include the apiKey in the response or logs.
    return NextResponse.json({ error: message }, { status });
  }
}
