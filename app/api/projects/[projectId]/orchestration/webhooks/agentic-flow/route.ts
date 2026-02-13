import { NextRequest } from "next/server";
import { json } from "@/lib/api/response-helpers";

/**
 * Webhook receiver for agentic-flow callbacks.
 * MVP stub: Returns 202 Accepted without processing.
 * Phase 4: Will process status updates, commit notifications, etc.
 */
export async function POST(_request: NextRequest) {
  // Stub: accept and acknowledge without processing
  return json(
    { received: true, message: "Webhook received (MVP stub - no processing)" },
    202
  );
}
