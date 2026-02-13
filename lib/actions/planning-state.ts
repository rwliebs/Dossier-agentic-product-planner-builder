// This file has been replaced by lib/schemas/planning-state.ts and individual action files
// Re-exporting from the new locations for backward compatibility
export { createEmptyPlanningState, clonePlanningState } from "@/lib/schemas/planning-state";
export type { PlanningState, ValidationError, ValidationResult } from "@/lib/schemas/planning-state";
export { validateAction } from "./validate-action";
export { applyAction } from "./apply-action";
export type { MutationResult, ImmutableMutationRecord } from "./apply-action";
export { previewAction, applyActionBatch, previewActionBatch } from "./preview-action";
export type { PreviewDelta, BatchMutationResult } from "./preview-action";
