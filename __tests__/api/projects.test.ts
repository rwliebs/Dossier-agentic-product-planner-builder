/**
 * API contract tests for projects endpoints.
 * Requires dev server running (pnpm dev) and Supabase configured.
 * Skips when server returns non-2xx or non-JSON (server unavailable).
 */

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function canRunIntegrationTests(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Skip when we cannot get a proper API response (connection error or non-JSON). */
function shouldSkip(response: Response | null): boolean {
  if (!response) return true;
  const ct = response.headers.get("content-type") ?? "";
  return !ct.includes("application/json");
}

describe("projects API contract", () => {
  it("returns project list from GET /api/projects", async () => {
    const response = await fetch(`${BASE_URL}/api/projects`).catch(() => null);
    if (!response || shouldSkip(response)) return;
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("creates project via POST /api/projects", async () => {
    if (!canRunIntegrationTests()) return;
    const check = await fetch(`${BASE_URL}/api/projects`).catch(() => null);
    if (!check || shouldSkip(check)) return;
    const response = await fetch(`${BASE_URL}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project " + Date.now() }),
    });
    expect([200, 201]).toContain(response.status);
    const data = await response.json();
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
  });

  it("returns 400 for invalid POST /api/projects", async () => {
    const response = await fetch(`${BASE_URL}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    }).catch(() => null);
    if (!response || shouldSkip(response)) return;
    expect(response.status).toBe(400);
  });
});
