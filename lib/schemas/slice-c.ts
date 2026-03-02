import * as z from "zod";
import { runStatusSchema, buildScopeSchema } from "./slice-a";

/**
 * Slice C: Orchestration, Quality Gates, and Approval Entities
 * These schemas cover SystemPolicyProfile, OrchestrationRun, CardAssignment,
 * RunCheck, ApprovalRequest, PullRequestCandidate, and related types.
 * Introduced in Step 9 of prototype-to-MVP journey.
 */

// Re-export for consumers that only import slice-c
export { runStatusSchema, buildScopeSchema };

// ============================================================================
// Enums (orchestration-specific)
// ============================================================================

export const triggerTypeSchema = z.enum(["card", "workflow", "manual"]);

export const agentRoleSchema = z.enum([
  "planner",
  "coder",
  "reviewer",
  "integrator",
  "tester",
]);

export const approvalStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const prStatusSchema = z.enum([
  "not_created",
  "draft_open",
  "open",
  "merged",
  "closed",
]);

export const runCheckTypeSchema = z.enum([
  "dependency",
  "security",
  "policy",
  "lint",
  "unit",
  "integration",
  "e2e",
]);

export const checkStatusSchema = z.enum(["passed", "failed", "skipped"]);

export const approvalTypeSchema = z.enum(["create_pr", "merge_pr"]);

// ============================================================================
// SystemPolicyProfile: Project-level always-on execution constraints
// ============================================================================

export const systemPolicyProfileSchema = z.object({
  id: z.string().guid(),
  project_id: z.string().guid(),
  required_checks: z.array(runCheckTypeSchema),
  protected_paths: z.array(z.string()).nullable().optional(),
  forbidden_paths: z.array(z.string()).nullable().optional(),
  dependency_policy: z.record(z.string(), z.unknown()),
  security_policy: z.record(z.string(), z.unknown()),
  architecture_policy: z.record(z.string(), z.unknown()),
  approval_policy: z.record(z.string(), z.unknown()),
  updated_at: z.string().datetime(),
});

// ============================================================================
// OrchestrationRun: Build execution lifecycle
// ============================================================================

