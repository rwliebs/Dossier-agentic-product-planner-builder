import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { triggerBuild } from "@/lib/orchestration/trigger-build";
import { json, validationError, notFoundError, internalError } from "@/lib/api/response-helpers";
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
      if (result.error?.includes("not found")) {
        return notFoundError(result.error);
      }
      if (result.validationErrors && result.validationErrors.length > 0) {
        return validationError(result.error ?? "Build failed", {
          validation: result.validationErrors,
        });
      }
      return validationError(result.error ?? "Build failed");
    }

    return json(
      {
        runId: result.runId,
        assignmentIds: result.assignmentIds,
      },
      202
    );
  } catch (err) {
    console.error("POST orchestration build error:", err);
    return internalError();
  }
}
