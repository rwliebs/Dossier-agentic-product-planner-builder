import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Project,
  Workflow,
  WorkflowActivity,
  Step,
  Card,
} from "@/lib/schemas/slice-a";
import type { ContextArtifact } from "@/lib/schemas/slice-b";
import {
  createEmptyPlanningState,
  type PlanningState,
} from "@/lib/schemas/planning-state";
import {
  getProject,
  getWorkflowsByProject,
  getActivitiesByWorkflow,
  getStepsByActivity,
  getCardsByStep,
  getCardsByActivity,
  getArtifactsByProject,
  getCardContextArtifacts,
} from "./queries";

/**
 * Fetch project map snapshot from Supabase and build PlanningState.
 * Used by chat API and map snapshot endpoint.
 */
export async function fetchMapSnapshot(
  supabase: SupabaseClient,
  projectId: string,
): Promise<PlanningState | null> {
  const projectRow = await getProject(supabase, projectId);
  if (!projectRow) return null;

  const project: Project = {
    id: projectRow.id,
    name: projectRow.name,
    repo_url: projectRow.repo_url ?? null,
    default_branch: projectRow.default_branch ?? "main",
  };

  const state = createEmptyPlanningState(project);

  const workflows = await getWorkflowsByProject(supabase, projectId);
  for (const w of workflows ?? []) {
    const workflow: Workflow = {
      id: w.id,
      project_id: w.project_id,
      title: w.title,
      description: w.description ?? null,
      build_state: w.build_state ?? null,
      position: w.position,
    };
    state.workflows.set(w.id, workflow);
  }

  for (const w of workflows ?? []) {
    const activities = await getActivitiesByWorkflow(supabase, w.id);
    for (const a of activities ?? []) {
      const activity: WorkflowActivity = {
        id: a.id,
        workflow_id: a.workflow_id,
        title: a.title,
        color: a.color ?? null,
        position: a.position,
      };
      state.activities.set(a.id, activity);
    }
  }

  const allActivities = Array.from(state.activities.values());
  for (const a of allActivities) {
    const steps = await getStepsByActivity(supabase, a.id);
    for (const s of steps ?? []) {
      const step: Step = {
        id: s.id,
        workflow_activity_id: s.workflow_activity_id,
        title: s.title,
        position: s.position,
      };
      state.steps.set(s.id, step);
    }
  }

  for (const a of allActivities) {
    const stepsInActivity = Array.from(state.steps.values()).filter(
      (s) => s.workflow_activity_id === a.id,
    );
    for (const s of stepsInActivity) {
      const cards = await getCardsByStep(supabase, s.id);
      for (const c of cards ?? []) {
        const card: Card = {
          id: c.id,
          workflow_activity_id: c.workflow_activity_id,
          step_id: c.step_id ?? null,
          title: c.title,
          description: c.description ?? null,
          status: c.status,
          priority: c.priority,
          position: c.position,
        };
        state.cards.set(c.id, card);
      }
    }
    const cardsWithoutStep = await getCardsByActivity(supabase, a.id);
    for (const c of cardsWithoutStep ?? []) {
      if (!state.cards.has(c.id)) {
        const card: Card = {
          id: c.id,
          workflow_activity_id: c.workflow_activity_id,
          step_id: null,
          title: c.title,
          description: c.description ?? null,
          status: c.status,
          priority: c.priority,
          position: c.position,
        };
        state.cards.set(c.id, card);
      }
    }
  }

  const artifacts = await getArtifactsByProject(supabase, projectId);
  for (const art of artifacts ?? []) {
    const artifact: ContextArtifact = {
      id: art.id,
      project_id: art.project_id,
      name: art.name,
      type: art.type,
      title: art.title ?? null,
      content: art.content ?? null,
      uri: art.uri ?? null,
      locator: art.locator ?? null,
      mime_type: art.mime_type ?? null,
      integration_ref: art.integration_ref ?? null,
      checksum: art.checksum ?? null,
      created_at: art.created_at,
      updated_at: art.updated_at,
    };
    state.contextArtifacts.set(art.id, artifact);
  }

  for (const card of state.cards.values()) {
    const links = await getCardContextArtifacts(supabase, card.id);
    const artifactIds = new Set(
      (links ?? []).map((l) => l.context_artifact_id),
    );
    if (artifactIds.size > 0) {
      state.cardContextLinks.set(card.id, artifactIds);
    }
  }

  return state;
}

/**
 * Get linked context artifacts for cards in the current state.
 * Returns top N artifacts by relevance (linked to cards).
 */
export function getLinkedArtifactsForPrompt(
  state: PlanningState,
  limit = 5,
): ContextArtifact[] {
  const linkedIds = new Set<string>();
  for (const ids of state.cardContextLinks.values()) {
    for (const id of ids) {
      linkedIds.add(id);
    }
  }
  const artifacts: ContextArtifact[] = [];
  for (const id of linkedIds) {
    const art = state.contextArtifacts.get(id);
    if (art) artifacts.push(art);
    if (artifacts.length >= limit) break;
  }
  return artifacts;
}
