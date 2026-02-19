import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import type { DbAdapter } from "@/lib/db/adapter";
import { fetchMapSnapshot, getLinkedArtifactsForPrompt } from "@/lib/supabase/map-snapshot";
import { claudeStreamingRequest } from "@/lib/llm/claude-client";
import { parseActionsFromStream } from "@/lib/llm/stream-action-parser";
import { validatePlanningOutput } from "@/lib/llm/validate-planning-output";
import { pipelineApply } from "@/lib/supabase/mutations";
import type { PlanningState } from "@/lib/schemas/planning-state";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import {
  buildScaffoldSystemPrompt,
  buildScaffoldUserMessage,
  buildPopulateWorkflowPrompt,
  buildPopulateWorkflowUserMessage,
  buildFinalizeSystemPrompt,
  buildFinalizeUserMessage,
  buildFinalizeTestsSystemPrompt,
  buildFinalizeTestsUserMessage,
} from "@/lib/llm/planning-prompt";
import { PLANNING_LLM } from "@/lib/feature-flags";
import { chatStreamRequestSchema } from "@/lib/validation/request-schema";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type Emitter = (event: string, data: unknown) => void;

/**
 * Run a single LLM sub-step: stream a prompt, parse actions, validate, and apply.
 * Returns the number of successfully applied actions.
 */
async function runLlmSubStep(opts: {
  db: DbAdapter;
  projectId: string;
  systemPrompt: string;
  userMessage: string;
  state: PlanningState;
  emit: Emitter;
  actionFilter?: (action: PlanningAction) => boolean;
  mockResponse?: string;
}): Promise<{ actionCount: number; updatedState: PlanningState }> {
  const { db, projectId, systemPrompt, userMessage, emit, actionFilter, mockResponse } = opts;
  let currentState = opts.state;

  const useMock =
    process.env.PLANNING_MOCK_ALLOWED === "1" &&
    typeof mockResponse === "string" &&
    mockResponse.length > 0;

  let rawLlmOutput = "";
  const llmStreamRaw = useMock
    ? null
    : await claudeStreamingRequest({ systemPrompt, userMessage });
  const llmStream = useMock
    ? new ReadableStream<string>({
        start(ctrl) {
          ctrl.enqueue(mockResponse!);
          ctrl.close();
        },
      })
    : (() => {
        const [parseBranch, logBranch] = llmStreamRaw!.tee();
        const reader = logBranch.getReader();
        const decoder = new TextDecoder();
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              rawLlmOutput += typeof value === "string" ? value : decoder.decode(value);
            }
          } catch {
            /* ignore */
          }
        })();
        return parseBranch;
      })();

  let actionCount = 0;

  for await (const result of parseActionsFromStream(llmStream)) {
    if (result.type === "response_type") {
      if (result.responseType === "clarification") {
        return { actionCount, updatedState: currentState };
      }
      continue;
    }
    if (result.type === "message") {
      emit("message", { message: result.message });
      continue;
    }
    if (result.type === "done") break;
    if (result.type !== "action") continue;

    const action = result.action;
    if (actionFilter && !actionFilter(action)) continue;

    const targetRef = action.target_ref as Record<string, unknown>;
    const projectIdValue = currentState.project.id;
    const actionWithProjectId = {
      ...action,
      project_id: action.project_id || projectIdValue,
      target_ref: {
        ...targetRef,
        ...(action.action_type === "createWorkflow" && !targetRef.project_id
          ? { project_id: projectIdValue }
          : {}),
      },
    };

    const { valid, rejected } = validatePlanningOutput(
      [actionWithProjectId],
      currentState,
    );

    if (rejected.length > 0) {
      emit("error", { action: actionWithProjectId, reason: rejected[0].reason });
      continue;
    }

    const applyResult = await pipelineApply(db, projectId, valid);
    if (applyResult.failedAt !== undefined) {
      emit("error", { action: actionWithProjectId, reason: applyResult.rejectionReason ?? "Apply failed" });
      continue;
    }

    actionCount++;
    emit("action", { action: actionWithProjectId, applied: applyResult.applied });

    const newState = await fetchMapSnapshot(db, projectId);
    if (newState) currentState = newState;
  }

  if (!useMock && rawLlmOutput && process.env.PLANNING_DEBUG === "1") {
    console.log(
      "[planning] LLM sub-step raw output",
      actionCount === 0 ? "(0 actions parsed)" : "",
      ":\n",
      rawLlmOutput.slice(0, 4000),
      rawLlmOutput.length > 4000 ? "\n...(truncated)" : "",
    );
  }

  return { actionCount, updatedState: currentState };
}

