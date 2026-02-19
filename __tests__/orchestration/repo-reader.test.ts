/**
 * Tests for repo-reader: getRepoFileTree, getChangedFiles, getFileContent, getFileDiff.
 * Uses a real temp git repo.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import {
  getRepoFileTree,
  getChangedFiles,
  getFileContent,
  getFileDiff,
  getRepoFileTreeWithStatus,
} from "@/lib/orchestration/repo-reader";

describe("repo-reader", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = path.join(
      require("node:os").tmpdir(),
      `dossier-repo-reader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(repoPath, { recursive: true });
    execSync("git init", { cwd: repoPath, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: repoPath, stdio: "pipe" });
    execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "pipe" });

    fs.mkdirSync(path.join(repoPath, "src"), { recursive: true });
    fs.writeFileSync(path.join(repoPath, "src", "index.ts"), "export {};\n", "utf-8");
    fs.writeFileSync(path.join(repoPath, "README.md"), "# Test\n", "utf-8");
    execSync("git add .", { cwd: repoPath, stdio: "pipe" });
    execSync("git commit -m 'Initial'", { cwd: repoPath, stdio: "pipe" });

    execSync("git checkout -b feat/test", { cwd: repoPath, stdio: "pipe" });
    fs.writeFileSync(path.join(repoPath, "src", "new.ts"), "// new file\n", "utf-8");
    fs.writeFileSync(path.join(repoPath, "src", "index.ts"), "export {};\n// modified\n", "utf-8");
    execSync("git add .", { cwd: repoPath, stdio: "pipe" });
    execSync("git commit -m 'Add new file'", { cwd: repoPath, stdio: "pipe" });
  });

  afterEach(() => {
    try {
      fs.rmSync(repoPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("getRepoFileTree", () => {
    it("returns file tree for branch", () => {
      const result = getRepoFileTree(repoPath, "feat/test");
      expect(result.success).toBe(true);
      expect(result.tree).toBeDefined();
      const paths = collectPaths(result.tree!);
      expect(paths).toContain("/README.md");
      expect(paths).toContain("/src/index.ts");
      expect(paths).toContain("/src/new.ts");
    });
  });

  describe("getChangedFiles", () => {
    it("returns added and modified files", () => {
      const result = getChangedFiles(repoPath, "main", "feat/test");
      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
      const paths = result.files!.map((f) => f.path);
      expect(paths).toContain("/src/new.ts");
      expect(paths).toContain("/src/index.ts");
      const newFile = result.files!.find((f) => f.path === "/src/new.ts");
      expect(newFile?.status).toBe("added");
      const modFile = result.files!.find((f) => f.path === "/src/index.ts");
      expect(modFile?.status).toBe("modified");
    });
  });

  describe("getFileContent", () => {
    it("returns file content at branch", () => {
      const result = getFileContent(repoPath, "feat/test", "src/new.ts");
      expect(result.success).toBe(true);
      expect(result.content).toContain("// new file");
    });
  });

  describe("getFileDiff", () => {
    it("returns diff for modified file", () => {
      const result = getFileDiff(repoPath, "main", "feat/test", "src/index.ts");
      expect(result.success).toBe(true);
      expect(result.diff).toContain("// modified");
    });
  });

  describe("getRepoFileTreeWithStatus", () => {
    it("returns tree with status annotations", () => {
      const result = getRepoFileTreeWithStatus(repoPath, "feat/test", "main");
      expect(result.success).toBe(true);
      expect(result.tree).toBeDefined();
      const newNode = findNodeByPath(result.tree!, "/src/new.ts");
      expect(newNode?.status).toBe("added");
      const modNode = findNodeByPath(result.tree!, "/src/index.ts");
      expect(modNode?.status).toBe("modified");
    });
  });
});

function collectPaths(nodes: { path: string; children?: unknown[] }[]): string[] {
  const out: string[] = [];
  function walk(n: { path: string; children?: unknown[] }) {
    out.push(n.path);
    for (const c of (n.children ?? []) as { path: string; children?: unknown[] }[]) {
      walk(c);
    }
  }
  for (const n of nodes) walk(n);
  return out;
}

function findNodeByPath(
  nodes: { path: string; status?: string; children?: unknown[] }[],
  target: string
): { path: string; status?: string } | null {
  for (const n of nodes) {
    if (n.path === target) return n;
    const found = findNodeByPath(
      (n.children ?? []) as { path: string; status?: string; children?: unknown[] }[],
      target
    );
    if (found) return found;
  }
  return null;
}
