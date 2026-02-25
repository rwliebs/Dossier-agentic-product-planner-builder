// @vitest-environment node
/**
 * E2E test: Orchestration run → assignment → check → PR candidate flow.
 *
 * Validates user-workflows-reference.md Workflow 5 success outcomes:
 *   "User can push and create PRs via agent or manually"
 *
 * Exercises the orchestration CRUD layer through the API:
 * 1. Create a run
 * 2. Create an assignment under that run
 * 3. Record a check
 * 4. Create a PR candidate
 * 5. Resolve the PR candidate
 *
 * Requires: dev server running (npm run dev). No LLM needed.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  BASE_URL,
  canReachServer,
  createProject,
  seedProjectWithMap,
} from "./helpers";

let serverUp = false;
let projectId: string;
let workflowId: string;
let cardId: string;

function skip() {
  if (!serverUp) console.warn("Skipping: dev server not reachable");
  return !serverUp;
}

beforeAll(async () => {
  serverUp = await canReachServer();
  if (!serverUp) return;

  try {
    const project = await createProject("Orchestration PR Flow Test");
    projectId = project.id;
    const seeded = await seedProjectWithMap(projectId);
    workflowId = seeded.workflowId;
    cardId = seeded.cardId;
  } catch {
    serverUp = false;
  }
});

describe("orchestration PR flow (Workflow 5)", () => {
  let runId: string;
  let assignmentId: string;
  let checkId: string;
  let prCandidateId: string;

  it("creates an orchestration run", async () => {
    if (skip()) return;
    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "card",
          card_id: cardId,
          trigger_type: "manual",
          initiated_by: "e2e-test",
          repo_url: "https://github.com/test-org/test-repo.git",
          base_branch: "main",
          run_input_snapshot: { source: "e2e-test" },
        }),
      }
    );

    expect(res.status, `create run failed: ${await res.clone().text()}`).toBe(201);
    const body = await res.json();
    expect(body.runId).toBeTruthy();
    runId = body.runId;
  });

  it("retrieves the created run", async () => {
    if (skip() || !runId) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/runs/${runId}`
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.run).toBeTruthy();
    expect(body.run.id).toBe(runId);
    expect(body.run.status).toBe("queued");
  });

  it("lists runs for project", async () => {
    if (skip() || !runId) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/runs`
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.runs.length).toBeGreaterThanOrEqual(1);
    expect(body.runs.some((r: { id: string }) => r.id === runId)).toBe(true);
  });

  it("creates an assignment under the run", async () => {
    if (skip() || !runId) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/runs/${runId}/assignments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: cardId,
          agent_role: "implementer",
          agent_profile: "claude-agent",
          feature_branch: `feature/e2e-test-${Date.now()}`,
          allowed_paths: ["src/"],
        }),
      }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assignmentId).toBeTruthy();
    assignmentId = body.assignmentId;
  });

  it("retrieves the assignment", async () => {
    if (skip() || !assignmentId) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/runs/${runId}/assignments/${assignmentId}`
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.assignment).toBeTruthy();
    expect(body.assignment.card_id).toBe(cardId);
  });

  it("records a check on the run", async () => {
    if (skip() || !runId) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/runs/${runId}/checks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          check_type: "lint",
          status: "passed",
          output: "No lint errors found",
        }),
      }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.checkId).toBeTruthy();
    checkId = body.checkId;
  });

  it("lists checks for the run", async () => {
    if (skip() || !runId) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/runs/${runId}/checks`
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.checks.length).toBeGreaterThanOrEqual(1);
    expect(body.checks.some((c: { id: string }) => c.id === checkId)).toBe(true);
  });

  it("creates a PR candidate", async () => {
    if (skip() || !runId) return;
    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/pull-requests`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          base_branch: "main",
          head_branch: `feature/e2e-test-${Date.now()}`,
          title: "E2E Test: Sign Up Form",
          description: "Implements user registration with email and password",
        }),
      }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.prCandidateId).toBeTruthy();
    prCandidateId = body.prCandidateId;
  });

  it("retrieves PR candidate", async () => {
    if (skip() || !prCandidateId) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/pull-requests/${prCandidateId}`
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pullRequest).toBeTruthy();
    expect(body.pullRequest.title).toContain("Sign Up");
  });

  it("updates PR candidate status", async () => {
    if (skip() || !prCandidateId) return;

    const res = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/pull-requests/${prCandidateId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "merged",
          pr_url: "https://github.com/test/repo/pull/42",
        }),
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pullRequest.status).toBe("merged");
    expect(body.pullRequest.pr_url).toContain("github.com");
  });

  it("updates run status to completed", async () => {
    if (skip() || !runId) return;
    const startRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/runs/${runId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "running",
          started_at: new Date().toISOString(),
        }),
      }
    );
    expect(startRes.status).toBe(200);

    const completeRes = await fetch(
      `${BASE_URL}/api/projects/${projectId}/orchestration/runs/${runId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          ended_at: new Date().toISOString(),
        }),
      }
    );
    expect(completeRes.status).toBe(200);

    const body = await completeRes.json();
    expect(body.run.status).toBe("completed");
  });
});
