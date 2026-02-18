/**
 * RuVector local client for Section 4 Memory Plane.
 * Vector storage for memory embeddings. Uses ~/.dossier/ruvector/ or DOSSIER_DATA_DIR/ruvector/.
 *
 * @see REMAINING_WORK_PLAN.md §4 Memory Plane
 * @see docs/SECTION_4_MEMORY_COORDINATION_PROMPT.md
 */

import * as fs from "fs";
import * as path from "path";

/** Default embedding dimensions (all-MiniLM, etc.). Configurable via env. */
const DEFAULT_DIMENSIONS = 384;

/** Max vectors in index. Increase for large projects. */
const DEFAULT_MAX_ELEMENTS = 100_000;

let _client: VectorDbInstance | null = null;
let _available: boolean | null = null;

function getDataDir(): string {
  const env = process.env.DOSSIER_DATA_DIR;
  if (env) return env;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return path.join(home, ".dossier");
}

/** RuVector data directory (vectors, indexes). */
export function getRuvectorDataDir(): string {
  return path.join(getDataDir(), "ruvector");
}

/** Ensure RuVector data directory exists. */
export function ensureRuvectorDataDir(): string {
  const dir = getRuvectorDataDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return dir;
}

/** VectorDb instance type (from ruvector-core). */
export type VectorDbInstance = {
  insert(entry: { id?: string; vector: Float32Array | number[] }): Promise<string>;
  search(query: { vector: Float32Array | number[]; k: number; efSearch?: number }): Promise<{ id: string; score: number }[]>;
  delete(id: string): Promise<boolean>;
  get(id: string): Promise<{ id?: string; vector: Float32Array | number[] } | null>;
  len(): Promise<number>;
};

/**
 * Check if RuVector native module is available.
 * Caches result. Use for fallback to mock MemoryStore.
 */
export function isRuvectorAvailable(): boolean {
  if (_available !== null) return _available;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("ruvector-core");
    _available = true;
    return true;
  } catch {
    _available = false;
    return false;
  }
}

/**
 * Get RuVector client. Returns null if native module unavailable.
 * Uses singleton. Storage path: ~/.dossier/ruvector/vectors.db (or DOSSIER_DATA_DIR/ruvector/).
 */
export function getRuvectorClient(): VectorDbInstance | null {
  if (_client) return _client;
  if (!isRuvectorAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VectorDb } = require("ruvector-core");
    const dims = parseInt(process.env.RUVECTOR_DIMENSIONS ?? String(DEFAULT_DIMENSIONS), 10);
    _client = new VectorDb({
      dimensions: dims,
      maxElements: parseInt(process.env.RUVECTOR_MAX_ELEMENTS ?? String(DEFAULT_MAX_ELEMENTS), 10),
      storagePath: path.join(ensureRuvectorDataDir(), "vectors.db"),
    }) as VectorDbInstance;
    return _client;
  } catch {
    return null;
  }
}

/** Reset client (for tests). */
export function resetRuvectorForTesting(): void {
  _client = null;
  _available = null;
}
