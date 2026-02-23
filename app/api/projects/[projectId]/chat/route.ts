import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { fetchMapSnapshot, getLinkedArtifactsForPrompt } from "@/lib/db/map-snapshot";
import { claudePlanningRequest } from "@/lib/llm/claude-client";
import { parsePlanningResponse } from "@/lib/llm/parse-planning-response";
import { validatePlanningOutput } from "@/lib/llm/validate-planning-output";
import { pipelineApply } from "@/lib/db/mutations";
import {
  buildPlanningSystemPrompt,
  buildPlanningUserMessage,
  buildScaffoldSystemPrompt,
  buildScaffoldUserMessage,
  buildPopulateWorkflowPrompt,
  buildPopulateWorkflowUserMessage,
} from "@/lib/llm/planning-prompt";
import { runLlmSubStep } from "@/lib/llm/run-llm-substep";
import { runFinalizeMultiStep } from "@/lib/llm/run-finalize-multistep";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import { json } from "@/lib/api/response-helpers";
import { PLANNING_LLM } from "@/lib/feature-flags";
import { chatRequestSchema } from "@/lib/validation/request-schema";

export interface ChatResponse {
  status: "success" | "error";
  responseType: "clarification" | "actions" | "mixed";
  message?: string;
  applied: number;
  workflow_ids_created: string[];
  workflow_id?: string;
  artifacts_created?: number;
  errors?: Array<{ action_type: string; reason: string }>;
}

