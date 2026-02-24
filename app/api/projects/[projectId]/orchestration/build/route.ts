import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { triggerBuild } from "@/lib/orchestration/trigger-build";
import { json, internalError, validationError } from "@/lib/api/response-helpers";
import { BUILD_ORCHESTRATOR } from "@/lib/feature-flags";
import { triggerBuildRequestSchema } from "@/lib/validation/request-schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!BUILD_ORCHESTRATOR) {
      return json(
        { error: "Build orchestrator is disabled", message: "Set NEXT_PUBLIC_BUILD_ORCHESTRATOR_ENABLED=true to enable." },
        503
      );
    }
    const { projectId } = await params;
    const rawBody = await request.json().catch(() => ({}));
    const parsed = triggerBuildRequestSchema.safeParse(rawBody);

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
    const { scope, workflow_id, card_id, trigger_type, initiated_by } = parsed.data;
    const result = await triggerBuild(db, {
      project_id: projectId,
      scope,
      workflow_id: workflow_id ?? null,
      card_id: card_id ?? null,
      trigger_type: trigger_type ?? "manual",
      initiated_by,
    });

    if (!result.success) {
      console.warn("[orchestration/build] triggerBuild failed:", result.message ?? result.error, result.validationErrors);
      const outcomeType = result.outcomeType ?? "error";
      const message = result.message ?? result.error ?? "Build failed";
      const details = result.validationErrors && result.validationErrors.length > 0
        ? { validation: result.validationErrors }
        : undefined;

      if (result.error?.includes("not found")) {
        return json(
          {
            error: "not_found",
            message,
            details,
            outcome_type: outcomeType,
          },
          404
        );
      }
      return json(
        {
          error: "validation_failed",
          message,
          details,
          outcome_type: outcomeType,
        },
        400
      );
    }

    return json(
      {
        runId: result.runId,
        assignmentIds: result.assignmentIds,
        message: result.message ?? "Build started",
        outcome_type: result.outcomeType ?? "success",
      },
      202
    );
  } catch (err) {
    console.error("POST orchestration build error:", err);
    return internalError();
  }
}
