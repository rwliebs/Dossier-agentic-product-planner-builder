/**
 * Card query helpers.
 * Implementation deferred to Step 4 (API Layer).
 */
import type { Card } from "@/lib/schemas/slice-a";

export async function getCard(id: string): Promise<Card | null> {
  // TODO: Implement in Step 4 - fetch from Supabase card table
  void id;
  throw new Error("Not implemented");
}

export async function listCardsByStep(stepId: string): Promise<Card[]> {
  // TODO: Implement in Step 4 - fetch cards for step, ordered by priority
  void stepId;
  throw new Error("Not implemented");
}

export async function listCardsByActivity(
  workflowActivityId: string
): Promise<Card[]> {
  // TODO: Implement in Step 4 - fetch cards for activity (including those without step_id)
  void workflowActivityId;
  throw new Error("Not implemented");
}
