/**
 * Database adapter interface.
 * Single seam between business logic and storage.
 * Supports SQLite (default) and Postgres (hosted mode).
 */

/** Row types - generic records from DB */
export type DbRow = Record<string, unknown>;

/**
 * Run multiple operations in a transaction.
 * On success: commit. On error/throw: rollback.
 */
export type TransactionFn<T> = (adapter: DbAdapter) => Promise<T>;

export interface DbAdapter {
  /** Run operations in a transaction. Rolls back on error. */
  transaction<T>(fn: TransactionFn<T>): Promise<T>;

  // --- Projects ---
  getProject(projectId: string): Promise<DbRow | null>;
  listProjects(): Promise<DbRow[]>;
  incrementProjectActionSequence(
    projectId: string,
    expectedSequence: number
  ): Promise<number | null>;
  insertProject(row: DbRow): Promise<void>;
  updateProject(projectId: string, updates: DbRow): Promise<void>;

  // --- Workflows ---
  getWorkflowsByProject(projectId: string): Promise<DbRow[]>;
  insertWorkflow(row: DbRow): Promise<void>;
  upsertWorkflow(row: DbRow): Promise<void>;
  deleteWorkflow(id: string, projectId: string): Promise<void>;

  // --- Workflow activities ---
  getActivitiesByWorkflow(workflowId: string): Promise<DbRow[]>;
  /** Batch: all activities for workflows in project. Avoids N+1. */
  getActivitiesByProject(projectId: string): Promise<DbRow[]>;
  insertWorkflowActivity(row: DbRow): Promise<void>;
  upsertWorkflowActivity(row: DbRow): Promise<void>;
  deleteWorkflowActivity(id: string, workflowId: string): Promise<void>;

  // --- Cards ---
  getCardsByActivity(activityId: string): Promise<DbRow[]>;
  /** Batch: all cards (with step or activity) in project. Avoids N+1. */
  getCardsByProject(projectId: string): Promise<DbRow[]>;
  getCardById(cardId: string): Promise<DbRow | null>;
  insertCard(row: DbRow): Promise<void>;
  updateCard(cardId: string, updates: DbRow): Promise<void>;
  upsertCard(row: DbRow): Promise<void>;
  deleteCard(id: string): Promise<void>;

  // --- Planning actions ---
  getPlanningActionsByProject(
    projectId: string,
    limit?: number
  ): Promise<DbRow[]>;
  getPlanningActionsByIdempotencyKey(
    projectId: string,
    idempotencyKey: string
  ): Promise<DbRow[]>;
  insertPlanningAction(row: DbRow): Promise<void>;

  // --- Context artifacts ---
  getArtifactsByProject(projectId: string): Promise<DbRow[]>;
  getArtifactById(artifactId: string): Promise<DbRow | null>;
  insertContextArtifact(row: DbRow): Promise<void>;
  updateContextArtifact(artifactId: string, updates: DbRow): Promise<void>;
  deleteContextArtifact(artifactId: string, projectId: string): Promise<void>;

  // --- Card context links ---
  getCardContextArtifacts(cardId: string): Promise<DbRow[]>;
  /** Batch: all card-context links for cards in project. Avoids N+1. */
  getCardContextLinksByProject(projectId: string): Promise<Array<{ card_id: string; context_artifact_id: string }>>;
  insertCardContextArtifact(row: DbRow): Promise<void>;

  // --- Card knowledge items ---
  getCardRequirements(cardId: string): Promise<DbRow[]>;
  getRequirementsByProject(projectId: string): Promise<DbRow[]>;
  getCardFacts(cardId: string): Promise<DbRow[]>;
  getCardAssumptions(cardId: string): Promise<DbRow[]>;
  getCardQuestions(cardId: string): Promise<DbRow[]>;
  insertCardRequirement(row: DbRow): Promise<void>;
  insertCardFact(row: DbRow): Promise<void>;
  insertCardAssumption(row: DbRow): Promise<void>;
  insertCardQuestion(row: DbRow): Promise<void>;
  updateCardRequirement(id: string, cardId: string, updates: DbRow): Promise<void>;
  updateCardFact(id: string, cardId: string, updates: DbRow): Promise<void>;
  updateCardAssumption(id: string, cardId: string, updates: DbRow): Promise<void>;
  updateCardQuestion(id: string, cardId: string, updates: DbRow): Promise<void>;
  deleteCardRequirement(id: string, cardId: string): Promise<void>;
  deleteCardFact(id: string, cardId: string): Promise<void>;
  deleteCardAssumption(id: string, cardId: string): Promise<void>;
  deleteCardQuestion(id: string, cardId: string): Promise<void>;
  updateKnowledgeItemStatus(
    knowledgeItemId: string,
    cardId: string,
    status: string
  ): Promise<boolean>;

