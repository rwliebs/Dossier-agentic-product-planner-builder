/**
 * API contract tests for map snapshot endpoint.
 * Requires dev server and Supabase with at least one project.
 */

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function isServerAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/projects`);
    const ct = res.headers.get("content-type") ?? "";
    return res.ok && ct.includes("application/json");
  } catch {
    return false;
  }
}

describe("map snapshot API contract", () => {
  it("returns 404 for non-existent project", async () => {
    const response = await fetch(
      `${BASE_URL}/api/projects/00000000-0000-0000-0000-000000000000/map`
    );
    if (!(await isServerAvailable())) return;
    expect(response.status).toBe(404);
  });

  it("returns map structure for existing project", async () => {
    const listRes = await fetch(`${BASE_URL}/api/projects`);
    if (!listRes.ok || !listRes.headers.get("content-type")?.includes("application/json"))
      return;
    const projects = await listRes.json();
    if (!Array.isArray(projects) || projects.length === 0) return;
    const projectId = projects[0].id;
    const response = await fetch(`${BASE_URL}/api/projects/${projectId}/map`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("project");
    expect(data).toHaveProperty("workflows");
    expect(data.project).toHaveProperty("id");
    expect(data.project).toHaveProperty("name");
    expect(Array.isArray(data.workflows)).toBe(true);
  });
});
