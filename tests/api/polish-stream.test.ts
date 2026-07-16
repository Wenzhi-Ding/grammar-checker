// tests/api/polish-stream.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/polish/route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/polish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

const STREAM_BODY = {
  providerId: "deepseek",
  adapter: "openai-compatible",
  stream: true,
  payload: {
    text: "hi",
    config: { apiKey: "SECRET_KEY", model: "deepseek-v4-pro", baseURL: "https://api.deepseek.com/v1" },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/api/polish stream passthrough", () => {
  it("pipes upstream SSE bytes back with an event-stream content type", async () => {
    const upstream = new Response(streamOf(["data: {}\n\n"]), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeReq(STREAM_BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(await res.text()).toBe("data: {}\n\n");
  });

  it("forwards the api key upstream as Authorization, never in the response", async () => {
    const upstream = new Response(streamOf(["data: {}\n\n"]), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeReq(STREAM_BODY));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer SECRET_KEY");
    expect(await res.text()).not.toContain("SECRET_KEY");
  });

  it("returns {error} with the upstream status when upstream is not OK", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeReq(STREAM_BODY));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("401");
  });

  it("returns 400 when the api key is missing", async () => {
    const res = await POST(makeReq({ ...STREAM_BODY, payload: { text: "hi", config: { apiKey: "", model: "m" } } }));
    expect(res.status).toBe(400);
  });
});
