/**
 * EventLog wiring for orchestration audit and observability.
 * Writes to event_log for planning_action_applied, memory_committed,
 * agent_run_started, checks_executed, approval_requested, pr_created.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createEventLogInputSchema } from "@/lib/schemas/slice-c";
import { ORCHESTRATION_TABLES } from "@/lib/supabase/queries/orchestration";

export type EventType =
  | "planning_action_applied"
  | "memory_committed"
  | "agent_run_started"
  | "checks_executed"
  | "approval_requested"
  | "pr_created"
  | "run_initialized"
  | "assignment_dispatched"
  | "execution_started"
  | "commit_created"
  | "execution_completed"
  | "execution_failed";

export interface LogEventInput {
  project_id: string;
  run_id?: string | null;
  event_type: EventType;
  actor: string;
  payload: Record<string, unknown>;
}

export interface LogEventResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Writes an event to event_log.
 */
export async function logEvent(
  supabase: SupabaseClient,
  input: LogEventInput
): Promise<LogEventResult> {
  try {
    const payload = createEventLogInputSchema.parse({
      project_id: input.project_id,
      run_id: input.run_id ?? null,
      event_type: input.event_type,
      actor: input.actor,
      payload: input.payload,
      created_at: new Date().toISOString(),
    });

    const { data: inserted, error } = await supabase
      .from(ORCHESTRATION_TABLES.event_logs)
      .insert({
        project_id: payload.project_id,
        run_id: payload.run_id,
        event_type: payload.event_type,
        actor: payload.actor,
        payload: payload.payload,
        created_at: payload.created_at,
      })
      .select("id")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      eventId: inserted?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
