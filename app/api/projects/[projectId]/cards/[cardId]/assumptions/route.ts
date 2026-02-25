import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  getCardAssumptions,
  verifyCardInProject,
} from "@/lib/db/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { createAssumptionSchema } from "@/lib/validation/request-schema";
import { zodErrorDetails } from "@/lib/validation/zod-details";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const items = await getCardAssumptions(db, cardId);
    return json(items);
  } catch (err) {
    console.error("GET assumptions error:", err);
    return internalError();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const body = await request.json();
    const parsed = createAssumptionSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Invalid request body", zodErrorDetails(parsed.error));
    }

    const db = getDb();
    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const items = await getCardAssumptions(db, cardId);
    const position = parsed.data.position ?? items.length;

    const id = crypto.randomUUID();
    await db.insertCardAssumption({
      id,
      card_id: cardId,
      text: parsed.data.text,
      status: parsed.data.status ?? "draft",
      source: parsed.data.source,
      confidence: parsed.data.confidence ?? null,
      position,
    });

    const created = (await db.getCardAssumptions(cardId)).find((r) => (r as { id?: string }).id === id);
    return json(created ?? { id, card_id: cardId, text: parsed.data.text, status: parsed.data.status ?? "draft", source: parsed.data.source, confidence: parsed.data.confidence ?? null, position }, 201);
  } catch (err) {
    console.error("POST assumptions error:", err);
    return internalError();
  }
}