  // --- Card planned files ---
  getCardPlannedFiles(cardId: string): Promise<DbRow[]>;
  getPlannedFilesByProject(projectId: string): Promise<DbRow[]>;
  insertCardPlannedFile(row: DbRow): Promise<void>;
  updateCardPlannedFile(
    id: string,
    cardId: string,
    updates: DbRow
  ): Promise<void>;
  deleteCardPlannedFile(id: string, cardId: string): Promise<void>;

  // --- Helpers (used by mutations) ---
  verifyCardInProject(cardId: string, projectId: string): Promise<boolean>;
  getCardIdsByWorkflow(workflowId: string): Promise<string[]>;
  getCardIdsByProject(projectId: string): Promise<string[]>;

  // --- Orchestration: system policy ---
  getSystemPolicyProfileByProject(projectId: string): Promise<DbRow | null>;
  insertSystemPolicyProfile(row: DbRow): Promise<void>;

  // --- Orchestration: runs ---
  getOrchestrationRun(runId: string): Promise<DbRow | null>;
  listOrchestrationRunsByProject(
    projectId: string,
    options?: { scope?: "workflow" | "card"; status?: string; limit?: number }
  ): Promise<DbRow[]>;
  insertOrchestrationRun(row: DbRow): Promise<DbRow>;
  updateOrchestrationRun(runId: string, updates: DbRow): Promise<void>;

  // --- Orchestration: assignments ---
  getCardAssignmentsByRun(runId: string): Promise<DbRow[]>;
  getCardAssignment(assignmentId: string): Promise<DbRow | null>;
  updateCardAssignment(
    assignmentId: string,
    updates: DbRow
  ): Promise<void>;
  insertCardAssignment(row: DbRow): Promise<DbRow>;

  // --- Orchestration: agent executions ---
  getAgentExecutionsByAssignment(assignmentId: string): Promise<DbRow[]>;
  insertAgentExecution(row: DbRow): Promise<DbRow>;
  updateAgentExecution(executionId: string, updates: DbRow): Promise<void>;

  // --- Orchestration: agent commits ---
  getAgentCommitsByAssignment(assignmentId: string): Promise<DbRow[]>;
  insertAgentCommit(row: DbRow): Promise<void>;

  // --- Orchestration: run checks ---
  getRunChecksByRun(runId: string): Promise<DbRow[]>;
  getRunCheck(checkId: string): Promise<DbRow | null>;
  insertRunCheck(row: DbRow): Promise<DbRow>;

  // --- Orchestration: approval requests ---
  getApprovalRequestsByRun(runId: string): Promise<DbRow[]>;
  getApprovalRequest(approvalId: string): Promise<DbRow | null>;
  insertApprovalRequest(row: DbRow): Promise<DbRow>;
  updateApprovalRequest(approvalId: string, updates: DbRow): Promise<void>;

  // --- Orchestration: pull request candidates ---
  getPullRequestCandidateByRun(runId: string): Promise<DbRow | null>;
  getPullRequestCandidate(prId: string): Promise<DbRow | null>;
  insertPullRequestCandidate(row: DbRow): Promise<DbRow>;
  updatePullRequestCandidate(prId: string, updates: DbRow): Promise<void>;

  // --- Orchestration: event log ---
  insertEventLog(row: DbRow): Promise<DbRow>;

  // --- Memory (Section 4 coordination; Section 3 implements) ---
  insertMemoryUnit(row: DbRow): Promise<DbRow>;
  getMemoryUnitsByIds(ids: string[]): Promise<DbRow[]>;
  insertMemoryUnitRelation(row: DbRow): Promise<void>;
  getMemoryUnitRelationsByEntity(
    entityType: string,
    entityId: string
  ): Promise<DbRow[]>;
  insertMemoryRetrievalLog(row: DbRow): Promise<DbRow>;
}
