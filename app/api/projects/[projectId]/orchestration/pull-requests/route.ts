import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createPullRequestCandidate } from "@/lib/orchestration";
import { json, validationError, internalError } from "@/lib/api/response-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("run_id");

    if (!runId) {
      return validationError("run_id query parameter is required");
    }

    const db = getDb();
    const { getPullRequestCandidateByRun } = await import(
      "@/lib/db/queries/orchestration"
    );
    const pr = await getPullRequestCandidateByRun(db, runId);

    return json({ pullRequest: pr });
  } catch (err) {
    console.error("GET pull request candidate error:", err);
    return internalError();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const body = await request.json();
    const { run_id, base_branch, head_branch, title, description } = body;

    if (!run_id || !base_branch || !head_branch || !title || !description) {
      return validationError(
        "Missing required fields: run_id, base_branch, head_branch, title, description"
      );
    }

    const db = getDb();
    const result = await createPullRequestCandidate(db, {
      run_id,
      base_branch,
      head_branch,
      title,
      description,
    });

    if (!result.success) {
      if (result.validationErrors && result.validationErrors.length > 0) {
        return validationError(result.error ?? "Validation failed", {
          validation: result.validationErrors,
        });
      }
      return validationError(
        result.error ?? "Failed to create pull request candidate"
      );
    }

    return json({ prCandidateId: result.prCandidateId }, 201);
  } catch (err) {
    console.error("POST pull request candidate error:", err);
    return internalError();
  }
}
