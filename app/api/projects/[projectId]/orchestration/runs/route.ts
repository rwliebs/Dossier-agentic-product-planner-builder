import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createRun } from "@/lib/orchestration";
import {
  listOrchestrationRunsByProject,
} from "@/lib/db/queries/orchestration";
import { json, validationError, notFoundError, internalError } from "@/lib/api/response-helpers";
import { createRunRequestSchema } from "@/lib/validation/request-schema";
import { zodErrorDetails } from "@/lib/validation/zod-details";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const db = getDb();

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") as "workflow" | "card" | null;
    const status = searchParams.get("status");
    const limit = searchParams.get("limit");
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const runs = await listOrchestrationRunsByProject(db, projectId, {
      scope: scope ?? undefined,
      status: status ?? undefined,
      limit: limitNum,
    });

    return json({ runs });
  } catch (err) {
    console.error("GET orchestration runs error:", err);
    return internalError();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const rawBody = await request.json();
    const parsed = createRunRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return validationError("Invalid request body", zodErrorDetails(parsed.error));
    }

    const db = getDb();
    const { scope, workflow_id, card_id, trigger_type, initiated_by, repo_url, base_branch, run_input_snapshot, worktree_root } = parsed.data;
    const result = await createRun(db, {
      project_id: projectId,
      scope,
      workflow_id: workflow_id ?? null,
      card_id: card_id ?? null,
      trigger_type: trigger_type ?? "manual",
      initiated_by,
      repo_url,
      base_branch,
      run_input_snapshot,
      worktree_root: worktree_root ?? null,
    });

    if (!result.success) {
      if (result.validationErrors && result.validationErrors.length > 0) {
        return validationError(result.error ?? "Validation failed", {
          validation: result.validationErrors,
        });
      }
      if (result.error?.includes("not found")) {
        return notFoundError(result.error);
      }
      return validationError(result.error ?? "Failed to create run");
    }

    return json({ runId: result.runId }, 201);
  } catch (err) {
    console.error("POST orchestration run error:", err);
    return internalError();
  }
}
