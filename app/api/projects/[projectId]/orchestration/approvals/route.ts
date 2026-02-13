import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createApprovalRequest } from "@/lib/orchestration";
import { getApprovalRequestsByRun } from "@/lib/supabase/queries/orchestration";
import { json, validationError, notFoundError, internalError } from "@/lib/api/response-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("run_id");

    if (!runId) {
      return validationError("run_id query parameter is required");
    }

    const supabase = await createClient();
    const approvals = await getApprovalRequestsByRun(supabase, runId);

    return json({ approvals });
  } catch (err) {
    console.error("GET approvals error:", err);
    return internalError();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const body = await request.json();
    const { run_id, approval_type, requested_by } = body;

    if (!run_id || !approval_type || !requested_by) {
      return validationError(
        "Missing required fields: run_id, approval_type, requested_by"
      );
    }

    const supabase = await createClient();
    const result = await createApprovalRequest(supabase, {
      run_id,
      approval_type,
      requested_by,
    });

    if (!result.success) {
      if (result.validationErrors && result.validationErrors.length > 0) {
        return validationError(result.error ?? "Validation failed", {
          validation: result.validationErrors,
        });
      }
      return validationError(result.error ?? "Failed to create approval request");
    }

    return json({ approvalId: result.approvalId }, 201);
  } catch (err) {
    console.error("POST approval request error:", err);
    return internalError();
  }
}
