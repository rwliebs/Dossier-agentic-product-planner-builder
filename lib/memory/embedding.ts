/**
 * Text embedding for memory retrieval.
 * Placeholder: deterministic hash-based vectors for M2.
 * M4 will replace with real local model (@xenova/transformers or similar).
 *
 * @see REMAINING_WORK_PLAN.md §4 M4
 */

const DEFAULT_DIMENSIONS = 384;

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
 * Generate a deterministic vector from text.
 * Not semantic - use for placeholder only. M4 adds real embedding.
 */
export function embedText(text: string, dimensions = DEFAULT_DIMENSIONS): Float32Array {
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
