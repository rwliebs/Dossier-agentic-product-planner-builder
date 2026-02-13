/**
 * Create pull request candidate for a run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPullRequestCandidateInputSchema } from "@/lib/schemas/slice-c";
import {
  getOrchestrationRun,
  getPullRequestCandidateByRun,
  ORCHESTRATION_TABLES,
} from "@/lib/supabase/queries/orchestration";

export interface CreatePullRequestCandidateInput {
  run_id: string;
  base_branch: string;
  head_branch: string;
  title: string;
  description: string;
}

export interface CreatePullRequestCandidateResult {
  success: boolean;
  prCandidateId?: string;
  error?: string;
  validationErrors?: string[];
}

/**
 * Creates a PullRequestCandidate for a run.
 * Only one PR candidate per run (unique constraint).
 */
export async function createPullRequestCandidate(
  supabase: SupabaseClient,
  input: CreatePullRequestCandidateInput
): Promise<CreatePullRequestCandidateResult> {
  try {
    const run = await getOrchestrationRun(supabase, input.run_id);
    if (!run) {
      return {
        success: false,
        error: "Orchestration run not found",
      };
    }

    const existing = await getPullRequestCandidateByRun(supabase, input.run_id);
    if (existing) {
      return {
        success: false,
        validationErrors: ["A pull request candidate already exists for this run"],
      };
    }

    const payload = createPullRequestCandidateInputSchema.parse({
      run_id: input.run_id,
      base_branch: input.base_branch,
      head_branch: input.head_branch,
      title: input.title,
      description: input.description,
      status: "not_created",
    });

    const { data: inserted, error } = await supabase
      .from(ORCHESTRATION_TABLES.pull_request_candidates)
      .insert({
        run_id: payload.run_id,
        base_branch: payload.base_branch,
        head_branch: payload.head_branch,
        title: payload.title,
        description: payload.description,
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
      prCandidateId: inserted?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}
