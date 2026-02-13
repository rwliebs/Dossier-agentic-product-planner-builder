/**
 * Update pull request candidate status.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { updatePullRequestCandidateStatusSchema } from "@/lib/schemas/slice-c";
import { ORCHESTRATION_TABLES } from "@/lib/supabase/queries/orchestration";

export interface ResolvePullRequestCandidateInput {
  pr_candidate_id: string;
  status: "not_created" | "draft_open" | "open" | "merged" | "closed";
  pr_url?: string | null;
}

export interface ResolvePullRequestCandidateResult {
  success: boolean;
  error?: string;
}

/**
 * Updates a PullRequestCandidate status (e.g. when PR is created or merged).
 */
export async function resolvePullRequestCandidate(
  supabase: SupabaseClient,
  input: ResolvePullRequestCandidateInput
): Promise<ResolvePullRequestCandidateResult> {
  try {
    const payload = updatePullRequestCandidateStatusSchema.parse({
      status: input.status,
      pr_url: input.pr_url ?? null,
    });

    const updateData: Record<string, unknown> = {
      status: payload.status,
      updated_at: new Date().toISOString(),
    };
    if (payload.pr_url !== undefined) {
      updateData.pr_url = payload.pr_url;
    }

    const { error } = await supabase
      .from(ORCHESTRATION_TABLES.pull_request_candidates)
      .update(updateData)
      .eq("id", input.pr_candidate_id);

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
