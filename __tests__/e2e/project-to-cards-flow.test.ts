/**
 * E2E test: Create project → prompt idea → completed cards for at least two workflows.
 *
 * Outcome-based: run the full flow, then assert on the final state.
 * Covers: scaffold, populate, card content, planned files creation & approval.
 *
 * Required outcomes:
 * - Map has ≥2 workflows, each with ≥1 card
 * - Cards have non-empty title
 * - ≥2 cards have approved planned files (build-ready)
 *
 * Note: LLM populate can be variable; if 0 cards, run with PLANNING_DEBUG=1 to inspect.
 * Requires: dev server (npm run dev), ANTHROPIC_API_KEY, PLANNING_LLM enabled.
 * Skips when env unavailable; fails on API errors when running.
 */

import { describe, it, expect } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const PROMPT =
  "I want to build a trading card marketplace for canadian buyers and sellers of magic the gathering cards";

function canRun(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY &&
    process.env.NEXT_PUBLIC_PLANNING_LLM_ENABLED !== "false"
  );
}

async function consumeSSE(
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

interface MapCard {
  id: string;
  title: string;
  description: string | null;
}

interface MapActivity {
  id: string;
  cards: MapCard[];
}

interface MapWorkflow {
  id: string;
  title: string;
  activities: MapActivity[];
}

interface MapSnapshot {
  project: { id: string; name: string };
  workflows: MapWorkflow[];
}

interface PlannedFile {
  id: string;
  status: string;
}

async function fetchMapSnapshot(projectId: string): Promise<MapSnapshot | null> {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/map`).catch(
    () => null
  );
  if (!res?.ok) return null;
  return res.json();
}

async function fetchPlannedFiles(
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

function getAllCards(map: MapSnapshot): MapCard[] {
  const cards: MapCard[] = [];
  for (const wf of map.workflows) {
    for (const act of wf.activities) {
      cards.push(...act.cards);
    }
  }
  return cards;
}

function cardCount(wf: MapWorkflow): number {
  return wf.activities.reduce((sum, act) => sum + act.cards.length, 0);
}

interface OutcomeResult {
  ok: boolean;
  workflowCount: number;
  workflowsWithCards: number;
  cardsWithTitle: number;
  totalCards: number;
  cardsWithApprovedPlannedFiles: number;
  workflowSummaries: { title: string; cards: number; withTitle: number; withApproved: number }[];
}

/** Outcome: ≥2 workflows, each with ≥1 card; cards have title; ≥2 cards have approved planned files. */
function satisfiesOutcome(
  map: MapSnapshot,
  cardApprovedCount: Map<string, number>
): OutcomeResult {
  const workflowCount = map.workflows.length;
  const workflowsWithCards = map.workflows.filter(
    (wf) => cardCount(wf) >= 1
  ).length;
  const allCards = getAllCards(map);
  const totalCards = allCards.length;
  const cardsWithTitle = allCards.filter(
    (c) => c.title != null && String(c.title).trim().length > 0
  ).length;
  const cardsWithApprovedPlannedFiles = allCards.filter(
    (c) => (cardApprovedCount.get(c.id) ?? 0) >= 1
  ).length;

  const workflowSummaries = map.workflows.map((wf) => {
    const wfCards = wf.activities.flatMap((a) => a.cards);
    return {
      title: wf.title ?? "(no title)",
      cards: wfCards.length,
      withTitle: wfCards.filter(
        (c) => c.title != null && String(c.title).trim().length > 0
      ).length,
      withApproved: wfCards.filter(
        (c) => (cardApprovedCount.get(c.id) ?? 0) >= 1
      ).length,
    };
  });

  const ok =
    workflowCount >= 2 &&
    workflowsWithCards >= 2 &&
    cardsWithTitle >= 2 &&
    cardsWithApprovedPlannedFiles >= 2;

  return {
    ok,
    workflowCount,
    workflowsWithCards,
    cardsWithTitle,
    totalCards,
    cardsWithApprovedPlannedFiles,
    workflowSummaries,
  };
}

/** Run full flow: create → scaffold → populate → create planned files → approve → return map + counts. */
async function runFlow(): Promise<{
  map: MapSnapshot;
  cardApprovedCount: Map<string, number>;
}> {
  const createRes = await fetch(`${BASE_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "E2E Project-to-Cards " + Date.now(),
      description: null,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Projects API failed: ${createRes.status}`);
  }

  const project = await createRes.json();
  const projectId = project.id;

  const scaffoldRes = await fetch(
    `${BASE_URL}/api/projects/${projectId}/chat/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: PROMPT, mode: "scaffold" }),
    }
  );
  if (!scaffoldRes.ok) {
    const err = await scaffoldRes.json().catch(() => ({}));
    throw new Error(
      `Scaffold failed: ${scaffoldRes.status} ${JSON.stringify(err)}`
    );
  }

  await consumeSSE(scaffoldRes);

  let map = await fetchMapSnapshot(projectId);
  if (!map) throw new Error("Map fetch failed after scaffold");

  const workflowsToPopulate = map.workflows.slice(0, 2);
  for (const wf of workflowsToPopulate) {
    const populateRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/chat/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: PROMPT,
          mode: "populate",
          workflow_id: wf.id,
        }),
      }
    );
    if (!populateRes.ok) {
      const err = await populateRes.json().catch(() => ({}));
      throw new Error(
        `Populate failed for ${wf.id}: ${populateRes.status} ${JSON.stringify(err)}`
      );
    }
    await consumeSSE(populateRes);
  }

  map = await fetchMapSnapshot(projectId);
  if (!map) throw new Error("Map fetch failed after populate");

  const cardApprovedCount = new Map<string, number>();
  const allCards = getAllCards(map);
  let cardsWithPlannedFiles = 0;
  for (const card of allCards.slice(0, 10)) {
    if (cardsWithPlannedFiles >= 2) break;
    const createPfRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/cards/${card.id}/planned-files`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logical_file_name: `src/${card.title?.replace(/\s+/g, "-").toLowerCase() ?? "feature"}.ts`,
          artifact_kind: "component",
          action: "create",
          intent_summary: `Implement ${card.title ?? "feature"}`,
        }),
      }
    );
    if (!createPfRes.ok) continue;
    const created = await createPfRes.json();
    const fileId = created?.id;
    if (!fileId) continue;

    const patchRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/cards/${card.id}/planned-files/${fileId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      }
    );
    if (!patchRes.ok) continue;
    cardApprovedCount.set(card.id, (cardApprovedCount.get(card.id) ?? 0) + 1);
    cardsWithPlannedFiles++;
  }

  return { map, cardApprovedCount };
}

function formatDiagnostics(result: OutcomeResult): string {
  const lines = [
    `Workflows: ${result.workflowCount} (need ≥2 with cards)`,
    `Cards with title: ${result.cardsWithTitle}/${result.totalCards} (need ≥2)`,
    `Cards with approved planned files: ${result.cardsWithApprovedPlannedFiles} (need ≥2)`,
    "Per workflow:",
    ...result.workflowSummaries.map(
      (wf) =>
        `  - "${wf.title}": ${wf.cards} cards, ${wf.withTitle} with title, ${wf.withApproved} with approved planned files`
    ),
  ];
  return lines.join("\n");
}

describe("project to cards flow", () => {
  it.skipIf(!canRun())(
    "map has ≥2 workflows, cards with title, ≥2 cards build-ready (approved planned files)",
    async () => {
      const { map, cardApprovedCount } = await runFlow();
      const result = satisfiesOutcome(map, cardApprovedCount);

      expect(
        result.ok,
        `Outcome not met.\n${formatDiagnostics(result)}`
      ).toBe(true);
    },
    240_000
  );
});
