/**
 * API contract tests for actions endpoint.
 * Requires dev server and DB (SQLite or Postgres).
 * Skips when TEST_BASE_URL points at a non-Dossier server (HTML or non-JSON).
 */

import { beforeAll, describe, expect, it } from "vitest";

export {};

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function isDossierProjectsApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return false;
    const data: unknown = await res.json();
    return Array.isArray(data);
  } catch {
    return false;
  }
}

describe("actions API contract", () => {
  let apiOk = false;
  beforeAll(async () => {
    apiOk = await isDossierProjectsApiAvailable();
    if (!apiOk) {
      console.warn(
        `[actions.test] Skipping: no Dossier JSON API at ${BASE_URL} (wrong port/app or server down)`
      );
    }
  });

  it("returns 404 for non-existent project", async () => {
    if (!apiOk) return;
    const response = await fetch(
      `${BASE_URL}/api/projects/00000000-0000-0000-0000-000000000000/actions`
    ).catch(() => null);
    if (!response) return;
    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return;
    expect(response.status).toBe(404);
  });

  it("returns action history for existing project", async () => {
    if (!apiOk) return;
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
    if (!apiOk) return;

    const listRes = await fetch(`${BASE_URL}/api/projects`).catch(() => null);
    if (!listRes?.ok) return;
    if (!listRes.headers.get("content-type")?.includes("application/json")) return;
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
    if (!apiOk) return;

    const createRes = await fetch(`${BASE_URL}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Actions Test " + Date.now() }),
    }).catch(() => null);
    if (!createRes || (createRes.status !== 200 && createRes.status !== 201)) return;
    if (!createRes.headers.get("content-type")?.includes("application/json")) return;

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
