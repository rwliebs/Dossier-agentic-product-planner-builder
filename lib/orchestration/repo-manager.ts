/**
 * Repo manager: clone, fetch, and branch operations for build execution.
 * Clones user repos to ~/.dossier/repos/<projectId>/ for agentic-flow to work in.
 *
 * Handles empty (freshly-created) repos by seeding an initial commit so that
 * downstream git operations (checkout, ls-tree, diff) have a valid base.
 *
 * @see docs/strategy/worktree-management-flow.md
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { getDataDir, ensureDataDir, readConfigFile } from "@/lib/config/data-dir";

const REPOS_DIR = "repos";

function getGitHubToken(): string | null {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const config = readConfigFile();
  const fromConfig = config.GITHUB_TOKEN?.trim();
  return fromConfig ?? null;
}

function runGitSync(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Returns true when the local clone has zero commits (freshly-created remote).
 */
function isEmptyRepo(clonePath: string): boolean {
  try {
    runGitSync(clonePath, "rev-parse HEAD");
    return false;
  } catch {
    return true;
  }
}

/**
 * Seeds an empty repo with a local initial commit so that branch creation,
 * ls-tree, and diff all work. Does NOT push — the agent pushes when it
 * creates a PR, and the token may not have write scope yet.
 */
function seedEmptyRepo(clonePath: string, baseBranch: string): void {
  runGitSync(clonePath, `checkout -b ${baseBranch}`);
  fs.writeFileSync(
    path.join(clonePath, "README.md"),
    "# New Project\n\nInitialized by Dossier.\n"
  );
  runGitSync(clonePath, "add README.md");
  runGitSync(
    clonePath,
    'commit -m "chore: initialize repository (Dossier)" --author="Dossier <noreply@dossier.dev>"'
  );
}

/**
 * Converts html_url (https://github.com/owner/repo) to authenticated clone URL.
 * Appends .git if needed; injects token for private repos.
 * file:// URLs are left as-is (no .git suffix).
 */
export function repoUrlToCloneUrl(repoUrl: string, token?: string | null): string {
  const trimmed = repoUrl.trim().replace(/\/$/, "");
  const isFile = trimmed.toLowerCase().startsWith("file://");
  let cloneUrl = trimmed.endsWith(".git") ? trimmed : isFile ? trimmed : `${trimmed}.git`;

  if (token && !isFile) {
    cloneUrl = cloneUrl.replace(/^https:\/\//, `https://${token}@`);
  }

  return cloneUrl;
}

/**
 * Returns the clone path for a project: ~/.dossier/repos/<projectId>/
 */
export function getClonePath(projectId: string): string {
  const dataDir = getDataDir();
  return path.join(dataDir, REPOS_DIR, projectId);
}

/**
 * Ensures the repo is cloned locally. If it exists, fetches latest from origin.
 * If the repo is empty (no commits), seeds it with an initial commit.
 * Returns the clone path on success.
 */
export function ensureClone(
  projectId: string,
  repoUrl: string,
  token?: string | null,
  baseBranch = "main"
): { success: boolean; clonePath?: string; error?: string } {
  const clonePath = getClonePath(projectId);
  const effectiveToken = token ?? getGitHubToken();
  const cloneUrl = repoUrlToCloneUrl(repoUrl, effectiveToken);

  try {
    ensureDataDir();
    const reposDir = path.join(getDataDir(), REPOS_DIR);
    if (!fs.existsSync(reposDir)) {
      fs.mkdirSync(reposDir, { recursive: true });
    }

    const gitDir = path.join(clonePath, ".git");

    if (fs.existsSync(gitDir)) {
      execSync("git fetch origin", {
        cwd: clonePath,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else {
      execSync(`git clone "${cloneUrl}" "${clonePath}"`, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    }

    if (isEmptyRepo(clonePath)) {
      seedEmptyRepo(clonePath, baseBranch);
    }

    return { success: true, clonePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Repo clone/fetch failed: ${message}`,
    };
  }
}

/**
 * Creates root folders in the repo and commits them.
 * Used after project finalization to establish folder structure.
 * Idempotent: skips commit if nothing to add.
 */
export function createRootFoldersInRepo(
  clonePath: string,
  folders: string[],
  baseBranch: string
): { success: boolean; error?: string } {
  if (folders.length === 0) return { success: true };

  try {
    runGitSync(clonePath, `checkout ${baseBranch}`);

    for (const folder of folders) {
      const dirPath = path.join(clonePath, folder);
      fs.mkdirSync(dirPath, { recursive: true });
      const gitkeepPath = path.join(dirPath, ".gitkeep");
      const entries = fs.readdirSync(dirPath);
      if (entries.length === 0 && !fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, "");
      }
    }

    runGitSync(clonePath, "add -A");
    const status = runGitSync(clonePath, "status --porcelain");
    if (status) {
      runGitSync(
        clonePath,
        'commit -m "chore: add root folder structure (Dossier finalization)" --author="Dossier <noreply@dossier.dev>"'
      );
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Create root folders failed: ${message}`,
    };
  }
}

/**
 * Creates a feature branch from the base branch.
 * Tries origin/<baseBranch> first; falls back to local <baseBranch>
 * (covers repos seeded locally that haven't been fetched yet).
 */
export function createFeatureBranch(
  clonePath: string,
  branchName: string,
  baseBranch: string
): { success: boolean; error?: string } {
  try {
    let baseRef = `origin/${baseBranch}`;
    try {
      runGitSync(clonePath, `rev-parse --verify ${baseRef}`);
    } catch {
      baseRef = baseBranch;
    }
    execSync(`git checkout -b "${branchName}" "${baseRef}"`, {
      cwd: clonePath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Create branch failed: ${message}`,
    };
  }
}
