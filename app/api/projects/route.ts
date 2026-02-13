import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listProjects } from "@/lib/supabase/queries";
import {
  json,
  validationError,
  internalError,
} from "@/lib/api/response-helpers";
import { createProjectSchema } from "@/lib/validation/request-schema";
import { TABLES } from "@/lib/supabase/queries";

export async function GET() {
  try {
    const supabase = await createClient();
    const projects = await listProjects(supabase);
    return json(projects);
  } catch (err) {
    console.error("GET /api/projects error:", err);
    return internalError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      parsed.error.errors.forEach((e) => {
        const path = e.path.join(".");
        if (!details[path]) details[path] = [];
        details[path].push(e.message);
      });
      return validationError("Invalid request body", details);
    }

    const { name, repo_url, default_branch } = parsed.data;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from(TABLES.projects)
      .insert({
        name,
        repo_url: repo_url ?? null,
        default_branch: default_branch ?? "main",
      })
      .select()
      .single();

    if (error) {
      console.error("POST /api/projects insert error:", error);
      return internalError(error.message);
    }

    return json(data, 201);
  } catch (err) {
    console.error("POST /api/projects error:", err);
    return internalError();
  }
}
