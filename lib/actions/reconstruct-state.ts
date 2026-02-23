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
import { getProject, getPlanningActionsByProject } from "@/lib/db/queries";
import { fetchMapSnapshot } from "@/lib/db/map-snapshot";

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
  project: {
    id: string;
    name: string;
    description?: string | null;
    customer_personas?: string | null;
    tech_stack?: string | null;
    deployment?: string | null;
    design_inspiration?: string | null;
    repo_url?: string | null;
    default_branch?: string;
  },
  actions: PlanningAction[]
): ReconstructResult {
  const state = createEmptyPlanningState({
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    customer_personas: project.customer_personas ?? null,
    tech_stack: project.tech_stack ?? null,
    deployment: project.deployment ?? null,
    design_inspiration: project.design_inspiration ?? null,
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
  const projectIdValue = (project as { id?: unknown }).id;
  const projectName = (project as { name?: unknown }).name;
  if (typeof projectIdValue !== "string" || typeof projectName !== "string") {
    return null;
  }

  const allActions = await getPlanningActionsByProject(db, projectId, 500);
  const accepted = allActions
    .filter((a) => (a as { validation_status?: string }).validation_status === "accepted")
    .sort(
      (a, b) =>
        new Date((a as { created_at?: string }).created_at ?? 0).getTime() -
        new Date((b as { created_at?: string }).created_at ?? 0).getTime()
    ) as PlanningAction[];

  return reconstructStateFromActions(
    {
      id: projectIdValue,
      name: projectName,
      description:
        typeof (project as { description?: unknown }).description === "string" ||
        (project as { description?: unknown }).description === null
          ? ((project as { description?: string | null }).description ?? null)
          : null,
      customer_personas:
        typeof (project as { customer_personas?: unknown }).customer_personas === "string" ||
        (project as { customer_personas?: unknown }).customer_personas === null
          ? ((project as { customer_personas?: string | null }).customer_personas ?? null)
          : null,
      tech_stack:
        typeof (project as { tech_stack?: unknown }).tech_stack === "string" ||
        (project as { tech_stack?: unknown }).tech_stack === null
          ? ((project as { tech_stack?: string | null }).tech_stack ?? null)
          : null,
      deployment:
        typeof (project as { deployment?: unknown }).deployment === "string" ||
        (project as { deployment?: unknown }).deployment === null
          ? ((project as { deployment?: string | null }).deployment ?? null)
          : null,
      design_inspiration:
        typeof (project as { design_inspiration?: unknown }).design_inspiration === "string" ||
        (project as { design_inspiration?: unknown }).design_inspiration === null
          ? ((project as { design_inspiration?: string | null }).design_inspiration ?? null)
          : null,
      repo_url:
        typeof (project as { repo_url?: unknown }).repo_url === "string" ||
        (project as { repo_url?: unknown }).repo_url === null
          ? ((project as { repo_url?: string | null }).repo_url ?? null)
          : null,
      default_branch:
        typeof (project as { default_branch?: unknown }).default_branch === "string"
          ? (project as { default_branch?: string }).default_branch
          : "main",
    },
    accepted
  );
}

export interface DriftReport {
  hasDrift: boolean;
  workflowCountDiff?: number;
  activityCountDiff?: number;
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
  const cardDiff = reconstructed.cards.size - actual.cards.size;

  if (wfDiff !== 0) details.push(`Workflows: ${wfDiff > 0 ? "+" : ""}${wfDiff}`);
  if (actDiff !== 0) details.push(`Activities: ${actDiff > 0 ? "+" : ""}${actDiff}`);
  if (cardDiff !== 0) details.push(`Cards: ${cardDiff > 0 ? "+" : ""}${cardDiff}`);

  const hasDrift = details.length > 0;

  return {
    hasDrift,
    workflowCountDiff: wfDiff !== 0 ? wfDiff : undefined,
    activityCountDiff: actDiff !== 0 ? actDiff : undefined,
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
