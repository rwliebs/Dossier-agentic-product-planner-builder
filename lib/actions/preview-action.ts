import type { PlanningAction } from "@/lib/schemas/slice-a";
import { PlanningState, clonePlanningState } from "@/lib/schemas/planning-state";
import { applyAction, MutationError } from "./apply-action";

/**
 * Preview Delta: What will change if we apply these actions
 */
export interface PreviewDelta {
  created_ids: string[]; // New entities created
  updated_ids: string[]; // Existing entities updated
  deleted_ids: string[]; // Entities deleted (if applicable)
  reordered_ids: string[]; // Entities reordered
  summary: string; // Human-readable summary
}

/**
 * Dry-run action application: preview what will happen without mutating state
 */
export function previewAction(
  action: PlanningAction,
  state: PlanningState,
): PreviewDelta | null {
  const testState = clonePlanningState(state);
  const result = applyAction(action, testState);

  if (!result.success) {
    return null;
  }

  const delta: PreviewDelta = {
    created_ids: [],
    updated_ids: [],
    deleted_ids: [],
    reordered_ids: [],
    summary: "",
  };

  // Analyze what changed
  switch (action.action_type) {
    case "createWorkflow":
    case "createActivity":
    case "createStep":
    case "createCard":
      delta.created_ids.push(
        (action.target_ref as Record<string, unknown>).id as string || "new",
      );
      delta.summary = `${action.action_type}: ${action.payload.title || action.payload.name || "New entity"}`;
      break;

    case "updateCard":
      delta.updated_ids.push(
        (action.target_ref as Record<string, unknown>).card_id as string,
      );
      delta.summary = `Updated card: ${action.payload.title || "unnamed"}`;
      break;

    case "reorderCard":
      delta.reordered_ids.push(
        (action.target_ref as Record<string, unknown>).card_id as string,
      );
      delta.summary = `Reordered card to position ${action.payload.new_position}`;
      break;

    case "linkContextArtifact":
      delta.updated_ids.push(
        (action.target_ref as Record<string, unknown>).card_id as string,
      );
      delta.summary = `Linked context artifact to card`;
      break;

    case "upsertCardPlannedFile":
      delta.updated_ids.push(
        (action.target_ref as Record<string, unknown>).card_id as string,
      );
      delta.summary = `Planned file: ${action.payload.logical_file_name}`;
      break;

    case "approveCardPlannedFile":
      delta.updated_ids.push(
        (action.target_ref as Record<string, unknown>).card_id as string,
      );
      delta.summary = `Approved planned file`;
      break;

    case "upsertCardKnowledgeItem":
      delta.updated_ids.push(
        (action.target_ref as Record<string, unknown>).card_id as string,
      );
      delta.summary = `${action.payload.item_type}: ${action.payload.text.substring(0, 50)}...`;
      break;

    case "setCardKnowledgeStatus":
      delta.updated_ids.push(
        (action.target_ref as Record<string, unknown>).card_id as string,
      );
      delta.summary = `Knowledge item status: ${action.payload.status}`;
      break;
  }

  return delta;
}

/**
 * Batch result: outcome of applying multiple actions
 */
export interface BatchMutationResult {
  success: boolean;
  applied_count: number;
  failed_at_index?: number;
  error?: MutationError;
  final_state?: PlanningState;
  previews: PreviewDelta[]; // Preview of what would happen
}

/**
 * Apply a batch of actions in order with rollback on failure
 * Returns either the final state or an error with rollback information.
 */
export function applyActionBatch(
  actions: PlanningAction[],
  state: PlanningState,
): BatchMutationResult {
  let currentState = clonePlanningState(state);
  const previews: PreviewDelta[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    // Generate preview first
    const preview = previewAction(action, currentState);
    if (preview) {
      previews.push(preview);
    }

    // Apply mutation
    const result = applyAction(action, currentState);

    if (!result.success) {
      // Rollback occurred implicitly since we mutate a clone
      return {
        success: false,
        applied_count: i,
        failed_at_index: i,
        error: result.error,
        previews,
      };
    }

    currentState = result.newState!;
  }

  return {
    success: true,
    applied_count: actions.length,
    final_state: currentState,
    previews,
  };
}

/**
 * Preview a batch of actions without applying them
 * Useful for showing users what will happen before they approve.
 */
export function previewActionBatch(
  actions: PlanningAction[],
  state: PlanningState,
): PreviewDelta[] | null {
  let currentState = clonePlanningState(state);
  const previews: PreviewDelta[] = [];

  for (const action of actions) {
    const preview = previewAction(action, currentState);

    if (!preview) {
      // If any action fails to preview, bail
      return null;
    }

    previews.push(preview);

    // Apply the action to the test state so we have accurate state for next preview
    const result = applyAction(action, currentState);
    if (!result.success) {
      return null;
    }

    currentState = result.newState!;
  }

  return previews;
}

/**
 * Deterministic apply with immutable snapshots
 * Captures the before and after state for auditability.
 */
export interface ImmutableMutationRecord {
  action: PlanningAction;
  state_before: PlanningState;
  state_after?: PlanningState;
  success: boolean;
  error?: MutationError;
  preview?: PreviewDelta;
  applied_at?: string;
}

/**
 * Apply action and record mutations immutably
 */
export function applyActionWithRecord(
  action: PlanningAction,
  state: PlanningState,
): ImmutableMutationRecord {
  const preview = previewAction(action, state);
  const result = applyAction(action, state);

  return {
    action,
    state_before: clonePlanningState(state),
    state_after: result.success ? result.newState : undefined,
    success: result.success,
    error: result.error,
    preview: preview || undefined,
    applied_at: new Date().toISOString(),
  };
}
