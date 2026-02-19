import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { listProjects } from "@/lib/supabase/queries";
import {
  json,
  validationError,
  internalError,
} from "@/lib/api/response-helpers";
import { createProjectSchema } from "@/lib/validation/request-schema";

export async function GET() {
  try {
    const db = getDb();
    const projects = await listProjects(db);
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
    const db = getDb();
    const id = crypto.randomUUID();

    await db.insertProject({
      id,
      name,
      repo_url: repo_url ?? null,
      default_branch: default_branch ?? "main",
    });

    await db.insertSystemPolicyProfile({
      id: crypto.randomUUID(),
      project_id: id,
      required_checks: ["lint"],
      protected_paths: [],
      forbidden_paths: [],
      dependency_policy: {},
      security_policy: {},
      architecture_policy: {},
      approval_policy: {},
    });

    const created = await db.getProject(id);
    return json(created ?? { id, name, repo_url: repo_url ?? null, default_branch: default_branch ?? "main" }, 201);
  } catch (err) {
    console.error("POST /api/projects error:", err);
    return internalError();
  }
}
