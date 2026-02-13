import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePullRequestCandidate } from "@/lib/orchestration";
import { getPullRequestCandidate } from "@/lib/supabase/queries/orchestration";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; prId: string }> }
) {
  try {
    const { prId } = await params;
    const supabase = await createClient();

    const pr = await getPullRequestCandidate(supabase, prId);
    if (!pr) {
      return notFoundError("Pull request candidate not found");
    }

    return json({ pullRequest: pr });
  } catch (err) {
    console.error("GET pull request candidate error:", err);
    return internalError();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; prId: string }> }
) {
  try {
    const { prId } = await params;
    const body = await request.json();
    const { status, pr_url } = body;

    if (!status) {
      return validationError("Missing required field: status");
    }

    const supabase = await createClient();
    const existing = await getPullRequestCandidate(supabase, prId);
    if (!existing) {
      return notFoundError("Pull request candidate not found");
    }

    const result = await resolvePullRequestCandidate(supabase, {
      pr_candidate_id: prId,
      status,
      pr_url: pr_url ?? null,
    });

    if (!result.success) {
      return validationError(result.error ?? "Failed to update PR candidate");
    }

    const updated = await getPullRequestCandidate(supabase, prId);
    return json({ pullRequest: updated });
  } catch (err) {
    console.error("PATCH pull request candidate error:", err);
    return internalError();
  }
}
