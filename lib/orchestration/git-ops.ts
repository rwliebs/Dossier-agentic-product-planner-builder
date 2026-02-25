/**
 * Git operations for build worktrees.
 * Uses spawnSync with argument arrays (no shell string concatenation) for safety.
 *
 * ARCH_REF: docs/strategy/worktree-auto-commit.md
 */

import { spawnSync } from "node:child_process";

export interface GitOpsResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

/**
 * Runs a git command with explicit args. Safe against command injection.
 */
export function runGit(
  cwd: string,
  args: string[]
): { success: boolean; stdout: string; stderr: string; error?: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  const success = result.status === 0;

  return {
    success,
    stdout,
    stderr,
    error: success ? undefined : stderr || `git exited with ${result.status}`,
  };
}

/**
 * Returns the current branch name in the worktree.
 */
export function getCurrentBranch(cwd: string): { success: boolean; branch?: string; error?: string } {
  const r = runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!r.success) return { success: false, error: r.error };
  return { success: true, branch: r.stdout || undefined };
}

/**
 * Returns porcelain status lines (XY path) for changed files.
 * Uses --untracked-files=all so every new file in the project repo is listed
 * (not just directory summaries), ensuring agent-created files are picked up.
 * See: git status --porcelain format.
 */
export function getStatusPorcelain(cwd: string): { success: boolean; lines: string[]; error?: string } {
  const r = runGit(cwd, ["status", "--porcelain", "--untracked-files=all"]);
  if (!r.success) return { success: false, lines: [], error: r.error };
  const lines = r.stdout ? r.stdout.split("\n").filter(Boolean) : [];
  return { success: true, lines };
}

/**
 * Stages a single path. Path must be validated (no injection).
 */
export function stagePath(cwd: string, path: string): GitOpsResult {
  const r = runGit(cwd, ["add", "--", path]);
  return { success: r.success, stdout: r.stdout, stderr: r.stderr, error: r.error };
}

/**
 * Commits staged changes. Returns the new commit SHA.
 */
export function commit(
  cwd: string,
  message: string,
  author = "Dossier <noreply@dossier.dev>"
): { success: boolean; sha?: string; error?: string } {
  const r = runGit(cwd, [
    "commit",
    "-m",
    message,
    "--author",
    author,
  ]);
  if (!r.success) return { success: false, error: r.error };

  const revParse = runGit(cwd, ["rev-parse", "HEAD"]);
  if (!revParse.success) return { success: false, error: revParse.error };
  return { success: true, sha: revParse.stdout || undefined };
}
