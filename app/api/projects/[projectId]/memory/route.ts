/**
 * GET /api/projects/[projectId]/memory
 *
 * Returns memory units stored for this project (ingested from finalize + harvest).
 * Use this to verify that the memory plane is actually storing data.
 *
 * Raw data locations:
 * - SQLite: memory_unit + memory_unit_relation tables in ~/.dossier/dossier.db (or DOSSIER_DATA_DIR)
 * - RuVector: vectors in ~/.dossier/ruvector/vectors.db (or DOSSIER_DATA_DIR/ruvector/)
 */

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getProject } from "@/lib/db/queries";
import { getRuvectorDataDir } from "@/lib/ruvector/client";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";

type RouteParams = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const db = getDb();
    const project = await getProject(db, projectId);
    if (!project) return notFoundError("Project not found");

    const relations = await db.getMemoryUnitRelationsByEntity("project", projectId);
    const unitIds = [...new Set(relations.map((r) => (r as { memory_unit_id: string }).memory_unit_id))];
    const units = unitIds.length > 0 ? await db.getMemoryUnitsByIds(unitIds) : [];

    const dataDir = process.env.DOSSIER_DATA_DIR || (process.env.HOME || process.env.USERPROFILE || ".") + "/.dossier";
    const ruvectorDir = getRuvectorDataDir();

    return json({
      projectId,
      count: units.length,
      units: units.map((u) => ({
        id: (u as { id: string }).id,
        title: (u as { title?: string }).title ?? null,
        content_type: (u as { content_type: string }).content_type,
        status: (u as { status: string }).status,
        updated_at: (u as { updated_at: string }).updated_at,
        content_preview:
          (u as { content_text?: string }).content_text?.substring(0, 200) ??
          (u as { link_url?: string }).link_url ??
          null,
        link_url: (u as { link_url?: string }).link_url ?? null,
      })),
      storage: {
        sqlite: `${dataDir}/dossier.db`,
        ruvector: `${ruvectorDir}/vectors.db`,
      },
    });
  } catch (err) {
    console.error("GET memory error:", err);
    return internalError();
  }
}
