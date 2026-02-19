/**
 * Repo reader: git-based file tree, diff, and content retrieval.
 * Used by the files API to surface produced code from the cloned repo.
 */

import { execSync } from "node:child_process";

export interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  status?: "added" | "modified" | "deleted" | "unchanged";
  children?: FileNode[];
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted";
}

function runGit(cwd: string, args: string[]): string {
  return execSync(`git ${args.join(" ")}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Builds a FileNode tree from flat paths.
 * Paths are normalized to start with / (e.g. /src/foo.ts).
 */
function buildTreeFromPaths(
  paths: string[],
  statusByPath?: Map<string, ChangedFile["status"]>
): FileNode[] {
  const byPath = new Map<string, FileNode>();

  for (const raw of paths) {
    const path = "/" + raw.replace(/^\/+/, "").trim();
    const segments = path.split("/").filter(Boolean);
    let currentPath = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
      if (byPath.has(currentPath)) continue;

      const status = statusByPath?.get(currentPath);
      const node: FileNode = {
        name: segment,
        type: isLast ? "file" : "folder",
        path: currentPath,
      };
      if (status) node.status = status;
      if (!isLast) node.children = [];

      byPath.set(currentPath, node);
      if (i > 0) {
        const parts = currentPath.split("/").filter(Boolean);
        const parentPath = "/" + parts.slice(0, -1).join("/");
        const parent = byPath.get(parentPath);
        if (parent?.children && !parent.children.some((c) => c.path === currentPath)) {
          parent.children.push(node);
        }
      }
    }
  }

  const roots: FileNode[] = [];
  byPath.forEach((node) => {
    const depth = (node.path.match(/\//g) ?? []).length;
    if (depth === 1) roots.push(node);
  });
  roots.sort((a, b) => a.name.localeCompare(b.name));
  return roots;
}

/**
 * Returns the file tree for a branch via git ls-tree.
 */
export function getRepoFileTree(
  clonePath: string,
  branch: string
): { success: boolean; tree?: FileNode[]; error?: string } {
  try {
    const out = runGit(clonePath, [
      "ls-tree",
      "-r",
      "--name-only",
      branch,
    ]);
    const paths = out ? out.split("\n").filter(Boolean) : [];
    const tree = buildTreeFromPaths(paths);
    return { success: true, tree };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns changed files between base and feature branch.
 */
export function getChangedFiles(
  clonePath: string,
  baseBranch: string,
  featureBranch: string
): { success: boolean; files?: ChangedFile[]; error?: string } {
  try {
    const out = runGit(clonePath, [
      "diff",
      "--name-status",
      `${baseBranch}...${featureBranch}`,
    ]);
    const files: ChangedFile[] = [];
    for (const line of out ? out.split("\n").filter(Boolean) : []) {
      const m = line.match(/^([AMD])\s+(.+)$/);
      if (m) {
        const [, code, path] = m;
        const status =
          code === "A" ? "added" : code === "M" ? "modified" : "deleted";
        files.push({ path: "/" + path.replace(/^\/+/, ""), status });
      }
    }
    return { success: true, files };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns file content at a given branch/path.
 */
export function getFileContent(
  clonePath: string,
  branch: string,
  filePath: string
): { success: boolean; content?: string; error?: string } {
  try {
    const path = filePath.replace(/^\/+/, "");
    const content = runGit(clonePath, ["show", `${branch}:${path}`]);
    return { success: true, content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns unified diff for a file between base and feature branch.
 */
export function getFileDiff(
  clonePath: string,
  baseBranch: string,
  featureBranch: string,
  filePath: string
): { success: boolean; diff?: string; error?: string } {
  try {
    const path = filePath.replace(/^\/+/, "");
    const diff = runGit(clonePath, [
      "diff",
      `${baseBranch}...${featureBranch}`,
      "--",
      path,
    ]);
    return { success: true, diff };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Returns file tree with diff status annotations.
 * Merges ls-tree output with changed files.
 */
export function getRepoFileTreeWithStatus(
  clonePath: string,
  featureBranch: string,
  baseBranch: string
): { success: boolean; tree?: FileNode[]; error?: string } {
  const treeResult = getRepoFileTree(clonePath, featureBranch);
  if (!treeResult.success) return treeResult;

  const changedResult = getChangedFiles(clonePath, baseBranch, featureBranch);
  const statusByPath = new Map<string, ChangedFile["status"]>();
  if (changedResult.success && changedResult.files) {
    for (const f of changedResult.files) {
      statusByPath.set(f.path, f.status);
    }
  }

  // Rebuild tree with status annotations
  const paths = collectPathsFromTree(treeResult.tree!);
  const tree = buildTreeFromPaths(paths, statusByPath);
  return { success: true, tree };
}

function collectPathsFromTree(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  function walk(n: FileNode) {
    if (n.type === "file") paths.push(n.path.replace(/^\/+/, ""));
    for (const c of n.children ?? []) walk(c);
  }
  for (const n of nodes) walk(n);
  return paths;
}
