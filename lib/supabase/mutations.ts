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
  getArtifactById,
  verifyCardInProject,
  getCardPlannedFiles,
  getCardRequirements,
  getCardFacts,
  getCardAssumptions,
  getCardQuestions,
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
    case "reorderCard":
      return applyReorderCard(supabase, projectId, action);
    case "linkContextArtifact":
      return applyLinkContextArtifact(supabase, projectId, action);
    case "upsertCardPlannedFile":
      return applyUpsertCardPlannedFile(supabase, projectId, action);
    case "approveCardPlannedFile":
      return applyApproveCardPlannedFile(supabase, projectId, action);
    case "upsertCardKnowledgeItem":
      return applyUpsertCardKnowledgeItem(supabase, projectId, action);
    case "setCardKnowledgeStatus":
      return applySetCardKnowledgeStatus(supabase, projectId, action);
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

async function applyReorderCard(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  if (!cardId) {
    return { applied: false, rejectionReason: "card_id is required in target_ref" };
  }

  const inProject = await verifyCardInProject(supabase, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const newStepId = (action.payload.new_step_id as string) ?? undefined;
  const newPosition = action.payload.new_position as number;

  if (typeof newPosition !== "number" || newPosition < 0) {
    return { applied: false, rejectionReason: "new_position is required and must be non-negative" };
  }

  const card = await getCardById(supabase, cardId);
  if (!card) {
    return { applied: false, rejectionReason: "Card not found" };
  }

  const activityId = (card as Record<string, unknown>).workflow_activity_id as string;
  if (newStepId !== undefined) {
    const steps = await getStepsByActivity(supabase, activityId);
    if (!steps.some((s) => s.id === newStepId)) {
      return { applied: false, rejectionReason: "new_step_id not found in card's activity" };
    }
  }

  const updates: Record<string, unknown> = {
    position: newPosition,
    updated_at: new Date().toISOString(),
  };
  if (newStepId !== undefined) {
    updates.step_id = newStepId;
  }

  const { error } = await supabase
    .from(TABLES.cards)
    .update(updates)
    .eq("id", cardId);

  if (error) {
    return { applied: false, rejectionReason: error.message };
  }
  return { applied: true };
}

async function applyLinkContextArtifact(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  const contextArtifactId = action.payload.context_artifact_id as string;

  if (!cardId || !contextArtifactId) {
    return { applied: false, rejectionReason: "card_id and context_artifact_id are required" };
  }

  const inProject = await verifyCardInProject(supabase, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const artifact = await getArtifactById(supabase, contextArtifactId);
  if (!artifact) {
    return { applied: false, rejectionReason: "Context artifact not found" };
  }

  const artifactProjectId = (artifact as Record<string, unknown>).project_id as string;
  if (artifactProjectId !== projectId) {
    return { applied: false, rejectionReason: "Context artifact does not belong to project" };
  }

  const linkedBy = (action.payload.linked_by as string) ?? null;
  const usageHint = (action.payload.usage_hint as string) ?? null;

  const { error } = await supabase.from(TABLES.card_context_artifacts).insert({
    card_id: cardId,
    context_artifact_id: contextArtifactId,
    linked_by: linkedBy,
    usage_hint: usageHint,
  });

  if (error) {
    if (error.code === "23505") {
      return { applied: true };
    }
    return { applied: false, rejectionReason: error.message };
  }
  return { applied: true };
}

async function applyUpsertCardPlannedFile(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  if (!cardId) {
    return { applied: false, rejectionReason: "card_id is required in target_ref" };
  }

  const inProject = await verifyCardInProject(supabase, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const plannedFileId = (action.payload.planned_file_id as string) ?? crypto.randomUUID();
  const logicalFileName = action.payload.logical_file_name as string;
  const artifactKind = action.payload.artifact_kind as string;
  const fileAction = action.payload.action as string;
  const intentSummary = action.payload.intent_summary as string;
  const moduleHint = (action.payload.module_hint as string) ?? null;
  const contractNotes = (action.payload.contract_notes as string) ?? null;
  const position = (action.payload.position as number) ?? 0;

  if (!logicalFileName?.trim() || !intentSummary?.trim()) {
    return { applied: false, rejectionReason: "logical_file_name and intent_summary are required" };
  }

  const existingFiles = await getCardPlannedFiles(supabase, cardId);
  const existingIndex = existingFiles.findIndex((f) => (f as { id?: string }).id === plannedFileId);

  if (existingIndex >= 0) {
    const { error } = await supabase
      .from(TABLES.card_planned_files)
      .update({
        logical_file_name: logicalFileName.trim(),
        module_hint: moduleHint,
        artifact_kind: artifactKind,
        action: fileAction,
        intent_summary: intentSummary.trim(),
        contract_notes: contractNotes,
        position,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plannedFileId)
      .eq("card_id", cardId);

    if (error) {
      return { applied: false, rejectionReason: error.message };
    }
  } else {
    const { error } = await supabase.from(TABLES.card_planned_files).insert({
      id: plannedFileId,
      card_id: cardId,
      logical_file_name: logicalFileName.trim(),
      module_hint: moduleHint,
      artifact_kind: artifactKind,
      action: fileAction,
      intent_summary: intentSummary.trim(),
      contract_notes: contractNotes,
      status: "proposed",
      position,
    });

    if (error) {
      return { applied: false, rejectionReason: error.message };
    }
  }
  return { applied: true };
}

async function applyApproveCardPlannedFile(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  const plannedFileId = action.payload.planned_file_id as string;
  const status = action.payload.status as string;

  if (!cardId || !plannedFileId || !status) {
    return { applied: false, rejectionReason: "card_id, planned_file_id, and status are required" };
  }

  if (status !== "approved" && status !== "proposed") {
    return { applied: false, rejectionReason: "status must be 'approved' or 'proposed'" };
  }

  const inProject = await verifyCardInProject(supabase, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const files = await getCardPlannedFiles(supabase, cardId);
  const file = files.find((f) => (f as { id?: string }).id === plannedFileId);
  if (!file) {
    return { applied: false, rejectionReason: "Planned file not found for card" };
  }

  const { error } = await supabase
    .from(TABLES.card_planned_files)
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", plannedFileId)
    .eq("card_id", cardId);

  if (error) {
    return { applied: false, rejectionReason: error.message };
  }
  return { applied: true };
}

async function applyUpsertCardKnowledgeItem(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  const itemType = action.payload.item_type as string;
  const text = action.payload.text as string;
  const itemId = (action.payload.knowledge_item_id as string) ?? crypto.randomUUID();
  const evidenceSource = (action.payload.evidence_source as string) ?? null;
  const confidence = (action.payload.confidence as number) ?? null;
  const position = (action.payload.position as number) ?? 0;

  if (!cardId || !itemType || !text?.trim()) {
    return { applied: false, rejectionReason: "card_id, item_type, and text are required" };
  }

  const inProject = await verifyCardInProject(supabase, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const validTypes = ["requirement", "fact", "assumption", "question"];
  if (!validTypes.includes(itemType)) {
    return { applied: false, rejectionReason: `item_type must be one of: ${validTypes.join(", ")}` };
  }

  const table =
    itemType === "requirement"
      ? TABLES.card_requirements
      : itemType === "fact"
        ? TABLES.card_known_facts
        : itemType === "assumption"
          ? TABLES.card_assumptions
          : TABLES.card_questions;

  const getExisting =
    itemType === "requirement"
      ? getCardRequirements
      : itemType === "fact"
        ? getCardFacts
        : itemType === "assumption"
          ? getCardAssumptions
          : getCardQuestions;

  const existing = await getExisting(supabase, cardId);
  const existingIndex = existing.findIndex((r) => (r as { id?: string }).id === itemId);

  const baseRow: Record<string, unknown> = {
    card_id: cardId,
    text: text.trim(),
    status: "draft",
    source: "user",
    confidence,
    position,
  };

  if (itemType === "fact") {
    (baseRow as Record<string, unknown>).evidence_source = evidenceSource;
  }

  if (existingIndex >= 0) {
    const updatePayload: Record<string, unknown> = {
      text: text.trim(),
      confidence,
      position,
      updated_at: new Date().toISOString(),
    };
    if (itemType === "fact") {
      (updatePayload as Record<string, unknown>).evidence_source = evidenceSource;
    }

    const { error } = await supabase
      .from(table)
      .update(updatePayload)
      .eq("id", itemId)
      .eq("card_id", cardId);

    if (error) {
      return { applied: false, rejectionReason: error.message };
    }
  } else {
    const insertPayload = { ...baseRow, id: itemId };
    const { error } = await supabase.from(table).insert(insertPayload);

    if (error) {
      return { applied: false, rejectionReason: error.message };
    }
  }
  return { applied: true };
}

async function applySetCardKnowledgeStatus(
  supabase: SupabaseClient,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  const knowledgeItemId = action.payload.knowledge_item_id as string;
  const status = action.payload.status as string;

  if (!cardId || !knowledgeItemId || !status) {
    return { applied: false, rejectionReason: "card_id, knowledge_item_id, and status are required" };
  }

  const validStatuses = ["draft", "approved", "rejected"];
  if (!validStatuses.includes(status)) {
    return { applied: false, rejectionReason: `status must be one of: ${validStatuses.join(", ")}` };
  }

  const inProject = await verifyCardInProject(supabase, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const tables = [
    TABLES.card_requirements,
    TABLES.card_known_facts,
    TABLES.card_assumptions,
    TABLES.card_questions,
  ] as const;

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", knowledgeItemId)
      .eq("card_id", cardId)
      .select("id")
      .maybeSingle();

    if (error) {
      return { applied: false, rejectionReason: error.message };
    }
    if (data) {
      return { applied: true };
    }
  }

  return { applied: false, rejectionReason: "Knowledge item not found" };
}
