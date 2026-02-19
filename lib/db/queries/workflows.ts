/**
 * Workflow query helpers.
 * Implementation deferred to Step 4 (API Layer).
 */
import type { Workflow } from "@/lib/schemas/slice-a";

export async function getWorkflow(id: string): Promise<Workflow | null> {
  void id;
  throw new Error("Not implemented");
}

export async function listWorkflowsByProject(
  projectId: string
): Promise<Workflow[]> {
  void projectId;
  throw new Error("Not implemented");
}
