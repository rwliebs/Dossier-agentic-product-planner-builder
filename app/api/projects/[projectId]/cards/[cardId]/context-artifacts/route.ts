import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  getCardContextArtifacts,
  getArtifactById,
  verifyCardInProject,
} from "@/lib/db/queries";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";

type RouteParams = {
  params: Promise<{ projectId: string; cardId: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, cardId } = await params;
    const db = getDb();

    const inProject = await verifyCardInProject(db, cardId, projectId);
    if (!inProject) return notFoundError("Card not found");

    const links = await getCardContextArtifacts(db, cardId);
    const artifacts = [];
    for (const link of links) {
      const artifactId = (link as { context_artifact_id?: string }).context_artifact_id;
      if (artifactId) {
        const art = await getArtifactById(db, artifactId);
        if (art) artifacts.push(art);
      }
    }
    return json(artifacts);
  } catch (err) {
    console.error("GET context-artifacts error:", err);
    return internalError();
  }
}
