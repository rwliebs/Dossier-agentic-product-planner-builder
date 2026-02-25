/**
 * Auto-commit agent-produced files in build worktrees.
 * Runs on execution_completed, before checks.
 * Workflow: agent creates code for the feature card in the project's repo (worktree);
 * we must pick up all new and modified files there (including untracked).
 *
 * ARCH_REF: docs/strategy/worktree-auto-commit.md
 */

import {
  runGit,
  getCurrentBranch,
  getStatusPorcelain,
  stagePath,
  commit,
} from "./git-ops";

/** Paths/patterns always excluded from staging. */
const ARTIFACT_EXCLUSIONS = [
  ".next/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  "test-results/",
  "playwright-report/",
  ".tsbuildinfo",
  ".log",
];

/** Root-level files always allowed when changed. */
const ROOT_ALLOWLIST = [
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "tsconfig.base.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "playwright.config.ts",
  "playwright.config.js",
  ".eslintrc.json",
  ".eslintrc.js",
  "jest.config.js",
  "vitest.config.ts",
];

/** Directory prefixes always allowed (tests and docs created for the card). */
const ALLOWED_DIR_PREFIXES = ["__tests__/", "docs/"];

export interface AutoCommitInput {
  worktreePath: string;
  featureBranch: string;
  cardTitle?: string;
  cardId: string;
  allowedPaths: string[];
}

export type AutoCommitOutcome =
  | { outcome: "committed"; sha: string; message: string }
  | { outcome: "no_changes"; reason: string }
  | { outcome: "error"; error: string };

function isExcluded(path: string): boolean {
  const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "");
  for (const exc of ARTIFACT_EXCLUSIONS) {
    if (exc.endsWith("/")) {
      if (normalized === exc.slice(0, -1) || normalized.startsWith(exc)) return true;
    } else if (normalized.includes(exc) || normalized.endsWith(exc)) {
      return true;
    }
  }
  return false;
}

function isInRootAllowlist(path: string): boolean {
  const normalized = path.replace(/^\/+/, "");
  const segments = normalized.split("/");
  const basename = segments[segments.length - 1] ?? "";
  if (ROOT_ALLOWLIST.includes(basename) && segments.length <= 2) return true;
  for (const prefix of ALLOWED_DIR_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

function isInAllowedPaths(path: string, allowedPaths: string[]): boolean {
  if (allowedPaths.length === 0) return true;
  const normalized = path.replace(/^\/+/, "");
  for (const allowed of allowedPaths) {
    const a = allowed.replace(/^\/+/, "").replace(/\/+$/, "");
    if (normalized === a || normalized.startsWith(a + "/")) return true;
  }
  return false;
}

function isEligible(path: string, allowedPaths: string[]): boolean {
  if (isExcluded(path)) return false;
  if (isInRootAllowlist(path)) return true;
  return isInAllowedPaths(path, allowedPaths);
}

/**
 * Parses git status --porcelain lines into file paths.
 * Format: XY path or XY path1 path2 (rename)
 */
function parsePorcelainLines(lines: string[]): string[] {
  const paths = new Set<string>();
  for (const line of lines) {
    const rest = line.slice(3).trim();
    if (!rest) continue;
    const parts = rest.split(/\s+/);
    for (const p of parts) {
      const path = p.replace(/^"+|"+$/g, "").trim();
      if (path) paths.add(path);
    }
  }
  return Array.from(paths);
}

/**
 * Performs auto-commit for a single assignment's worktree.
 */
export function performAutoCommit(input: AutoCommitInput): AutoCommitOutcome {
  const { worktreePath, featureBranch, cardTitle, cardId, allowedPaths } = input;

  const branchResult = getCurrentBranch(worktreePath);
  if (!branchResult.success) {
    return { outcome: "error", error: branchResult.error ?? "Failed to get current branch" };
  }
  if (branchResult.branch !== featureBranch) {
    return {
      outcome: "error",
      error: `Branch mismatch: expected ${featureBranch}, got ${branchResult.branch ?? "unknown"}`,
    };
  }

  const statusResult = getStatusPorcelain(worktreePath);
  if (!statusResult.success) {
    return { outcome: "error", error: statusResult.error ?? "Failed to get git status" };
  }

  const allPaths = parsePorcelainLines(statusResult.lines);
  const eligible = allPaths.filter((p) => isEligible(p, allowedPaths));

  if (eligible.length === 0) {
    return {
      outcome: "no_changes",
      reason: allPaths.length === 0
        ? "No changes to commit"
        : `No eligible files (${allPaths.length} excluded by policy)`,
    };
  }

  for (const p of eligible) {
    const r = stagePath(worktreePath, p);
    if (!r.success) {
      return { outcome: "error", error: `Failed to stage ${p}: ${r.error ?? r.stderr}` };
    }
  }

  const message = cardTitle
    ? `feat: ${cardTitle}`
    : `feat: update card ${cardId.slice(0, 8)}`;
  const commitResult = commit(worktreePath, message);

  if (!commitResult.success) {
    return { outcome: "error", error: commitResult.error ?? "Commit failed" };
  }

  return {
    outcome: "committed",
    sha: commitResult.sha ?? "",
    message,
  };
}
