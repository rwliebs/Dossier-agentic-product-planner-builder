import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOrchestrationRun,
  ORCHESTRATION_TABLES,
} from "@/lib/supabase/queries/orchestration";
import { updateOrchestrationRunStatusSchema } from "@/lib/schemas/slice-c";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";

const VALID_TRANSITIONS: Record<string, string[]> = {
  queued: ["running", "cancelled"],
  running: ["blocked", "failed", "completed", "cancelled"],
  blocked: ["running", "failed", "cancelled"],
  failed: ["queued"],
  completed: [],
  cancelled: [],
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { runId } = await params;
    const supabase = await createClient();

    const run = await getOrchestrationRun(supabase, runId);
    if (!run) {
      return notFoundError("Orchestration run not found");
    }

    return json({ run });
  } catch (err) {
    console.error("GET orchestration run error:", err);
    return internalError();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { runId } = await params;
    const body = await request.json();

    const parsed = updateOrchestrationRunStatusSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(
        parsed.error.errors.map((e) => e.message).join("; ") ?? "Invalid payload"
      );
    }

    const supabase = await createClient();
    const existing = await getOrchestrationRun(supabase, runId);
    if (!existing) {
      return notFoundError("Orchestration run not found");
    }

    const allowed = VALID_TRANSITIONS[existing.status as string];
    if (allowed && !allowed.includes(parsed.data.status)) {
      return validationError(
        `Invalid status transition from ${existing.status} to ${parsed.data.status}`
      );
    }

    const updatePayload: Record<string, unknown> = {
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.started_at) updatePayload.started_at = parsed.data.started_at;
    if (parsed.data.ended_at) updatePayload.ended_at = parsed.data.ended_at;

    const { data, error } = await supabase
      .from(ORCHESTRATION_TABLES.orchestration_runs)
      .update(updatePayload)
      .eq("id", runId)
      .select()
      .single();

    if (error) {
      return validationError(error.message);
    }

    return json({ run: data });
  } catch (err) {
    console.error("PATCH orchestration run error:", err);
    return internalError();
  }
}
