import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { verifyCardInProject } from "@/lib/db/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import {
  updatePlannedFileSchema,
  approvePlannedFileSchema,
} from "@/lib/validation/request-schema";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string; fileId: string }>;
};

async function getPlannedFile(
  db: ReturnType<typeof getDb>,
  cardId: string,
  fileId: string
) {
  const files = await db.getCardPlannedFiles(cardId);
  return files.find((f) => (f as { id?: string }).id === fileId) ?? null;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId, fileId } = await params;
    const body = await request.json();

    const db = getDb();
    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getPlannedFile(db, cardId, fileId);
    if (!existing) return notFoundError("Planned file not found");

    const parsed =
      body.status === "approved"
        ? approvePlannedFileSchema.safeParse(body)
        : updatePlannedFileSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      parsed.error.errors.forEach((e) => {
        const path = e.path.join(".");
        if (!details[path]) details[path] = [];
        details[path].push(e.message);
      });
      return validationError("Invalid request body", details);
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if ("logical_file_name" in parsed.data && parsed.data.logical_file_name !== undefined)
      updates.logical_file_name = parsed.data.logical_file_name;
    if ("module_hint" in parsed.data) updates.module_hint = parsed.data.module_hint;
    if ("artifact_kind" in parsed.data && parsed.data.artifact_kind !== undefined)
      updates.artifact_kind = parsed.data.artifact_kind;
    if ("action" in parsed.data && parsed.data.action !== undefined)
      updates.action = parsed.data.action;
    if ("intent_summary" in parsed.data && parsed.data.intent_summary !== undefined)
      updates.intent_summary = parsed.data.intent_summary;
    if ("contract_notes" in parsed.data) updates.contract_notes = parsed.data.contract_notes;
    if ("position" in parsed.data && parsed.data.position !== undefined)
      updates.position = parsed.data.position;

    if (Object.keys(updates).length === 0) return json(existing);

    await db.updateCardPlannedFile(fileId, cardId, updates);

    const updated = await getPlannedFile(db, cardId, fileId);
    return json(updated ?? existing);
  } catch (err) {
    console.error("PATCH planned-file error:", err);
    return internalError();
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId, fileId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getPlannedFile(db, cardId, fileId);
    if (!existing) return notFoundError("Planned file not found");

    await db.deleteCardPlannedFile(fileId, cardId);

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("DELETE planned-file error:", err);
    return internalError();
  }
}
