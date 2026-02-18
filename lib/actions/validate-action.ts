import { PlanningAction, planningActionSchema } from "@/lib/schemas/slice-a";
import {
  payloadSchemaByActionType,
  targetRefSchemaByActionType,
} from "@/lib/schemas/action-payloads";
import {
  PlanningState,
  ValidationResult,
  ValidationError,
  workflowExists,
  activityExists,
  stepExists,
  cardExists,
  contextArtifactExists,
  containsCodeGenerationIntent,
} from "@/lib/schemas/planning-state";

/**
 * Validate Action Step 1: Schema Validation
 * Ensures the action payload conforms to the schema for its action type.
 */
export function validateActionSchema(action: PlanningAction): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check basic planning action shape
  try {
    planningActionSchema.parse(action);
  } catch (error: unknown) {
    const err = error as { issues?: Array<{ message: string }> };
    errors.push({
      code: "invalid_schema",
      message: "Action failed basic schema validation",
      details: {
        reason: err.issues?.[0]?.message || "Unknown schema error",
      },
    });
    return errors;
  }

  // Check action-specific payload and target_ref (by action_type)
  const payloadSchema = payloadSchemaByActionType[action.action_type];
  const targetRefSchema = targetRefSchemaByActionType[action.action_type];
  if (payloadSchema) {
    try {
      payloadSchema.parse(action.payload);
    } catch (error: unknown) {
      const err = error as { issues?: Array<{ message: string }> };
      errors.push({
        code: "invalid_schema",
        message: `Action payload failed validation for type: ${action.action_type}`,
        details: {
          reason: err.issues?.[0]?.message || "Unknown payload error",
        },
      });
    }
  }
  if (targetRefSchema) {
    try {
      targetRefSchema.parse(action.target_ref);
    } catch (error: unknown) {
      const err = error as { issues?: Array<{ message: string }> };
      errors.push({
        code: "invalid_schema",
        message: `Action target_ref failed validation for type: ${action.action_type}`,
        details: {
          reason: err.issues?.[0]?.message || "Unknown target_ref error",
        },
      });
    }
  }

  return errors;
}

/**
 * Validate Action Step 2: Referential Integrity
 * Ensures all referenced entities exist in the current state.
 */
export function validateReferentialIntegrity(
  action: PlanningAction,
  state: PlanningState,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const target_ref = action.target_ref as Record<string, string>;

  switch (action.action_type) {
    case "updateProject":
      // project_id is implicit from context
      break;

    case "createWorkflow":
      // project_id must exist (implicit: we're in a project context)
      break;

    case "createActivity":
      if (target_ref.workflow_id && !workflowExists(state, target_ref.workflow_id)) {
        errors.push({
          code: "referential_integrity",
          message: `Referenced workflow ${target_ref.workflow_id} does not exist`,
        });
      }
      break;

    case "createStep":
      if (
        target_ref.workflow_activity_id &&
        !activityExists(state, target_ref.workflow_activity_id)
      ) {
        errors.push({
          code: "referential_integrity",
          message: `Referenced activity ${target_ref.workflow_activity_id} does not exist`,
        });
      }
      break;

    case "createCard":
      if (
        target_ref.workflow_activity_id &&
        !activityExists(state, target_ref.workflow_activity_id)
      ) {
        errors.push({
          code: "referential_integrity",
          message: `Referenced activity ${target_ref.workflow_activity_id} does not exist`,
        });
      }
      const createCardPayload = action.payload as Record<string, unknown>;
      if (createCardPayload.step_id) {
        const stepId = createCardPayload.step_id as string;
        if (!stepExists(state, stepId)) {
          errors.push({
            code: "referential_integrity",
            message: `Referenced step ${stepId} does not exist`,
          });
        }
      }
      break;

    case "updateCard":
    case "reorderCard":
      if (target_ref.card_id && !cardExists(state, target_ref.card_id)) {
        errors.push({
          code: "referential_integrity",
          message: `Referenced card ${target_ref.card_id} does not exist`,
        });
      }
      break;

    case "linkContextArtifact":
      if (target_ref.card_id && !cardExists(state, target_ref.card_id)) {
        errors.push({
          code: "referential_integrity",
          message: `Referenced card ${target_ref.card_id} does not exist`,
        });
      }
      const linkPayload = action.payload as Record<string, unknown>;
      if (
        linkPayload.context_artifact_id &&
        !contextArtifactExists(
          state,
          linkPayload.context_artifact_id as string,
        )
      ) {
        errors.push({
          code: "referential_integrity",
          message: `Referenced artifact ${linkPayload.context_artifact_id} does not exist`,
        });
      }
      break;

    case "upsertCardPlannedFile":
    case "approveCardPlannedFile":
    case "upsertCardKnowledgeItem":
    case "setCardKnowledgeStatus":
      if (target_ref.card_id && !cardExists(state, target_ref.card_id)) {
        errors.push({
          code: "referential_integrity",
          message: `Referenced card ${target_ref.card_id} does not exist`,
        });
      }
      break;
  }

  return errors;
}

/**
 * Validate Action Step 3: Policy Checks
 * Ensures the action complies with business rules and constraints.
 */
export function validatePolicies(
  action: PlanningAction,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for code generation intent
  if (containsCodeGenerationIntent(action.action_type, action.payload)) {
    errors.push({
      code: "code_generation_detected",
      message:
        "Planning actions cannot generate production code. Code generation must be deferred to orchestration phase.",
      details: {
        action_type: action.action_type,
      },
    });
  }

  return errors;
}

/**
 * Comprehensive action validation
 * Returns ValidationResult with all errors collected.
 */
export function validateAction(
  action: PlanningAction,
  state: PlanningState,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Step 1: Schema validation
  errors.push(...validateActionSchema(action));
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Step 2: Referential integrity
  errors.push(...validateReferentialIntegrity(action, state));

  // Step 3: Policy checks
  errors.push(...validatePolicies(action));

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Batch validation for multiple actions
 * Stops on first error or validates all and returns aggregated results.
 */
export function validateActionBatch(
  actions: PlanningAction[],
  state: PlanningState,
  stopOnError: boolean = false,
): ValidationResult {
  const allErrors: ValidationError[] = [];

  for (let i = 0; i < actions.length; i++) {
    const result = validateAction(actions[i], state);
    if (!result.valid) {
      // Annotate errors with action index for batch context
      result.errors.forEach((err) => {
        allErrors.push({
          ...err,
          details: {
            ...err.details,
            action_index: i,
          },
        });
      });

      if (stopOnError) {
        break;
      }
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