const orchestrationRunBaseSchema = z.object({
  id: z.string().guid(),
  project_id: z.string().guid(),
  scope: buildScopeSchema,
  workflow_id: z.string().guid().nullable().optional(),
  card_id: z.string().guid().nullable().optional(),
  trigger_type: triggerTypeSchema,
  status: runStatusSchema,
  initiated_by: z.string().min(1),
  repo_url: z.string().url(),
  base_branch: z.string().min(1),
  system_policy_profile_id: z.string().guid(),
  system_policy_snapshot: z.record(z.string(), z.unknown()),
  run_input_snapshot: z.record(z.string(), z.unknown()),
  worktree_root: z.string().nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  ended_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const orchestrationRunSchema = orchestrationRunBaseSchema.refine(
  (run) => {
    if (run.scope === "workflow") {
      return run.workflow_id != null && run.card_id == null;
    }
    if (run.scope === "card") {
      return run.card_id != null;
    }
    return true;
  },
  {
    message:
      "OrchestrationRun: scope=workflow requires workflow_id and null card_id; scope=card requires card_id",
  }
);

// ============================================================================
// CardAssignment: Per-card execution assignment
// ============================================================================

export const cardAssignmentSchema = z.object({
  id: z.string().guid(),
  run_id: z.string().guid(),
  card_id: z.string().guid(),
  agent_role: agentRoleSchema,
  agent_profile: z.string().min(1),
  feature_branch: z.string().min(1),
  worktree_path: z.string().nullable().optional(),
  allowed_paths: z.array(z.string()).min(1),
  forbidden_paths: z.array(z.string()).nullable().optional(),
  assignment_input_snapshot: z.record(z.string(), z.unknown()),
  status: runStatusSchema,
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// ============================================================================
// AgentExecution: Per-assignment execution record (optional for MVP)
// ============================================================================

export const agentExecutionSchema = z.object({
  id: z.string().guid(),
  assignment_id: z.string().guid(),
  status: runStatusSchema,
  started_at: z.string().datetime().nullable().optional(),
  ended_at: z.string().datetime().nullable().optional(),
  summary: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

// ============================================================================
// AgentCommit: Commit record from agent execution
// ============================================================================

export const agentCommitSchema = z.object({
  id: z.string().guid(),
  assignment_id: z.string().guid(),
  sha: z.string().min(1),
  branch: z.string().min(1),
  message: z.string().min(1),
  committed_at: z.string().datetime(),
});

// ============================================================================
// RunCheck: Quality gate execution
// ============================================================================

export const runCheckSchema = z.object({
  id: z.string().guid(),
  run_id: z.string().guid(),
  check_type: runCheckTypeSchema,
  status: checkStatusSchema,
  output: z.string().nullable().optional(),
  executed_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().optional(),
});

// ============================================================================
// PullRequestCandidate: Draft PR tracking
// ============================================================================

export const pullRequestCandidateSchema = z.object({
  id: z.string().guid(),
  run_id: z.string().guid(),
  base_branch: z.string().min(1),
  head_branch: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  status: prStatusSchema,
  pr_url: z.string().url().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// ============================================================================
// ApprovalRequest: PR approval lifecycle
// ============================================================================

export const approvalRequestSchema = z.object({
  id: z.string().guid(),
  run_id: z.string().guid(),
  approval_type: approvalTypeSchema,
  status: approvalStatusSchema,
  requested_by: z.string().min(1),
  requested_at: z.string().datetime(),
  resolved_by: z.string().nullable().optional(),
  resolved_at: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// ============================================================================
// EventLog: Audit and observability
// ============================================================================

export const eventLogSchema = z.object({
  id: z.string().guid(),
  project_id: z.string().guid(),
  run_id: z.string().guid().nullable().optional(),
  event_type: z.string().min(1),
  actor: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime(),
});

// ============================================================================
// Input schemas for API/create operations (omit id, timestamps)
// ============================================================================

export const createSystemPolicyProfileInputSchema = systemPolicyProfileSchema
  .omit({ id: true })
  .extend({
    id: z.string().guid().optional(),
  });

export const createOrchestrationRunInputSchema = orchestrationRunBaseSchema
  .omit({
    id: true,
    created_at: true,
    updated_at: true,
  })
  .refine(
    (run) => {
      if (run.scope === "workflow") {
        return run.workflow_id != null && run.card_id == null;
      }
      if (run.scope === "card") {
        return run.card_id != null;
      }
      return true;
    },
    {
      message:
        "OrchestrationRun: scope=workflow requires workflow_id and null card_id; scope=card requires card_id",
    }
  );

export const createCardAssignmentInputSchema = cardAssignmentSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const createRunCheckInputSchema = runCheckSchema.omit({
  id: true,
  created_at: true,
});

export const createPullRequestCandidateInputSchema =
  pullRequestCandidateSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
  });

export const createApprovalRequestInputSchema = approvalRequestSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const createEventLogInputSchema = eventLogSchema.omit({ id: true });

// ============================================================================
// Update schemas (partial)
// ============================================================================

export const updateOrchestrationRunStatusSchema = z.object({
  status: runStatusSchema,
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
});

export const resolveApprovalRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  resolved_by: z.string().min(1),
  notes: z.string().nullable().optional(),
});

export const updatePullRequestCandidateStatusSchema = z.object({
  status: prStatusSchema,
  pr_url: z.string().url().nullable().optional(),
});

// ============================================================================
// Type exports
// ============================================================================

export type RunStatus = z.infer<typeof runStatusSchema>;
export type BuildScope = z.infer<typeof buildScopeSchema>;
export type TriggerType = z.infer<typeof triggerTypeSchema>;
export type AgentRole = z.infer<typeof agentRoleSchema>;
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type PrStatus = z.infer<typeof prStatusSchema>;
export type RunCheckType = z.infer<typeof runCheckTypeSchema>;
export type CheckStatus = z.infer<typeof checkStatusSchema>;
export type ApprovalType = z.infer<typeof approvalTypeSchema>;

export type SystemPolicyProfile = z.infer<typeof systemPolicyProfileSchema>;
export type OrchestrationRun = z.infer<typeof orchestrationRunSchema>;
export type CardAssignment = z.infer<typeof cardAssignmentSchema>;
export type AgentExecution = z.infer<typeof agentExecutionSchema>;
export type AgentCommit = z.infer<typeof agentCommitSchema>;
export type RunCheck = z.infer<typeof runCheckSchema>;
export type PullRequestCandidate = z.infer<typeof pullRequestCandidateSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type EventLog = z.infer<typeof eventLogSchema>;
