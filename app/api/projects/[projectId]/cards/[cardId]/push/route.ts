/**
 * POST /api/projects/[projectId]/cards/[cardId]/push
 * Pushes this card's feature branch from the local clone to GitHub.
 * MVP: one click to get code onto GitHub so the user can open a PR there.
 */

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getProject, verifyCardInProject } from "@/lib/db/queries";
import {
  listOrchestrationRunsByProject,
  getCardAssignmentsByRun,
} from "@/lib/db/queries/orchestration";
import { pushBranch } from "@/lib/orchestration/repo-manager";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string }>;
};

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const project = await getProject(db, projectId);
    const repoUrl = (project as { repo_url?: string | null })?.repo_url ?? null;
    if (!repoUrl || repoUrl.includes("placeholder")) {
      return json(
        { error: "Connect a repository in project settings to push." },
        400
      );
    }

    const runs = await listOrchestrationRunsByProject(db, projectId, {
      limit: 20,
    });

    for (const run of runs) {
      const worktreeRoot = (run as { worktree_root?: string | null }).worktree_root;
      if (!worktreeRoot) continue;

      const assignments = await getCardAssignmentsByRun(db, (run as { id: string }).id);
      const assignment = assignments.find(
        (a) =>
          (a as { card_id: string }).card_id === cardId &&
          (a as { status?: string }).status === "completed" &&
          (a as { worktree_path?: string | null }).worktree_path
      );

      if (!assignment) continue;

      const featureBranch = (assignment as { feature_branch: string }).feature_branch;
      if (!featureBranch) continue;

      const result = pushBranch(projectId, featureBranch, repoUrl);
      if (result.success) {
        return json({ success: true, branch: featureBranch });
      }
      return json(
        { error: result.error ?? "Push failed." },
        result.error?.includes("GITHUB_TOKEN") ? 401 : 502
      );
    }

    return json(
      {
        error:
          "No completed build for this card. Run a build and wait for it to complete, then push.",
      },
      409
    );
  } catch (err) {
    console.error("POST push error:", err);
    return internalError();
  }
}
