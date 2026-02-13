/**
 * Card-to-agent assignment creation with path constraints validation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createCardAssignmentInputSchema } from "@/lib/schemas/slice-c";
import {
  getOrchestrationRun,
  getSystemPolicyProfileByProject,
  ORCHESTRATION_TABLES,
} from "@/lib/supabase/queries/orchestration";

export interface CreateAssignmentInput {
  run_id: string;
  card_id: string;
  agent_role: "planner" | "coder" | "reviewer" | "integrator" | "tester";
  agent_profile: string;
  feature_branch: string;
  worktree_path?: string | null;
  allowed_paths: string[];
  forbidden_paths?: string[] | null;
  assignment_input_snapshot: Record<string, unknown>;
}

export interface CreateAssignmentResult {
  success: boolean;
  assignmentId?: string;
  error?: string;
  validationErrors?: string[];
}

/**
 * Creates a CardAssignment for a run.
 * Validates:
 * - Run exists
 * - feature_branch != project default_branch
 * - allowed_paths non-empty
 * - allowed_paths/forbidden_paths do not violate system policy
 */
export async function createAssignment(
  supabase: SupabaseClient,
  input: CreateAssignmentInput
): Promise<CreateAssignmentResult> {
  try {
    // Fetch run to get project and base branch
    const run = await getOrchestrationRun(supabase, input.run_id);
    if (!run) {
      return {
        success: false,
        error: "Orchestration run not found",
      };
    }

    // Fetch project for default_branch check
    const { data: project } = await supabase
      .from("projects")
      .select("default_branch")
      .eq("id", run.project_id)
      .maybeSingle();

    const defaultBranch = project?.default_branch ?? "main";

    // feature_branch must not equal default_branch
    if (input.feature_branch === defaultBranch) {
      return {
        success: false,
        validationErrors: [
          `feature_branch cannot equal project default_branch (${defaultBranch})`,
        ],
      };
    }

    // allowed_paths must be non-empty
    if (!input.allowed_paths || input.allowed_paths.length === 0) {
      return {
        success: false,
        validationErrors: ["allowed_paths must be non-empty"],
      };
    }

    // Validate against system policy snapshot from run
    const policySnapshot = run.system_policy_snapshot as {
      forbidden_paths?: string[];
    };
    const policyForbidden = policySnapshot?.forbidden_paths ?? [];
    for (const path of input.allowed_paths) {
      for (const forbidden of policyForbidden) {
        if (path.includes(forbidden) || path === forbidden) {
          return {
            success: false,
            validationErrors: [
              `allowed_paths cannot include forbidden path from policy: ${forbidden}`,
            ],
          };
        }
      }
    }

    const payload = createCardAssignmentInputSchema.parse({
      run_id: input.run_id,
      card_id: input.card_id,
      agent_role: input.agent_role,
      agent_profile: input.agent_profile,
      feature_branch: input.feature_branch,
      worktree_path: input.worktree_path ?? null,
      allowed_paths: input.allowed_paths,
      forbidden_paths: input.forbidden_paths ?? null,
      assignment_input_snapshot: input.assignment_input_snapshot,
      status: "queued",
    });

    const { data: inserted, error } = await supabase
      .from(ORCHESTRATION_TABLES.card_assignments)
      .insert({
        run_id: payload.run_id,
        card_id: payload.card_id,
        agent_role: payload.agent_role,
        agent_profile: payload.agent_profile,
        feature_branch: payload.feature_branch,
        worktree_path: payload.worktree_path,
        allowed_paths: payload.allowed_paths,
        forbidden_paths: payload.forbidden_paths,
        assignment_input_snapshot: payload.assignment_input_snapshot,
        status: payload.status,
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
      assignmentId: inserted?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}
