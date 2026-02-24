#!/usr/bin/env -S npx tsx
/**
 * Commits all eligible uncommitted files to the current branch.
 * Uses the same exclusions as auto-commit (.next, node_modules, etc.).
 *
 * Usage:
 *   npm run commit-all-to-branches -- <projectId>
 *   npx tsx scripts/commit-all-to-branches.ts <projectId>
 *
 * Run when on each feature branch to commit that branch's files.
 * Checkout first: cd ~/.dossier/repos/<projectId> && git checkout <branch>
 */

import * as path from "node:path";
import { getDataDir } from "../lib/config/data-dir";
import { runGit } from "../lib/orchestration/git-ops";
import { performAutoCommit } from "../lib/orchestration/auto-commit";

const REPOS_DIR = "repos";

const DEFAULT_ALLOWED_PATHS = [
  "app",
  "components",
  "lib",
  "tests",
  "__tests__",
  "src",
  "public",
];

function getClonePath(projectId: string): string {
  return path.join(getDataDir(), REPOS_DIR, projectId);
}

function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: npx tsx scripts/commit-all-to-branches.ts <projectId>");
    process.exit(1);
  }

  const repoPath = getClonePath(projectId);
  const branchResult = runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branchResult.success) {
    console.error("Failed to get current branch:", branchResult.error);
    process.exit(1);
  }

  const branch = branchResult.stdout?.trim() ?? "";
  if (branch === "main") {
    console.error("On main branch. Switch to a feature branch first.");
    process.exit(1);
  }

  console.log(`Committing to ${branch} in ${repoPath}\n`);

  const result = performAutoCommit({
    worktreePath: repoPath,
    featureBranch: branch,
    cardId: branch.replace("feat/run-", "").replace(/-/g, "").slice(0, 8),
    allowedPaths: DEFAULT_ALLOWED_PATHS,
  });

  if (result.outcome === "committed") {
    console.log(`Committed (${result.sha?.slice(0, 7)}): ${result.message}`);
  } else if (result.outcome === "no_changes") {
    console.log(result.reason);
  } else {
    console.error(result.error);
    process.exit(1);
  }
}

main();
