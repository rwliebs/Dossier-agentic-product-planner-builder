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
  "createWorkflow",
  "createActivity",
  "createStep",
  "createCard",
  "updateCard",
  "reorderCard",
  "linkContextArtifact",
  "upsertCardPlannedFile",
  "approveCardPlannedFile",
  "upsertCardKnowledgeItem",
  "setCardKnowledgeStatus",
]);

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  repo_url: z.string().url().nullable().optional(),
  default_branch: z.string().min(1).default("main"),
});

export const workflowSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  build_state: runStatusSchema.nullable().optional(),
  position: z.number().int(),
});

export const workflowActivitySchema = z.object({
  id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  title: z.string().min(1),
  color: activityColorSchema.nullable().optional(),
  position: z.number().int(),
});

export const stepSchema = z.object({
  id: z.string().uuid(),
  workflow_activity_id: z.string().uuid(),
  title: z.string().min(1),
  position: z.number().int(),
});

export const cardSchema = z.object({
  id: z.string().uuid(),
  workflow_activity_id: z.string().uuid(),
  step_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: cardStatusSchema,
  priority: z.number().int(),
  position: z.number().int(),
  quick_answer: z.string().nullable().optional(),
});

export const planningActionSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  action_type: planningActionTypeSchema,
  target_ref: z.record(z.unknown()),
  payload: z.record(z.unknown()),
});

export type Project = z.infer<typeof projectSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowActivity = z.infer<typeof workflowActivitySchema>;
export type Step = z.infer<typeof stepSchema>;
export type Card = z.infer<typeof cardSchema>;
export type CardStatus = z.infer<typeof cardStatusSchema>;
export type PlanningAction = z.infer<typeof planningActionSchema>;
