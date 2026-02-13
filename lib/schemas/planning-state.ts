import type {
  Project,
  Workflow,
  WorkflowActivity,
  Step,
  Card,
} from "./slice-a";
import type {
  ContextArtifact,
  CardRequirement,
  CardKnownFact,
  CardAssumption,
  CardQuestion,
  CardPlannedFile,
} from "./slice-b";

/**
 * Canonical Planning State
 * Represents the current state of a project's story map and related entities.
 * This is the single source of truth during action validation and mutation.
 */

export interface PlanningState {
  project: Project;
  workflows: Map<string, Workflow>;
  activities: Map<string, WorkflowActivity>;
  steps: Map<string, Step>;
  cards: Map<string, Card>;
  contextArtifacts: Map<string, ContextArtifact>;
  cardContextLinks: Map<string, Set<string>>; // card_id -> Set<artifact_id>
  cardRequirements: Map<string, CardRequirement[]>; // card_id -> requirements
  cardFacts: Map<string, CardKnownFact[]>; // card_id -> facts
  cardAssumptions: Map<string, CardAssumption[]>; // card_id -> assumptions
  cardQuestions: Map<string, CardQuestion[]>; // card_id -> questions
  cardPlannedFiles: Map<string, CardPlannedFile[]>; // card_id -> planned files
}

/**
 * Create an empty planning state for a project
 */
export function createEmptyPlanningState(project: Project): PlanningState {
  return {
    project,
    workflows: new Map(),
    activities: new Map(),
    steps: new Map(),
    cards: new Map(),
    contextArtifacts: new Map(),
    cardContextLinks: new Map(),
    cardRequirements: new Map(),
    cardFacts: new Map(),
    cardAssumptions: new Map(),
    cardQuestions: new Map(),
    cardPlannedFiles: new Map(),
  };
}

/**
 * Validation error type for action failures
 */
export interface ValidationError {
  code:
    | "invalid_schema"
    | "referential_integrity"
    | "duplicate_entry"
    | "ordering_conflict"
    | "policy_violation"
    | "code_generation_detected";
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Check if a workflow exists in the state
 */
export function workflowExists(
  state: PlanningState,
  workflowId: string,
): boolean {
  return state.workflows.has(workflowId);
}

/**
 * Check if an activity exists in the state
 */
export function activityExists(
  state: PlanningState,
  activityId: string,
): boolean {
  return state.activities.has(activityId);
}

/**
 * Check if a step exists in the state
 */
export function stepExists(state: PlanningState, stepId: string): boolean {
  return state.steps.has(stepId);
}

/**
 * Check if a card exists in the state
 */
export function cardExists(state: PlanningState, cardId: string): boolean {
  return state.cards.has(cardId);
}

/**
 * Check if a context artifact exists in the state
 */
export function contextArtifactExists(
  state: PlanningState,
  artifactId: string,
): boolean {
  return state.contextArtifacts.has(artifactId);
}

/**
 * Get all activities within a workflow
 */
export function getWorkflowActivities(
  state: PlanningState,
  workflowId: string,
): WorkflowActivity[] {
  return Array.from(state.activities.values()).filter(
    (a) => a.workflow_id === workflowId,
  );
}

/**
 * Get all steps within an activity
 */
export function getActivitySteps(
  state: PlanningState,
  activityId: string,
): Step[] {
  return Array.from(state.steps.values()).filter(
    (s) => s.workflow_activity_id === activityId,
  );
}

/**
 * Get all cards within a step
 */
export function getStepCards(state: PlanningState, stepId: string): Card[] {
  return Array.from(state.cards.values()).filter((c) => c.step_id === stepId);
}

/**
 * Get all cards within an activity (including those without steps)
 */
export function getActivityCards(
  state: PlanningState,
  activityId: string,
): Card[] {
  return Array.from(state.cards.values()).filter(
    (c) => c.workflow_activity_id === activityId,
  );
}

/**
 * Get max position within a container to determine next position
 */
export function getMaxPosition(
  items: { position: number }[],
  defaultMax: number = 0,
): number {
  if (items.length === 0) return defaultMax;
  return Math.max(...items.map((i) => i.position));
}

/**
 * Check if action contains code generation intent
 * Rejects actions that propose generating production code.
 */
export function containsCodeGenerationIntent(
  actionType: string,
  payload: Record<string, unknown>,
): boolean {
  // Check for explicit code generation keywords in payloads
  const suspiciousPatterns = [
    /generate.*code/i,
    /write.*code/i,
    /implement.*function/i,
    /create.*class/i,
    /code.*snippet/i,
  ];

  const payloadStr = JSON.stringify(payload).toLowerCase();
  return suspiciousPatterns.some((pattern) => pattern.test(payloadStr));
}

/**
 * Deep clone planning state for immutable mutations
 */
export function clonePlanningState(state: PlanningState): PlanningState {
  return {
    project: { ...state.project },
    workflows: new Map(state.workflows),
    activities: new Map(state.activities),
    steps: new Map(state.steps),
    cards: new Map(state.cards),
    contextArtifacts: new Map(state.contextArtifacts),
    cardContextLinks: new Map(
      Array.from(state.cardContextLinks.entries()).map(([k, v]) => [
        k,
        new Set(v),
      ]),
    ),
    cardRequirements: new Map(
      Array.from(state.cardRequirements.entries()).map(([k, v]) => [
        k,
        [...v],
      ]),
    ),
    cardFacts: new Map(
      Array.from(state.cardFacts.entries()).map(([k, v]) => [k, [...v]]),
    ),
    cardAssumptions: new Map(
      Array.from(state.cardAssumptions.entries()).map(([k, v]) => [
        k,
        [...v],
      ]),
    ),
    cardQuestions: new Map(
      Array.from(state.cardQuestions.entries()).map(([k, v]) => [k, [...v]]),
    ),
    cardPlannedFiles: new Map(
      Array.from(state.cardPlannedFiles.entries()).map(([k, v]) => [
        k,
        [...v],
      ]),
    ),
  };
}
