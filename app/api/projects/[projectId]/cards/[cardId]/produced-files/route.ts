/**
 * GET /api/projects/[projectId]/cards/[cardId]/produced-files
 * Returns files added or modified by the execution agent for this card.
 * Used to surface produced files on the implementation card for user review.
 */

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { verifyCardInProject } from "@/lib/db/queries";
import {
  listOrchestrationRunsByProject,
  getCardAssignmentsByRun,
} from "@/lib/db/queries/orchestration";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";
import { getChangedFiles, type ChangedFile } from "@/lib/orchestration/repo-reader";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string }>;
};

export interface ProducedFile {
  path: string;
  status: "added" | "modified";
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const runs = await listOrchestrationRunsByProject(db, projectId, {
      limit: 20,
    });

    for (const run of runs) {
      const worktreeRoot = (run as { worktree_root?: string | null }).worktree_root;
      const baseBranch = (run as { base_branch: string }).base_branch;
      if (!worktreeRoot || !baseBranch) continue;

      const assignments = await getCardAssignmentsByRun(db, (run as { id: string }).id);
      const assignment = assignments.find(
        (a) =>
          (a as { card_id: string }).card_id === cardId &&
          (a as { status?: string }).status === "completed" &&
          (a as { worktree_path?: string | null }).worktree_path
      );

      if (!assignment) continue;

      const featureBranch = (assignment as { feature_branch: string }).feature_branch;
      const result = getChangedFiles(worktreeRoot, baseBranch, featureBranch);

      if (!result.success) {
        return json(
          { error: result.error ?? "Failed to read changed files" },
          500
        );
      }

      const files: ProducedFile[] = (result.files ?? [])
        .filter((f: ChangedFile) => f.status === "added" || f.status === "modified")
        .map((f: ChangedFile) => ({ path: f.path, status: f.status }));

      return json(files);
    }

    return json([]);
  } catch (err) {
    console.error("GET produced-files error:", err);
    return internalError();
  }
}
