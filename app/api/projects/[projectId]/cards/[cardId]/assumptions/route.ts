import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCardAssumptions,
  verifyCardInProject,
} from "@/lib/supabase/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { createAssumptionSchema } from "@/lib/validation/request-schema";
import { TABLES } from "@/lib/supabase/queries";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const supabase = await createClient();

    const inProject = await verifyCardInProject(supabase, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const items = await getCardAssumptions(supabase, cardId);
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

    const items = await getCardAssumptions(supabase, cardId);
    const position = parsed.data.position ?? items.length;

    const { data, error } = await supabase
      .from(TABLES.card_assumptions)
      .insert({
        card_id: cardId,
        text: parsed.data.text,
        status: parsed.data.status ?? "draft",
        source: parsed.data.source,
        confidence: parsed.data.confidence ?? null,
        position,
      })
      .select()
      .single();

    if (error) {
      console.error("POST assumption error:", error);
      return internalError(error.message);
    }

    return json(data, 201);
  } catch (err) {
    console.error("POST assumptions error:", err);
    return internalError();
  }
}
