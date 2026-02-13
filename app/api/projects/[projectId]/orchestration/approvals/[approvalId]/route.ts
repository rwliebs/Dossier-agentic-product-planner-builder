import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveApprovalRequest } from "@/lib/orchestration";
import { getApprovalRequest } from "@/lib/supabase/queries/orchestration";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; approvalId: string }> }
) {
  try {
    const { approvalId } = await params;
    const supabase = await createClient();

    const approval = await getApprovalRequest(supabase, approvalId);
    if (!approval) {
      return notFoundError("Approval request not found");
    }

    return json({ approval });
  } catch (err) {
    console.error("GET approval error:", err);
    return internalError();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; approvalId: string }> }
) {
  try {
    const { approvalId } = await params;
    const body = await request.json();
    const { status, resolved_by, notes } = body;

    if (!status || !resolved_by) {
      return validationError("Missing required fields: status, resolved_by");
    }

    const supabase = await createClient();
    const existing = await getApprovalRequest(supabase, approvalId);
    if (!existing) {
      return notFoundError("Approval request not found");
    }

    const result = await resolveApprovalRequest(supabase, {
      approval_id: approvalId,
      status,
      resolved_by,
      notes: notes ?? null,
    });

    if (!result.success) {
      return validationError(result.error ?? "Failed to resolve approval");
    }

    const updated = await getApprovalRequest(supabase, approvalId);
    return json({ approval: updated });
  } catch (err) {
    console.error("PATCH approval error:", err);
    return internalError();
  }
}
