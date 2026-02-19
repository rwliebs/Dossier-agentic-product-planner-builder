import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  verifyCardInProject,
  getCardContextArtifacts,
  getArtifactById,
  getArtifactsByProject,
  getCardRequirements,
  getCardPlannedFiles,
  getCardById,
} from "@/lib/supabase/queries";
import { json, notFoundError, validationError, internalError } from "@/lib/api/response-helpers";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string }>;
};

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
 * POST /api/projects/[projectId]/cards/[cardId]/finalize
 * Confirm finalization — sets finalized_at on the card.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const requirements = await getCardRequirements(db, cardId);
    if (requirements.length === 0) {
      return validationError("Card must have at least one requirement before finalization");
    }

    const plannedFiles = await getCardPlannedFiles(db, cardId);
    if (plannedFiles.length === 0) {
      return validationError("Card must have at least one planned file before finalization");
    }

    const now = new Date().toISOString();
    await db.updateCard(cardId, { finalized_at: now });

    return json({ finalized_at: now });
  } catch (err) {
    console.error("POST finalize error:", err);
    return internalError();
  }
}
