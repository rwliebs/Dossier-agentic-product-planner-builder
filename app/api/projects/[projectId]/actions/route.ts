import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProject, getPlanningActionsByProject } from "@/lib/supabase/queries";
import { applyAction } from "@/lib/supabase/mutations";
import {
  json,
  validationError,
  notFoundError,
  actionRejectedError,
  internalError,
} from "@/lib/api/response-helpers";
import { submitActionsSchema } from "@/lib/validation/request-schema";
import { TABLES } from "@/lib/supabase/queries";

type RouteParams = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createClient();

    const project = await getProject(supabase, projectId);
    if (!project) {
      return notFoundError("Project not found");
    }

    const actions = await getPlanningActionsByProject(supabase, projectId);
    return json(actions);
  } catch (err) {
    console.error("GET /api/projects/[projectId]/actions error:", err);
    return internalError();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = submitActionsSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      parsed.error.errors.forEach((e) => {
        const path = e.path.join(".");
        if (!details[path]) details[path] = [];
        details[path].push(e.message);
      });
      return validationError("Invalid request body", details);
    }

    const supabase = await createClient();
    const project = await getProject(supabase, projectId);

    if (!project) {
      return notFoundError("Project not found");
    }

    const results: Array<{
      id: string;
      action_type: string;
      validation_status: "accepted" | "rejected";
      rejection_reason?: string;
      applied_at?: string;
    }> = [];

    for (const action of parsed.data.actions) {
      const actionId = action.id ?? crypto.randomUUID();
      const actionRecord = {
        ...action,
        id: actionId,
        project_id: projectId,
      };

      const result = await applyAction(supabase, projectId, actionRecord);

      const now = new Date().toISOString();
      const validationStatus = result.applied ? "accepted" : "rejected";

      const { error: insertError } = await supabase.from(TABLES.planning_actions).insert({
        id: actionId,
        project_id: projectId,
        action_type: action.action_type,
        target_ref: action.target_ref ?? {},
        payload: action.payload ?? {},
        validation_status: validationStatus,
        rejection_reason: result.rejectionReason ?? null,
        applied_at: result.applied ? now : null,
      });

      if (insertError) {
        console.error("Failed to persist action record:", insertError);
        return internalError("Failed to persist action");
      }

      results.push({
        id: actionId,
        action_type: action.action_type,
        validation_status: validationStatus,
        rejection_reason: result.rejectionReason,
        applied_at: result.applied ? now : undefined,
      });

      if (!result.applied) {
        return actionRejectedError(
          result.rejectionReason ?? "Action rejected",
          { [action.action_type]: [result.rejectionReason ?? "Unknown"] }
        );
      }
    }

    return json({ applied: results.length, results }, 201);
  } catch (err) {
    console.error("POST /api/projects/[projectId]/actions error:", err);
    return internalError();
  }
}
