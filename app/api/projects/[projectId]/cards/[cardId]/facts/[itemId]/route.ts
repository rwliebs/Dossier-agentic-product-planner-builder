import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCardInProject } from "@/lib/supabase/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { updateKnowledgeItemSchema } from "@/lib/validation/request-schema";
import { TABLES } from "@/lib/supabase/queries";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string; itemId: string }>;
};

async function getFact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardId: string,
  itemId: string
) {
  const { data, error } = await supabase
    .from(TABLES.card_known_facts)
    .select("*")
    .eq("id", itemId)
    .eq("card_id", cardId)
    .maybeSingle();
  if (error) throw error;
  return data;
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

    const supabase = await createClient();
    const inProject = await verifyCardInProject(supabase, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getFact(supabase, cardId, itemId);
    if (!existing) return notFoundError("Fact not found");

    const updates: Record<string, unknown> = {};
    if (parsed.data.text !== undefined) updates.text = parsed.data.text;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.confidence !== undefined) updates.confidence = parsed.data.confidence;
    if (parsed.data.position !== undefined) updates.position = parsed.data.position;

    if (Object.keys(updates).length === 0) return json(existing);

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from(TABLES.card_known_facts)
      .update(updates)
      .eq("id", itemId)
      .eq("card_id", cardId)
      .select()
      .single();

    if (error) {
      console.error("PATCH fact error:", error);
      return internalError(error.message);
    }

    return json(data);
  } catch (err) {
    console.error("PATCH fact error:", err);
    return internalError();
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId, itemId } = await params;
    const supabase = await createClient();

    const inProject = await verifyCardInProject(supabase, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getFact(supabase, cardId, itemId);
    if (!existing) return notFoundError("Fact not found");

    const { error } = await supabase
      .from(TABLES.card_known_facts)
      .delete()
      .eq("id", itemId)
      .eq("card_id", cardId);

    if (error) {
      console.error("DELETE fact error:", error);
      return internalError(error.message);
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("DELETE fact error:", err);
    return internalError();
  }
}