/**
 * POST /api/projects/[projectId]/chat
 *
 * Unified planning chat endpoint.
 * - mode=finalize → run finalize multi-step (context artifacts).
 * - mode=populate + workflow_id → add activities/cards to one workflow.
 * - mode=scaffold → always scaffold prompt (updateProject + createWorkflow only); only those actions are applied.
 * - No mode or other → empty map → scaffold prompt; map has structure → full planning prompt (all action types).
 *
 * Actions are validated and applied directly to the DB.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!PLANNING_LLM) {
    return json(
      { status: "error", error: "Planning LLM is disabled" },
      503,
    );
  }

  const { projectId } = await params;
  if (!projectId) {
    return json({ status: "error", message: "Project ID required" }, 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ status: "error", message: "Invalid JSON body" }, 400);
  }

  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    parsed.error.errors.forEach((e) => {
      const path = e.path.join(".") || "body";
      if (!details[path]) details[path] = [];
      details[path].push(e.message);
    });
    return json({ status: "error", message: "Invalid request body", details }, 400);
  }

  const { message, mock_response, mode, workflow_id } = parsed.data;

  let db;
  try {
    db = getDb();
  } catch {
    return json({ status: "error", message: "Database not configured" }, 500);
  }

  const state = await fetchMapSnapshot(db, projectId);
  if (!state) {
    return json({ status: "error", message: "Project not found" }, 404);
  }

  const noopEmit = () => {};

  if (mode === "finalize") {
    try {
      const artifactsCreated = await runFinalizeMultiStep({
        db,
        projectId,
        state,
        emit: noopEmit,
        mockResponse: mock_response,
      });
      return json({
        status: "success",
        responseType: "actions" as const,
        message: `Created ${artifactsCreated} context artifact(s).`,
        applied: artifactsCreated,
        workflow_ids_created: [],
        artifacts_created: artifactsCreated,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Finalize failed";
      console.error("[chat] Finalize error:", msg);
      return json({ status: "error", message: msg }, 502);
    }
  }

  if (mode === "populate" && workflow_id) {
    const workflow = Array.from(state.workflows.values()).find((w) => w.id === workflow_id);
    if (!workflow) {
      return json({ status: "error", message: "Workflow not found" }, 404);
    }
    try {
      const result = await runLlmSubStep({
        db,
        projectId,
        systemPrompt: buildPopulateWorkflowPrompt(),
        userMessage: buildPopulateWorkflowUserMessage(
          workflow_id,
          workflow.title,
          workflow.description,
          message,
          state,
        ),
        state,
        emit: noopEmit,
        actionFilter: (a: PlanningAction) =>
          a.action_type === "createActivity" ||
          a.action_type === "createCard" ||
          a.action_type === "upsertCardKnowledgeItem",
        mockResponse: mock_response,
      });
      return json({
        status: "success",
        responseType: "actions" as const,
        message: result.actionCount > 0 ? `Added ${result.actionCount} activity/card action(s).` : "No actions generated.",
        applied: result.actionCount,
        workflow_ids_created: [],
        workflow_id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Populate failed";
      console.error("[chat] Populate error:", msg);
      return json({ status: "error", message: msg }, 502);
    }
  }

  const linkedArtifacts = getLinkedArtifactsForPrompt(state, 5);
  const hasStructure = state.workflows.size >= 1;

  let systemPrompt: string;
  let userMessage: string;

  if (mode === "scaffold") {
    systemPrompt = buildScaffoldSystemPrompt();
    userMessage = buildScaffoldUserMessage(message, state, linkedArtifacts);
  } else if (hasStructure) {
    systemPrompt = buildPlanningSystemPrompt();
    userMessage = buildPlanningUserMessage(message, state, linkedArtifacts);
  } else {
    systemPrompt = buildScaffoldSystemPrompt();
    userMessage = buildScaffoldUserMessage(message, state, linkedArtifacts);
  }

  // --- LLM call ---
  const useMock =
    process.env.PLANNING_MOCK_ALLOWED === "1" &&
    typeof mock_response === "string" &&
    mock_response.length > 0;

  let llmText: string;

  if (useMock) {
    llmText = mock_response!;
  } else {
    try {
      const llmResponse = await claudePlanningRequest({
        userRequest: message,
        mapSnapshot: state,
        linkedArtifacts,
      }, {
        systemPromptOverride: systemPrompt,
        userMessageOverride: userMessage,
      });
      llmText = llmResponse.text;
    } catch (e) {
      const err = e instanceof Error ? e.message : "Planning service error";
      console.error("[chat] Planning LLM error:", err);

      let userMsg: string;
      if (err.includes("ANTHROPIC_API_KEY")) {
        userMsg = "Planning LLM not configured. Set ANTHROPIC_API_KEY.";
      } else if (err.includes("timed out") || err.includes("aborted")) {
        userMsg = "Planning request timed out. Try again.";
      } else if (err.includes("credit balance") || err.includes("billing")) {
        userMsg = "Anthropic API credit balance is too low.";
      } else if (err.includes("401") || err.includes("authentication")) {
        userMsg = "Anthropic API key is invalid.";
      } else if (err.includes("429") || err.includes("rate limit")) {
        userMsg = "Rate limit exceeded. Please try again in a moment.";
      } else {
        userMsg = "Planning service temporarily unavailable.";
      }
      return json({ status: "error", message: userMsg }, 502);
    }
  }

  // --- Parse ---
  const parseResult = parsePlanningResponse(llmText);

  if (parseResult.responseType === "clarification" && parseResult.actions.length === 0) {
    const response: ChatResponse = {
      status: "success",
      responseType: "clarification",
      message: parseResult.message,
      applied: 0,
      workflow_ids_created: [],
    };
    return json(response);
  }

  // --- Validate ---
  const projectIdValue = state.project.id;
  const actionsWithProjectId = parseResult.actions.map((a) => {
    const targetRef = a.target_ref as Record<string, unknown>;
    if (a.action_type === "createWorkflow" && !targetRef.project_id) {
      targetRef.project_id = projectIdValue;
    }
    return {
      ...a,
      project_id: a.project_id || projectIdValue,
      target_ref: targetRef,
    };
  });

  const { valid, rejected } = validatePlanningOutput(actionsWithProjectId, state);

  if (rejected.length > 0) {
    console.error(
      `[chat] ${rejected.length} actions rejected:`,
      rejected.map((r) => `${r.action.action_type}: ${r.reason}`),
    );
  }

  // When mode is scaffold, only apply updateProject and createWorkflow (ignore any other types from LLM)
  const scaffoldOnly = mode === "scaffold";
  const toApply = scaffoldOnly
    ? valid.filter((a) => a.action_type === "updateProject" || a.action_type === "createWorkflow")
    : valid;

  // --- Apply ---
  let applied = 0;
  const workflowIdsCreated: string[] = [];

  if (toApply.length > 0) {
    const applyResult = await pipelineApply(db, projectId, toApply);
    if (applyResult.failedAt !== undefined) {
      console.error("[chat] pipelineApply failed at index", applyResult.failedAt, applyResult.rejectionReason);
    }
    applied = applyResult.applied;

    // Collect created workflow IDs for scaffold → populate flow
    const finalState = await fetchMapSnapshot(db, projectId);
    if (finalState) {
      for (const wf of finalState.workflows.values()) {
        if (!state.workflows.has(wf.id)) {
          workflowIdsCreated.push(wf.id);
        }
      }
    }
  }

  const response: ChatResponse = {
    status: valid.length > 0 || rejected.length === 0 ? "success" : "error",
    responseType: parseResult.responseType,
    message: parseResult.message,
    applied,
    workflow_ids_created: workflowIdsCreated,
    errors:
      rejected.length > 0
        ? rejected.map((r) => ({ action_type: r.action.action_type, reason: r.reason }))
        : undefined,
  };

  return json(response);
}
