/**
 * Text embedding for memory retrieval.
 * Uses ruvector-onnx-embeddings-wasm (RuvNet) with all-MiniLM-L6-v2 (384-dim).
 * Falls back to deterministic hash-based vectors if the model fails to load.
 *
 * @see REMAINING_WORK_PLAN.md §4 M4
 */

const DEFAULT_DIMENSIONS = 384;
const DEFAULT_MODEL = "all-MiniLM-L6-v2";

/** Simple string hash (djb2). */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/** Seeded pseudo-random for deterministic vectors. */
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/**
 * Fallback: generate a deterministic vector from text.
 * Not semantic - used when the real model fails to load.
 */
function embedTextFallback(text: string, dimensions = DEFAULT_DIMENSIONS): Float32Array {
  const vec = new Float32Array(dimensions);
  const seed = hashString(text);
  const rng = seededRandom(seed);
  for (let i = 0; i < dimensions; i++) {
    vec[i] = (rng() - 0.5) * 2;
  }
  // L2 normalize for cosine similarity
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimensions; i++) vec[i] /= norm;
  return vec;
}

let _embedder: { embedOne: (text: string) => Float32Array } | null = null;
let _useFallback = false;
let _initAttempted = false;

async function loadEmbedder(): Promise<{ embedOne: (text: string) => Float32Array } | null> {
  if (_useFallback || _initAttempted) return _embedder;
  _initAttempted = true;

  try {
    const { createEmbedder } = await import("ruvector-onnx-embeddings-wasm/loader.js");
    const model = process.env.EMBEDDING_MODEL ?? DEFAULT_MODEL;
    const embedder = await createEmbedder(model);
    _embedder = embedder;
    return _embedder;
  } catch (err) {
    _useFallback = true;
    console.warn(
      "[embedding] Failed to load embedding model, using hash-based fallback:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Embed text into a 384-dimensional vector.
 * Uses ruvector-onnx-embeddings-wasm (RuvNet) when available.
 * Falls back to deterministic hash-based vectors on model load failure.
 *
 * @param text - Text to embed
 * @param dimensions - Ignored when using real model (always 384). Used for fallback.
 * @returns Promise resolving to normalized Float32Array
 */
export async function embedText(text: string, dimensions = DEFAULT_DIMENSIONS): Promise<Float32Array> {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return embedTextFallback("", dimensions);

  const embedder = await loadEmbedder();
  if (!embedder) return embedTextFallback(trimmed, dimensions);

  try {
    const vec = embedder.embedOne(trimmed);
    if (!vec || vec.length < DEFAULT_DIMENSIONS) return embedTextFallback(trimmed, dimensions);
    return new Float32Array(vec.subarray(0, DEFAULT_DIMENSIONS));
  } catch (err) {
    console.warn(
      "[embedding] Inference failed, using hash-based fallback:",
      err instanceof Error ? err.message : String(err)
    );
    return embedTextFallback(trimmed, dimensions);
  }
}

/** Reset for tests. */
export function resetEmbeddingForTesting(): void {
  _embedder = null;
  _useFallback = false;
  _initAttempted = false;
}

export { DEFAULT_DIMENSIONS };
