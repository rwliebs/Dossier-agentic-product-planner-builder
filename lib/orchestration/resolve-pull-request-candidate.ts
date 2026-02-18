/**
 * Update pull request candidate status.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { updatePullRequestCandidateStatusSchema } from "@/lib/schemas/slice-c";

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
  db: DbAdapter,
  input: ResolvePullRequestCandidateInput
): Promise<ResolvePullRequestCandidateResult> {
  try {
    const payload = updatePullRequestCandidateStatusSchema.parse({
      status: input.status,
      pr_url: input.pr_url ?? null,
    });

    const updates: Record<string, unknown> = { status: payload.status };
    if (payload.pr_url !== undefined) {
      updates.pr_url = payload.pr_url;
    }

    await db.updatePullRequestCandidate(input.pr_candidate_id, updates);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}
