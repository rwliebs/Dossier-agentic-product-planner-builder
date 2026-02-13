/**
 * Planning action query helpers.
 * Implementation deferred to Step 4 (API Layer).
 */
import type { PlanningAction } from "@/lib/schemas/slice-a";

export async function listActionsByProject(
  projectId: string,
  options?: { validationStatus?: "accepted" | "rejected"; limit?: number }
): Promise<PlanningAction[]> {
  // TODO: Implement in Step 4 - fetch planning actions for project
  void projectId;
  void options;
  throw new Error("Not implemented");
}

export async function submitAction(
  projectId: string,
  action: Omit<PlanningAction, "id" | "project_id">
): Promise<PlanningAction> {
  // TODO: Implement in Step 4 - validate, apply, persist via mutation pipeline
  void projectId;
  void action;
  throw new Error("Not implemented");
}
