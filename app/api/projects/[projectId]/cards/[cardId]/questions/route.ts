import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getCardQuestions, verifyCardInProject } from "@/lib/supabase/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { createQuestionSchema } from "@/lib/validation/request-schema";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const items = await getCardQuestions(db, cardId);
    return json(items);
  } catch (err) {
    console.error("GET questions error:", err);
    return internalError();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const body = await request.json();
    const parsed = createQuestionSchema.safeParse(body);

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

    const items = await getCardQuestions(db, cardId);
    const position = parsed.data.position ?? items.length;

    const id = crypto.randomUUID();
    await db.insertCardQuestion({
      id,
      card_id: cardId,
      text: parsed.data.text,
      status: parsed.data.status ?? "draft",
      source: parsed.data.source,
      confidence: parsed.data.confidence ?? null,
      position,
    });

    const created = (await db.getCardQuestions(cardId)).find((r) => (r as { id?: string }).id === id);
    return json(created ?? { id, card_id: cardId, text: parsed.data.text, status: parsed.data.status ?? "draft", source: parsed.data.source, confidence: parsed.data.confidence ?? null, position }, 201);
  } catch (err) {
    console.error("POST questions error:", err);
    return internalError();
  }
}
