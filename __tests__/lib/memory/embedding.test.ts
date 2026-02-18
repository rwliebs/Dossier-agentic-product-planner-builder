/**
 * Embedding module tests.
 * Verifies async embedText returns 384-dim Float32Array.
 * In test env the model often fails to load (ONNX runtime), so fallback is used.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { embedText, DEFAULT_DIMENSIONS, resetEmbeddingForTesting } from "@/lib/memory/embedding";

describe("embedText", () => {
  beforeEach(() => {
    resetEmbeddingForTesting();
  });

  it("returns Float32Array of DEFAULT_DIMENSIONS (384)", async () => {
    const vec = await embedText("hello world");
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(DEFAULT_DIMENSIONS);
  });

  it("returns deterministic vectors for same input", async () => {
    const a = await embedText("same text");
    const b = await embedText("same text");
    expect(a).toEqual(b);
  });

  it("returns different vectors for different inputs", async () => {
    const a = await embedText("text A");
    const b = await embedText("text B");
    expect(a).not.toEqual(b);
  });

  it("handles empty string", async () => {
    const vec = await embedText("");
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(DEFAULT_DIMENSIONS);
  });
});
