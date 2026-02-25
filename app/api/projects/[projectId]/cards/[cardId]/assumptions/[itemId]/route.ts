import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { verifyCardInProject } from "@/lib/db/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { updateKnowledgeItemSchema } from "@/lib/validation/request-schema";
import { zodErrorDetails } from "@/lib/validation/zod-details";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string; itemId: string }>;
};

async function getAssumption(
  db: ReturnType<typeof getDb>,
  cardId: string,
  itemId: string
) {
  const items = await db.getCardAssumptions(cardId);
  return items.find((r) => (r as { id?: string }).id === itemId) ?? null;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId, itemId } = await params;
    const body = await request.json();
    const parsed = updateKnowledgeItemSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Invalid request body", zodErrorDetails(parsed.error));
    }

    const db = getDb();
    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getAssumption(db, cardId, itemId);
    if (!existing) return notFoundError("Assumption not found");

    const updates: Record<string, unknown> = {};
    if (parsed.data.text !== undefined) updates.text = parsed.data.text;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.confidence !== undefined) updates.confidence = parsed.data.confidence;
    if (parsed.data.position !== undefined) updates.position = parsed.data.position;

    if (Object.keys(updates).length === 0) return json(existing);

    await db.updateCardAssumption(itemId, cardId, updates);

    const updated = await getAssumption(db, cardId, itemId);
    return json(updated ?? existing);
  } catch (err) {
    console.error("PATCH assumption error:", err);
    return internalError();
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId, itemId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getAssumption(db, cardId, itemId);
    if (!existing) return notFoundError("Assumption not found");

    await db.deleteCardAssumption(itemId, cardId);

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("DELETE assumption error:", err);
    return internalError();
  }
}
