import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { dispatchAssignment } from "@/lib/orchestration/dispatch";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; runId: string; assignmentId: string }>;
  }
) {
  try {
    const { assignmentId } = await params;
    const body = await request.json().catch(() => ({}));
    const actor = (body.actor as string) ?? "system";

    const db = getDb();
    const result = await dispatchAssignment(db, {
      assignment_id: assignmentId,
      actor,
    });

    if (!result.success) {
      if (result.error?.includes("not found")) {
        return notFoundError(result.error);
      }
      if (
        result.error?.includes("not queued") ||
        result.error?.includes("no approved")
      ) {
        return validationError(result.error ?? "Cannot dispatch");
      }
      return validationError(result.error ?? "Dispatch failed");
    }

    return json(
      {
        executionId: result.executionId,
        agentExecutionId: result.agentExecutionId,
      },
      202
    );
  } catch (err) {
    console.error("POST dispatch assignment error:", err);
    return internalError();
  }
}
