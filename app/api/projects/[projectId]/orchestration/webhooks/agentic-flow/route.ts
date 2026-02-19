import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { processWebhook, type WebhookPayload } from "@/lib/orchestration/process-webhook";
import { json, validationError, internalError } from "@/lib/api/response-helpers";

/**
 * Webhook receiver for agentic-flow callbacks.
 * Handles: execution_started, commit_created, execution_completed, execution_failed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return validationError("Invalid JSON body");
    }

    const { event_type, assignment_id } = body as Partial<WebhookPayload>;
    if (!event_type || !assignment_id) {
      return validationError("Missing required fields: event_type, assignment_id");
    }

    const validEvents = [
      "execution_started",
      "commit_created",
      "execution_completed",
      "execution_failed",
      "execution_blocked",
    ];
    if (!validEvents.includes(event_type)) {
      return validationError(
        `Invalid event_type: ${event_type}. Must be one of: ${validEvents.join(", ")}`
      );
    }

    const db = getDb();
    const result = await processWebhook(db, body as WebhookPayload);

    if (!result.success) {
      return validationError(result.error ?? "Webhook processing failed");
    }

    return json({ received: true, processed: true }, 202);
  } catch (err) {
    console.error("Agentic-flow webhook error:", err);
    return internalError();
  }
}
