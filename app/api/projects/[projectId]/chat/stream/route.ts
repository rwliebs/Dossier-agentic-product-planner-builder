import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { fetchMapSnapshot, getLinkedArtifactsForPrompt } from "@/lib/supabase/map-snapshot";
import { claudeStreamingRequest } from "@/lib/llm/claude-client";
import { parseActionsFromStream } from "@/lib/llm/stream-action-parser";
import { validatePlanningOutput } from "@/lib/llm/validate-planning-output";
import { pipelineApply } from "@/lib/supabase/mutations";
import {
  buildScaffoldSystemPrompt,
  buildScaffoldUserMessage,
  buildPopulateWorkflowPrompt,
  buildPopulateWorkflowUserMessage,
  buildFinalizeSystemPrompt,
  buildFinalizeUserMessage,
} from "@/lib/llm/planning-prompt";
import { PLANNING_LLM } from "@/lib/feature-flags";
import { chatStreamRequestSchema } from "@/lib/validation/request-schema";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * POST /api/projects/[projectId]/chat/stream
 * Streaming planning endpoint. Returns SSE with actions as they are parsed and applied.
 * Supports scaffold (workflows only) and populate (activities/cards for one workflow) modes.
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

  let db;
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

  let systemPrompt: string;
  let userMessage: string;

  if (mode === "finalize") {
    systemPrompt = buildFinalizeSystemPrompt();
    userMessage = buildFinalizeUserMessage(state);
  } else if (mode === "populate" && workflow_id) {
    const workflow = Array.from(state.workflows.values()).find((w) => w.id === workflow_id);
    if (!workflow) {
      return new Response(JSON.stringify({ error: "Workflow not found" }), {
        status: 404,
      });
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        const useMock =
          process.env.PLANNING_MOCK_ALLOWED === "1" &&
          typeof mock_response === "string" &&
          mock_response.length > 0;

        let rawLlmOutput = "";
        const llmStreamRaw = useMock
          ? null
          : await claudeStreamingRequest({
              systemPrompt,
              userMessage,
            });
        const llmStream = useMock
          ? new ReadableStream<string>({
              start(ctrl) {
                ctrl.enqueue(mock_response!);
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

        let currentState = state;
        let actionCount = 0;

        for await (const result of parseActionsFromStream(llmStream)) {
          if (result.type === "response_type") {
            if (result.responseType === "clarification") {
              emit("phase_complete", { responseType: "clarification" });
              emit("done", {});
              controller.close();
              return;
            }
            continue;
          }
          if (result.type === "message") {
            emit("message", { message: result.message });
            continue;
          }
          if (result.type === "done") {
            break;
          }
          if (result.type !== "action") continue;

          const action = result.action;
          if (mode === "populate" && action.action_type !== "createActivity" && action.action_type !== "createCard") {
            continue;
          }
          if (mode === "finalize" && action.action_type !== "createContextArtifact") {
            continue;
          }
          const targetRef = action.target_ref as Record<string, unknown>;
          const projectIdValue = state.project.id;

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
            emit("error", {
              action: actionWithProjectId,
              reason: rejected[0].reason,
            });
            continue;
          }

          const applyResult = await pipelineApply(db, projectId, valid);

          if (applyResult.failedAt !== undefined) {
            emit("error", {
              action: actionWithProjectId,
              reason: applyResult.rejectionReason ?? "Apply failed",
            });
            continue;
          }

          actionCount++;
          emit("action", {
            action: actionWithProjectId,
            applied: applyResult.applied,
          });

          const newState = await fetchMapSnapshot(db, projectId);
          if (newState) currentState = newState;
        }

        const shouldLogRaw =
          !useMock &&
          rawLlmOutput &&
          (process.env.PLANNING_DEBUG === "1" || (mode === "scaffold" && actionCount === 0));
        if (shouldLogRaw) {
          console.log(
            "[planning] LLM raw output",
            actionCount === 0 ? "(0 actions parsed)" : "",
            ":\n",
            rawLlmOutput.slice(0, 4000),
            rawLlmOutput.length > 4000 ? "\n...(truncated)" : "",
          );
        }

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
        } else if (mode === "finalize") {
          emit("phase_complete", {
            responseType: "finalize_complete",
            artifacts_created: actionCount,
          });
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
