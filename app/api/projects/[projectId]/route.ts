import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/supabase/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { updateProjectSchema } from "@/lib/validation/request-schema";
import { TABLES } from "@/lib/supabase/queries";

type RouteParams = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createClient();
    const project = await getProject(supabase, projectId);

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

    const supabase = await createClient();
    const existing = await getProject(supabase, projectId);

    if (!existing) {
      return notFoundError("Project not found");
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.repo_url !== undefined) updates.repo_url = parsed.data.repo_url;
    if (parsed.data.default_branch !== undefined)
      updates.default_branch = parsed.data.default_branch;

    if (Object.keys(updates).length === 0) {
      return json(existing);
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from(TABLES.projects)
      .update(updates)
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      console.error("PATCH /api/projects/[projectId] error:", error);
      return internalError(error.message);
    }

    return json(data);
  } catch (err) {
    console.error("PATCH /api/projects/[projectId] error:", err);
    return internalError();
  }
}
