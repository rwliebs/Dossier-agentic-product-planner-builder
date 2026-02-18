/**
 * Historical snapshots (M6).
 * Append-only to RuVector on status transitions, approval, build completion.
 * Async, never blocks. Include build outcome metadata for GNN learning.
 *
 * @see REMAINING_WORK_PLAN.md §4 M6
 * @see DUAL_LLM_INTEGRATION_STRATEGY §Storage Architecture
 */

import { getRuvectorClient } from "@/lib/ruvector/client";
import { embedText } from "./embedding";

export interface CardSnapshotInput {
  cardId: string;
  projectId: string;
  workflowId?: string | null;
  activityId?: string | null;
  stepId?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  plannedFilesSummary?: string | null;
  eventType: "status_transition" | "approval" | "build_trigger" | "build_completed";
  buildOutcome?: "success" | "failed" | null;
  timestamp?: string;
}

/**
 * Append a card snapshot to RuVector. No-op if RuVector unavailable.
 * Uses namespaced id (snapshot:card:cardId:timestamp) to avoid collision with memory_unit vectors.
 */
export async function appendCardSnapshot(input: CardSnapshotInput): Promise<boolean> {
  const rv = getRuvectorClient();
  if (!rv) return false;

  const parts: string[] = [];
  if (input.title) parts.push(input.title);
  if (input.description) parts.push(input.description);
  if (input.status) parts.push(`status: ${input.status}`);
  if (input.plannedFilesSummary) parts.push(input.plannedFilesSummary);
  if (input.eventType) parts.push(`event: ${input.eventType}`);
  if (input.buildOutcome) parts.push(`outcome: ${input.buildOutcome}`);

  const text = parts.join("\n");
  if (!text.trim()) return false;

  const vec = await embedText(text);
  const ts = input.timestamp ?? new Date().toISOString();
  const id = `snapshot:card:${input.cardId}:${ts.replace(/[:.]/g, "-")}`;

  try {
    await rv.insert({ id, vector: vec });
    return true;
  } catch {
    return false;
  }
}
