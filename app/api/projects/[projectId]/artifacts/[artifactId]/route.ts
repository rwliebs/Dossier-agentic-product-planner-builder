import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getProject, getArtifactById } from "@/lib/db/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { updateArtifactSchema } from "@/lib/validation/request-schema";

type RouteParams = {
  params: Promise<{ projectId: string; artifactId: string }>;
};

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { projectId, artifactId } = await params;
    const db = getDb();

    const project = await getProject(db, projectId);
    if (!project) {
      return notFoundError("Project not found");
    }

    const artifact = await getArtifactById(db, artifactId);
    if (!artifact) {
      return notFoundError("Artifact not found");
    }

    if ((artifact as Record<string, unknown>).project_id !== projectId) {
      return notFoundError("Artifact not found");
    }

    return json(artifact);
  } catch (err) {
    console.error("GET /api/projects/[projectId]/artifacts/[artifactId] error:", err);
    return internalError();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { projectId, artifactId } = await params;
    const body = await request.json();
    const parsed = updateArtifactSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      parsed.error.errors.forEach((e) => {
        const path = e.path.join(".");
        if (!details[path]) details[path] = [];
        details[path].push(e.message);
      });
      return validationError("Invalid request body", details);
    }

    const db = getDb();
    const project = await getProject(db, projectId);
    if (!project) {
      return notFoundError("Project not found");
    }

    const artifact = await getArtifactById(db, artifactId);
    if (!artifact) {
      return notFoundError("Artifact not found");
    }

    if ((artifact as Record<string, unknown>).project_id !== projectId) {
      return notFoundError("Artifact not found");
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.type !== undefined) updates.type = parsed.data.type;
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.content !== undefined) updates.content = parsed.data.content;
    if (parsed.data.uri !== undefined) updates.uri = parsed.data.uri;
    if (parsed.data.locator !== undefined) updates.locator = parsed.data.locator;
    if (parsed.data.mime_type !== undefined) updates.mime_type = parsed.data.mime_type;
    if (parsed.data.integration_ref !== undefined)
      updates.integration_ref = parsed.data.integration_ref;

    if (Object.keys(updates).length === 0) {
      return json(artifact);
    }

    await db.updateContextArtifact(artifactId, updates);

    const updated = await db.getArtifactById(artifactId);
    return json(updated ?? artifact);
  } catch (err) {
    console.error("PATCH /api/projects/[projectId]/artifacts/[artifactId] error:", err);
    return internalError();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { projectId, artifactId } = await params;
    const db = getDb();

    const project = await getProject(db, projectId);
    if (!project) {
      return notFoundError("Project not found");
    }

    const artifact = await getArtifactById(db, artifactId);
    if (!artifact) {
      return notFoundError("Artifact not found");
    }

    if ((artifact as Record<string, unknown>).project_id !== projectId) {
      return notFoundError("Artifact not found");
    }

    await db.deleteContextArtifact(artifactId, projectId);

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/projects/[projectId]/artifacts/[artifactId] error:", err);
    return internalError();
  }
}
