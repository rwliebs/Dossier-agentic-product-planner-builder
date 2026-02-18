/**
 * Create pull request candidate for a run.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { createPullRequestCandidateInputSchema } from "@/lib/schemas/slice-c";
import {
  getOrchestrationRun,
  getPullRequestCandidateByRun,
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
  db: DbAdapter,
  input: CreatePullRequestCandidateInput
): Promise<CreatePullRequestCandidateResult> {
  try {
    const run = await getOrchestrationRun(db, input.run_id);
    if (!run) {
      return {
        success: false,
        error: "Orchestration run not found",
      };
    }

    const existing = await getPullRequestCandidateByRun(db, input.run_id);
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

    const inserted = await db.insertPullRequestCandidate({
      run_id: payload.run_id,
      base_branch: payload.base_branch,
      head_branch: payload.head_branch,
      title: payload.title,
      description: payload.description,
      status: payload.status,
    });

    return {
      success: true,
      prCandidateId: inserted?.id as string,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      error: message,
    };
  }
}
