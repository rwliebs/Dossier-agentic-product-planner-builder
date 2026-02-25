import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  getProject,
  getPlanningActionsByProject,
  getPlanningActionsByIdempotencyKey,
  incrementProjectActionSequence,
} from "@/lib/db/queries";
import { pipelineApply } from "@/lib/db/mutations";
import {
  json,
  validationError,
  notFoundError,
  actionRejectedError,
  internalError,
} from "@/lib/api/response-helpers";
import { submitActionsSchema } from "@/lib/validation/request-schema";
import { zodErrorDetails } from "@/lib/validation/zod-details";

type RouteParams = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const db = getDb();

    const project = await getProject(db, projectId);
    if (!project) {
      return notFoundError("Project not found");
    }

    const actions = await getPlanningActionsByProject(db, projectId);
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
      return validationError("Invalid request body", zodErrorDetails(parsed.error));
    }

    const db = getDb();
    const project = await getProject(db, projectId);

    if (!project) {
      return notFoundError("Project not found");
    }

    const idempotencyKey = (body as { idempotency_key?: string }).idempotency_key as
      | string
      | undefined;
    const expectedSequence = (body as { expected_sequence?: number }).expected_sequence as
      | number
      | undefined;

    if (expectedSequence !== undefined) {
      const currentSeq = (project as { action_sequence?: number }).action_sequence ?? 0;
      if (currentSeq !== expectedSequence) {
        return json(
          {
            error: "Concurrent modification",
            message: `Expected action_sequence ${expectedSequence}, got ${currentSeq}`,
            current_sequence: currentSeq,
          },
          409
        );
      }
    }

    if (idempotencyKey) {
      try {
        const existing = await getPlanningActionsByIdempotencyKey(
          db,
          projectId,
          idempotencyKey
        );
        if (existing.length > 0) {
          return json(
            {
              applied: existing.filter((r) => r.validation_status === "accepted").length,
              results: existing.map((r) => ({
                id: r.id,
                action_type: r.action_type,
                validation_status: r.validation_status,
                rejection_reason: r.rejection_reason,
                applied_at: r.applied_at,
              })),
              idempotent: true,
            },
            200
          );
        }
      } catch {
        // idempotency_key column may not exist yet; proceed without idempotency
      }
    }

    const result = await pipelineApply(db, projectId, parsed.data.actions, {
      idempotencyKey,
    });

    if (result.failedAt !== undefined) {
      const failed = result.results[result.failedAt];
      return actionRejectedError(
        result.rejectionReason ?? "Action rejected",
        { [failed?.action_type ?? "unknown"]: [result.rejectionReason ?? "Unknown"] }
      );
    }

    if (expectedSequence !== undefined) {
      try {
        const newSeq = await incrementProjectActionSequence(
          db,
          projectId,
          expectedSequence
        );
        if (newSeq === null) {
          return json(
            {
              error: "Concurrent modification",
              message: "Sequence increment failed; another client may have applied",
            },
            409
          );
        }
        return json(
          { applied: result.applied, results: result.results, action_sequence: newSeq },
          201
        );
      } catch {
        // action_sequence column may not exist; return without it
      }
    }

    return json({ applied: result.applied, results: result.results }, 201);
  } catch (err) {
    console.error("POST /api/projects/[projectId]/actions error:", err);
    return internalError();
  }
}
