// tests/providers/shared/sse.test.ts
import { describe, it, expect } from "vitest";
import { iterateSSE } from "@/lib/providers/shared/sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<string[]> {
  const out: string[] = [];
  for await (const p of iterateSSE(streamOf(chunks))) out.push(p);
  return out;
}

describe("iterateSSE", () => {
  it("yields data payloads frame by frame", async () => {
    expect(await collect(["data: a\n\ndata: b\n\n"])).toEqual(["a", "b"]);
  });

  it("handles frames split across chunks", async () => {
    expect(await collect(["data: a\n", "\ndata: b", "\n\n"])).toEqual(["a", "b"]);
  });

  it("joins multi-line data lines", async () => {
    expect(await collect(["data: a\ndata: b\n\n"])).toEqual(["a\nb"]);
  });

  it("skips comment lines and blank lines", async () => {
    expect(await collect([": ping\n\ndata: x\n\n"])).toEqual(["x"]);
  });

  it("skips malformed lines without a colon prefix", async () => {
    expect(await collect(["garbage\ndata: x\n\n"])).toEqual(["x"]);
  });

  it("flushes a trailing frame that lacks the final delimiter", async () => {
    expect(await collect(["data: tail"])).toEqual(["tail"]);
  });

  it("handles CRLF delimiters", async () => {
    expect(await collect(["data: a\r\n\r\ndata: b\r\n\r\n"])).toEqual(["a", "b"]);
  });
});
