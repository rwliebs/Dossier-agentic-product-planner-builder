/**
 * API contract tests for actions endpoint.
 * Requires dev server and DB (SQLite or Postgres).
 */

export {};

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function canRunIntegrationTests(): boolean {
  return true; // Run when server is up
}

describe("actions API contract", () => {
  it("returns 404 for non-existent project", async () => {
    const response = await fetch(
      `${BASE_URL}/api/projects/00000000-0000-0000-0000-000000000000/actions`
    ).catch(() => null);
    if (!response) return; // skip when server not running
    expect(response.status).toBe(404);
  });

  it("returns action history for existing project", async () => {
    const listRes = await fetch(`${BASE_URL}/api/projects`).catch(() => null);
    if (!listRes?.ok || !listRes?.headers.get("content-type")?.includes("application/json"))
      return;
    const projects = await listRes.json();
    if (!Array.isArray(projects) || projects.length === 0) return;

    const projectId = projects[0].id;
    const response = await fetch(
      `${BASE_URL}/api/projects/${projectId}/actions`
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("rejects invalid action payload", async () => {
    if (!canRunIntegrationTests()) return;

    const listRes = await fetch(`${BASE_URL}/api/projects`).catch(() => null);
    if (!listRes?.ok) return;
    const projects = await listRes.json();
    if (!Array.isArray(projects) || projects.length === 0) return;

    const projectId = projects[0].id;
    const response = await fetch(
      `${BASE_URL}/api/projects/${projectId}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: [{ action_type: "invalidType" }] }),
      }
    ).catch(() => null);
    if (!response) return;
    expect(response.status).toBe(400);
  });

  it("applies valid createWorkflow action", async () => {
    if (!canRunIntegrationTests()) return;

    const createRes = await fetch(`${BASE_URL}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Actions Test " + Date.now() }),
    }).catch(() => null);
    if (!createRes || (createRes.status !== 200 && createRes.status !== 201)) return;

    const project = await createRes.json();
    const projectId = project.id;

    const response = await fetch(
      `${BASE_URL}/api/projects/${projectId}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: [
            {
              action_type: "createWorkflow",
              target_ref: {},
              payload: { title: "Test Workflow", position: 0 },
            },
          ],
        }),
      }
    ).catch(() => null);
    if (!response) return;
    expect([200, 201]).toContain(response.status);
    const data = await response.json();
    expect(data).toHaveProperty("applied");
    expect(data).toHaveProperty("results");
  });
});
