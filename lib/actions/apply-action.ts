import { v4 as uuidv4 } from "uuid";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import {
  PlanningState,
  clonePlanningState,
  cardExists,
  getMaxPosition,
  getActivityCards,
  getStepCards,
} from "@/lib/schemas/planning-state";
import type {
  UpdateProjectPayload,
  CreateWorkflowPayload,
  CreateActivityPayload,
  CreateStepPayload,
  CreateCardPayload,
  UpdateCardPayload,
  ReorderCardPayload,
  LinkContextArtifactPayload,
  UpsertCardPlannedFilePayload,
  ApproveCardPlannedFilePayload,
  UpsertCardKnowledgeItemPayload,
  SetCardKnowledgeStatusPayload,
} from "@/lib/schemas/action-payloads";

/**
 * Mutation error type for action application failures
 */
export interface MutationError {
  code: "state_corrupted" | "mutation_failed" | "constraint_violation";
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Mutation result
 */
export interface MutationResult {
  success: boolean;
  error?: MutationError;
  newState?: PlanningState;
}

/**
 * Apply a single action to the planning state
 * Returns a new mutated state or an error.
 */
export function applyAction(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const newState = clonePlanningState(state);

  try {
    switch (action.action_type) {
      case "updateProject":
        return applyUpdateProject(action, newState);

      case "createWorkflow":
        return applyCreateWorkflow(action, newState);

      case "createActivity":
        return applyCreateActivity(action, newState);

      case "createStep":
        return applyCreateStep(action, newState);

      case "createCard":
        return applyCreateCard(action, newState);

      case "updateCard":
        return applyUpdateCard(action, newState);

      case "reorderCard":
        return applyReorderCard(action, newState);

      case "linkContextArtifact":
        return applyLinkContextArtifact(action, newState);

      case "upsertCardPlannedFile":
        return applyUpsertCardPlannedFile(action, newState);

      case "approveCardPlannedFile":
        return applyApproveCardPlannedFile(action, newState);

      case "upsertCardKnowledgeItem":
        return applyUpsertCardKnowledgeItem(action, newState);

      case "setCardKnowledgeStatus":
        return applySetCardKnowledgeStatus(action, newState);

      default:
        return {
          success: false,
          error: {
            code: "mutation_failed",
            message: `Unknown action type: ${action.action_type}`,
          },
        };
    }
  } catch (e) {
    return {
      success: false,
      error: {
        code: "state_corrupted",
        message: `Mutation failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      },
    };
  }
}

// ============================================================================
// Handler functions for each action type
// ============================================================================

function applyUpdateProject(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as UpdateProjectPayload;

  state.project = {
    ...state.project,
    name: payload.name ?? state.project.name,
    description: payload.description !== undefined ? payload.description : state.project.description,
  };

  return { success: true, newState: state };
}

function applyCreateWorkflow(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as CreateWorkflowPayload & { id?: string };
  const workflowId = payload.id ?? action.id ?? uuidv4();

  state.workflows.set(workflowId, {
    id: workflowId,
    project_id: state.project.id,
    title: payload.title,
    description: payload.description || null,
    build_state: null,
    position: payload.position,
  });

  return { success: true, newState: state };
}

function applyCreateActivity(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as CreateActivityPayload & { id?: string };
  const target_ref = action.target_ref as { workflow_id: string };
  const activityId = payload.id ?? action.id ?? uuidv4();

  state.activities.set(activityId, {
    id: activityId,
    workflow_id: target_ref.workflow_id,
    title: payload.title,
    color: payload.color || null,
    position: payload.position,
  });

  return { success: true, newState: state };
}

function applyCreateStep(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as CreateStepPayload & { id?: string };
  const target_ref = action.target_ref as { workflow_activity_id: string };
  const stepId = payload.id ?? action.id ?? uuidv4();

  state.steps.set(stepId, {
    id: stepId,
    workflow_activity_id: target_ref.workflow_activity_id,
    title: payload.title,
    position: payload.position,
  });

  return { success: true, newState: state };
}

function applyCreateCard(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as CreateCardPayload & { id?: string };
  const target_ref = action.target_ref as { workflow_activity_id: string };
  const cardId = payload.id ?? action.id ?? uuidv4();

  state.cards.set(cardId, {
    id: cardId,
    workflow_activity_id: target_ref.workflow_activity_id,
    step_id: payload.step_id || null,
    title: payload.title,
    description: payload.description || null,
    status: payload.status,
    priority: payload.priority,
    position: payload.position,
  });

  return { success: true, newState: state };
}

function applyUpdateCard(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as UpdateCardPayload;
  const target_ref = action.target_ref as { card_id: string };
  const card = state.cards.get(target_ref.card_id);

  if (!card) {
    return {
      success: false,
      error: {
        code: "constraint_violation",
        message: `Card ${target_ref.card_id} not found`,
      },
    };
  }

  // Use ?? so null/undefined are treated as "keep existing"; Card schema
  // requires title, status, priority to be non-null.
  state.cards.set(target_ref.card_id, {
    ...card,
    title: payload.title ?? card.title,
    description:
      payload.description !== undefined ? payload.description : card.description,
    status: payload.status ?? card.status,
    priority: payload.priority ?? card.priority,
    quick_answer:
      payload.quick_answer !== undefined ? payload.quick_answer : card.quick_answer,
  });

  return { success: true, newState: state };
}

function applyReorderCard(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as ReorderCardPayload;
  const target_ref = action.target_ref as { card_id: string };
  const card = state.cards.get(target_ref.card_id);

  if (!card) {
    return {
      success: false,
      error: {
        code: "constraint_violation",
        message: `Card ${target_ref.card_id} not found`,
      },
    };
  }

  state.cards.set(target_ref.card_id, {
    ...card,
    step_id: payload.new_step_id !== undefined ? payload.new_step_id : card.step_id,
    position: payload.new_position,
  });

  return { success: true, newState: state };
}

function applyLinkContextArtifact(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as LinkContextArtifactPayload;
  const target_ref = action.target_ref as { card_id: string };

  const links = state.cardContextLinks.get(target_ref.card_id);
  if (!links) {
    state.cardContextLinks.set(target_ref.card_id, new Set());
  }

  state.cardContextLinks.get(target_ref.card_id)!.add(payload.context_artifact_id);

  return { success: true, newState: state };
}

function applyUpsertCardPlannedFile(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as UpsertCardPlannedFilePayload;
  const target_ref = action.target_ref as { card_id: string };
  const fileId = payload.planned_file_id || uuidv4();

  const files = state.cardPlannedFiles.get(target_ref.card_id) || [];
  const existingIndex = files.findIndex((f) => f.id === fileId);

  const newFile = {
    id: fileId,
    card_id: target_ref.card_id,
    logical_file_name: payload.logical_file_name,
    module_hint: payload.module_hint || null,
    artifact_kind: payload.artifact_kind,
    action: payload.action,
    intent_summary: payload.intent_summary,
    contract_notes: payload.contract_notes || null,
    status: "proposed" as const,
    position: payload.position,
  };

  if (existingIndex >= 0) {
    files[existingIndex] = newFile;
  } else {
    files.push(newFile);
  }

  state.cardPlannedFiles.set(target_ref.card_id, files);

  return { success: true, newState: state };
}

function applyApproveCardPlannedFile(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as ApproveCardPlannedFilePayload;
  const target_ref = action.target_ref as { card_id: string };

  const files = state.cardPlannedFiles.get(target_ref.card_id);
  if (!files) {
    return {
      success: false,
      error: {
        code: "constraint_violation",
        message: `No planned files for card ${target_ref.card_id}`,
      },
    };
  }

  const fileIndex = files.findIndex((f) => f.id === payload.planned_file_id);
  if (fileIndex < 0) {
    return {
      success: false,
      error: {
        code: "constraint_violation",
        message: `Planned file ${payload.planned_file_id} not found`,
      },
    };
  }

  // Immutable array update to preserve immutability contract with shallow clone
  const updated = files.map((f, i) =>
    i === fileIndex ? { ...f, status: payload.status } : f,
  );
  state.cardPlannedFiles.set(target_ref.card_id, updated);

  return { success: true, newState: state };
}

function applyUpsertCardKnowledgeItem(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as UpsertCardKnowledgeItemPayload;
  const target_ref = action.target_ref as { card_id: string };
  const itemId = payload.knowledge_item_id || uuidv4();

  switch (payload.item_type) {
    case "requirement": {
      const requirements = state.cardRequirements.get(target_ref.card_id) || [];
      const existingIndex = requirements.findIndex((r) => r.id === itemId);

      const newItem = {
        id: itemId,
        card_id: target_ref.card_id,
        text: payload.text,
        status: "draft" as const,
        source: "user" as const,
        confidence: payload.confidence || null,
        position: payload.position,
      };

      if (existingIndex >= 0) {
        requirements[existingIndex] = newItem;
      } else {
        requirements.push(newItem);
      }

      state.cardRequirements.set(target_ref.card_id, requirements);
      break;
    }

    case "fact": {
      const facts = state.cardFacts.get(target_ref.card_id) || [];
      const existingIndex = facts.findIndex((f) => f.id === itemId);

      const newItem = {
        id: itemId,
        card_id: target_ref.card_id,
        text: payload.text,
        evidence_source: payload.evidence_source || null,
        status: "draft" as const,
        source: "user" as const,
        confidence: payload.confidence || null,
        position: payload.position,
      };

      if (existingIndex >= 0) {
        facts[existingIndex] = newItem;
      } else {
        facts.push(newItem);
      }

      state.cardFacts.set(target_ref.card_id, facts);
      break;
    }

    case "assumption": {
      const assumptions = state.cardAssumptions.get(target_ref.card_id) || [];
      const existingIndex = assumptions.findIndex((a) => a.id === itemId);

      const newItem = {
        id: itemId,
        card_id: target_ref.card_id,
        text: payload.text,
        status: "draft" as const,
        source: "user" as const,
        confidence: payload.confidence || null,
        position: payload.position,
      };

      if (existingIndex >= 0) {
        assumptions[existingIndex] = newItem;
      } else {
        assumptions.push(newItem);
      }

      state.cardAssumptions.set(target_ref.card_id, assumptions);
      break;
    }

    case "question": {
      const questions = state.cardQuestions.get(target_ref.card_id) || [];
      const existingIndex = questions.findIndex((q) => q.id === itemId);

      const newItem = {
        id: itemId,
        card_id: target_ref.card_id,
        text: payload.text,
        status: "draft" as const,
        source: "user" as const,
        confidence: payload.confidence || null,
        position: payload.position,
      };

      if (existingIndex >= 0) {
        questions[existingIndex] = newItem;
      } else {
        questions.push(newItem);
      }

      state.cardQuestions.set(target_ref.card_id, questions);
      break;
    }
  }

  return { success: true, newState: state };
}

function applySetCardKnowledgeStatus(
  action: PlanningAction,
  state: PlanningState,
): MutationResult {
  const payload = action.payload as SetCardKnowledgeStatusPayload;
  const target_ref = action.target_ref as { card_id: string };

  // Attempt to find and update the knowledge item in any of the lists.
  // Use immutable array updates (new array + new object) to avoid mutating
  // shared references from shallow clone, preserving the immutability contract.
  for (const [cardId, requirements] of state.cardRequirements) {
    const itemIndex = requirements.findIndex(
      (r) => r.id === payload.knowledge_item_id,
    );
    if (itemIndex >= 0) {
      const updated = requirements.map((r, i) =>
        i === itemIndex ? { ...r, status: payload.status } : r,
      );
      state.cardRequirements.set(cardId, updated);
      return { success: true, newState: state };
    }
  }

  for (const [cardId, facts] of state.cardFacts) {
    const itemIndex = facts.findIndex(
      (f) => f.id === payload.knowledge_item_id,
    );
    if (itemIndex >= 0) {
      const updated = facts.map((f, i) =>
        i === itemIndex ? { ...f, status: payload.status } : f,
      );
      state.cardFacts.set(cardId, updated);
      return { success: true, newState: state };
    }
  }

  for (const [cardId, assumptions] of state.cardAssumptions) {
    const itemIndex = assumptions.findIndex(
      (a) => a.id === payload.knowledge_item_id,
    );
    if (itemIndex >= 0) {
      const updated = assumptions.map((a, i) =>
        i === itemIndex ? { ...a, status: payload.status } : a,
      );
      state.cardAssumptions.set(cardId, updated);
      return { success: true, newState: state };
    }
  }

  for (const [cardId, questions] of state.cardQuestions) {
    const itemIndex = questions.findIndex(
      (q) => q.id === payload.knowledge_item_id,
    );
    if (itemIndex >= 0) {
      const updated = questions.map((q, i) =>
        i === itemIndex ? { ...q, status: payload.status } : q,
      );
      state.cardQuestions.set(cardId, updated);
      return { success: true, newState: state };
    }
  }

  return {
    success: false,
    error: {
      code: "constraint_violation",
      message: `Knowledge item ${payload.knowledge_item_id} not found`,
    },
  };
}
