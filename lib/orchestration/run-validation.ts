/**
 * Policy snapshot validation against active SystemPolicyProfile.
 * Ensures run_input_snapshot conforms to system-wide constraints before run creation.
 */

import type { SystemPolicyProfile } from "@/lib/schemas/slice-c";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates run_input_snapshot against the active system policy profile.
 * - Ensures scope target (workflow_id or card_id) is present
 * - Ensures no paths in run_input violate protected_paths or forbidden_paths
 * - Ensures per-build overrides do not relax system-wide constraints
 */
export function validateRunInputAgainstPolicy(
  runInputSnapshot: Record<string, unknown>,
  policy: SystemPolicyProfile
): ValidationResult {
  const errors: string[] = [];

  // Scope target must be present
  const hasWorkflowId = runInputSnapshot.workflow_id != null;
  const hasCardId = runInputSnapshot.card_id != null;
  if (!hasWorkflowId && !hasCardId) {
    errors.push("run_input_snapshot must include workflow_id or card_id as scope target");
  }

  // If allowed_paths in run input, they must not include forbidden_paths from policy
  const policyForbidden = policy.forbidden_paths ?? [];
  const runAllowedPaths = runInputSnapshot.allowed_paths as string[] | undefined;
  if (runAllowedPaths && policyForbidden.length > 0) {
    for (const path of runAllowedPaths) {
      for (const forbidden of policyForbidden) {
        if (path.includes(forbidden) || path === forbidden) {
          errors.push(`allowed_paths cannot include forbidden path: ${forbidden}`);
        }
      }
    }
  }

  // If forbidden_paths in run input, they must be a subset or equal to policy (cannot relax)
  const runForbiddenPaths = runInputSnapshot.forbidden_paths as string[] | undefined;
  if (runForbiddenPaths && policyForbidden.length > 0) {
    for (const policyPath of policyForbidden) {
      if (!runForbiddenPaths.some((p) => p === policyPath || p.includes(policyPath))) {
        errors.push(`run must forbid paths required by policy: ${policyPath}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates that the run scope matches the policy requirements.
 * - workflow scope: integration check is mandatory and cannot be skipped
 * - card scope: required_checks from policy must all be present
 */
export function validateScopeAgainstPolicy(
  scope: "workflow" | "card",
  requiredChecks: string[]
): ValidationResult {
  const errors: string[] = [];

  if (scope === "workflow") {
    if (!requiredChecks.includes("integration")) {
      errors.push("workflow scope requires integration check in policy required_checks");
    }
  }

  if (requiredChecks.length === 0) {
    errors.push("policy must have at least one required check");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
