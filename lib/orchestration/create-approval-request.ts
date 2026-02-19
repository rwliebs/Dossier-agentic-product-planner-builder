/**
 * Create approval request with pre-checks validation.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { createApprovalRequestInputSchema } from "@/lib/schemas/slice-c";
import {
  getOrchestrationRun,
  getRunChecksByRun,
} from "@/lib/db/queries/orchestration";
import { validateApprovalGates, type CheckResult } from "./approval-gates";

export interface CreateApprovalRequestInput {
  run_id: string;
  approval_type: "create_pr" | "merge_pr";
  requested_by: string;
}

export interface CreateApprovalRequestResult {
  success: boolean;
  approvalId?: string;
  error?: string;
  validationErrors?: string[];
}

/**
 * Creates an ApprovalRequest for a run.
 * Validates that all required checks have passed before creating the request.
 */
export async function createApprovalRequest(
  db: DbAdapter,
  input: CreateApprovalRequestInput
): Promise<CreateApprovalRequestResult> {
  try {
    const run = await getOrchestrationRun(db, input.run_id);
    if (!run) {
      return {
        success: false,
        error: "Orchestration run not found",
      };
    }

    const policySnapshot = run.system_policy_snapshot as {
      required_checks?: string[];
    };
    const requiredChecks = (policySnapshot?.required_checks ?? []) as Array<
      "dependency" | "security" | "policy" | "lint" | "unit" | "integration" | "e2e"
    >;

    const checks = await getRunChecksByRun(db, input.run_id);
    const checkResults: CheckResult[] = checks.map((c) => ({
      check_type: c.check_type as CheckResult["check_type"],
      status: c.status as "passed" | "failed" | "skipped",
    }));

    const gates = validateApprovalGates(requiredChecks, checkResults);
    if (!gates.canApprove) {
      return {
        success: false,
        validationErrors: gates.errors,
      };
    }

    const payload = createApprovalRequestInputSchema.parse({
      run_id: input.run_id,
      approval_type: input.approval_type,
      status: "pending",
      requested_by: input.requested_by,
      requested_at: new Date().toISOString(),
    });

    const inserted = await db.insertApprovalRequest({
      run_id: payload.run_id,
      approval_type: payload.approval_type,
      status: payload.status,
      requested_by: payload.requested_by,
      requested_at: payload.requested_at,
    });

    return {
      success: true,
      approvalId: inserted?.id as string,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}
