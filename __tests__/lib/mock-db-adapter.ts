/**
 * Mock DbAdapter for orchestration tests.
 * Provides stub implementations for all DbAdapter methods.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { vi } from "vitest";

export function createMockDbAdapter(overrides?: Partial<Record<keyof DbAdapter, unknown>>): DbAdapter {
  const noop = vi.fn().mockResolvedValue(undefined);
  const noopNull = vi.fn().mockResolvedValue(null);
  const noopArray = vi.fn().mockResolvedValue([]);
  const noopFalse = vi.fn().mockResolvedValue(false);

  const base: DbAdapter = {
    transaction: vi.fn((fn) => fn(base)),
    getProject: noopNull,
    listProjects: noopArray,
    incrementProjectActionSequence: noopNull,
    insertProject: noop,
    updateProject: noop,
    getWorkflowsByProject: noopArray,
    insertWorkflow: noop,
    upsertWorkflow: noop,
    getActivitiesByWorkflow: noopArray,
    getActivitiesByProject: noopArray,
    insertWorkflowActivity: noop,
    upsertWorkflowActivity: noop,
    getCardsByActivity: noopArray,
    getCardsByProject: noopArray,
    getCardById: noopNull,
    insertCard: noop,
    updateCard: noop,
    upsertCard: noop,
    getPlanningActionsByProject: noopArray,
    getPlanningActionsByIdempotencyKey: noopArray,
    insertPlanningAction: noop,
    getArtifactsByProject: noopArray,
    getArtifactById: noopNull,
    insertContextArtifact: noop,
    updateContextArtifact: noop,
    getCardContextArtifacts: noopArray,
    getCardContextLinksByProject: noopArray,
    insertCardContextArtifact: noop,
    getCardRequirements: noopArray,
    getCardFacts: noopArray,
    getCardAssumptions: noopArray,
    getCardQuestions: noopArray,
    insertCardRequirement: noop,
    insertCardFact: noop,
    insertCardAssumption: noop,
    insertCardQuestion: noop,
    updateCardRequirement: noop,
    updateCardFact: noop,
    updateCardAssumption: noop,
    updateCardQuestion: noop,
    updateKnowledgeItemStatus: noopFalse,
    getCardPlannedFiles: noopArray,
    getPlannedFilesByProject: noopArray,
    insertCardPlannedFile: noop,
    updateCardPlannedFile: noop,
    verifyCardInProject: vi.fn().mockResolvedValue(true),
    getCardIdsByWorkflow: noopArray,
    getCardIdsByProject: noopArray,
    getSystemPolicyProfileByProject: noopNull,
    getOrchestrationRun: noopNull,
    listOrchestrationRunsByProject: noopArray,
    insertOrchestrationRun: vi.fn().mockResolvedValue({ id: "run-123" }),
    updateOrchestrationRun: noop,
    getCardAssignmentsByRun: noopArray,
    getCardAssignment: noopNull,
    updateCardAssignment: noop,
    insertCardAssignment: vi.fn().mockResolvedValue({ id: "assign-123" }),
    getAgentExecutionsByAssignment: noopArray,
    insertAgentExecution: vi.fn().mockResolvedValue({ id: "agent-exec-123" }),
    updateAgentExecution: noop,
    getAgentCommitsByAssignment: noopArray,
    insertAgentCommit: noop,
    getRunChecksByRun: noopArray,
    getRunCheck: noopNull,
    insertRunCheck: vi.fn().mockResolvedValue({ id: "check-123" }),
    getApprovalRequestsByRun: noopArray,
    getApprovalRequest: noopNull,
    insertApprovalRequest: vi.fn().mockResolvedValue({ id: "approval-123" }),
    updateApprovalRequest: noop,
    getPullRequestCandidateByRun: noopNull,
    getPullRequestCandidate: noopNull,
    insertPullRequestCandidate: vi.fn().mockResolvedValue({ id: "pr-123" }),
    updatePullRequestCandidate: noop,
    insertEventLog: vi.fn().mockResolvedValue({ id: "event-123" }),
    insertMemoryUnit: vi.fn().mockResolvedValue({ id: "mem-123" }),
    getMemoryUnitsByIds: noopArray,
    insertMemoryUnitRelation: noop,
    getMemoryUnitRelationsByEntity: noopArray,
    insertMemoryRetrievalLog: vi.fn().mockResolvedValue({ id: "retrieval-123" }),
  };

  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      (base as Record<string, unknown>)[k] = v;
    }
  }
  return base;
}
