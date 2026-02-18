import type { DbAdapter } from "@/lib/db/adapter";
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
  getActivitiesByProject,
  getStepsByProject,
  getCardsByProject,
  getArtifactsByProject,
  getCardContextLinksByProject,
} from "./queries";

/**
 * Fetch project map snapshot from DB and build PlanningState.
 * Used by chat API and map snapshot endpoint.
 */
export async function fetchMapSnapshot(
  db: DbAdapter,
  projectId: string,
): Promise<PlanningState | null> {
  const projectRow = await getProject(db, projectId);
  if (!projectRow) return null;

  const project: Project = {
    id: projectRow.id,
    name: projectRow.name,
    repo_url: projectRow.repo_url ?? null,
    default_branch: projectRow.default_branch ?? "main",
  };

  const state = createEmptyPlanningState(project);

  const [workflows, activities, steps, cards, artifacts, cardContextLinks] =
    await Promise.all([
      getWorkflowsByProject(db, projectId),
      getActivitiesByProject(db, projectId),
      getStepsByProject(db, projectId),
      getCardsByProject(db, projectId),
      getArtifactsByProject(db, projectId),
      getCardContextLinksByProject(db, projectId),
    ]);

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

  for (const s of steps ?? []) {
    const step: Step = {
      id: s.id,
      workflow_activity_id: s.workflow_activity_id,
      title: s.title,
      position: s.position,
    };
    state.steps.set(s.id, step);
  }

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

  for (const link of cardContextLinks ?? []) {
    const cardId = link.card_id;
    if (!state.cardContextLinks.has(cardId)) {
      state.cardContextLinks.set(cardId, new Set());
    }
    state.cardContextLinks.get(cardId)!.add(link.context_artifact_id);
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
