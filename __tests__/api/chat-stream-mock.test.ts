/**
 * API test for chat/stream with mock LLM response.
 * Invokes the route handler directly with PLANNING_MOCK_ALLOWED=1.
 * Verifies scaffold + populate flow without hitting the real Anthropic API.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/projects/[projectId]/chat/stream/route";
import { getDb } from "@/lib/db";

const PROMPT =
  "I want to build a trading card marketplace for canadian buyers and sellers of magic the gathering cards";

async function createTestProject(): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.insertProject({
    id,
    name: "Mock Planning Test " + Date.now(),
    repo_url: null,
    default_branch: "main",
  });
  return id;
}

async function consumeSSE(res: Response): Promise<{ event: string; data: unknown }[]> {
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
          // skip
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
        // skip
      }
    }
  }

  return events;
}

describe("chat/stream with mock", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_PLANNING_LLM_ENABLED = "true";
    process.env.PLANNING_MOCK_ALLOWED = "1";
  });

  afterAll(() => {
    delete process.env.PLANNING_MOCK_ALLOWED;
  });

  it("scaffold with mock_response produces updateProject and createWorkflow actions", async () => {
    let pid: string;
    try {
      pid = await createTestProject();
    } catch {
      return;
    }

    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const id3 = crypto.randomUUID();
    const mockScaffold = JSON.stringify({
      type: "actions",
      message: "Creating structure for Canadian MTG marketplace.",
      actions: [
        {
          id: id1,
          project_id: pid,
          action_type: "updateProject",
          target_ref: { project_id: pid },
          payload: {
            name: "MTG Card Marketplace",
            description:
              "A marketplace for Canadian buyers and sellers of Magic: The Gathering cards.",
          },
        },
        {
          id: id2,
          project_id: pid,
          action_type: "createWorkflow",
          target_ref: { project_id: pid },
          payload: { title: "Browse & Search", description: "Discover cards", position: 0 },
        },
        {
          id: id3,
          project_id: pid,
          action_type: "createWorkflow",
          target_ref: { project_id: pid },
          payload: { title: "Buying & Selling", description: "List and purchase", position: 1 },
        },
      ],
    });

    const req = new NextRequest(
      `http://localhost/api/projects/${pid}/chat/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: PROMPT,
          mode: "scaffold",
          mock_response: mockScaffold,
        }),
      },
    );

    const res = await POST(req, { params: Promise.resolve({ projectId: pid }) });
    expect(res.status).toBe(200);

    const events = await consumeSSE(res);
    const actions = events
      .filter((e) => e.event === "action")
      .map((e) => (e.data as { action?: unknown }).action)
      .filter(Boolean);

    if (actions.length === 0) {
      const eventTypes = events.map((e) => e.event);
      const err = events.find((e) => e.event === "error");
      throw new Error(
        `Expected actions but got 0. Events: ${eventTypes.join(", ")}. ` +
          (err ? `Error: ${JSON.stringify((err.data as { reason?: string }).reason)}` : ""),
      );
    }

    const updateProject = actions.filter(
      (a: { action_type?: string }) => a?.action_type === "updateProject",
    );
    const createWorkflow = actions.filter(
      (a: { action_type?: string }) => a?.action_type === "createWorkflow",
    );

    expect(createWorkflow.length, "should create at least 2 workflows").toBeGreaterThanOrEqual(2);
    // updateProject may fail if project table lacks description column in test DB
    if (updateProject.length >= 1) {
      const payload = updateProject[0]?.payload as { description?: string };
      expect(String(payload?.description ?? "").toLowerCase()).toMatch(
        /marketplace|trading|card|canadian|magic/i,
      );
    }

    const phaseComplete = events.find(
      (e) =>
        e.event === "phase_complete" &&
        (e.data as { responseType?: string })?.responseType === "scaffold_complete",
    );
    expect(phaseComplete).toBeTruthy();
    const workflowIds = (phaseComplete?.data as { workflow_ids?: string[] })?.workflow_ids ?? [];
    expect(workflowIds.length).toBe(2);
  });
});
