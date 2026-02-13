/**
 * Project query helpers.
 * Implementation deferred to Step 4 (API Layer).
 */
import type { Project } from "@/lib/schemas/slice-a";

export async function getProject(id: string): Promise<Project | null> {
  // TODO: Implement in Step 4 - fetch from Supabase project table
  void id;
  throw new Error("Not implemented");
}

export async function createProject(data: {
  name: string;
  repo_url?: string | null;
  default_branch?: string;
}): Promise<Project> {
  // TODO: Implement in Step 4 - insert into Supabase project table
  void data;
  throw new Error("Not implemented");
}

export async function listProjects(): Promise<Project[]> {
  // TODO: Implement in Step 4 - fetch all from Supabase project table
  throw new Error("Not implemented");
}
