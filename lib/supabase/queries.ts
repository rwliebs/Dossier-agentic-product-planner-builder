/**
 * Reusable query builders for Supabase.
 * Centralizes table names and common query patterns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const TABLES = {
  projects: "projects",
  workflows: "workflows",
  workflow_activities: "workflow_activities",
  steps: "steps",
  cards: "cards",
  context_artifacts: "context_artifacts",
  card_context_artifacts: "card_context_artifacts",
  card_requirements: "card_requirements",
  card_known_facts: "card_known_facts",
  card_assumptions: "card_assumptions",
  card_questions: "card_questions",
  card_planned_files: "card_planned_files",
  planning_actions: "planning_actions",
} as const;

export async function getProject(
  supabase: SupabaseClient,
  projectId: string
) {
  const { data, error } = await supabase
    .from(TABLES.projects)
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listProjects(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from(TABLES.projects)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getWorkflowsByProject(
  supabase: SupabaseClient,
  projectId: string
) {
  const { data, error } = await supabase
    .from(TABLES.workflows)
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getActivitiesByWorkflow(
  supabase: SupabaseClient,
  workflowId: string
) {
  const { data, error } = await supabase
    .from(TABLES.workflow_activities)
    .select("*")
    .eq("workflow_id", workflowId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getStepsByActivity(
  supabase: SupabaseClient,
  activityId: string
) {
  const { data, error } = await supabase
    .from(TABLES.steps)
    .select("*")
    .eq("workflow_activity_id", activityId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCardsByStep(
  supabase: SupabaseClient,
  stepId: string
) {
  const { data, error } = await supabase
    .from(TABLES.cards)
    .select("*")
    .eq("step_id", stepId)
    .order("priority", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCardsByActivity(
  supabase: SupabaseClient,
  activityId: string
) {
  const { data, error } = await supabase
    .from(TABLES.cards)
    .select("*")
    .eq("workflow_activity_id", activityId)
    .is("step_id", null)
    .order("priority", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getPlanningActionsByProject(
  supabase: SupabaseClient,
  projectId: string,
  limit = 100
) {
  const { data, error } = await supabase
    .from(TABLES.planning_actions)
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getArtifactsByProject(
  supabase: SupabaseClient,
  projectId: string
) {
  const { data, error } = await supabase
    .from(TABLES.context_artifacts)
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getArtifactById(
  supabase: SupabaseClient,
  artifactId: string
) {
  const { data, error } = await supabase
    .from(TABLES.context_artifacts)
    .select("*")
    .eq("id", artifactId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getCardContextArtifacts(
  supabase: SupabaseClient,
  cardId: string
) {
  const { data, error } = await supabase
    .from(TABLES.card_context_artifacts)
    .select("context_artifact_id, usage_hint, linked_by")
    .eq("card_id", cardId);

  if (error) throw error;
  return data ?? [];
}

export async function getCardById(
  supabase: SupabaseClient,
  cardId: string
) {
  const { data, error } = await supabase
    .from(TABLES.cards)
    .select("*")
    .eq("id", cardId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Verify card exists and belongs to project (via workflow_activity -> workflow) */
export async function verifyCardInProject(
  supabase: SupabaseClient,
  cardId: string,
  projectId: string
): Promise<boolean> {
  const card = await getCardById(supabase, cardId);
  if (!card) return false;

  const activityId = (card as Record<string, unknown>).workflow_activity_id as string;
  const { data: activity } = await supabase
    .from(TABLES.workflow_activities)
    .select("workflow_id")
    .eq("id", activityId)
    .single();

  if (!activity) return false;

  const { data: workflow } = await supabase
    .from(TABLES.workflows)
    .select("project_id")
    .eq("id", (activity as Record<string, unknown>).workflow_id)
    .single();

  return workflow !== null && (workflow as Record<string, unknown>).project_id === projectId;
}

export async function getCardRequirements(supabase: SupabaseClient, cardId: string) {
  const { data, error } = await supabase
    .from(TABLES.card_requirements)
    .select("*")
    .eq("card_id", cardId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCardFacts(supabase: SupabaseClient, cardId: string) {
  const { data, error } = await supabase
    .from(TABLES.card_known_facts)
    .select("*")
    .eq("card_id", cardId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCardAssumptions(supabase: SupabaseClient, cardId: string) {
  const { data, error } = await supabase
    .from(TABLES.card_assumptions)
    .select("*")
    .eq("card_id", cardId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCardQuestions(supabase: SupabaseClient, cardId: string) {
  const { data, error } = await supabase
    .from(TABLES.card_questions)
    .select("*")
    .eq("card_id", cardId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCardPlannedFiles(supabase: SupabaseClient, cardId: string) {
  const { data, error } = await supabase
    .from(TABLES.card_planned_files)
    .select("*")
    .eq("card_id", cardId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
