/**
 * RuVector test helpers.
 * Use for integration tests that need real vector storage.
 *
 * @example
 *   if (!ruvectorAvailable) return;
 *   const client = createTestRuvectorClient();
 *   const id = await client.insert({ id: "test-1", vector: vec });
 *   // ... run tests
 *   await cleanupRuvectorTestVectors([id], client);
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { VectorDbInstance } from "@/lib/ruvector/client";

/** Default dimensions (must match embedding model). */
const DEFAULT_DIMENSIONS = 384;

/** Whether ruvector-core is loadable. */
export const ruvectorAvailable: boolean = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("ruvector-core");
    return true;
  } catch {
    return false;
  }
})();

/**
 * Deletes vectors by ID from the given client.
 * Use after tests to avoid polluting the index.
 */
export async function cleanupRuvectorTestVectors(
  ids: string[],
  client: VectorDbInstance
): Promise<void> {
  for (const id of ids) {
    try {
      await client.delete(id);
    } catch {
      // ignore missing ids
    }
  }
}

/**
 * Creates a RuVector client configured for test use (temp data dir).
 * Each call uses a fresh temp directory for isolation.
 * Returns null if ruvector-core is unavailable.
 */
export function createTestRuvectorClient(): VectorDbInstance | null {
  if (!ruvectorAvailable) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VectorDb } = require("ruvector-core");
    const tmpDir = path.join(os.tmpdir(), `dossier-ruvector-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const dims = parseInt(process.env.RUVECTOR_DIMENSIONS ?? String(DEFAULT_DIMENSIONS), 10);
    const client = new VectorDb({
      dimensions: dims,
      maxElements: 10_000,
      storagePath: path.join(tmpDir, "vectors.db"),
    }) as VectorDbInstance;
    return client;
  } catch {
    return null;
  }
}
