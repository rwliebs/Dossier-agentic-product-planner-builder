/**
 * Project query helpers.
 * Implementation deferred to Step 4 (API Layer).
 */
import type { Project } from "@/lib/schemas/slice-a";

export async function getProject(id: string): Promise<Project | null> {
  void id;
  throw new Error("Not implemented");
}

export async function createProject(data: {
  name: string;
  repo_url?: string | null;
  default_branch?: string;
}): Promise<Project> {
  void data;
  throw new Error("Not implemented");
}

export async function listProjects(): Promise<Project[]> {
  throw new Error("Not implemented");
}
