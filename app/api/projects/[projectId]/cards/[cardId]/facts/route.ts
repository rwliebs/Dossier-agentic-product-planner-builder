import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getCardFacts, verifyCardInProject } from "@/lib/db/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { createFactSchema } from "@/lib/validation/request-schema";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const items = await getCardFacts(db, cardId);
    return json(items);
  } catch (err) {
    console.error("GET facts error:", err);
    return internalError();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const body = await request.json();
    const parsed = createFactSchema.safeParse(body);

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

    const items = await getCardFacts(db, cardId);
    const position = parsed.data.position ?? items.length;

    const id = crypto.randomUUID();
    await db.insertCardFact({
      id,
      card_id: cardId,
      text: parsed.data.text,
      evidence_source: parsed.data.evidence_source ?? null,
      status: parsed.data.status ?? "draft",
      source: parsed.data.source,
      confidence: parsed.data.confidence ?? null,
      position,
    });

    const created = (await db.getCardFacts(cardId)).find((r) => (r as { id?: string }).id === id);
    return json(created ?? { id, card_id: cardId, text: parsed.data.text, evidence_source: parsed.data.evidence_source ?? null, status: parsed.data.status ?? "draft", source: parsed.data.source, confidence: parsed.data.confidence ?? null, position }, 201);
  } catch (err) {
    console.error("POST facts error:", err);
    return internalError();
  }
}
