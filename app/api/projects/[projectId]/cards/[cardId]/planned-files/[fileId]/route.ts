import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCardInProject } from "@/lib/supabase/queries";
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
import { TABLES } from "@/lib/supabase/queries";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string; fileId: string }>;
};

async function getPlannedFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardId: string,
  fileId: string
) {
  const { data, error } = await supabase
    .from(TABLES.card_planned_files)
    .select("*")
    .eq("id", fileId)
    .eq("card_id", cardId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId, fileId } = await params;
    const body = await request.json();

    const supabase = await createClient();
    const inProject = await verifyCardInProject(supabase, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getPlannedFile(supabase, cardId, fileId);
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

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from(TABLES.card_planned_files)
      .update(updates)
      .eq("id", fileId)
      .eq("card_id", cardId)
      .select()
      .single();

    if (error) {
      console.error("PATCH planned-file error:", error);
      return internalError(error.message);
    }

    return json(data);
  } catch (err) {
    console.error("PATCH planned-file error:", err);
    return internalError();
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId, fileId } = await params;
    const supabase = await createClient();

    const inProject = await verifyCardInProject(supabase, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const existing = await getPlannedFile(supabase, cardId, fileId);
    if (!existing) return notFoundError("Planned file not found");

    const { error } = await supabase
      .from(TABLES.card_planned_files)
      .delete()
      .eq("id", fileId)
      .eq("card_id", cardId);

    if (error) {
      console.error("DELETE planned-file error:", error);
      return internalError(error.message);
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("DELETE planned-file error:", err);
    return internalError();
  }
}
