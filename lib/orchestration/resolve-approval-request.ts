/**
 * Resolve approval request with audit trail.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { resolveApprovalRequestSchema } from "@/lib/schemas/slice-c";

export interface ResolveApprovalRequestInput {
  approval_id: string;
  status: "approved" | "rejected";
  resolved_by: string;
  notes?: string | null;
}

export interface ResolveApprovalRequestResult {
  success: boolean;
  error?: string;
}

/**
 * Resolves an approval request (approve or reject).
 * Records resolved_by and resolved_at for audit trail.
 */
export async function resolveApprovalRequest(
  db: DbAdapter,
  input: ResolveApprovalRequestInput
): Promise<ResolveApprovalRequestResult> {
  try {
    const payload = resolveApprovalRequestSchema.parse({
      status: input.status,
      resolved_by: input.resolved_by,
      notes: input.notes ?? null,
    });

    await db.updateApprovalRequest(input.approval_id, {
      status: payload.status,
      resolved_by: payload.resolved_by,
      resolved_at: new Date().toISOString(),
      notes: payload.notes,
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}
