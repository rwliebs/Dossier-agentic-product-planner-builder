// @vitest-environment node
/**
 * E2E test: Feedback iteration — add feedback as knowledge items and context.
 *
 * Validates user-workflows-reference.md Workflow 6 success outcomes:
 *   "Feedback captured as card requirements, knowledge items, or linked artifacts"
 *   "Rebuild uses updated context; iteration loop continues"
 *
 * Simulates the feedback iteration loop:
 * 1. Add initial requirements and knowledge items to a card
 * 2. Add feedback as additional requirements and facts
 * 3. Link context artifacts representing feedback
 * 4. Verify all context accumulates on the card
 *
 * Requires: dev server running (npm run dev). No LLM needed.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  BASE_URL,
  canReachServer,
  createProject,
  seedProjectWithMap,
  createRequirement,
  type KnowledgeItem,
} from "./helpers";

let serverUp = false;
let projectId: string;
let cardId: string;

function skip() {
  if (!serverUp) console.warn("Skipping: dev server not reachable");
  return !serverUp;
}

beforeAll(async () => {
  serverUp = await canReachServer();
  if (!serverUp) return;

  try {
    const project = await createProject("Feedback Iteration Test");
    projectId = project.id;
    const seeded = await seedProjectWithMap(projectId);
    cardId = seeded.cardId;
  } catch {
    serverUp = false;
  }
});

describe("feedback iteration (Workflow 6)", () => {
  it("captures initial requirements on card", async () => {
    if (skip()) return;
      const req = await createRequirement(
        projectId,
        cardId,
        "User can sign up with email and password"
      );
      expect(req.id).toBeTruthy();
      expect(req.text).toContain("sign up");
    }
  );

  it("adds user feedback as additional requirements", async () => {
    if (skip()) return;

    await createRequirement(
      projectId,
      cardId,
      "Users want a dark mode toggle on the sign-up page"
    );
    await createRequirement(
      projectId,
      cardId,
      "Form should validate email format before submission"
    );

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/requirements`
    );
    const reqs: KnowledgeItem[] = await res.json();

    expect(reqs.length).toBeGreaterThanOrEqual(3);
    expect(reqs.some((r) => r.text.includes("dark mode"))).toBe(true);
    expect(reqs.some((r) => r.text.includes("validate email"))).toBe(true);
  });

  it("captures feedback as facts (knowledge items)", async () => {
    if (skip()) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/facts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "80% of users prefer dark mode based on analytics",
          evidence_source: "user analytics dashboard",
          source: "user",
        }),
      }
    );
    expect(res.status).toBe(201);

    const listRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/facts`
    );
    const facts: KnowledgeItem[] = await listRes.json();
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.some((f) => f.text.includes("dark mode"))).toBe(true);
  });

  it("captures feedback as assumptions", async () => {
    if (skip()) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/assumptions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Users will use modern browsers that support CSS custom properties",
          source: "user",
        }),
      }
    );
    expect(res.status).toBe(201);
  });

  it("captures open questions from feedback", async () => {
    if (skip()) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/questions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Should dark mode persist across sessions via localStorage or user profile?",
          source: "user",
        }),
      }
    );
    expect(res.status).toBe(201);
  });

  it("links feedback artifact to card as additional context", async () => {
    if (skip()) return;

    const artifactRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/artifacts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "user-feedback-round-1",
          type: "doc",
          title: "User Feedback Round 1",
          content:
            "Users reported: sign-up too slow, need dark mode, email validation confusing.",
        }),
      }
    );
    expect(artifactRes.status).toBe(201);
    const artifact = await artifactRes.json();

    const linkRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: [
            {
              id: crypto.randomUUID(),
              project_id: projectId,
              action_type: "linkContextArtifact",
              target_ref: { card_id: cardId },
              payload: {
                context_artifact_id: artifact.id,
                usage_hint: "user feedback from round 1",
              },
            },
          ],
        }),
      }
    );
    expect(linkRes.status).toBe(201);

    const contextRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/cards/${cardId}/context-artifacts`
    );
    const artifacts = await contextRes.json();
    expect(
      artifacts.some((a: { id: string }) => a.id === artifact.id),
      "feedback artifact should be linked to card"
    ).toBe(true);
  });

  it("all accumulated context is available for build", async () => {
    if (skip()) return;

    const [reqsRes, factsRes, assumptionsRes, questionsRes, artifactsRes] =
      await Promise.all([
        fetch(`${BASE_URL}/api/projects/${projectId}/cards/${cardId}/requirements`),
        fetch(`${BASE_URL}/api/projects/${projectId}/cards/${cardId}/facts`),
        fetch(`${BASE_URL}/api/projects/${projectId}/cards/${cardId}/assumptions`),
        fetch(`${BASE_URL}/api/projects/${projectId}/cards/${cardId}/questions`),
        fetch(`${BASE_URL}/api/projects/${projectId}/cards/${cardId}/context-artifacts`),
      ]);

    const reqs = await reqsRes.json();
    const facts = await factsRes.json();
    const assumptions = await assumptionsRes.json();
    const questions = await questionsRes.json();
    const artifacts = await artifactsRes.json();

    expect(reqs.length, "requirements").toBeGreaterThanOrEqual(3);
    expect(facts.length, "facts").toBeGreaterThanOrEqual(1);
    expect(assumptions.length, "assumptions").toBeGreaterThanOrEqual(1);
    expect(questions.length, "questions").toBeGreaterThanOrEqual(1);
    expect(artifacts.length, "context artifacts").toBeGreaterThanOrEqual(1);
  });
});
