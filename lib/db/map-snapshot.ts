import type { DbAdapter } from "@/lib/db/adapter";
import type {
  Project,
  Workflow,
  WorkflowActivity,
  Card,
  CardStatus,
} from "@/lib/schemas/slice-a";
import type { ContextArtifact, CardRequirement, CardPlannedFile } from "@/lib/schemas/slice-b";
import {
  createEmptyPlanningState,
  type PlanningState,
} from "@/lib/schemas/planning-state";
import {
  getProject,
  getWorkflowsByProject,
  getActivitiesByProject,
  getCardsByProject,
  getArtifactsByProject,
  getCardContextLinksByProject,
  getRequirementsByProject,
  getPlannedFilesByProject,
} from "./queries";

const RUN_STATUSES = new Set([
  "queued",
  "running",
  "blocked",
  "failed",
  "completed",
  "cancelled",
] as const);
const ACTIVITY_COLORS = new Set([
  "yellow",
  "blue",
  "purple",
  "green",
  "orange",
  "pink",
] as const);
const CARD_STATUSES = new Set([
  "todo",
  "active",
  "questions",
  "review",
  "production",
] as const);
const ARTIFACT_TYPES = new Set([
  "doc",
  "design",
  "code",
  "research",
  "link",
  "image",
  "skill",
  "mcp",
  "cli",
  "api",
  "prompt",
  "spec",
  "runbook",
  "test",
] as const);

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function readString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function readNullableString(
  row: Record<string, unknown>,
  key: string
): string | null | undefined {
  const value = row[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : null;
}

function readInt(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readRunStatus(
  row: Record<string, unknown>,
  key: string
): Workflow["build_state"] {
  const value = row[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !RUN_STATUSES.has(value as never)) return null;
  return value as Workflow["build_state"];
}

function readActivityColor(
  row: Record<string, unknown>,
  key: string
): WorkflowActivity["color"] {
  const value = row[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !ACTIVITY_COLORS.has(value as never)) return null;
  return value as WorkflowActivity["color"];
}

function readCardStatus(row: Record<string, unknown>, key: string): CardStatus | null {
  const value = row[key];
  if (typeof value !== "string" || !CARD_STATUSES.has(value as never)) return null;
  return value as CardStatus;
}

function readArtifactType(
  row: Record<string, unknown>,
  key: string
): ContextArtifact["type"] | null {
  const value = row[key];
  if (typeof value !== "string" || !ARTIFACT_TYPES.has(value as never)) return null;
  return value as ContextArtifact["type"];
}

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
  const projectObj = asObject(projectRow);
  if (!projectObj) return null;

  const projectIdValue = readString(projectObj, "id");
  const projectName = readString(projectObj, "name");
  if (!projectIdValue || !projectName) return null;

  const project: Project = {
    id: projectIdValue,
    name: projectName,
    description: readNullableString(projectObj, "description") ?? null,
    customer_personas: readNullableString(projectObj, "customer_personas") ?? null,
    tech_stack: readNullableString(projectObj, "tech_stack") ?? null,
    deployment: readNullableString(projectObj, "deployment") ?? null,
    design_inspiration: readNullableString(projectObj, "design_inspiration") ?? null,
    repo_url: readNullableString(projectObj, "repo_url") ?? null,
    default_branch: readString(projectObj, "default_branch") ?? "main",
  };

  const state = createEmptyPlanningState(project);

  const [workflows, activities, cards, artifacts, cardContextLinks, requirements, plannedFiles] =
    await Promise.all([
      getWorkflowsByProject(db, projectId),
      getActivitiesByProject(db, projectId),
      getCardsByProject(db, projectId),
      getArtifactsByProject(db, projectId),
      getCardContextLinksByProject(db, projectId),
      getRequirementsByProject(db, projectId),
      getPlannedFilesByProject(db, projectId),
    ]);

  for (const w of workflows ?? []) {
    const row = asObject(w);
    if (!row) continue;
    const id = readString(row, "id");
    const rowProjectId = readString(row, "project_id");
    const title = readString(row, "title");
    const position = readInt(row, "position");
    if (!id || !rowProjectId || !title || position === null) continue;

    const workflow: Workflow = {
      id,
      project_id: rowProjectId,
      title,
      description: readNullableString(row, "description") ?? null,
      build_state: readRunStatus(row, "build_state"),
      position,
    };
    state.workflows.set(id, workflow);
  }

  for (const a of activities ?? []) {
    const row = asObject(a);
    if (!row) continue;
    const id = readString(row, "id");
    const workflowId = readString(row, "workflow_id");
    const title = readString(row, "title");
    const position = readInt(row, "position");
    if (!id || !workflowId || !title || position === null) continue;

    const activity: WorkflowActivity = {
      id,
      workflow_id: workflowId,
      title,
      color: readActivityColor(row, "color"),
      position,
    };
    state.activities.set(id, activity);
  }

  for (const c of cards ?? []) {
    const row = asObject(c);
    if (!row) continue;
    const id = readString(row, "id");
    const workflowActivityId = readString(row, "workflow_activity_id");
    const title = readString(row, "title");
    const status = readCardStatus(row, "status");
    const priority = readInt(row, "priority");
    const position = readInt(row, "position");
    if (
      !id ||
      !workflowActivityId ||
      !title ||
      !status ||
      priority === null ||
      position === null
    ) {
      continue;
    }

    const card: Card = {
      id,
      workflow_activity_id: workflowActivityId,
      title,
      description: readNullableString(row, "description") ?? null,
      status,
      priority,
      position,
    };
    state.cards.set(id, card);
  }

  for (const art of artifacts ?? []) {
    const row = asObject(art);
    if (!row) continue;
    const id = readString(row, "id");
    const rowProjectId = readString(row, "project_id");
    const name = readString(row, "name");
    const type = readArtifactType(row, "type");
    if (!id || !rowProjectId || !name || !type) continue;

    const artifact: ContextArtifact = {
      id,
      project_id: rowProjectId,
      name,
      type,
      title: readNullableString(row, "title") ?? null,
      content: readNullableString(row, "content") ?? null,
      uri: readNullableString(row, "uri") ?? null,
      locator: readNullableString(row, "locator") ?? null,
      mime_type: readNullableString(row, "mime_type") ?? null,
      integration_ref:
        row.integration_ref && typeof row.integration_ref === "object"
          ? (row.integration_ref as Record<string, unknown>)
          : null,
      checksum: readNullableString(row, "checksum") ?? null,
      created_at: readString(row, "created_at") ?? undefined,
      updated_at: readString(row, "updated_at") ?? undefined,
    };
    state.contextArtifacts.set(id, artifact);
  }

  for (const link of cardContextLinks ?? []) {
    const cardId = link.card_id;
    if (!state.cardContextLinks.has(cardId)) {
      state.cardContextLinks.set(cardId, new Set());
    }
    state.cardContextLinks.get(cardId)!.add(link.context_artifact_id);
  }

  for (const req of requirements ?? []) {
    const row = asObject(req);
    const cardId = row ? readString(row, "card_id") : null;
    if (!row || !cardId) continue;
    if (!state.cardRequirements.has(cardId)) {
      state.cardRequirements.set(cardId, []);
    }
    state.cardRequirements.get(cardId)!.push(row as unknown as CardRequirement);
  }

  for (const pf of plannedFiles ?? []) {
    const row = asObject(pf);
    const cardId = row ? readString(row, "card_id") : null;
    if (!row || !cardId) continue;
    if (!state.cardPlannedFiles.has(cardId)) {
      state.cardPlannedFiles.set(cardId, []);
    }
    state.cardPlannedFiles.get(cardId)!.push(row as unknown as CardPlannedFile);
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
