/**
 * Pre-approval check validation.
 * Approval cannot be granted unless required checks have passed.
 */

import type { RunCheckType } from "@/lib/schemas/slice-c";

export interface CheckResult {
  check_type: RunCheckType;
  status: "passed" | "failed" | "skipped";
}

export interface ApprovalGatesResult {
  canApprove: boolean;
  errors: string[];
  missingChecks: RunCheckType[];
  failedChecks: RunCheckType[];
}

/**
 * Validates that all required checks have passed before an approval can be granted.
 * - All required checks must have a result
 * - No required check may have status "failed"
 * - "skipped" is allowed only when policy explicitly permits (MVP: not permitted for required checks)
 */
export function validateApprovalGates(
  requiredChecks: RunCheckType[],
  checkResults: CheckResult[]
): ApprovalGatesResult {
  const errors: string[] = [];
  const missingChecks: RunCheckType[] = [];
  const failedChecks: RunCheckType[] = [];

  const resultsByType = new Map<string, CheckResult>();
  for (const r of checkResults) {
    resultsByType.set(r.check_type, r);
  }

  for (const required of requiredChecks) {
    const result = resultsByType.get(required);
    if (!result) {
      missingChecks.push(required);
      errors.push(`Required check '${required}' has not been executed`);
    } else if (result.status === "failed") {
      failedChecks.push(required);
      errors.push(`Required check '${required}' failed`);
    } else if (result.status === "skipped") {
      errors.push(`Required check '${required}' was skipped - must pass before approval`);
    }
  }

  return {
    canApprove: errors.length === 0,
    errors,
    missingChecks,
    failedChecks,
  };
}
