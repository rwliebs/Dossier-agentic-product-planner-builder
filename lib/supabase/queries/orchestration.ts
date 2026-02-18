/**
 * Orchestration CRUD (slice-c).
 * Uses DbAdapter - no Supabase dependency.
 */

import type { DbAdapter } from "@/lib/db/adapter";

/** Singular table names (strategy-aligned schema). */
export const ORCHESTRATION_TABLES = {
  system_policy_profiles: "system_policy_profile",
  orchestration_runs: "orchestration_run",
  card_assignments: "card_assignment",
  agent_executions: "agent_execution",
  agent_commits: "agent_commit",
  run_checks: "run_check",
  pull_request_candidates: "pull_request_candidate",
  approval_requests: "approval_request",
  event_logs: "event_log",
} as const;

export async function getSystemPolicyProfileByProject(
  db: DbAdapter,
  projectId: string
) {
  return db.getSystemPolicyProfileByProject(projectId);
}

export async function getOrchestrationRun(db: DbAdapter, runId: string) {
  return db.getOrchestrationRun(runId);
}

export async function listOrchestrationRunsByProject(
  db: DbAdapter,
  projectId: string,
  options?: { scope?: "workflow" | "card"; status?: string; limit?: number }
) {
  return db.listOrchestrationRunsByProject(projectId, options);
}

export async function getCardAssignmentsByRun(db: DbAdapter, runId: string) {
  return db.getCardAssignmentsByRun(runId);
}

export async function getCardAssignment(db: DbAdapter, assignmentId: string) {
  return db.getCardAssignment(assignmentId);
}

export async function updateCardAssignmentStatus(
  db: DbAdapter,
  assignmentId: string,
  status: string
) {
  return db.updateCardAssignment(assignmentId, { status });
}

export async function getRunChecksByRun(db: DbAdapter, runId: string) {
  return db.getRunChecksByRun(runId);
}

export async function getRunCheck(db: DbAdapter, checkId: string) {
  return db.getRunCheck(checkId);
}

export async function getApprovalRequestsByRun(db: DbAdapter, runId: string) {
  return db.getApprovalRequestsByRun(runId);
}

export async function getPullRequestCandidateByRun(db: DbAdapter, runId: string) {
  return db.getPullRequestCandidateByRun(runId);
}

export async function getApprovalRequest(db: DbAdapter, approvalId: string) {
  return db.getApprovalRequest(approvalId);
}

export async function getPullRequestCandidate(db: DbAdapter, prId: string) {
  return db.getPullRequestCandidate(prId);
}

export async function getAgentExecutionsByAssignment(
  db: DbAdapter,
  assignmentId: string
) {
  return db.getAgentExecutionsByAssignment(assignmentId);
}

export async function getAgentCommitsByAssignment(
  db: DbAdapter,
  assignmentId: string
) {
  return db.getAgentCommitsByAssignment(assignmentId);
}
