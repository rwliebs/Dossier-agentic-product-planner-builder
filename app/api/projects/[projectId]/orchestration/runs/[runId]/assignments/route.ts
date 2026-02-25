import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createAssignment } from "@/lib/orchestration";
import {
  getOrchestrationRun,
  getCardAssignmentsByRun,
} from "@/lib/db/queries/orchestration";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";
import { createAssignmentRequestSchema } from "@/lib/validation/request-schema";
import { zodErrorDetails } from "@/lib/validation/zod-details";

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
    const rawBody = await request.json();
    const parsed = createAssignmentRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return validationError("Invalid request body", zodErrorDetails(parsed.error));
    }

    const db = getDb();
    const run = await getOrchestrationRun(db, runId);
    if (!run) {
      return notFoundError("Orchestration run not found");
    }

    const { card_id, agent_role, agent_profile, feature_branch, worktree_path, allowed_paths, forbidden_paths, assignment_input_snapshot } = parsed.data;
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
