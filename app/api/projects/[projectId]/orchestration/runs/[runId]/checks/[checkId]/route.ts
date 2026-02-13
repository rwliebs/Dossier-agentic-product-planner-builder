import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRunCheck } from "@/lib/supabase/queries/orchestration";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";

export async function GET(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectId: string; runId: string; checkId: string }> }
) {
  try {
    const { checkId } = await params;
    const supabase = await createClient();

    const check = await getRunCheck(supabase, checkId);
    if (!check) {
      return notFoundError("Run check not found");
    }

    return json({ check });
  } catch (err) {
    console.error("GET run check error:", err);
    return internalError();
  }
}
