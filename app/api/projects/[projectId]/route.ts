import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getProject } from "@/lib/supabase/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { updateProjectSchema } from "@/lib/validation/request-schema";

type RouteParams = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const db = getDb();
    const project = await getProject(db, projectId);

    if (!project) {
      return notFoundError("Project not found");
    }

    return json(project);
  } catch (err) {
    console.error("GET /api/projects/[projectId] error:", err);
    return internalError();
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = updateProjectSchema.safeParse(body);

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
    const existing = await getProject(db, projectId);

    if (!existing) {
      return notFoundError("Project not found");
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.repo_url !== undefined) updates.repo_url = parsed.data.repo_url;
    if (parsed.data.default_branch !== undefined)
      updates.default_branch = parsed.data.default_branch;

    if (Object.keys(updates).length === 0) {
      return json(existing);
    }

    await db.updateProject(projectId, updates);

    const updated = await getProject(db, projectId);
    return json(updated ?? existing);
  } catch (err) {
    console.error("PATCH /api/projects/[projectId] error:", err);
    return internalError();
  }
}
