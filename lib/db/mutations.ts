/**
 * Deterministic action apply logic for planning mutations.
 * Validates and persists PlanningActions via DbAdapter.
 * Aligns with Dual LLM Strategy: PlanningAction as the only mutation contract.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import {
  getProject,
  getWorkflowsByProject,
  getActivitiesByWorkflow,
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

export interface PipelineApplyResult {
  applied: number;
  results: Array<{
    id: string;
    action_type: string;
    validation_status: "accepted" | "rejected";
    rejection_reason?: string;
    applied_at?: string;
  }>;
  failedAt?: number;
  rejectionReason?: string;
}

/**
 * Single entry point for applying a batch of actions.
 * Applies actions sequentially; returns on first rejection.
 * For transactional apply with rollback, use pipelineApplyTransactional when DATABASE_URL is set.
 */
export async function pipelineApply(
  db: DbAdapter,
  projectId: string,
  actions: ActionInput[],
  options?: { idempotencyKey?: string }
): Promise<PipelineApplyResult> {
  const results: PipelineApplyResult["results"] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const actionId = action.id ?? crypto.randomUUID();
    const actionRecord = {
      ...action,
      id: actionId,
      project_id: projectId,
    };

    const result = await applyAction(db, projectId, actionRecord);
    const validationStatus = result.applied ? "accepted" : "rejected";

    // Always use a fresh UUID for the planning_action audit record to avoid
    // collisions from LLM-generated IDs being reused across requests.
    const auditRecordId = crypto.randomUUID();
    const insertPayload: Record<string, unknown> = {
      id: auditRecordId,
      project_id: projectId,
      action_type: action.action_type,
      target_ref: action.target_ref ?? {},
      payload: action.payload ?? {},
      validation_status: validationStatus,
      rejection_reason: result.rejectionReason ?? null,
      applied_at: result.applied ? now : null,
    };
    if (options?.idempotencyKey) {
      insertPayload.idempotency_key = options.idempotencyKey;
    }
    try {
      await db.insertPlanningAction(insertPayload);
    } catch (insertError) {
      const msg = insertError instanceof Error ? insertError.message : String(insertError);
      return {
        applied: results.length,
        results,
        failedAt: i,
        rejectionReason: `Failed to persist action record: ${msg}`,
      };
    }

    results.push({
      id: actionId,
      action_type: action.action_type,
      validation_status: validationStatus,
      rejection_reason: result.rejectionReason,
      applied_at: result.applied ? now : undefined,
    });

    if (!result.applied) {
      return {
        applied: results.length - 1,
        results,
        failedAt: i,
        rejectionReason: result.rejectionReason ?? "Action rejected",
      };
    }
  }

  return { applied: results.length, results };
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
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const isTestArtifact =
    action.action_type === "createContextArtifact" &&
    (action.payload as Record<string, unknown>).type === "test";
  if (!isTestArtifact && isCodeGenerationIntent(action.payload)) {
    return { applied: false, rejectionReason: "Code-generation intents are forbidden" };
  }

  switch (action.action_type) {
    case "updateProject":
      return applyUpdateProjectAction(db, projectId, action);
    case "createWorkflow":
      return applyCreateWorkflow(db, projectId, action);
    case "createActivity":
      return applyCreateActivity(db, projectId, action);
    case "createCard":
      return applyCreateCard(db, projectId, action);
    case "updateCard":
      return applyUpdateCard(db, projectId, action);
    case "reorderCard":
      return applyReorderCard(db, projectId, action);
    case "linkContextArtifact":
      return applyLinkContextArtifact(db, projectId, action);
    case "createContextArtifact":
      return applyCreateContextArtifactAction(db, projectId, action);
    case "upsertCardPlannedFile":
      return applyUpsertCardPlannedFile(db, projectId, action);
    case "approveCardPlannedFile":
      return applyApproveCardPlannedFile(db, projectId, action);
    case "upsertCardKnowledgeItem":
      return applyUpsertCardKnowledgeItem(db, projectId, action);
    case "setCardKnowledgeStatus":
      return applySetCardKnowledgeStatus(db, projectId, action);
    default:
      return { applied: false, rejectionReason: `Unsupported action type: ${action.action_type}` };
  }
}

