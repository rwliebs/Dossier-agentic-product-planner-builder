import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { resolveApprovalRequest } from "@/lib/orchestration";
import { getApprovalRequest } from "@/lib/supabase/queries/orchestration";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; approvalId: string }> }
) {
  try {
    const { approvalId } = await params;
    const db = getDb();

    const approval = await getApprovalRequest(db, approvalId);
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

    const db = getDb();
    const existing = await getApprovalRequest(db, approvalId);
    if (!existing) {
      return notFoundError("Approval request not found");
    }

    const result = await resolveApprovalRequest(db, {
      approval_id: approvalId,
      status,
      resolved_by,
      notes: notes ?? null,
    });

    if (!result.success) {
      return validationError(result.error ?? "Failed to resolve approval");
    }

    const updated = await getApprovalRequest(db, approvalId);
    return json({ approval: updated });
  } catch (err) {
    console.error("PATCH approval error:", err);
    return internalError();
  }
}
