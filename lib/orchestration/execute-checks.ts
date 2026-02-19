/**
 * Check execution - O4: Real lint/unit checks; stub for complex checks.
 * Basic checks (lint, unit) run locally via spawn.
 * Complex checks (integration, e2e, security, dependency, policy) remain stubbed.
 */

import { spawn } from "child_process";
import { join } from "path";
import type { DbAdapter } from "@/lib/db/adapter";
import { createRunCheckInputSchema } from "@/lib/schemas/slice-c";
import {
  getOrchestrationRun,
  getRunChecksByRun,
} from "@/lib/db/queries/orchestration";

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
  db: DbAdapter,
  input: RecordCheckInput
): Promise<RecordCheckResult> {
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

    const inserted = await db.insertRunCheck({
      run_id: payload.run_id,
      check_type: payload.check_type,
      status: payload.status,
      output: payload.output,
      executed_at: payload.executed_at,
    });

    return {
      success: true,
      checkId: inserted?.id as string,
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
  db: DbAdapter,
  runId: string
): Promise<{ success: boolean; checkIds: string[]; error?: string }> {
  const run = await getOrchestrationRun(db, runId);
  if (!run) {
    return { success: false, error: "Run not found", checkIds: [] };
  }

  const policySnapshot = run.system_policy_snapshot as {
    required_checks?: RunCheckType[];
  };
  const requiredChecks = policySnapshot?.required_checks ?? [];

  const existingChecks = await getRunChecksByRun(db, runId);
  const existingTypes = new Set(existingChecks.map((c) => c.check_type));

  const checkIds: string[] = [];
  for (const checkType of requiredChecks) {
    if (existingTypes.has(checkType)) continue;

    const result = await recordCheck(db, {
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

/** Complex checks: stubbed for MVP (integration, e2e, security, dependency, policy). */
const STUBBED_CHECK_TYPES: RunCheckType[] = [
  "integration",
  "e2e",
  "security",
  "dependency",
  "policy",
];

/** Detect package manager from lockfile. */
function detectPackageManager(worktreePath: string): "pnpm" | "npm" {
  try {
    const fs = require("fs");
    if (fs.existsSync(join(worktreePath, "pnpm-lock.yaml"))) return "pnpm";
  } catch {
    // ignore
  }
  return "npm";
}

/** Run a local command and return status + output. */
function runCommand(
  worktreePath: string,
  script: string
): Promise<{ status: CheckStatus; output: string }> {
  return new Promise((resolve) => {
    const pm = detectPackageManager(worktreePath);
    const cmd = pm === "pnpm" ? "pnpm" : "npm";
    const args = ["run", script];
    const proc = spawn(cmd, args, {
      cwd: worktreePath,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      const output = [stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)";
      resolve({
        status: code === 0 ? "passed" : "failed",
        output: output.slice(0, 2000),
      });
    });
    proc.on("error", (err) => {
      resolve({
        status: "failed",
        output: err.message?.slice(0, 500) ?? "Spawn error",
      });
    });
  });
}

/** Map check type to npm script name. */
const CHECK_SCRIPT: Partial<Record<RunCheckType, string>> = {
  lint: "lint",
  unit: "test",
};

/**
 * O4: Executes required checks for a run.
 * Basic checks (lint, unit): run locally when worktree available.
 * Complex checks: stub records as passed.
 */
export async function executeRequiredChecks(
  db: DbAdapter,
  runId: string
): Promise<{ success: boolean; checkIds: string[]; error?: string }> {
  const run = await getOrchestrationRun(db, runId);
  if (!run) {
    return { success: false, error: "Run not found", checkIds: [] };
  }

  const policySnapshot = run.system_policy_snapshot as {
    required_checks?: RunCheckType[];
  };
  const requiredChecks = policySnapshot?.required_checks ?? [];
  const worktreePath = (run.worktree_root as string | null) ?? process.cwd();

  const existingChecks = await getRunChecksByRun(db, runId);
  const existingTypes = new Set(existingChecks.map((c) => c.check_type as string));
  const checkIds: string[] = [];

  for (const checkType of requiredChecks) {
    if (existingTypes.has(checkType)) continue;

    let status: CheckStatus = "passed";
    let output = `[MVP dry-run] ${checkType} check recorded as passed`;

    if (BASIC_CHECK_TYPES.includes(checkType)) {
      const script = CHECK_SCRIPT[checkType];
      if (script) {
        try {
          const result = await runCommand(worktreePath, script);
          status = result.status;
          output = result.output;
        } catch (err) {
          status = "failed";
          output = err instanceof Error ? err.message : "Check execution error";
        }
      }
    }

    const recordResult = await recordCheck(db, {
      run_id: runId,
      check_type: checkType,
      status,
      output,
    });

    if (!recordResult.success) {
      return {
        success: false,
        error: recordResult.error,
        checkIds,
      };
    }
    if (recordResult.checkId) checkIds.push(recordResult.checkId);
    existingTypes.add(checkType);
  }

  return {
    success: true,
    checkIds,
  };
}
