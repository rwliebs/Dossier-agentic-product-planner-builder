/**
 * Run creation with immutable snapshot capture.
 * Validates policy and run input before persisting.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { createOrchestrationRunInputSchema } from "@/lib/schemas/slice-c";
import { getSystemPolicyProfileByProject } from "@/lib/supabase/queries/orchestration";
import {
  getCardIdsByWorkflow,
  getCardPlannedFiles,
} from "@/lib/supabase/queries";
import {
  validateRunInputAgainstPolicy,
  validateScopeAgainstPolicy,
} from "./run-validation";

export interface CreateRunInput {
  project_id: string;
  scope: "workflow" | "card";
  workflow_id?: string | null;
  card_id?: string | null;
  trigger_type: "card" | "workflow" | "manual";
  initiated_by: string;
  repo_url: string;
  base_branch: string;
  run_input_snapshot: Record<string, unknown>;
  worktree_root?: string | null;
}

export interface CreateRunResult {
  success: boolean;
  runId?: string;
  error?: string;
  validationErrors?: string[];
}

/**
 * Creates an OrchestrationRun with immutable system_policy_snapshot and run_input_snapshot.
 * Validates run input against active system policy before insert.
 */
export async function createRun(
  db: DbAdapter,
  input: CreateRunInput
): Promise<CreateRunResult> {
  try {
    // Fetch active system policy profile
    const policy = await getSystemPolicyProfileByProject(
      db,
      input.project_id
    );

    if (!policy) {
      return {
        success: false,
        error: "No system policy profile found for project",
      };
    }

    // Build immutable snapshots
    const systemPolicySnapshot = {
      required_checks: policy.required_checks,
      protected_paths: policy.protected_paths ?? [],
      forbidden_paths: policy.forbidden_paths ?? [],
      dependency_policy: policy.dependency_policy,
      security_policy: policy.security_policy,
      architecture_policy: policy.architecture_policy,
      approval_policy: policy.approval_policy,
      updated_at: policy.updated_at,
    };

    // Validate run input against policy
    const inputValidation = validateRunInputAgainstPolicy(
      input.run_input_snapshot,
      policy
    );
    if (!inputValidation.valid) {
      return {
        success: false,
        validationErrors: inputValidation.errors,
      };
    }

    // Validate scope against policy
    const scopeValidation = validateScopeAgainstPolicy(
      input.scope,
      policy.required_checks as string[]
    );
    if (!scopeValidation.valid) {
      return {
        success: false,
        validationErrors: scopeValidation.errors,
      };
    }

    // Validate approved planned files: build requires ≥1 approved planned file per targeted card
    const targetedCardIds =
      input.scope === "card" && input.card_id
        ? [input.card_id]
        : input.scope === "workflow" && input.workflow_id
          ? await getCardIdsByWorkflow(db, input.workflow_id)
          : [];

    for (const cardId of targetedCardIds) {
      const plannedFiles = await getCardPlannedFiles(db, cardId);
      const hasApproved = plannedFiles.some(
        (f) => (f as { status?: string }).status === "approved"
      );
      if (!hasApproved) {
        return {
          success: false,
          validationErrors: [
            `Card ${cardId} has no approved planned files. Build requires at least one approved planned file per targeted card.`,
          ],
        };
      }
    }

    // Parse and validate run payload (create schema omits id - DB generates)
    const runPayload = createOrchestrationRunInputSchema.parse({
      project_id: input.project_id,
      scope: input.scope,
      workflow_id: input.workflow_id ?? null,
      card_id: input.card_id ?? null,
      trigger_type: input.trigger_type,
      status: "queued",
      initiated_by: input.initiated_by,
      repo_url: input.repo_url,
      base_branch: input.base_branch,
      system_policy_profile_id: policy.id,
      system_policy_snapshot: systemPolicySnapshot,
      run_input_snapshot: input.run_input_snapshot,
      worktree_root: input.worktree_root ?? null,
    });

    const inserted = await db.insertOrchestrationRun({
      project_id: runPayload.project_id,
      scope: runPayload.scope,
      workflow_id: runPayload.workflow_id,
      card_id: runPayload.card_id,
      trigger_type: runPayload.trigger_type,
      status: runPayload.status,
      initiated_by: runPayload.initiated_by,
      repo_url: runPayload.repo_url,
      base_branch: runPayload.base_branch,
      system_policy_profile_id: runPayload.system_policy_profile_id,
      system_policy_snapshot: runPayload.system_policy_snapshot,
      run_input_snapshot: runPayload.run_input_snapshot,
      worktree_root: runPayload.worktree_root,
    });

    return {
      success: true,
      runId: inserted?.id as string,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}
