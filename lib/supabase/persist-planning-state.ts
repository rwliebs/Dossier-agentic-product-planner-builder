import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanningState } from "@/lib/schemas/planning-state";
import { TABLES } from "./queries";

/**
 * Persist planning state changes to Supabase.
 * Inserts new entities and updates modified ones.
 * Caller must ensure state is valid and ordered (workflows before activities, etc.).
 */
export async function persistPlanningState(
  supabase: SupabaseClient,
  state: PlanningState,
): Promise<void> {
  const projectId = state.project.id;

  for (const w of state.workflows.values()) {
    await supabase.from(TABLES.workflows).upsert(
      {
        id: w.id,
        project_id: w.project_id,
        title: w.title,
        description: w.description,
        build_state: w.build_state,
        position: w.position,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  }

  for (const a of state.activities.values()) {
    await supabase.from(TABLES.workflow_activities).upsert(
      {
        id: a.id,
        workflow_id: a.workflow_id,
        title: a.title,
        color: a.color,
        position: a.position,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  }

  for (const s of state.steps.values()) {
    await supabase.from(TABLES.steps).upsert(
      {
        id: s.id,
        workflow_activity_id: s.workflow_activity_id,
        title: s.title,
        position: s.position,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  }

  for (const c of state.cards.values()) {
    await supabase.from(TABLES.cards).upsert(
      {
        id: c.id,
        workflow_activity_id: c.workflow_activity_id,
        step_id: c.step_id,
        title: c.title,
        description: c.description,
        status: c.status,
        priority: c.priority,
        position: c.position,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  }
}
