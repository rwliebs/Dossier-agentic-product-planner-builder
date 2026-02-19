/**
 * Repo manager: clone, fetch, and branch operations for build execution.
 * Clones user repos to ~/.dossier/repos/<projectId>/ for agentic-flow to work in.
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
    // https://github.com/owner/repo.git -> https://<token>@github.com/owner/repo.git
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
 * Returns the clone path on success.
 */
export function ensureClone(
  projectId: string,
  repoUrl: string,
  token?: string | null
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
      // Already cloned — fetch latest
      execSync("git fetch origin", {
        cwd: clonePath,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { success: true, clonePath };
    }

    // Clone
    execSync(`git clone --depth 1 "${cloneUrl}" "${clonePath}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    });

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
 * Creates a feature branch from the base branch.
 * Assumes origin/<baseBranch> exists (from fetch).
 */
export function createFeatureBranch(
  clonePath: string,
  branchName: string,
  baseBranch: string
): { success: boolean; error?: string } {
  try {
    const baseRef = `origin/${baseBranch}`;
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
