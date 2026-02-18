/**
 * Action history reconstruction (REMAINING_WORK_PLAN §2 Task 6e)
 * Replay accepted PlanningActions onto empty state.
 * Drift detection: compare reconstructed state with actual DB state.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import type { PlanningState } from "@/lib/schemas/planning-state";
import { createEmptyPlanningState } from "@/lib/schemas/planning-state";
import { applyAction } from "./apply-action";
import { getProject, getPlanningActionsByProject } from "@/lib/supabase/queries";
import { fetchMapSnapshot } from "@/lib/supabase/map-snapshot";

export interface ReconstructResult {
  success: boolean;
  state: PlanningState;
  appliedCount: number;
  failedAt?: number;
  error?: string;
}

/**
 * Replay accepted PlanningActions onto empty state.
 * Uses payload.id when provided for create operations to ensure deterministic replay.
 */
export function reconstructStateFromActions(
  project: { id: string; name: string; repo_url?: string | null; default_branch?: string },
  actions: PlanningAction[]
): ReconstructResult {
  const state = createEmptyPlanningState({
    id: project.id,
    name: project.name,
    repo_url: project.repo_url ?? null,
    default_branch: project.default_branch ?? "main",
  });

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const validationStatus = (action as PlanningAction & { validation_status?: string })
      .validation_status;
    if (validationStatus === "rejected") continue;

    const result = applyAction(action, state);
    if (!result.success) {
      return {
        success: false,
        state,
        appliedCount: i,
        failedAt: i,
        error: result.error?.message ?? "Action application failed",
      };
    }
    if (result.newState) {
      Object.assign(state, result.newState);
    }
  }

  const appliedCount = actions.filter(
    (a) => (a as PlanningAction & { validation_status?: string }).validation_status !== "rejected"
  ).length;

  return {
    success: true,
    state,
    appliedCount,
  };
}

/**
 * Fetch accepted actions from DB and replay onto empty state.
 */
export async function reconstructStateFromDb(
  db: DbAdapter,
  projectId: string
): Promise<ReconstructResult | null> {
  const project = await getProject(db, projectId);
  if (!project) return null;

  const allActions = await getPlanningActionsByProject(db, projectId, 500);
  const accepted = allActions
    .filter((a) => (a as { validation_status?: string }).validation_status === "accepted")
    .sort(
      (a, b) =>
        new Date((a as { created_at?: string }).created_at ?? 0).getTime() -
        new Date((b as { created_at?: string }).created_at ?? 0).getTime()
    ) as PlanningAction[];

  return reconstructStateFromActions(project, accepted);
}

export interface DriftReport {
  hasDrift: boolean;
  workflowCountDiff?: number;
  activityCountDiff?: number;
  stepCountDiff?: number;
  cardCountDiff?: number;
  details?: string[];
}

/**
 * Compare reconstructed state with actual DB state.
 * Returns drift report if structures differ.
 */
export function detectDrift(
  reconstructed: PlanningState,
  actual: PlanningState
): DriftReport {
  const details: string[] = [];
  const wfDiff = reconstructed.workflows.size - actual.workflows.size;
  const actDiff = reconstructed.activities.size - actual.activities.size;
  const stepDiff = reconstructed.steps.size - actual.steps.size;
  const cardDiff = reconstructed.cards.size - actual.cards.size;

  if (wfDiff !== 0) details.push(`Workflows: ${wfDiff > 0 ? "+" : ""}${wfDiff}`);
  if (actDiff !== 0) details.push(`Activities: ${actDiff > 0 ? "+" : ""}${actDiff}`);
  if (stepDiff !== 0) details.push(`Steps: ${stepDiff > 0 ? "+" : ""}${stepDiff}`);
  if (cardDiff !== 0) details.push(`Cards: ${cardDiff > 0 ? "+" : ""}${cardDiff}`);

  const hasDrift = details.length > 0;

  return {
    hasDrift,
    workflowCountDiff: wfDiff !== 0 ? wfDiff : undefined,
    activityCountDiff: actDiff !== 0 ? actDiff : undefined,
    stepCountDiff: stepDiff !== 0 ? stepDiff : undefined,
    cardCountDiff: cardDiff !== 0 ? cardDiff : undefined,
    details: hasDrift ? details : undefined,
  };
}

/**
 * Reconstruct from DB and detect drift against actual state.
 */
export async function reconstructAndDetectDrift(
  db: DbAdapter,
  projectId: string
): Promise<{ reconstruct: ReconstructResult | null; drift: DriftReport | null }> {
  const actual = await fetchMapSnapshot(db, projectId);
  if (!actual) return { reconstruct: null, drift: null };

  const reconstruct = await reconstructStateFromDb(db, projectId);
  if (!reconstruct?.success) return { reconstruct, drift: null };

  const drift = detectDrift(reconstruct.state, actual);
  return { reconstruct, drift };
}
