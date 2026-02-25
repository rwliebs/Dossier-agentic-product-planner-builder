#!/usr/bin/env node
/**
 * Commits all uncommitted changes in the project clone so the worktree is clean
 * and you can start a new build (avoids "local changes would be overwritten by checkout").
 *
 * Usage:
 *   node scripts/commit-worktree-wip.mjs <projectId>
 *
 * Then trigger a new build from the UI.
 */

import { execSync } from "node:child_process";
import path from "node:path";

const dataDir = process.env.DOSSIER_DATA_DIR || path.join(process.env.HOME || process.env.USERPROFILE || ".", ".dossier");
const REPOS_DIR = "repos";

function getClonePath(projectId) {
  return path.join(dataDir, REPOS_DIR, projectId);
}

const projectId = process.argv[2];
if (!projectId) {
  console.error("Usage: node scripts/commit-worktree-wip.mjs <projectId>");
  process.exit(1);
}

const repoPath = getClonePath(projectId);
try {
  const status = execSync("git status --porcelain --untracked-files=all", {
    cwd: repoPath,
    encoding: "utf-8",
  }).trim();
  if (!status) {
    console.log("Nothing to commit; worktree already clean.");
    process.exit(0);
  }
  execSync("git add -A", { cwd: repoPath, stdio: "pipe" });
  execSync('git commit -m "WIP: recover uncommitted build output (commit-worktree-wip)"', {
    cwd: repoPath,
    stdio: "pipe",
  });
  console.log("Committed all changes. You can start a new build now.");
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
