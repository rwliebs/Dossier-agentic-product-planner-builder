import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordCheck } from "@/lib/orchestration";
import {
  getOrchestrationRun,
  getRunChecksByRun,
} from "@/lib/supabase/queries/orchestration";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";

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

    const checks = await getRunChecksByRun(supabase, runId);
    return json({ checks });
  } catch (err) {
    console.error("GET run checks error:", err);
    return internalError();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { runId } = await params;
    const body = await request.json();

    const { check_type, status, output } = body;

    if (!check_type || !status) {
      return validationError("Missing required fields: check_type, status");
    }

    const supabase = await createClient();
    const run = await getOrchestrationRun(supabase, runId);
    if (!run) {
      return notFoundError("Orchestration run not found");
    }

    const result = await recordCheck(supabase, {
      run_id: runId,
      check_type,
      status,
      output: output ?? null,
    });

    if (!result.success) {
      return validationError(result.error ?? "Failed to record check");
    }

    return json({ checkId: result.checkId }, 201);
  } catch (err) {
    console.error("POST run check error:", err);
    return internalError();
  }
}
