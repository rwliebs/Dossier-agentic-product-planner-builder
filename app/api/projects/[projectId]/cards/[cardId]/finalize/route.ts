import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import type { DbAdapter } from "@/lib/db/adapter";
import {
  verifyCardInProject,
  getCardContextArtifacts,
  getArtifactById,
  getArtifactsByProject,
  getCardRequirements,
  getCardPlannedFiles,
  getCardById,
  getProject,
} from "@/lib/db/queries";
import { fetchMapSnapshot } from "@/lib/db/map-snapshot";
import {
  buildFinalizeTestsSystemPrompt,
  buildFinalizeTestsUserMessage,
} from "@/lib/llm/planning-prompt";
import { runLlmSubStep, type Emitter } from "@/lib/llm/run-llm-substep";
import { MEMORY_PLANE, PLANNING_LLM } from "@/lib/feature-flags";
import { ingestCardContext } from "@/lib/memory/ingestion";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string }>;
};

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * GET /api/projects/[projectId]/cards/[cardId]/finalize
 * Assemble the finalization package for a card: relevant project-wide docs,
 * card-specific context artifacts (including e2e tests), requirements, and planned files.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const card = await getCardById(db, cardId);
    if (!card) return notFoundError("Card not found");

    const allArtifacts = await getArtifactsByProject(db, projectId);

    const projectDocs = allArtifacts.filter((a: Record<string, unknown>) => {
      const type = a.type as string;
      return type === "doc" || type === "spec" || type === "design";
    });

    const cardLinks = await getCardContextArtifacts(db, cardId);
    const cardArtifacts = [];
    for (const link of cardLinks) {
      const artifactId = (link as { context_artifact_id?: string }).context_artifact_id;
      if (artifactId) {
        const art = await getArtifactById(db, artifactId);
        if (art) cardArtifacts.push(art);
      }
    }

    const requirements = await getCardRequirements(db, cardId);
    const plannedFiles = await getCardPlannedFiles(db, cardId);

    return json({
      card,
      project_docs: projectDocs,
      card_artifacts: cardArtifacts,
      requirements,
      planned_files: plannedFiles,
      finalized_at: (card as Record<string, unknown>).finalized_at ?? null,
    });
  } catch (err) {
    console.error("GET finalize error:", err);
    return internalError();
  }
}

/**
 * Link project-wide context docs (doc/spec/design) to a card if not already linked.
 */
async function linkProjectDocsToCard(
  db: DbAdapter,
  cardId: string,
  projectId: string,
): Promise<number> {
  const allArtifacts = await getArtifactsByProject(db, projectId);
  const projectDocs = allArtifacts.filter((a: Record<string, unknown>) => {
    const type = a.type as string;
    return type === "doc" || type === "spec" || type === "design";
  });

  const existingLinks = await getCardContextArtifacts(db, cardId);
  const linkedIds = new Set(
    existingLinks.map((l: Record<string, unknown>) => l.context_artifact_id as string),
  );

  let linked = 0;
  for (const doc of projectDocs) {
    const docId = (doc as Record<string, unknown>).id as string;
    if (linkedIds.has(docId)) continue;
    try {
      await db.insertCardContextArtifact({
        card_id: cardId,
        context_artifact_id: docId,
        linked_by: "finalize",
        usage_hint: null,
      });
      linked++;
    } catch (err) {
      console.error(`[card-finalize] Failed to link doc ${docId} to card ${cardId}:`, err);
    }
  }
  return linked;
}

