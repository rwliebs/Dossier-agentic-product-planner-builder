import * as z from "zod";

/**
 * Slice B: Card Context and Knowledge Entities
 * These schemas cover ContextArtifact, CardContextArtifact, and all card knowledge items.
 * Introduced in Step 2 of prototype-to-MVP journey.
 */

// ============================================================================
// Enums
// ============================================================================

export const artifactTypeSchema = z.enum([
  "doc",
  "design",
  "code",
  "research",
  "link",
  "image",
  "skill",
  "mcp",
  "cli",
  "api",
  "prompt",
  "spec",
  "runbook",
  "test",
]);

export const plannedFileActionSchema = z.enum(["create", "edit"]);

export const plannedFileKindSchema = z.enum([
  "component",
  "endpoint",
  "service",
  "schema",
  "hook",
  "util",
  "middleware",
  "job",
  "config",
]);

export const plannedFileStatusSchema = z.enum([
  "proposed",
  "user_edited",
  "approved",
]);

export const knowledgeItemStatusSchema = z.enum([
  "draft",
  "approved",
  "rejected",
]);

// NOTE: Status fields are retained in the schema for DB compatibility but
// are no longer used for gating. All items are treated as active regardless
// of status value.

export const knowledgeItemSourceSchema = z.enum([
  "agent",
  "user",
  "imported",
]);

// ============================================================================
// ContextArtifact: Project-level reusable context
// ============================================================================

export const contextArtifactSchema = z.object({
  id: z.string().guid(),
  project_id: z.string().guid(),
  name: z.string().min(1),
  type: artifactTypeSchema,
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  uri: z.string().nullable().optional(), // URL/path/identifier
  locator: z.string().nullable().optional(), // pointer like endpoint path, command, skill id
  mime_type: z.string().nullable().optional(),
  integration_ref: z.record(z.string(), z.unknown()).nullable().optional(), // provider-specific handle
  checksum: z.string().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Validation: at least one of content, uri, or integration_ref must be present
export const contextArtifactValidated = contextArtifactSchema.refine(
  (artifact) =>
    artifact.content || artifact.uri || artifact.integration_ref,
  {
    message:
      "ContextArtifact must have at least one of: content, uri, or integration_ref",
  },
);

// ============================================================================
// CardContextArtifact: Many-to-many link between Card and ContextArtifact
// ============================================================================

export const cardContextArtifactSchema = z.object({
  card_id: z.string().guid(),
  context_artifact_id: z.string().guid(),
  linked_by: z.string().nullable().optional(),
  usage_hint: z.string().nullable().optional(),
});

// ============================================================================
// CardRequirement: Knowledge item for card requirements
// ============================================================================

export const cardRequirementSchema = z.object({
  id: z.string().guid(),
  card_id: z.string().guid(),
  text: z.string().min(1),
  status: knowledgeItemStatusSchema,
  source: knowledgeItemSourceSchema,
  confidence: z.number().min(0).max(1).nullable().optional(),
  position: z.number().int().nonnegative(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// ============================================================================
// CardKnownFact: Knowledge item for facts discovered about the card
// ============================================================================

export const cardKnownFactSchema = z.object({
  id: z.string().guid(),
  card_id: z.string().guid(),
  text: z.string().min(1),
  evidence_source: z.string().nullable().optional(),
  status: knowledgeItemStatusSchema,
  source: knowledgeItemSourceSchema,
  confidence: z.number().min(0).max(1).nullable().optional(),
  position: z.number().int().nonnegative(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// ============================================================================
// CardAssumption: Knowledge item for assumptions about the card
// ============================================================================

export const cardAssumptionSchema = z.object({
  id: z.string().guid(),
  card_id: z.string().guid(),
  text: z.string().min(1),
  status: knowledgeItemStatusSchema,
  source: knowledgeItemSourceSchema,
  confidence: z.number().min(0).max(1).nullable().optional(),
  position: z.number().int().nonnegative(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// ============================================================================
// CardQuestion: Knowledge item for open questions about the card
// ============================================================================

export const cardQuestionSchema = z.object({
  id: z.string().guid(),
  card_id: z.string().guid(),
  text: z.string().min(1),
  status: knowledgeItemStatusSchema,
  source: knowledgeItemSourceSchema,
  confidence: z.number().min(0).max(1).nullable().optional(),
  position: z.number().int().nonnegative(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// ============================================================================
// CardPlannedFile: Planned file artifact for orchestration
// ============================================================================

export const cardPlannedFileSchema = z.object({
  id: z.string().guid(),
  card_id: z.string().guid(),
  logical_file_name: z.string().min(1),
  module_hint: z.string().nullable().optional(),
  artifact_kind: plannedFileKindSchema,
  action: plannedFileActionSchema,
  intent_summary: z.string().min(1),
  contract_notes: z.string().nullable().optional(),
  status: plannedFileStatusSchema,
  position: z.number().int().nonnegative(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// ============================================================================
// Composite types for common queries
// ============================================================================

// Card with all its knowledge items and planned files loaded
export const cardWithContextSchema = z.object({
  card_id: z.string().guid(),
  requirements: z.array(cardRequirementSchema),
  facts: z.array(cardKnownFactSchema),
  assumptions: z.array(cardAssumptionSchema),
  questions: z.array(cardQuestionSchema),
  planned_files: z.array(cardPlannedFileSchema),
  context_artifacts: z.array(contextArtifactSchema),
});

// ============================================================================
// Type exports
// ============================================================================

export type ContextArtifact = z.infer<typeof contextArtifactSchema>;
export type CardContextArtifact = z.infer<typeof cardContextArtifactSchema>;
export type CardRequirement = z.infer<typeof cardRequirementSchema>;
export type CardKnownFact = z.infer<typeof cardKnownFactSchema>;
export type CardAssumption = z.infer<typeof cardAssumptionSchema>;
export type CardQuestion = z.infer<typeof cardQuestionSchema>;
export type CardPlannedFile = z.infer<typeof cardPlannedFileSchema>;
export type CardWithContext = z.infer<typeof cardWithContextSchema>;
