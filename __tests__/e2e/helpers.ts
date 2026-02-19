/**
 * Shared E2E test utilities.
 *
 * Centralises SSE consumption, environment checks, and constants
 * so individual E2E test files stay focused on scenario logic.
 */

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

export const MARKETPLACE_PROMPT =
  "I want to build a trading card marketplace for canadian buyers and sellers of magic the gathering cards";

export function canRunLLMTests(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY &&
    process.env.NEXT_PUBLIC_PLANNING_LLM_ENABLED !== "false"
  );
}

export async function consumeSSE(
  res: Response
): Promise<{ event: string; data: unknown }[]> {
  const events: { event: string; data: unknown }[] = [];
  const reader = res.body?.getReader();
  if (!reader) return events;

  const decoder = new TextDecoder();
  let buffer = "";

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

  return events;
}

export interface MapCard {
  id: string;
  title: string;
  description: string | null;
}

export interface MapActivity {
  id: string;
  cards: MapCard[];
}

export interface MapWorkflow {
  id: string;
  title: string;
  activities: MapActivity[];
}

export interface MapSnapshot {
  project: { id: string; name: string };
  workflows: MapWorkflow[];
}

export interface PlannedFile {
  id: string;
  status: string;
}

export async function fetchMapSnapshot(
  projectId: string
): Promise<MapSnapshot | null> {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/map`).catch(
    () => null
  );
  if (!res?.ok) return null;
  return res.json();
}

export async function fetchPlannedFiles(
  projectId: string,
  cardId: string
): Promise<PlannedFile[]> {
  const res = await fetch(
    `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/planned-files`
  ).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function getAllCards(map: MapSnapshot): MapCard[] {
  const cards: MapCard[] = [];
  for (const wf of map.workflows) {
    for (const act of wf.activities) {
      cards.push(...act.cards);
    }
  }
  return cards;
}

export function cardCount(wf: MapWorkflow): number {
  return wf.activities.reduce((sum, act) => sum + act.cards.length, 0);
}
