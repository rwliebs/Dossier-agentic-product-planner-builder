/**
 * API tests for POST /api/dev/restart-and-open.
 * Verifies validation: projectId required, clone must exist.
 * Does not start a real dev server.
 */

import { describe, it, expect, afterEach } from "vitest";

const env = process.env as {
  NODE_ENV?: string;
  DOSSIER_ALLOW_PROJECT_DEV_SERVER?: string;
  VERCEL?: string;
};
const originalNodeEnv = env.NODE_ENV;
const originalAllowFlag = env.DOSSIER_ALLOW_PROJECT_DEV_SERVER;
const originalVercel = env.VERCEL;

describe("POST /api/dev/restart-and-open", () => {
  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
    if (originalAllowFlag === undefined) {
      delete env.DOSSIER_ALLOW_PROJECT_DEV_SERVER;
    } else {
      env.DOSSIER_ALLOW_PROJECT_DEV_SERVER = originalAllowFlag;
    }
    if (originalVercel === undefined) {
      delete env.VERCEL;
    } else {
      env.VERCEL = originalVercel;
    }
  });

  it("returns 404 when not development and DOSSIER_ALLOW_PROJECT_DEV_SERVER is unset", async () => {
    env.NODE_ENV = "production";
    delete env.DOSSIER_ALLOW_PROJECT_DEV_SERVER;
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

  it("allows standalone mode when DOSSIER_ALLOW_PROJECT_DEV_SERVER=1 (409 if clone missing)", async () => {
    env.NODE_ENV = "production";
    env.DOSSIER_ALLOW_PROJECT_DEV_SERVER = "1";
    const { POST } = await import("@/app/api/dev/restart-and-open/route");
    const req = new Request("http://localhost/api/dev/restart-and-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "nonexistent-project-id-for-view-on-server-standalone-flag",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(String(data.error).toLowerCase()).toMatch(/clone|not cloned|run a build/i);
  });

  it("returns 404 on Vercel-like host even with allow flag and development", async () => {
    env.VERCEL = "1";
    env.NODE_ENV = "development";
    env.DOSSIER_ALLOW_PROJECT_DEV_SERVER = "1";
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
    env.NODE_ENV = "development";
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
    env.NODE_ENV = "development";
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
    env.NODE_ENV = "development";
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
