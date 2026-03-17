import { describe, it, expect } from "vitest";
import { isLikelyApiKey } from "@/lib/llm/claude-client";

describe("isLikelyApiKey", () => {
  it("returns true for standard API keys (sk-ant-api prefix)", () => {
    expect(isLikelyApiKey("sk-ant-api03-abc123")).toBe(true);
  });

  it("returns true for older API key formats", () => {
    expect(isLikelyApiKey("sk-ant-sid01-abc123")).toBe(true);
  });

  it("returns false for OAuth tokens (sk-ant-oat prefix)", () => {
    expect(isLikelyApiKey("sk-ant-oat01-abc123")).toBe(false);
  });

  it("returns false for other OAuth token versions", () => {
    expect(isLikelyApiKey("sk-ant-oat02-xyz789")).toBe(false);
  });

  it("returns false for non-Anthropic credentials", () => {
    expect(isLikelyApiKey("some-random-token")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLikelyApiKey("")).toBe(false);
  });
});