/**
 * Collect cards that have at least one non-rejected requirement from the map state.
 */
function getCardsWithRequirements(state: PlanningState) {
  const cards = Array.from(state.cards.values());
  return cards
    .map((card) => {
      const reqs = (state.cardRequirements.get(card.id) || [])
        .filter((r) => r.status !== "rejected")
        .map((r) => ({ text: r.text, status: r.status }));
      if (reqs.length === 0) return null;
      const plannedFiles = (state.cardPlannedFiles.get(card.id) || [])
        .map((f) => ({
          logical_file_name: f.logical_file_name,
          artifact_kind: f.artifact_kind,
          action: f.action,
          intent_summary: f.intent_summary,
        }));
      return {
        id: card.id,
        title: card.title,
        description: card.description,
        requirements: reqs,
        planned_files: plannedFiles,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
}

/**
 * Run multi-step finalization: project docs (1 call) then per-card tests (1 call each).
 * Emits finalize_progress events between sub-steps for frontend progress tracking.
 */
async function runFinalizeMultiStep(opts: {
  db: DbAdapter;
  projectId: string;
  state: PlanningState;
  emit: Emitter;
  mockResponse?: string;
}): Promise<number> {
  const { db, projectId, emit, mockResponse } = opts;
  let currentState = opts.state;

  const testableCards = getCardsWithRequirements(currentState);
  const totalSteps = 1 + testableCards.length;
  let totalActions = 0;

  emit("finalize_progress", {
    step: "docs",
    step_index: 0,
    total_steps: totalSteps,
    status: "generating",
    label: "Generating project context documents",
  });

  const docsResult = await runLlmSubStep({
    db,
    projectId,
    systemPrompt: buildFinalizeSystemPrompt(),
    userMessage: buildFinalizeUserMessage(currentState),
    state: currentState,
    emit,
    actionFilter: (a) => a.action_type === "createContextArtifact",
    mockResponse,
  });

  totalActions += docsResult.actionCount;
  currentState = docsResult.updatedState;

  emit("finalize_progress", {
    step: "docs",
    step_index: 0,
    total_steps: totalSteps,
    status: "complete",
    label: `Created ${docsResult.actionCount} project documents`,
  });

  const projectSummary = {
    id: currentState.project.id,
    name: currentState.project.name,
    description: currentState.project.description,
    tech_stack: currentState.project.tech_stack,
    deployment: currentState.project.deployment,
  };

  for (let i = 0; i < testableCards.length; i++) {
    const card = testableCards[i];

    emit("finalize_progress", {
      step: "card_tests",
      step_index: i + 1,
      total_steps: totalSteps,
      status: "generating",
      label: `Generating tests for "${card.title}"`,
      card_id: card.id,
    });

    try {
      const testResult = await runLlmSubStep({
        db,
        projectId,
        systemPrompt: buildFinalizeTestsSystemPrompt(),
        userMessage: buildFinalizeTestsUserMessage(card, projectSummary),
        state: currentState,
        emit,
        actionFilter: (a) => a.action_type === "createContextArtifact",
      });

      totalActions += testResult.actionCount;
      currentState = testResult.updatedState;

      emit("finalize_progress", {
        step: "card_tests",
        step_index: i + 1,
        total_steps: totalSteps,
        status: "complete",
        label: `Tests created for "${card.title}"`,
        card_id: card.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test generation failed";
      console.error(`[finalize] Card test generation failed for ${card.id}:`, msg);
      emit("error", { reason: `Test generation failed for "${card.title}": ${msg}` });
      emit("finalize_progress", {
        step: "card_tests",
        step_index: i + 1,
        total_steps: totalSteps,
        status: "error",
        label: `Failed to generate tests for "${card.title}"`,
        card_id: card.id,
      });
    }
  }

  return totalActions;
}

/**
 * POST /api/projects/[projectId]/chat/stream
 * Streaming planning endpoint. Returns SSE with actions as they are parsed and applied.
 * Supports scaffold, populate, and finalize modes.
 *
 * Finalize mode runs multiple LLM sub-steps (project docs + per-card tests)
 * to avoid timeout on large projects.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!PLANNING_LLM) {
    return new Response(
      JSON.stringify({
        error: "Planning LLM is disabled",
        message: "Set NEXT_PUBLIC_PLANNING_LLM_ENABLED=true to enable.",
      }),
      { status: 503 },
    );
  }

  const { projectId } = await params;
  if (!projectId) {
    return new Response(JSON.stringify({ error: "Project ID required" }), {
      status: 400,
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }

  const parsed = chatStreamRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    parsed.error.errors.forEach((e) => {
      const path = e.path.join(".") || "body";
      if (!details[path]) details[path] = [];
      details[path].push(e.message);
    });
    return new Response(
      JSON.stringify({ error: "Invalid request body", details }),
      { status: 400 },
    );
  }

  const { message, mode, workflow_id, mock_response } = parsed.data;

  let db: DbAdapter;
  try {
    db = getDb();
  } catch {
    return new Response(
      JSON.stringify({ error: "Database not configured" }),
      { status: 500 },
    );
  }

  const state = await fetchMapSnapshot(db, projectId);
  if (!state) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit: Emitter = (event, data) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        if (mode === "finalize") {
          const totalActions = await runFinalizeMultiStep({
            db,
            projectId,
            state,
            emit,
            mockResponse: mock_response,
          });

          emit("phase_complete", {
            responseType: "finalize_complete",
            artifacts_created: totalActions,
          });
          emit("done", {});
          return;
        }

        let systemPrompt: string;
        let userMessage: string;

        if (mode === "populate" && workflow_id) {
          const workflow = Array.from(state.workflows.values()).find((w) => w.id === workflow_id);
          if (!workflow) {
            emit("error", { reason: "Workflow not found" });
            emit("done", {});
            return;
          }
          systemPrompt = buildPopulateWorkflowPrompt();
          userMessage = buildPopulateWorkflowUserMessage(
            workflow_id,
            workflow.title,
            workflow.description,
            message,
            state,
          );
        } else {
          const linkedArtifacts = getLinkedArtifactsForPrompt(state, 3);
          systemPrompt = buildScaffoldSystemPrompt();
          userMessage = buildScaffoldUserMessage(message, state, linkedArtifacts);
        }

        const actionFilter = mode === "populate"
          ? (a: PlanningAction) => a.action_type === "createActivity" || a.action_type === "createCard"
          : undefined;

        const result = await runLlmSubStep({
          db,
          projectId,
          systemPrompt,
          userMessage,
          state,
          emit,
          actionFilter,
          mockResponse: mock_response,
        });

        if (mode === "scaffold") {
          const finalState = await fetchMapSnapshot(db, projectId);
          const workflowIds = finalState
            ? Array.from(finalState.workflows.values())
                .filter((w) => !state.workflows.has(w.id))
                .map((w) => w.id)
            : [];
          emit("phase_complete", {
            responseType: "scaffold_complete",
            workflow_ids: workflowIds,
          });
        } else if (mode === "populate") {
          emit("phase_complete", {
            responseType: "populate_complete",
            workflow_id,
          });
        }

        if (!mock_response && process.env.PLANNING_DEBUG === "1" && mode === "scaffold" && result.actionCount === 0) {
          console.log("[planning] scaffold produced 0 actions");
        }

        emit("done", {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        console.error("[chat/stream] Error:", msg);
        emit("error", { reason: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
