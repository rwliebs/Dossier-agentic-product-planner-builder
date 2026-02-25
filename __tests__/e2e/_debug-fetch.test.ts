// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("fetch debug", () => {
  it("can reach localhost:3000", async () => {
    console.log("typeof fetch:", typeof fetch);
    console.log("fetch.name:", fetch.name);
    console.log("fetch.toString() snippet:", fetch.toString().slice(0, 200));

    try {
      const res = await fetch("http://localhost:3000/api/projects");
      console.log("fetch status:", res.status);
      console.log("fetch headers:", Object.fromEntries(res.headers.entries()));
      const body = await res.text();
      console.log("fetch body (first 500 chars):", body.slice(0, 500));
      expect(res.ok).toBe(true);
    } catch (err) {
      console.log("fetch error:", err);
      throw err;
    }
  });
});
