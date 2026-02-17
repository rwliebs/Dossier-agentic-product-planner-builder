/**
 * Supabase CRUD for orchestration tables (slice-c).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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
  supabase: SupabaseClient,
  projectId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.system_policy_profiles)
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getOrchestrationRun(
  supabase: SupabaseClient,
  runId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.orchestration_runs)
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listOrchestrationRunsByProject(
  supabase: SupabaseClient,
  projectId: string,
  options?: { scope?: "workflow" | "card"; status?: string; limit?: number }
) {
  let query = supabase
    .from(ORCHESTRATION_TABLES.orchestration_runs)
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (options?.scope) {
    query = query.eq("scope", options.scope);
  }
  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCardAssignmentsByRun(
  supabase: SupabaseClient,
  runId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.card_assignments)
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCardAssignment(
  supabase: SupabaseClient,
  assignmentId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.card_assignments)
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getRunChecksByRun(
  supabase: SupabaseClient,
  runId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.run_checks)
    .select("*")
    .eq("run_id", runId)
    .order("executed_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getRunCheck(
  supabase: SupabaseClient,
  checkId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.run_checks)
    .select("*")
    .eq("id", checkId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getApprovalRequestsByRun(
  supabase: SupabaseClient,
  runId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.approval_requests)
    .select("*")
    .eq("run_id", runId)
    .order("requested_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPullRequestCandidateByRun(
  supabase: SupabaseClient,
  runId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.pull_request_candidates)
    .select("*")
    .eq("run_id", runId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getApprovalRequest(
  supabase: SupabaseClient,
  approvalId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.approval_requests)
    .select("*")
    .eq("id", approvalId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPullRequestCandidate(
  supabase: SupabaseClient,
  prId: string
) {
  const { data, error } = await supabase
    .from(ORCHESTRATION_TABLES.pull_request_candidates)
    .select("*")
    .eq("id", prId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
