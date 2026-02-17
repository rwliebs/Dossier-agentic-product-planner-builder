/**
 * Check execution - MVP stub/dry-run mode.
 * Records check results without actually running lint/test/integration.
 * Real check execution deferred to Phase 4 (agentic-flow integration).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createRunCheckInputSchema } from "@/lib/schemas/slice-c";
import {
  getOrchestrationRun,
  getRunChecksByRun,
  ORCHESTRATION_TABLES,
} from "@/lib/supabase/queries/orchestration";

export type RunCheckType =
  | "dependency"
  | "security"
  | "policy"
  | "lint"
  | "unit"
  | "integration"
  | "e2e";

export type CheckStatus = "passed" | "failed" | "skipped";

export interface RecordCheckInput {
  run_id: string;
  check_type: RunCheckType;
  status: CheckStatus;
  output?: string | null;
}

export interface RecordCheckResult {
  success: boolean;
  checkId?: string;
  error?: string;
}

/**
 * Records a check execution result for a run.
 * MVP: Does not actually execute checks - caller provides status.
 * Phase 4: Will integrate with real check execution engine.
 */
export async function recordCheck(
  supabase: SupabaseClient,
  input: RecordCheckInput
): Promise<RecordCheckResult> {
  try {
    const run = await getOrchestrationRun(supabase, input.run_id);
    if (!run) {
      return {
        success: false,
        error: "Orchestration run not found",
      };
    }

    const policySnapshot = run.system_policy_snapshot as {
      required_checks?: string[];
    };
    const requiredChecks = policySnapshot?.required_checks ?? [];

    if (!requiredChecks.includes(input.check_type)) {
      return {
        success: false,
        error: `Check type ${input.check_type} is not in policy required_checks`,
      };
    }

    const payload = createRunCheckInputSchema.parse({
      run_id: input.run_id,
      check_type: input.check_type,
      status: input.status,
      output: input.output ?? null,
      executed_at: new Date().toISOString(),
    });

    const { data: inserted, error } = await supabase
      .from(ORCHESTRATION_TABLES.run_checks)
      .insert({
        run_id: payload.run_id,
        check_type: payload.check_type,
        status: payload.status,
        output: payload.output,
        executed_at: payload.executed_at,
      })
      .select("id")
      .single();

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      checkId: inserted?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * MVP stub: "Executes" required checks by recording them as passed (dry-run).
 * Real execution in Phase 4.
 */
export async function executeRequiredChecksStub(
  supabase: SupabaseClient,
  runId: string
): Promise<{ success: boolean; checkIds: string[]; error?: string }> {
  const run = await getOrchestrationRun(supabase, runId);
  if (!run) {
    return { success: false, error: "Run not found", checkIds: [] };
  }

  const policySnapshot = run.system_policy_snapshot as {
    required_checks?: RunCheckType[];
  };
  const requiredChecks = policySnapshot?.required_checks ?? [];

  const existingChecks = await getRunChecksByRun(supabase, runId);
  const existingTypes = new Set(existingChecks.map((c) => c.check_type));

  const checkIds: string[] = [];
  for (const checkType of requiredChecks) {
    if (existingTypes.has(checkType)) continue;

    const result = await recordCheck(supabase, {
      run_id: runId,
      check_type: checkType,
      status: "passed",
      output: `[MVP dry-run] ${checkType} check recorded as passed`,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        checkIds,
      };
    }
    if (result.checkId) checkIds.push(result.checkId);
    existingTypes.add(checkType);
  }

  return {
    success: true,
    checkIds,
  };
}

/** Basic checks runnable against local worktree (lint, unit). */
const BASIC_CHECK_TYPES: RunCheckType[] = ["lint", "unit"];

/** Complex checks delegated to agentic-flow (integration, e2e, security). */
const DELEGATED_CHECK_TYPES: RunCheckType[] = [
  "integration",
  "e2e",
  "security",
  "dependency",
  "policy",
];

/**
 * Executes required checks for a run.
 * Hybrid: basic checks (lint, unit) direct against worktree when available;
 * complex checks (integration, e2e, security) delegated to agentic-flow.
 * MVP: Uses stub when worktree/agentic-flow unavailable.
 */
export async function executeRequiredChecks(
  supabase: SupabaseClient,
  runId: string
): Promise<{ success: boolean; checkIds: string[]; error?: string }> {
  // TODO O4: When worktree available, run basic checks (lint, unit) via spawn.
  // TODO O4: When agentic-flow available, delegate complex checks via API.
  // For now: stub records all as passed.
  return executeRequiredChecksStub(supabase, runId);
}
