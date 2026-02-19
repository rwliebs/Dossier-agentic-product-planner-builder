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

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string; itemId: string }>;
};

async function getQuestion(
  db: ReturnType<typeof getDb>,
  cardId: string,
  itemId: string
) {
  const items = await db.getCardQuestions(cardId);
  return items.find((r) => (r as { id?: string }).id === itemId) ?? null;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId, itemId } = await params;
    const body = await request.json();
    const parsed = updateKnowledgeItemSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      parsed.error.errors.forEach((e) => {
        const path = e.path.join(".");
        if (!details[path]) details[path] = [];
        details[path].push(e.message);
      });
      return validationError("Invalid request body", details);
    }

    const db = getDb();
    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getQuestion(db, cardId, itemId);
    if (!existing) return notFoundError("Question not found");

    const updates: Record<string, unknown> = {};
    if (parsed.data.text !== undefined) updates.text = parsed.data.text;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.confidence !== undefined) updates.confidence = parsed.data.confidence;
    if (parsed.data.position !== undefined) updates.position = parsed.data.position;

    if (Object.keys(updates).length === 0) return json(existing);

    await db.updateCardQuestion(itemId, cardId, updates);

    const updated = await getQuestion(db, cardId, itemId);
    return json(updated ?? existing);
  } catch (err) {
    console.error("PATCH question error:", err);
    return internalError();
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId, itemId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getQuestion(db, cardId, itemId);
    if (!existing) return notFoundError("Question not found");

    await db.deleteCardQuestion(itemId, cardId);

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("DELETE question error:", err);
    return internalError();
  }
}
