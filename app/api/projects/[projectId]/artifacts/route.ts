import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProject, getArtifactsByProject } from "@/lib/supabase/queries";
import {
  json,
  validationError,
  notFoundError,
  internalError,
} from "@/lib/api/response-helpers";
import { createArtifactSchema } from "@/lib/validation/request-schema";
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

    const artifacts = await getArtifactsByProject(supabase, projectId);
    return json(artifacts);
  } catch (err) {
    console.error("GET /api/projects/[projectId]/artifacts error:", err);
    return internalError();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = createArtifactSchema.safeParse(body);

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
    const project = await getProject(supabase, projectId);

    if (!project) {
      return notFoundError("Project not found");
    }

    const { name, type, title, content, uri, locator, mime_type, integration_ref } =
      parsed.data;

    const { data, error } = await supabase
      .from(TABLES.context_artifacts)
      .insert({
        project_id: projectId,
        name,
        type,
        title: title ?? null,
        content: content ?? null,
        uri: uri ?? null,
        locator: locator ?? null,
        mime_type: mime_type ?? null,
        integration_ref: integration_ref ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("POST /api/projects/[projectId]/artifacts error:", error);
      return internalError(error.message);
    }

    return json(data, 201);
  } catch (err) {
    console.error("POST /api/projects/[projectId]/artifacts error:", err);
    return internalError();
  }
}
