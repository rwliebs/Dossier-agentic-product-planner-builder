import * as z from "zod";
import {
  cardStatusSchema,
  planningActionTypeSchema,
  planningActionSchema,
} from "./slice-a";
import { artifactTypeSchema, plannedFileActionSchema, plannedFileKindSchema } from "./slice-b";

/**
 * Action Payload Schemas
 * Each action type has specific payload and target_ref requirements.
 */

// ============================================================================
// updateProject: Update project name, description, customer personas, tech stack, deployment
// ============================================================================

export const updateProjectPayloadSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  customer_personas: z.string().nullable().optional(),
  tech_stack: z.string().nullable().optional(),
  deployment: z.string().nullable().optional(),
  design_inspiration: z.string().nullable().optional(),
});

export const updateProjectTargetRefSchema = z.object({
  project_id: z.string().uuid(),
});

// ============================================================================
// createWorkflow: Create a new workflow in a project
// ============================================================================

export const createWorkflowPayloadSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  position: z.number().int().nonnegative(),
});

export const createWorkflowTargetRefSchema = z.object({
  project_id: z.string().uuid(),
});

// ============================================================================
// createActivity: Create a new workflow activity
// ============================================================================

export const createActivityPayloadSchema = z.object({
  id: z.string().uuid().optional(), // When provided, createCard can reference this in target_ref.workflow_activity_id
  title: z.string().min(1),
  color: z
    .enum(["yellow", "blue", "purple", "green", "orange", "pink"])
    .nullable()
    .optional(),
  position: z.number().int().nonnegative().optional().default(0),
});

export const createActivityTargetRefSchema = z.object({
  workflow_id: z.string().uuid(),
});

// ============================================================================
// createCard: Create a new card within an activity
// ============================================================================

export const createCardPayloadSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: cardStatusSchema,
  priority: z.number().int().nonnegative().default(0),
  position: z.number().int().nonnegative().optional().default(0),
});

export const createCardTargetRefSchema = z.object({
  workflow_activity_id: z.string().uuid(),
});

// ============================================================================
// updateCard: Update card properties (title, description, status, priority)
// ============================================================================
// title, status, priority: optional (omit to keep current); null accepted to mean "no change".
// When provided as non-null, must satisfy Card schema. description may be null to clear.
export const updateCardPayloadSchema = z.object({
  title: z.string().min(1).nullable().optional(),
  description: z.string().nullable().optional(),
  status: cardStatusSchema.nullable().optional(),
  priority: z.number().int().nonnegative().nullable().optional(),
  quick_answer: z.string().nullable().optional(),
});

export const updateCardTargetRefSchema = z.object({
  card_id: z.string().uuid(),
});

// ============================================================================
// reorderCard: Move card within an activity
// ============================================================================

export const reorderCardPayloadSchema = z.object({
  new_position: z.number().int().nonnegative(),
});

export const reorderCardTargetRefSchema = z.object({
  card_id: z.string().uuid(),
});

// ============================================================================
// linkContextArtifact: Link a context artifact to a card
// ============================================================================

export const linkContextArtifactPayloadSchema = z.object({
  context_artifact_id: z.string().uuid(),
  linked_by: z.string().nullable().optional(),
  usage_hint: z.string().nullable().optional(),
});

export const linkContextArtifactTargetRefSchema = z.object({
  card_id: z.string().uuid(),
});

// ============================================================================
// createContextArtifact: Create a project-level context artifact (optionally linked to a card)
// ============================================================================

export const createContextArtifactPayloadSchema = z.object({
  name: z.string().min(1),
  type: artifactTypeSchema,
  title: z.string().nullable().optional(),
  content: z.string().min(1),
  card_id: z.string().uuid().nullable().optional(),
});

export const createContextArtifactTargetRefSchema = z.object({
  project_id: z.string().uuid(),
});

// ============================================================================
// upsertCardPlannedFile: Create or update a planned file
// ============================================================================

export const upsertCardPlannedFilePayloadSchema = z.object({
  logical_file_name: z.string().min(1),
  module_hint: z.string().nullable().optional(),
  artifact_kind: plannedFileKindSchema,
  action: plannedFileActionSchema,
  intent_summary: z.string().min(1),
  contract_notes: z.string().nullable().optional(),
  position: z.number().int().nonnegative(),
  planned_file_id: z.string().uuid().nullable().optional(), // if null, insert; else update
});

export const upsertCardPlannedFileTargetRefSchema = z.object({
  card_id: z.string().uuid(),
});

// ============================================================================
// approveCardPlannedFile: Approve or reject a planned file
// ============================================================================

export const approveCardPlannedFilePayloadSchema = z.object({
  planned_file_id: z.string().uuid(),
  status: z.enum(["approved", "proposed"]), // only these can be approved
});

export const approveCardPlannedFileTargetRefSchema = z.object({
  card_id: z.string().uuid(),
});

// ============================================================================
// upsertCardKnowledgeItem: Create or update a knowledge item (requirement, fact, assumption, question)
// ============================================================================

export const upsertCardKnowledgeItemPayloadSchema = z.object({
  item_type: z.enum(["requirement", "fact", "assumption", "question"]),
  text: z.string().min(1),
  evidence_source: z.string().nullable().optional(), // for facts
  confidence: z.number().min(0).max(1).nullable().optional(),
  position: z.number().int().nonnegative(),
  knowledge_item_id: z.string().uuid().nullable().optional(), // if null, insert; else update
});

