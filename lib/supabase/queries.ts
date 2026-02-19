/**
 * Reusable query builders.
 * Uses DbAdapter (SQLite or Postgres) - no Supabase dependency.
 */

import type { DbAdapter } from "@/lib/db/adapter";

/** Singular table names (strategy-aligned schema). */
export const TABLES = {
  projects: "project",
  workflows: "workflow",
  workflow_activities: "workflow_activity",
  cards: "card",
  context_artifacts: "context_artifact",
  card_context_artifacts: "card_context_artifact",
  card_requirements: "card_requirement",
  card_known_facts: "card_known_fact",
  card_assumptions: "card_assumption",
  card_questions: "card_question",
  card_planned_files: "card_planned_file",
  planning_actions: "planning_action",
} as const;

export async function getProject(db: DbAdapter, projectId: string) {
  return db.getProject(projectId);
}

export async function incrementProjectActionSequence(
  db: DbAdapter,
  projectId: string,
  expectedSequence: number
): Promise<number | null> {
  return db.incrementProjectActionSequence(projectId, expectedSequence);
}

export async function listProjects(db: DbAdapter) {
  return db.listProjects();
}

export async function getWorkflowsByProject(db: DbAdapter, projectId: string) {
  return db.getWorkflowsByProject(projectId);
}

export async function getActivitiesByWorkflow(db: DbAdapter, workflowId: string) {
  return db.getActivitiesByWorkflow(workflowId);
}

export async function getActivitiesByProject(db: DbAdapter, projectId: string) {
  return db.getActivitiesByProject(projectId);
}

export async function getCardsByActivity(db: DbAdapter, activityId: string) {
  return db.getCardsByActivity(activityId);
}

export async function getCardsByProject(db: DbAdapter, projectId: string) {
  return db.getCardsByProject(projectId);
}

export async function getPlanningActionsByProject(
  db: DbAdapter,
  projectId: string,
  limit = 100
) {
  return db.getPlanningActionsByProject(projectId, limit);
}

export async function getPlanningActionsByIdempotencyKey(
  db: DbAdapter,
  projectId: string,
  idempotencyKey: string
) {
  return db.getPlanningActionsByIdempotencyKey(projectId, idempotencyKey);
}

export async function getArtifactsByProject(db: DbAdapter, projectId: string) {
  return db.getArtifactsByProject(projectId);
}

export async function getArtifactById(db: DbAdapter, artifactId: string) {
  return db.getArtifactById(artifactId);
}

export async function getCardContextArtifacts(db: DbAdapter, cardId: string) {
  return db.getCardContextArtifacts(cardId);
}

export async function getCardContextLinksByProject(
  db: DbAdapter,
  projectId: string
): Promise<Array<{ card_id: string; context_artifact_id: string }>> {
  return db.getCardContextLinksByProject(projectId);
}

export async function getCardById(db: DbAdapter, cardId: string) {
  return db.getCardById(cardId);
}

export async function verifyCardInProject(
  db: DbAdapter,
  cardId: string,
  projectId: string
): Promise<boolean> {
  return db.verifyCardInProject(cardId, projectId);
}

export async function getCardRequirements(db: DbAdapter, cardId: string) {
  return db.getCardRequirements(cardId);
}

export async function getCardFacts(db: DbAdapter, cardId: string) {
  return db.getCardFacts(cardId);
}

export async function getCardAssumptions(db: DbAdapter, cardId: string) {
  return db.getCardAssumptions(cardId);
}

export async function getCardQuestions(db: DbAdapter, cardId: string) {
  return db.getCardQuestions(cardId);
}

export async function getCardPlannedFiles(db: DbAdapter, cardId: string) {
  return db.getCardPlannedFiles(cardId);
}

export async function getCardIdsByWorkflow(
  db: DbAdapter,
  workflowId: string
): Promise<string[]> {
  return db.getCardIdsByWorkflow(workflowId);
}

export async function getCardIdsByProject(
  db: DbAdapter,
  projectId: string
): Promise<string[]> {
  return db.getCardIdsByProject(projectId);
}

export async function getPlannedFilesByProject(
  db: DbAdapter,
  projectId: string
) {
  return db.getPlannedFilesByProject(projectId);
}