async function applyUpdateProjectAction(
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const project = await getProject(db, projectId);
  if (!project) {
    return { applied: false, rejectionReason: "Project not found" };
  }

  const updates: Record<string, unknown> = {};
  if (action.payload.name !== undefined) updates.name = action.payload.name;
  if (action.payload.description !== undefined) updates.description = action.payload.description;
  if (action.payload.customer_personas !== undefined) updates.customer_personas = action.payload.customer_personas;
  if (action.payload.tech_stack !== undefined) updates.tech_stack = action.payload.tech_stack;
  if (action.payload.deployment !== undefined) updates.deployment = action.payload.deployment;
  if (action.payload.design_inspiration !== undefined) updates.design_inspiration = action.payload.design_inspiration;

  if (Object.keys(updates).length === 0) {
    return { applied: false, rejectionReason: "No fields to update" };
  }

  try {
    await db.updateProject(projectId, updates);
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applyCreateWorkflow(
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const project = await getProject(db, projectId);
  if (!project) {
    return { applied: false, rejectionReason: "Project not found" };
  }

  const id = (action.payload.id as string) ?? crypto.randomUUID();
  const title = action.payload.title as string;
  const description = (action.payload.description as string) ?? null;
  const workflows = await getWorkflowsByProject(db, projectId);
  const position = (action.payload.position as number) ?? workflows.length;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return { applied: false, rejectionReason: "Workflow title is required" };
  }

  try {
    await db.insertWorkflow({
      id,
      project_id: projectId,
      title: title.trim(),
      description,
      position,
    });
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applyCreateActivity(
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const workflowId = action.target_ref.workflow_id as string;
  if (!workflowId) {
    return { applied: false, rejectionReason: "workflow_id is required in target_ref" };
  }

  const workflows = await getWorkflowsByProject(db, projectId);
  if (!workflows.some((w) => w.id === workflowId)) {
    return { applied: false, rejectionReason: "Workflow not found" };
  }

  const id = (action.payload.id as string) ?? crypto.randomUUID();
  const title = action.payload.title as string;
  const color = (action.payload.color as string) ?? null;
  const activities = await getActivitiesByWorkflow(db, workflowId);
  const position = (action.payload.position as number) ?? activities.length;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return { applied: false, rejectionReason: "Activity title is required" };
  }

  try {
    await db.insertWorkflowActivity({
      id,
      workflow_id: workflowId,
      title: title.trim(),
      color,
      position,
    });
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applyCreateCard(
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const activityId = action.target_ref.workflow_activity_id as string;

  if (!activityId) {
    return { applied: false, rejectionReason: "workflow_activity_id is required in target_ref" };
  }

  const workflows = await getWorkflowsByProject(db, projectId);
  let found = false;
  for (const wf of workflows) {
    const activities = await getActivitiesByWorkflow(db, wf.id as string);
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
  const description = (action.payload.description as string) ?? null;
  const status = (action.payload.status as string) ?? "todo";
  const priority = (action.payload.priority as number) ?? 0;
  const position = (action.payload.position as number) ?? 0;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return { applied: false, rejectionReason: "Card title is required" };
  }

  const validStatuses = ["todo", "active", "questions", "review", "production"];
  if (!validStatuses.includes(status)) {
    return { applied: false, rejectionReason: `Invalid status: ${status}` };
  }

  try {
    await db.insertCard({
      id,
      workflow_activity_id: activityId,
      title: title.trim(),
      description,
      status,
      priority,
      position,
    });
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applyUpdateCard(
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  if (!cardId) {
    return { applied: false, rejectionReason: "card_id is required in target_ref" };
  }

  const card = await getCardById(db, cardId);
  if (!card) {
    return { applied: false, rejectionReason: "Card not found" };
  }

  const updates: Record<string, unknown> = {};
  if (action.payload.title !== undefined) updates.title = action.payload.title;
  if (action.payload.description !== undefined) updates.description = action.payload.description;
  if (action.payload.status !== undefined) updates.status = action.payload.status;
  if (action.payload.priority !== undefined) updates.priority = action.payload.priority;
  if (action.payload.quick_answer !== undefined) updates.quick_answer = action.payload.quick_answer;

  if (Object.keys(updates).length === 0) {
    return { applied: true };
  }

  try {
    await db.updateCard(cardId, updates);
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applyReorderCard(
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  if (!cardId) {
    return { applied: false, rejectionReason: "card_id is required in target_ref" };
  }

  const inProject = await verifyCardInProject(db, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const newPosition = action.payload.new_position as number;

  if (typeof newPosition !== "number" || newPosition < 0) {
    return { applied: false, rejectionReason: "new_position is required and must be non-negative" };
  }

  const updates: Record<string, unknown> = { position: newPosition };

  try {
    await db.updateCard(cardId, updates);
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applyLinkContextArtifact(
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  const contextArtifactId = action.payload.context_artifact_id as string;

  if (!cardId || !contextArtifactId) {
    return { applied: false, rejectionReason: "card_id and context_artifact_id are required" };
  }

  const inProject = await verifyCardInProject(db, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const artifact = await getArtifactById(db, contextArtifactId);
  if (!artifact) {
    return { applied: false, rejectionReason: "Context artifact not found" };
  }

  const artifactProjectId = (artifact as Record<string, unknown>).project_id as string;
  if (artifactProjectId !== projectId) {
    return { applied: false, rejectionReason: "Context artifact does not belong to project" };
  }

  const linkedBy = (action.payload.linked_by as string) ?? null;
  const usageHint = (action.payload.usage_hint as string) ?? null;

  try {
    await db.insertCardContextArtifact({
      card_id: cardId,
      context_artifact_id: contextArtifactId,
      linked_by: linkedBy,
      usage_hint: usageHint,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return { applied: true };
    }
    return { applied: false, rejectionReason: msg };
  }
  return { applied: true };
}

async function applyCreateContextArtifactAction(
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const name = action.payload.name as string;
  const type = action.payload.type as string;
  const title = (action.payload.title as string) ?? null;
  const content = action.payload.content as string;
  const cardId = (action.payload.card_id as string) ?? null;

  if (!name?.trim() || !content?.trim()) {
    return { applied: false, rejectionReason: "name and content are required" };
  }

  const validTypes = [
    "doc", "design", "code", "research", "link", "image",
    "skill", "mcp", "cli", "api", "prompt", "spec", "runbook", "test",
  ];
  if (!validTypes.includes(type)) {
    return { applied: false, rejectionReason: `Invalid artifact type: ${type}` };
  }

  if (cardId) {
    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) {
      return { applied: false, rejectionReason: "Card not found or not in project" };
    }
  }

  const artifactId = crypto.randomUUID();

  try {
    await db.insertContextArtifact({
      id: artifactId,
      project_id: projectId,
      name: name.trim(),
      type,
      title,
      content: content.trim(),
    });

    if (cardId) {
      await db.insertCardContextArtifact({
        card_id: cardId,
        context_artifact_id: artifactId,
        linked_by: "finalize",
        usage_hint: null,
      });
    }
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applyUpsertCardPlannedFile(
  db: DbAdapter,
  projectId: string,
  action: ActionInput
): Promise<ApplyResult> {
  const cardId = action.target_ref.card_id as string;
  if (!cardId) {
    return { applied: false, rejectionReason: "card_id is required in target_ref" };
  }

  const inProject = await verifyCardInProject(db, cardId, projectId);
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

  const existingFiles = await getCardPlannedFiles(db, cardId);
  const existingIndex = existingFiles.findIndex((f) => (f as { id?: string }).id === plannedFileId);

  try {
    if (existingIndex >= 0) {
      await db.updateCardPlannedFile(plannedFileId, cardId, {
        logical_file_name: logicalFileName.trim(),
        module_hint: moduleHint,
        artifact_kind: artifactKind,
        action: fileAction,
        intent_summary: intentSummary.trim(),
        contract_notes: contractNotes,
        position,
      });
    } else {
      await db.insertCardPlannedFile({
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
    }
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applyApproveCardPlannedFile(
  db: DbAdapter,
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

  const inProject = await verifyCardInProject(db, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const files = await getCardPlannedFiles(db, cardId);
  const file = files.find((f) => (f as { id?: string }).id === plannedFileId);
  if (!file) {
    return { applied: false, rejectionReason: "Planned file not found for card" };
  }

  try {
    await db.updateCardPlannedFile(plannedFileId, cardId, { status });
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applyUpsertCardKnowledgeItem(
  db: DbAdapter,
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

  const inProject = await verifyCardInProject(db, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const validTypes = ["requirement", "fact", "assumption", "question"];
  if (!validTypes.includes(itemType)) {
    return { applied: false, rejectionReason: `item_type must be one of: ${validTypes.join(", ")}` };
  }

  const existing =
    itemType === "requirement"
      ? await getCardRequirements(db, cardId)
      : itemType === "fact"
        ? await getCardFacts(db, cardId)
        : itemType === "assumption"
          ? await getCardAssumptions(db, cardId)
          : await getCardQuestions(db, cardId);
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

  try {
    if (existingIndex >= 0) {
      const updatePayload: Record<string, unknown> = { text: text.trim(), confidence, position };
      if (itemType === "fact") {
        (updatePayload as Record<string, unknown>).evidence_source = evidenceSource;
      }
      if (itemType === "requirement") await db.updateCardRequirement(itemId, cardId, updatePayload);
      else if (itemType === "fact") await db.updateCardFact(itemId, cardId, updatePayload);
      else if (itemType === "assumption") await db.updateCardAssumption(itemId, cardId, updatePayload);
      else await db.updateCardQuestion(itemId, cardId, updatePayload);
    } else {
      const insertPayload = { ...baseRow, id: itemId };
      if (itemType === "requirement") await db.insertCardRequirement(insertPayload);
      else if (itemType === "fact") await db.insertCardFact(insertPayload);
      else if (itemType === "assumption") await db.insertCardAssumption(insertPayload);
      else await db.insertCardQuestion(insertPayload);
    }
  } catch (error) {
    return { applied: false, rejectionReason: error instanceof Error ? error.message : String(error) };
  }
  return { applied: true };
}

async function applySetCardKnowledgeStatus(
  db: DbAdapter,
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

  const inProject = await verifyCardInProject(db, cardId, projectId);
  if (!inProject) {
    return { applied: false, rejectionReason: "Card not found or not in project" };
  }

  const ok = await db.updateKnowledgeItemStatus(knowledgeItemId, cardId, status);
  return ok ? { applied: true } : { applied: false, rejectionReason: "Knowledge item not found" };
}
