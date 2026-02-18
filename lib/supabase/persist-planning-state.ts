import type { DbAdapter } from "@/lib/db/adapter";
import type { PlanningState } from "@/lib/schemas/planning-state";

/**
 * Persist planning state changes via DbAdapter.
 * Inserts new entities and updates modified ones.
 * Caller must ensure state is valid and ordered (workflows before activities, etc.).
 */
export async function persistPlanningState(
  db: DbAdapter,
  state: PlanningState,
): Promise<void> {
  for (const w of state.workflows.values()) {
    await db.upsertWorkflow({
      id: w.id,
      project_id: w.project_id,
      title: w.title,
      description: w.description,
      build_state: w.build_state,
      position: w.position,
      updated_at: new Date().toISOString(),
    });
  }

  for (const a of state.activities.values()) {
    await db.upsertWorkflowActivity({
      id: a.id,
      workflow_id: a.workflow_id,
      title: a.title,
      color: a.color,
      position: a.position,
      updated_at: new Date().toISOString(),
    });
  }

  for (const s of state.steps.values()) {
    await db.upsertStep({
      id: s.id,
      workflow_activity_id: s.workflow_activity_id,
      title: s.title,
      position: s.position,
      updated_at: new Date().toISOString(),
    });
  }

  for (const c of state.cards.values()) {
    await db.upsertCard({
      id: c.id,
      workflow_activity_id: c.workflow_activity_id,
      step_id: c.step_id,
      title: c.title,
      description: c.description,
      status: c.status,
      priority: c.priority,
      position: c.position,
      updated_at: new Date().toISOString(),
    });
  }
}