export const upsertCardKnowledgeItemTargetRefSchema = z.object({
  card_id: z.string().uuid(),
});

// ============================================================================
// setCardKnowledgeStatus: Change status of a knowledge item
// ============================================================================

export const setCardKnowledgeStatusPayloadSchema = z.object({
  knowledge_item_id: z.string().uuid(),
  status: z.enum(["draft", "approved", "rejected"]),
});

export const setCardKnowledgeStatusTargetRefSchema = z.object({
  card_id: z.string().uuid(),
});

// ============================================================================
// Payload and target_ref by action type (for validation by action_type)
// ============================================================================

export const payloadSchemaByActionType: Record<
  z.infer<typeof planningActionTypeSchema>,
  z.ZodType
> = {
  updateProject: updateProjectPayloadSchema,
  createWorkflow: createWorkflowPayloadSchema,
  createActivity: createActivityPayloadSchema,
  createCard: createCardPayloadSchema,
  updateCard: updateCardPayloadSchema,
  reorderCard: reorderCardPayloadSchema,
  linkContextArtifact: linkContextArtifactPayloadSchema,
  createContextArtifact: createContextArtifactPayloadSchema,
  upsertCardPlannedFile: upsertCardPlannedFilePayloadSchema,
  approveCardPlannedFile: approveCardPlannedFilePayloadSchema,
  upsertCardKnowledgeItem: upsertCardKnowledgeItemPayloadSchema,
  setCardKnowledgeStatus: setCardKnowledgeStatusPayloadSchema,
};

export const targetRefSchemaByActionType: Record<
  z.infer<typeof planningActionTypeSchema>,
  z.ZodType
> = {
  updateProject: updateProjectTargetRefSchema,
  createWorkflow: createWorkflowTargetRefSchema,
  createActivity: createActivityTargetRefSchema,
  createCard: createCardTargetRefSchema,
  updateCard: updateCardTargetRefSchema,
  reorderCard: reorderCardTargetRefSchema,
  linkContextArtifact: linkContextArtifactTargetRefSchema,
  createContextArtifact: createContextArtifactTargetRefSchema,
  upsertCardPlannedFile: upsertCardPlannedFileTargetRefSchema,
  approveCardPlannedFile: approveCardPlannedFileTargetRefSchema,
  upsertCardKnowledgeItem: upsertCardKnowledgeItemTargetRefSchema,
  setCardKnowledgeStatus: setCardKnowledgeStatusTargetRefSchema,
};

// ============================================================================
// Union of all action payloads and target refs
// ============================================================================

export const actionPayloadsSchema = z.union([
  updateProjectPayloadSchema,
  createWorkflowPayloadSchema,
  createActivityPayloadSchema,
  createCardPayloadSchema,
  updateCardPayloadSchema,
  reorderCardPayloadSchema,
  linkContextArtifactPayloadSchema,
  createContextArtifactPayloadSchema,
  upsertCardPlannedFilePayloadSchema,
  approveCardPlannedFilePayloadSchema,
  upsertCardKnowledgeItemPayloadSchema,
  setCardKnowledgeStatusPayloadSchema,
]);

export const actionTargetRefsSchema = z.union([
  updateProjectTargetRefSchema,
  createWorkflowTargetRefSchema,
  createActivityTargetRefSchema,
  createCardTargetRefSchema,
  updateCardTargetRefSchema,
  reorderCardTargetRefSchema,
  linkContextArtifactTargetRefSchema,
  createContextArtifactTargetRefSchema,
  upsertCardPlannedFileTargetRefSchema,
  approveCardPlannedFileTargetRefSchema,
  upsertCardKnowledgeItemTargetRefSchema,
  setCardKnowledgeStatusTargetRefSchema,
]);

// ============================================================================
// Validated PlanningAction with stricter payload/target_ref contracts
// ============================================================================

export const validatedPlanningActionSchema = planningActionSchema.extend({
  action_type: planningActionTypeSchema,
  target_ref: actionTargetRefsSchema,
  payload: actionPayloadsSchema,
});

// ============================================================================
// Type exports
// ============================================================================

export type UpdateProjectPayload = z.infer<typeof updateProjectPayloadSchema>;
export type CreateWorkflowPayload = z.infer<typeof createWorkflowPayloadSchema>;
export type CreateActivityPayload = z.infer<typeof createActivityPayloadSchema>;
export type CreateCardPayload = z.infer<typeof createCardPayloadSchema>;
export type UpdateCardPayload = z.infer<typeof updateCardPayloadSchema>;
export type ReorderCardPayload = z.infer<typeof reorderCardPayloadSchema>;
export type LinkContextArtifactPayload = z.infer<
  typeof linkContextArtifactPayloadSchema
>;
export type CreateContextArtifactPayload = z.infer<
  typeof createContextArtifactPayloadSchema
>;
export type UpsertCardPlannedFilePayload = z.infer<
  typeof upsertCardPlannedFilePayloadSchema
>;
export type ApproveCardPlannedFilePayload = z.infer<
  typeof approveCardPlannedFilePayloadSchema
>;
export type UpsertCardKnowledgeItemPayload = z.infer<
  typeof upsertCardKnowledgeItemPayloadSchema
>;
export type SetCardKnowledgeStatusPayload = z.infer<
  typeof setCardKnowledgeStatusPayloadSchema
>;

export type ValidatedPlanningAction = z.infer<
  typeof validatedPlanningActionSchema
>;
