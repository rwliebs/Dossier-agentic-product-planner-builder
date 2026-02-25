/**
 * API tests for POST /api/dev/restart-and-open.
 * Verifies validation: projectId required, clone must exist.
 * Does not start a real dev server.
 */

import { describe, it, expect, afterEach } from "vitest";

const originalNodeEnv = process.env.NODE_ENV;

describe("POST /api/dev/restart-and-open", () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns 404 when NODE_ENV is not development", async () => {
    process.env.NODE_ENV = "production";
    const { POST } = await import("@/app/api/dev/restart-and-open/route");
    const req = new Request("http://localhost/api/dev/restart-and-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "any-id" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toHaveProperty("error", "Not found");
  });

  it("returns 400 when body is missing or invalid JSON", async () => {
    process.env.NODE_ENV = "development";
    const { POST } = await import("@/app/api/dev/restart-and-open/route");
    const req = new Request("http://localhost/api/dev/restart-and-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(String(data.error).toLowerCase()).toMatch(/json|projectId/);
  });

  it("returns 400 when projectId is missing", async () => {
    process.env.NODE_ENV = "development";
    const { POST } = await import("@/app/api/dev/restart-and-open/route");
    const req = new Request("http://localhost/api/dev/restart-and-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(String(data.error)).toMatch(/projectId.*required/i);
  });

  it("returns 409 when clone path does not exist", async () => {
    process.env.NODE_ENV = "development";
    const { POST } = await import("@/app/api/dev/restart-and-open/route");
    const req = new Request("http://localhost/api/dev/restart-and-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "nonexistent-project-id-for-view-on-server-test",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(String(data.error).toLowerCase()).toMatch(/clone|not cloned|run a build/i);
  });
});
