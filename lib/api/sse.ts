/**
 * Server-Sent Events helpers for streaming API routes and clients.
 */

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export interface SSEEvent {
  event: string;
  data: unknown;
}

function parseSSEBlock(block: string): SSEEvent | null {
  let eventType = "";
  let dataStr = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) eventType = line.slice(7).trim();
    if (line.startsWith("data: ")) dataStr = line.slice(6);
  }
  if (!eventType || !dataStr) return null;
  try {
    return { event: eventType, data: JSON.parse(dataStr) };
  } catch {
    return null;
  }
}

/**
 * Yield SSE events from a ReadableStream as they arrive. Use this in the UI so
 * progress callbacks (e.g. setCardFinalizeProgress) run in real time.
 */
export async function* streamSSEEvents(
  stream: ReadableStream<Uint8Array> | null,
): AsyncGenerator<SSEEvent> {
  if (!stream) return;
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
        const ev = parseSSEBlock(block);
        if (ev) yield ev;
      }
    }

    if (buffer.trim()) {
      const ev = parseSSEBlock(buffer);
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Read a ReadableStream (e.g. Response.body) to completion and parse SSE events.
 * Returns an array of { event, data } for each complete event. Use in tests when
 * you need the full list; for UI progress, use streamSSEEvents() so callbacks run
 * as events arrive.
 */
export async function consumeSSEStream(
  stream: ReadableStream<Uint8Array> | null,
): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const ev of streamSSEEvents(stream)) events.push(ev);
  return events;
}
