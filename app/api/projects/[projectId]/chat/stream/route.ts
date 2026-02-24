import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import type { DbAdapter } from "@/lib/db/adapter";
import { fetchMapSnapshot, getLinkedArtifactsForPrompt } from "@/lib/db/map-snapshot";
import type { PlanningState } from "@/lib/schemas/planning-state";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import {
  buildScaffoldSystemPrompt,
  buildScaffoldUserMessage,
  buildPopulateWorkflowPrompt,
  buildPopulateWorkflowUserMessage,
} from "@/lib/llm/planning-prompt";
import { PLANNING_LLM } from "@/lib/feature-flags";
import { chatStreamRequestSchema } from "@/lib/validation/request-schema";
import { runLlmSubStep, type Emitter } from "@/lib/llm/run-llm-substep";
import { runFinalizeMultiStep } from "@/lib/llm/run-finalize-multistep";
import { getArtifactsByProject, getProject } from "@/lib/db/queries";
import { parseRootFoldersFromArchitecturalSummary } from "@/lib/orchestration/parse-root-folders";
import { ensureClone, createRootFoldersInRepo } from "@/lib/orchestration/repo-manager";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

          const artifacts = await getArtifactsByProject(db, projectId);
          const archSummary = artifacts.find(
            (a: Record<string, unknown>) => (a.name as string) === "architectural-summary"
          );
          const content = (archSummary as { content?: string } | undefined)?.content ?? "";
          const rootFolders = parseRootFoldersFromArchitecturalSummary(content);

          const project = await getProject(db, projectId);
          const repoUrl = (project as { repo_url?: string })?.repo_url;
          const baseBranch = (project as { default_branch?: string })?.default_branch ?? "main";
          if (repoUrl && !repoUrl.includes("placeholder") && rootFolders.length > 0) {
            const cloneResult = ensureClone(projectId, repoUrl, null, baseBranch);
            if (cloneResult.success && cloneResult.clonePath) {
              const folderResult = createRootFoldersInRepo(
                cloneResult.clonePath,
                rootFolders,
                baseBranch
              );
              if (!folderResult.success) {
                console.warn("[chat/stream] Root folder creation failed:", folderResult.error);
              }
            }
          } else if (!repoUrl || repoUrl.includes("placeholder")) {
            console.warn("[chat/stream] No repo connected; skipping root folder creation");
          }

          const now = new Date().toISOString();
          await db.updateProject(projectId, { finalized_at: now });

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
            workflow.description ?? null,
            message,
            state,
          );
        } else {
          const linkedArtifacts = getLinkedArtifactsForPrompt(state, 3);
          systemPrompt = buildScaffoldSystemPrompt();
          userMessage = buildScaffoldUserMessage(message, state, linkedArtifacts);
        }

        const actionFilter = mode === "populate"
          ? (a: PlanningAction) =>
              a.action_type === "createActivity" ||
              a.action_type === "createCard" ||
              a.action_type === "upsertCardKnowledgeItem"
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
