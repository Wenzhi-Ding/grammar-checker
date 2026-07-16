// lib/providers/shared/sse.ts
/**
 * Minimal SSE parser: turns a ReadableStream of bytes into an async generator
 * of `data:` payloads (multi-line data joined with "\n"). Comment lines
 * (":..."), event:/id:/retry: fields, and malformed lines are skipped.
 * A trailing frame without a final blank-line delimiter is flushed at EOF.
 */
export async function* iterateSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  const framePayload = (frame: string): string | null => {
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line === "" || line.startsWith(":")) continue;
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      // ignore event:/id:/retry: and anything malformed
    }
    return dataLines.length ? dataLines.join("\n") : null;
  };

  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const idx = buffer.search(/\r\n\r\n|\n\n/);
        if (idx < 0) break;
        const delim = buffer.slice(idx).match(/^\r\n\r\n|^\n\n/);
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + (delim ? delim[0].length : 2));
        const payload = framePayload(frame);
        if (payload !== null) yield payload;
      }
    }
    buffer += decoder.decode();
    const payload = framePayload(buffer);
    if (payload !== null) yield payload;
  } finally {
    reader.releaseLock();
  }
}
