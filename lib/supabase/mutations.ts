/**
 * Deterministic action apply logic for planning mutations.
 * Validates and persists PlanningActions to Supabase.
 * Aligns with Dual LLM Strategy: PlanningAction as the only mutation contract.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES } from "./queries";
import {
  getProject,
  getWorkflowsByProject,
  getActivitiesByWorkflow,
  getStepsByActivity,
  getCardById,
} from "./queries";

export interface ActionInput {
  id?: string;
  action_type: string;
  target_ref: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export interface ApplyResult {
  applied: boolean;
  rejectionReason?: string;
}

const CODE_GEN_PATTERNS = [
  /generate\s+code/i,
  /write\s+code/i,
  /implement\s+(the\s+)?(code|function|component)/i,
  /create\s+(a\s+)?(file|component|function)\s+that\s+(implements|contains)/i,
  /produce\s+(production\s+)?code/i,
];

function isCodeGenerationIntent(payload: Record<string, unknown>): boolean {
  const text = JSON.stringify(payload);
  return CODE_GEN_PATTERNS.some((p) => p.test(text));
}

export async function applyAction(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  if (isCodeGenerationIntent(action.payload)) {
    return { applied: false, rejectionReason: "Code-generation intents are forbidden" };
  }

  switch (action.action_type) {
    case "createWorkflow":
      return applyCreateWorkflow(supabase, projectId, action);
    case "createActivity":
      return applyCreateActivity(supabase, projectId, action);
    case "createStep":
      return applyCreateStep(supabase, projectId, action);
    case "createCard":
      return applyCreateCard(supabase, projectId, action);
    case "updateCard":
      return applyUpdateCard(supabase, projectId, action);
    default:
      return { applied: false, rejectionReason: `Unsupported action type: ${action.action_type}` };
  }
}

async function applyCreateWorkflow(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const project = await getProject(supabase, projectId);
  if (!project) {
    return { applied: false, rejectionReason: "Project not found" };
  }

  const id = (action.payload.id as string) ?? crypto.randomUUID();
  const title = action.payload.title as string;
  const description = (action.payload.description as string) ?? null;
  const workflows = await getWorkflowsByProject(supabase, projectId);
  const position = (action.payload.position as number) ?? workflows.length;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return { applied: false, rejectionReason: "Workflow title is required" };
  }

  const { error } = await supabase.from(TABLES.workflows).insert({
    id,
    project_id: projectId,
    title: title.trim(),
    description,
    position,
  });

  if (error) {
    return { applied: false, rejectionReason: error.message };
  }
  return { applied: true };
}

async function applyCreateActivity(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const workflowId = action.target_ref.workflow_id as string;
  if (!workflowId) {
    return { applied: false, rejectionReason: "workflow_id is required in target_ref" };
  }

  const workflows = await getWorkflowsByProject(supabase, projectId);
  if (!workflows.some((w) => w.id === workflowId)) {
    return { applied: false, rejectionReason: "Workflow not found" };
  }

  const id = (action.payload.id as string) ?? crypto.randomUUID();
  const title = action.payload.title as string;
  const color = (action.payload.color as string) ?? null;
  const activities = await getActivitiesByWorkflow(supabase, workflowId);
  const position = (action.payload.position as number) ?? activities.length;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return { applied: false, rejectionReason: "Activity title is required" };
  }

  const { error } = await supabase.from(TABLES.workflow_activities).insert({
    id,
    workflow_id: workflowId,
    title: title.trim(),
    color,
    position,
  });

  if (error) {
    return { applied: false, rejectionReason: error.message };
  }
  return { applied: true };
}

async function applyCreateStep(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const activityId = action.target_ref.workflow_activity_id as string;
  if (!activityId) {
    return { applied: false, rejectionReason: "workflow_activity_id is required in target_ref" };
  }

  const workflows = await getWorkflowsByProject(supabase, projectId);
  let found = false;
  for (const wf of workflows) {
    const activities = await getActivitiesByWorkflow(supabase, wf.id);
    if (activities.some((a) => a.id === activityId)) {
      found = true;
      break;
    }
  }
  if (!found) {
    return { applied: false, rejectionReason: "Workflow activity not found" };
  }

  const id = (action.payload.id as string) ?? crypto.randomUUID();
  const title = action.payload.title as string;
  const steps = await getStepsByActivity(supabase, activityId);
  const position = (action.payload.position as number) ?? steps.length;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return { applied: false, rejectionReason: "Step title is required" };
  }

  const { error } = await supabase.from(TABLES.steps).insert({
    id,
    workflow_activity_id: activityId,
    title: title.trim(),
    position,
  });

  if (error) {
    return { applied: false, rejectionReason: error.message };
  }
  return { applied: true };
}

async function applyCreateCard(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const activityId = action.target_ref.workflow_activity_id as string;
  const stepId = action.target_ref.step_id as string | undefined;

  if (!activityId) {
    return { applied: false, rejectionReason: "workflow_activity_id is required in target_ref" };
  }

  const workflows = await getWorkflowsByProject(supabase, projectId);
  let found = false;
  for (const wf of workflows) {
    const activities = await getActivitiesByWorkflow(supabase, wf.id);
    if (activities.some((a) => a.id === activityId)) {
      found = true;
      break;
    }
  }
  if (!found) {
    return { applied: false, rejectionReason: "Workflow activity not found" };
  }

  if (stepId) {
    const steps = await getStepsByActivity(supabase, activityId);
    if (!steps.some((s) => s.id === stepId)) {
      return { applied: false, rejectionReason: "Step not found in activity" };
    }
  }

  const id = (action.payload.id as string) ?? crypto.randomUUID();
  const title = action.payload.title as string;
  const description = (action.payload.description as string) ?? null;
  const status = (action.payload.status as string) ?? "todo";
  const priority = (action.payload.priority as number) ?? 0;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return { applied: false, rejectionReason: "Card title is required" };
  }

  const validStatuses = ["todo", "active", "questions", "review", "production"];
  if (!validStatuses.includes(status)) {
    return { applied: false, rejectionReason: `Invalid status: ${status}` };
  }

  const { error } = await supabase.from(TABLES.cards).insert({
    id,
    workflow_activity_id: activityId,
    step_id: stepId ?? null,
    title: title.trim(),
    description,
    status,
    priority,
  });

  if (error) {
    return { applied: false, rejectionReason: error.message };
  }
  return { applied: true };
}

async function applyUpdateCard(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  if (!cardId) {
    return { applied: false, rejectionReason: "card_id is required in target_ref" };
  }

  const card = await getCardById(supabase, cardId);
  if (!card) {
    return { applied: false, rejectionReason: "Card not found" };
  }

  const updates: Record<string, unknown> = {};
  if (action.payload.title !== undefined) updates.title = action.payload.title;
  if (action.payload.description !== undefined) updates.description = action.payload.description;
  if (action.payload.status !== undefined) updates.status = action.payload.status;
  if (action.payload.priority !== undefined) updates.priority = action.payload.priority;

  if (Object.keys(updates).length === 0) {
    return { applied: true };
  }

  const { error } = await supabase
    .from(TABLES.cards)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", cardId);

  if (error) {
    return { applied: false, rejectionReason: error.message };
  }
  return { applied: true };
}
