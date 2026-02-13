/**
 * Workflow query helpers.
 * Implementation deferred to Step 4 (API Layer).
 */
import type { Workflow } from "@/lib/schemas/slice-a";

export async function getWorkflow(id: string): Promise<Workflow | null> {
  // TODO: Implement in Step 4 - fetch from Supabase workflow table
  void id;
  throw new Error("Not implemented");
}

export async function listWorkflowsByProject(
  projectId: string
): Promise<Workflow[]> {
  // TODO: Implement in Step 4 - fetch workflows for project, ordered by position
  void projectId;
  throw new Error("Not implemented");
}