/**
 * POST /api/projects/[projectId]/cards/[cardId]/finalize
 *
 * Streaming SSE endpoint that:
 * 1. Links project-wide context docs to this card
 * 2. Generates an e2e test artifact for this card via LLM
 * 3. Sets finalized_at on the card
 *
 * Returns SSE events: finalize_progress, action, error, done
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { projectId, cardId } = await params;

  let db: DbAdapter;
  try {
    db = getDb();
  } catch {
    return new Response(
      JSON.stringify({ error: "Database not configured" }),
      { status: 500 },
    );
  }

  const inProject = await verifyCardInProject(db, cardId, projectId);
  if (!inProject) return notFoundError("Card not found");

  const card = await getCardById(db, cardId);
  if (!card) return notFoundError("Card not found");

  const cardRow = card as Record<string, unknown>;
  if (cardRow.finalized_at) {
    return validationError("Card is already finalized");
  }

  const project = await getProject(db, projectId);
  const projectFinalizedAt = (project as { finalized_at?: string | null })?.finalized_at;
  if (!projectFinalizedAt) {
    return validationError("Project must be finalized before cards can be finalized");
  }

  const requirements = await getCardRequirements(db, cardId);
  if (requirements.length === 0) {
    return validationError("Card must have at least one requirement before finalization");
  }

  const plannedFiles = await getCardPlannedFiles(db, cardId);
  if (plannedFiles.length === 0) {
    return validationError(
      "Card must have at least one planned file or folder before finalization."
    );
  }

  if (!PLANNING_LLM) {
    return new Response(
      JSON.stringify({
        error: "Planning LLM is disabled",
        message: "Set NEXT_PUBLIC_PLANNING_LLM_ENABLED=true to enable.",
      }),
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit: Emitter = (event, data) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        const totalSteps = 3;

        // Step 1: Link project-wide context docs
        emit("finalize_progress", {
          step: "link_docs",
          step_index: 0,
          total_steps: totalSteps,
          status: "generating",
          label: "Linking project context documents",
        });

        const docsLinked = await linkProjectDocsToCard(db, cardId, projectId);

        emit("finalize_progress", {
          step: "link_docs",
          step_index: 0,
          total_steps: totalSteps,
          status: "complete",
          label: `Linked ${docsLinked} project document${docsLinked !== 1 ? "s" : ""}`,
        });

        // Step 2: Generate e2e test via LLM
        emit("finalize_progress", {
          step: "test_gen",
          step_index: 1,
          total_steps: totalSteps,
          status: "generating",
          label: `Generating e2e tests for "${cardRow.title}"`,
        });

        const state = await fetchMapSnapshot(db, projectId);
        if (!state) {
          emit("error", { reason: "Failed to load project state" });
          emit("done", {});
          return;
        }

        const plannedFiles = await getCardPlannedFiles(db, cardId);

        const cardData = {
          id: cardId,
          title: cardRow.title as string,
          description: (cardRow.description as string) ?? null,
          requirements: requirements.map((r: Record<string, unknown>) => ({
            text: r.text as string,
            status: r.status as string,
          })),
          planned_files: plannedFiles.map((pf: Record<string, unknown>) => ({
            logical_file_name: pf.logical_file_name as string,
            artifact_kind: pf.artifact_kind as string,
            action: pf.action as string,
            intent_summary: pf.intent_summary as string,
          })),
        };

        const projectSummary = {
          id: state.project.id,
          name: state.project.name ?? null,
          description: state.project.description ?? null,
          tech_stack: state.project.tech_stack ?? null,
          deployment: state.project.deployment ?? null,
        };

        let testGenerated = false;
        let contextDocsGenerated = 0;
        try {
          const result = await runLlmSubStep({
            db,
            projectId,
            systemPrompt: buildFinalizeTestsSystemPrompt(),
            userMessage: buildFinalizeTestsUserMessage(cardData, projectSummary),
            state,
            emit,
            actionFilter: (a) => a.action_type === "createContextArtifact",
          });

          testGenerated = result.actionCount > 0;
          contextDocsGenerated = result.actionCount > 1 ? result.actionCount - 1 : 0;

          emit("finalize_progress", {
            step: "test_gen",
            step_index: 1,
            total_steps: totalSteps,
            status: testGenerated ? "complete" : "error",
            label: testGenerated
              ? contextDocsGenerated > 0
                ? `Generated e2e test and ${contextDocsGenerated} context doc(s) for "${cardRow.title}"`
                : `Generated e2e test for "${cardRow.title}"`
              : `No test artifact produced for "${cardRow.title}"`,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Test generation failed";
          console.error(`[card-finalize] Test generation failed for card ${cardId}:`, msg);
          emit("error", { reason: `Test generation failed: ${msg}` });
          emit("finalize_progress", {
            step: "test_gen",
            step_index: 1,
            total_steps: totalSteps,
            status: "error",
            label: `Failed to generate tests: ${msg}`,
          });
        }

        // Step 3: Stamp finalized_at
        emit("finalize_progress", {
          step: "confirm",
          step_index: 2,
          total_steps: totalSteps,
          status: "generating",
          label: "Confirming finalization",
        });

        const now = new Date().toISOString();
        await db.updateCard(cardId, { finalized_at: now });

        if (MEMORY_PLANE) {
          try {
            await ingestCardContext(db, cardId, projectId);
          } catch (ingestErr) {
            console.warn("[card-finalize] Memory ingest failed (build context may be empty):", ingestErr instanceof Error ? ingestErr.message : String(ingestErr));
          }
        }

        emit("finalize_progress", {
          step: "confirm",
          step_index: 2,
          total_steps: totalSteps,
          status: "complete",
          label: "Card finalized",
        });

        emit("phase_complete", {
          responseType: "card_finalize_complete",
          card_id: cardId,
          finalized_at: now,
          docs_linked: docsLinked,
          test_generated: testGenerated,
          context_docs_generated: contextDocsGenerated,
        });

        emit("done", {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Finalization error";
        console.error("[card-finalize] Error:", msg);
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
