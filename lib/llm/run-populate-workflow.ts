import type { DbAdapter } from "@/lib/db/adapter";
import type { PlanningState } from "@/lib/schemas/planning-state";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import { getWorkflowActivities } from "@/lib/schemas/planning-state";
import { fetchMapSnapshot } from "@/lib/db/map-snapshot";
import {
  buildPopulateActivitiesPrompt,
  buildPopulateActivitiesUserMessage,
  buildPopulateCardsForActivityPrompt,
  buildPopulateCardsForActivityUserMessage,
} from "@/lib/llm/planning-prompt";
import { runLlmSubStep, type Emitter } from "@/lib/llm/run-llm-substep";

/**
 * Run two-phase populate: (1) activities only, (2) cards + requirements per activity.
 * Reduces token usage and timeout risk vs one large call.
 */
export async function runPopulateWorkflow(opts: {
  db: DbAdapter;
  projectId: string;
  workflowId: string;
  workflowTitle: string;
  workflowDescription: string | null;
  userRequest: string;
  state: PlanningState;
  emit: Emitter;
  mockResponse?: string;
}): Promise<{ actionCount: number }> {
  const {
    db,
    projectId,
    workflowId,
    workflowTitle,
    workflowDescription,
    userRequest,
    state,
    emit,
    mockResponse,
  } = opts;

  let totalActions = 0;
  let currentState = state;

  // Phase 1: activities only
  const activitiesResult = await runLlmSubStep({
    db,
    projectId,
    systemPrompt: buildPopulateActivitiesPrompt(),
    userMessage: buildPopulateActivitiesUserMessage(
      workflowId,
      workflowTitle,
      workflowDescription,
      userRequest,
      currentState,
    ),
    state: currentState,
    emit,
    actionFilter: (a: PlanningAction) => a.action_type === "createActivity",
    mockResponse,
  });

  totalActions += activitiesResult.actionCount;
  if (activitiesResult.actionCount === 0) {
    return { actionCount: totalActions };
  }

  const freshState = await fetchMapSnapshot(db, projectId);
  if (!freshState) return { actionCount: totalActions };
  currentState = freshState;

  const activities = getWorkflowActivities(currentState, workflowId)
    .sort((a, b) => a.position - b.position);
  if (activities.length === 0) return { actionCount: totalActions };

  // Phase 2: cards + requirements per activity, run in parallel
  const cardFilter = (a: PlanningAction) =>
    a.action_type === "createCard" ||
    a.action_type === "upsertCardKnowledgeItem" ||
    a.action_type === "upsertCardPlannedFile";

  const cardResults = await Promise.all(
    activities.map(async (activity) => {
      let result = await runLlmSubStep({
        db,
        projectId,
        systemPrompt: buildPopulateCardsForActivityPrompt(),
        userMessage: buildPopulateCardsForActivityUserMessage(
          workflowId,
          workflowTitle,
          activity.id,
          activity.title,
          userRequest,
          currentState,
        ),
        state: currentState,
        emit,
        actionFilter: cardFilter,
        mockResponse,
      });
      if (result.actionCount === 0) {
        result = await runLlmSubStep({
          db,
          projectId,
          systemPrompt: buildPopulateCardsForActivityPrompt(),
          userMessage: buildPopulateCardsForActivityUserMessage(
            workflowId,
            workflowTitle,
            activity.id,
            activity.title,
            userRequest,
            currentState,
            true,
          ),
          state: currentState,
          emit,
          actionFilter: cardFilter,
          mockResponse,
        });
      }
      return result;
    }),
  );

  totalActions += cardResults.reduce((sum, r) => sum + r.actionCount, 0);
  return { actionCount: totalActions };
}
