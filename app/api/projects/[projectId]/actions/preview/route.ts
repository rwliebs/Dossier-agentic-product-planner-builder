/**
 * POST /api/projects/[projectId]/actions/preview
 * Dry-run: returns delta without writing to DB.
 * REMAINING_WORK_PLAN §2 Task 6c
 */

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getProject } from "@/lib/db/queries";
import { fetchMapSnapshot } from "@/lib/db/map-snapshot";
import { previewActionBatch } from "@/lib/actions/preview-action";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { submitActionsSchema } from "@/lib/validation/request-schema";
import { zodErrorDetails } from "@/lib/validation/zod-details";
import type { PlanningAction } from "@/lib/schemas/slice-a";

type RouteParams = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = submitActionsSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Invalid request body", zodErrorDetails(parsed.error));
    }

    const db = getDb();
    const project = await getProject(db, projectId);

    if (!project) {
      return notFoundError("Project not found");
    }

    const state = await fetchMapSnapshot(db, projectId);
    if (!state) {
      return notFoundError("Project map not found");
    }

    const actions: PlanningAction[] = parsed.data.actions.map((a) => ({
      id: a.id ?? crypto.randomUUID(),
      project_id: projectId,
      action_type: a.action_type,
      target_ref: a.target_ref ?? {},
      payload: a.payload ?? {},
    }));

    const previews = previewActionBatch(actions, state);

    if (!previews) {
      return json(
        {
          success: false,
          error: "One or more actions failed to preview",
          previews: [],
        },
        400
      );
    }

    return json({
      success: true,
      previews,
      summary: previews.map((p) => p.summary).filter(Boolean),
    });
  } catch (err) {
    console.error("POST /api/projects/[projectId]/actions/preview error:", err);
    return internalError();
  }
}
