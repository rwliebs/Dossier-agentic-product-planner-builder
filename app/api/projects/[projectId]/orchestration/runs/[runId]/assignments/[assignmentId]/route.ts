import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCardAssignment } from "@/lib/supabase/queries/orchestration";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; runId: string; assignmentId: string }>;
  }
) {
  try {
    const { assignmentId } = await params;
    const supabase = await createClient();

    const assignment = await getCardAssignment(supabase, assignmentId);
    if (!assignment) {
      return notFoundError("Card assignment not found");
    }

    return json({ assignment });
  } catch (err) {
    console.error("GET card assignment error:", err);
    return internalError();
  }
}
