import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { resumeBlockedAssignment } from "@/lib/orchestration/resume-blocked";
import { json, internalError, validationError } from "@/lib/api/response-helpers";
import { BUILD_ORCHESTRATOR } from "@/lib/feature-flags";
import { resumeBlockedRequestSchema } from "@/lib/validation/request-schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!BUILD_ORCHESTRATOR) {
      return json(
        {
          error: "Build orchestrator is disabled",
          message: "Set NEXT_PUBLIC_BUILD_ORCHESTRATOR_ENABLED=true to enable.",
        },
        503
      );
    }
    const { projectId } = await params;
    const rawBody = await request.json().catch(() => ({}));
    const parsed = resumeBlockedRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      parsed.error.errors.forEach((e) => {
        const path = e.path.join(".") || "body";
        if (!details[path]) details[path] = [];
        details[path].push(e.message);
      });
      return validationError("Invalid request body", details);
    }

    const db = getDb();
    const { card_id, actor } = parsed.data;
    const result = await resumeBlockedAssignment(db, {
      project_id: projectId,
      card_id,
      actor: actor ?? "user",
    });

    if (!result.success) {
      return json(
        {
          error: result.error,
          message: result.message,
          outcome_type: result.outcomeType ?? "error",
        },
        400
      );
    }

    return json(
      {
        assignmentId: result.assignmentId,
        runId: result.runId,
        message: result.message,
        outcome_type: result.outcomeType ?? "success",
      },
      202
    );
  } catch (err) {
    console.error("POST resume-blocked error:", err);
    return internalError();
  }
}
