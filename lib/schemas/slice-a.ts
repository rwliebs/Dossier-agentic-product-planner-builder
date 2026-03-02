import * as z from "zod";

export const cardStatusSchema = z.enum([
  "todo",
  "active",
  "questions",
  "review",
  "production",
]);

export const activityColorSchema = z.enum([
  "yellow",
  "blue",
  "purple",
  "green",
  "orange",
  "pink",
]);

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "blocked",
  "failed",
  "completed",
  "cancelled",
]);

export const buildScopeSchema = z.enum(["workflow", "card"]);

export const planningActionTypeSchema = z.enum([
  "updateProject",
  "createWorkflow",
  "createActivity",
  "createCard",
  "updateCard",
  "reorderCard",
  "deleteWorkflow",
  "deleteActivity",
  "deleteCard",
  "linkContextArtifact",
  "createContextArtifact",
  "upsertCardPlannedFile",
  "upsertCardKnowledgeItem",
]);

export const projectSchema = z.object({
  id: z.string().guid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  customer_personas: z.string().nullable().optional(),
  tech_stack: z.string().nullable().optional(),
  deployment: z.string().nullable().optional(),
  design_inspiration: z.string().nullable().optional(),
  repo_url: z.string().url().nullable().optional(),
  default_branch: z.string().min(1).default("main"),
});

export const workflowSchema = z.object({
  id: z.string().guid(),
  project_id: z.string().guid(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  build_state: runStatusSchema.nullable().optional(),
  position: z.number().int(),
});

export const workflowActivitySchema = z.object({
  id: z.string().guid(),
  workflow_id: z.string().guid(),
  title: z.string().min(1),
  color: activityColorSchema.nullable().optional(),
  position: z.number().int(),
});

export const cardSchema = z.object({
  id: z.string().guid(),
  workflow_activity_id: z.string().guid(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: cardStatusSchema,
  priority: z.number().int(),
  position: z.number().int(),
  quick_answer: z.string().nullable().optional(),
  finalized_at: z.string().datetime().nullable().optional(),
});

export const planningActionSchema = z.object({
  id: z.string().guid(),
  project_id: z.union([z.string().guid(), z.literal("")]).optional(),
  action_type: planningActionTypeSchema,
  target_ref: z.record(z.string(), z.unknown()),
  payload: z.record(z.string(), z.unknown()),
});

export type Project = z.infer<typeof projectSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowActivity = z.infer<typeof workflowActivitySchema>;
export type Card = z.infer<typeof cardSchema>;
export type CardStatus = z.infer<typeof cardStatusSchema>;
export type PlanningAction = z.infer<typeof planningActionSchema>;
