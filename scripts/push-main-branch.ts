#!/usr/bin/env -S npx tsx
/**
 * Pushes the main (or project default) branch from the project clone to origin.
 * Use this when the remote has no main branch yet (e.g. demo project after
 * finalization before the push-at-finalize change, or if push failed).
 *
 * Usage:
 *   npx tsx scripts/push-main-branch.ts <projectId>
 *
 * Requires: GITHUB_TOKEN in env or ~/.dossier/config for private repos.
 */

import { getDb } from "../lib/db";
import { getProject } from "../lib/db/queries";
import { pushBranch } from "../lib/orchestration/repo-manager";

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: npx tsx scripts/push-main-branch.ts <projectId>");
    process.exit(1);
  }

  const db = getDb();
  const project = await getProject(db, projectId);
  if (!project) {
    console.error("Project not found:", projectId);
    process.exit(1);
  }

  const repoUrl = (project as { repo_url?: string }).repo_url;
  const baseBranch = (project as { default_branch?: string }).default_branch ?? "main";

  if (!repoUrl || repoUrl.includes("placeholder")) {
    console.error("Project has no repository connected. Set repo URL in project settings.");
    process.exit(1);
  }

  const result = pushBranch(projectId, baseBranch, repoUrl);
  if (!result.success) {
    console.error("Push failed:", result.error);
    process.exit(1);
  }

  console.log(`Pushed branch "${baseBranch}" to origin.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
