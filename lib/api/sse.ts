/**
 * Server-Sent Events helpers for streaming API routes and clients.
 */

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Read a ReadableStream (e.g. Response.body) to completion and parse SSE events.
 * Returns an array of { event, data } for each complete event. Use this in both
 * app code and tests so streaming behavior is consistent.
 */
export async function consumeSSEStream(
  stream: ReadableStream<Uint8Array> | null,
): Promise<{ event: string; data: unknown }[]> {
  const events: { event: string; data: unknown }[] = [];
  if (!stream) return events;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\n\n+/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        let eventType = "";
        let dataStr = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          if (line.startsWith("data: ")) dataStr = line.slice(6);
        }
        if (eventType && dataStr) {
          try {
            events.push({ event: eventType, data: JSON.parse(dataStr) });
          } catch {
            /* skip parse errors */
          }
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split("\n");
      let eventType = "";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        if (line.startsWith("data: ")) dataStr = line.slice(6);
      }
      if (eventType && dataStr) {
        try {
          events.push({ event: eventType, data: JSON.parse(dataStr) });
        } catch {
          /* skip */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return events;
}
