import type { PlanningAction } from "@/lib/schemas/slice-a";
import type { PlanningState } from "@/lib/schemas/planning-state";
import { validateAction } from "@/lib/actions/validate-action";
import { applyAction } from "@/lib/actions/apply-action";

export interface RejectedAction {
  action: PlanningAction;
  reason: string;
  errors: Array<{ code: string; message: string }>;
}

export interface ValidatePlanningOutputResult {
  valid: PlanningAction[];
  rejected: RejectedAction[];
}

/**
 * Validate parsed LLM actions against current state.
 * Uses sequential validation: each action is validated against state that includes
 * previously applied actions in the batch. This allows createWorkflow + createActivity
 * in the same batch (activity references the workflow being created).
 */
export function validatePlanningOutput(
  actions: PlanningAction[],
  state: PlanningState,
): ValidatePlanningOutputResult {
  const valid: PlanningAction[] = [];
  const rejected: RejectedAction[] = [];
  let currentState = state;

  for (const action of actions) {
    const result = validateAction(action, currentState);

    if (result.valid) {
      const applyResult = applyAction(action, currentState);
      if (applyResult.success && applyResult.newState) {
        valid.push(action);
        currentState = applyResult.newState;
      } else {
        rejected.push({
          action,
          reason: applyResult.error?.message ?? "Apply failed",
          errors: [
            {
              code: applyResult.error?.code ?? "mutation_failed",
              message: applyResult.error?.message ?? "Unknown error",
            },
          ],
        });
      }
    } else {
      rejected.push({
        action,
        reason: result.errors.map((e) => e.message).join("; "),
        errors: result.errors.map((e) => ({
          code: e.code,
          message: e.message,
        })),
      });
    }
  }

  return { valid, rejected };
}
