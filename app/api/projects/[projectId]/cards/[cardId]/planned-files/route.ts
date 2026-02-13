import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCardPlannedFiles,
  verifyCardInProject,
} from "@/lib/supabase/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { createPlannedFileSchema } from "@/lib/validation/request-schema";
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

    const items = await getCardPlannedFiles(supabase, cardId);
    return json(items);
  } catch (err) {
    console.error("GET planned-files error:", err);
    return internalError();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const body = await request.json();
    const parsed = createPlannedFileSchema.safeParse(body);

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

    const items = await getCardPlannedFiles(supabase, cardId);
    const position = parsed.data.position ?? items.length;

    const { data, error } = await supabase
      .from(TABLES.card_planned_files)
      .insert({
        card_id: cardId,
        logical_file_name: parsed.data.logical_file_name,
        module_hint: parsed.data.module_hint ?? null,
        artifact_kind: parsed.data.artifact_kind,
        action: parsed.data.action,
        intent_summary: parsed.data.intent_summary,
        contract_notes: parsed.data.contract_notes ?? null,
        status: parsed.data.status ?? "proposed",
        position,
      })
      .select()
      .single();

    if (error) {
      console.error("POST planned-file error:", error);
      return internalError(error.message);
    }

    return json(data, 201);
  } catch (err) {
    console.error("POST planned-files error:", err);
    return internalError();
  }
}
