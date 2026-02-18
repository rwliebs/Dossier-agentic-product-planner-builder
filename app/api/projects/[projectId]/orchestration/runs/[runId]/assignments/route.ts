import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createAssignment } from "@/lib/orchestration";
import {
  getOrchestrationRun,
  getCardAssignmentsByRun,
} from "@/lib/supabase/queries/orchestration";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { runId } = await params;
    const db = getDb();

    const run = await getOrchestrationRun(db, runId);
    if (!run) {
      return notFoundError("Orchestration run not found");
    }

    const assignments = await getCardAssignmentsByRun(db, runId);
    return json({ assignments });
  } catch (err) {
    console.error("GET run assignments error:", err);
    return internalError();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> }
) {
  try {
    const { runId } = await params;
    const body = await request.json();

    const {
      card_id,
      agent_role,
      agent_profile,
      feature_branch,
      worktree_path,
      allowed_paths,
      forbidden_paths,
      assignment_input_snapshot,
    } = body;

    if (
      !card_id ||
      !agent_role ||
      !agent_profile ||
      !feature_branch ||
      !allowed_paths ||
      !Array.isArray(allowed_paths)
    ) {
      return validationError(
        "Missing required fields: card_id, agent_role, agent_profile, feature_branch, allowed_paths (array)"
      );
    }

    const db = getDb();
    const run = await getOrchestrationRun(db, runId);
    if (!run) {
      return notFoundError("Orchestration run not found");
    }

    const result = await createAssignment(db, {
      run_id: runId,
      card_id,
      agent_role,
      agent_profile,
      feature_branch,
      worktree_path: worktree_path ?? null,
      allowed_paths,
      forbidden_paths: forbidden_paths ?? null,
      assignment_input_snapshot: assignment_input_snapshot ?? {},
    });

    if (!result.success) {
      if (result.validationErrors && result.validationErrors.length > 0) {
        return validationError(result.error ?? "Validation failed", {
          validation: result.validationErrors,
        });
      }
      return validationError(result.error ?? "Failed to create assignment");
    }

    return json({ assignmentId: result.assignmentId }, 201);
  } catch (err) {
    console.error("POST run assignment error:", err);
    return internalError();
  }
}
