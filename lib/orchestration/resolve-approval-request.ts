/**
 * Resolve approval request with audit trail.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveApprovalRequestSchema } from "@/lib/schemas/slice-c";
import { ORCHESTRATION_TABLES } from "@/lib/supabase/queries/orchestration";

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
  supabase: SupabaseClient,
  input: ResolveApprovalRequestInput
): Promise<ResolveApprovalRequestResult> {
  try {
    const payload = resolveApprovalRequestSchema.parse({
      status: input.status,
      resolved_by: input.resolved_by,
      notes: input.notes ?? null,
    });

    const { error } = await supabase
      .from(ORCHESTRATION_TABLES.approval_requests)
      .update({
        status: payload.status,
        resolved_by: payload.resolved_by,
        resolved_at: new Date().toISOString(),
        notes: payload.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.approval_id);

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}
