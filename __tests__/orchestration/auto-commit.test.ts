/**
 * Tests for auto-commit: artifact exclusion, eligible path filtering, commit creation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { performAutoCommit } from "@/lib/orchestration/auto-commit";
import { runGit, getCurrentBranch, getStatusPorcelain, commit } from "@/lib/orchestration/git-ops";

function initRepo(dir: string, branch = "main"): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });
  fs.writeFileSync(path.join(dir, "README.md"), "# Test\n", "utf-8");
  execSync("git add README.md", { cwd: dir, stdio: "pipe" });
  execSync(`git checkout -b ${branch}`, { cwd: dir, stdio: "pipe" });
  execSync("git commit -m 'Initial'", { cwd: dir, stdio: "pipe" });
}

describe("git-ops", () => {
  describe("getCurrentBranch", () => {
    it("returns current branch", () => {
      const dir = path.join(require("node:os").tmpdir(), `git-ops-${Date.now()}`);
      fs.mkdirSync(dir, { recursive: true });
      try {
        initRepo(dir, "feat/test");
        const r = getCurrentBranch(dir);
        expect(r.success).toBe(true);
        expect(r.branch).toBe("feat/test");
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("getStatusPorcelain", () => {
    it("returns changed files", () => {
      const dir = path.join(require("node:os").tmpdir(), `git-ops-${Date.now()}`);
      fs.mkdirSync(dir, { recursive: true });
      try {
        initRepo(dir);
        fs.writeFileSync(path.join(dir, "foo.ts"), "x", "utf-8");
        const r = getStatusPorcelain(dir);
        expect(r.success).toBe(true);
        expect(r.lines.some((l) => l.includes("foo.ts"))).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("commit", () => {
    it("creates commit and returns sha", () => {
      const dir = path.join(require("node:os").tmpdir(), `git-ops-${Date.now()}`);
      fs.mkdirSync(dir, { recursive: true });
      try {
        initRepo(dir);
        fs.writeFileSync(path.join(dir, "bar.ts"), "y", "utf-8");
        runGit(dir, ["add", "bar.ts"]);
        const r = commit(dir, "feat: add bar");
        expect(r.success).toBe(true);
        expect(r.sha).toBeDefined();
        expect(r.sha?.length).toBe(40);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

describe("auto-commit", () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(() => {
    tempDir = path.join(
      require("node:os").tmpdir(),
      `auto-commit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    repoDir = path.join(tempDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });
    initRepo(repoDir, "feat/run-abc-def");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("commits eligible files and excludes artifacts", () => {
    fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "src", "index.ts"), "export {};", "utf-8");
    fs.mkdirSync(path.join(repoDir, "node_modules", "foo"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "node_modules", "foo", "x.js"), "x", "utf-8");
    fs.mkdirSync(path.join(repoDir, ".next"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, ".next", "build.js"), "x", "utf-8");

    const result = performAutoCommit({
      worktreePath: repoDir,
      featureBranch: "feat/run-abc-def",
      cardTitle: "Add index",
      cardId: "card-123",
      allowedPaths: ["src", "app", "lib", "components"],
    });

    expect(result.outcome).toBe("committed");
    if (result.outcome === "committed") {
      expect(result.sha).toBeDefined();
      expect(result.message).toBe("feat: Add index");
    }

    const showResult = runGit(repoDir, ["show", "--name-only", "--format=", "HEAD"]);
    expect(showResult.success).toBe(true);
    const committedFiles = showResult.stdout.split("\n").filter(Boolean);
    expect(committedFiles).toContain("src/index.ts");
    expect(committedFiles.some((f) => f.includes("node_modules"))).toBe(false);
    expect(committedFiles.some((f) => f.includes(".next"))).toBe(false);
  });

  it("returns no_changes when only artifacts exist", () => {
    fs.mkdirSync(path.join(repoDir, "node_modules", "x"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "node_modules", "x", "y.js"), "x", "utf-8");

    const result = performAutoCommit({
      worktreePath: repoDir,
      featureBranch: "feat/run-abc-def",
      cardId: "card-456",
      allowedPaths: ["src", "app"],
    });

    expect(result.outcome).toBe("no_changes");
    if (result.outcome === "no_changes") {
      expect(result.reason).toContain("excluded");
    }
  });

  it("returns no_changes when nothing changed", () => {
    const result = performAutoCommit({
      worktreePath: repoDir,
      featureBranch: "feat/run-abc-def",
      cardId: "card-789",
      allowedPaths: ["src"],
    });

    expect(result.outcome).toBe("no_changes");
    if (result.outcome === "no_changes") {
      expect(result.reason).toContain("No changes");
    }
  });

  it("allows root config files regardless of allowed_paths", () => {
    fs.writeFileSync(path.join(repoDir, "package.json"), '{"name":"test"}', "utf-8");

    const result = performAutoCommit({
      worktreePath: repoDir,
      featureBranch: "feat/run-abc-def",
      cardId: "card-999",
      allowedPaths: ["src"],
    });

    expect(result.outcome).toBe("committed");
  });

  it("returns error on branch mismatch", () => {
    fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "src", "x.ts"), "x", "utf-8");

    const result = performAutoCommit({
      worktreePath: repoDir,
      featureBranch: "wrong-branch",
      cardId: "card-1",
      allowedPaths: ["src"],
    });

    expect(result.outcome).toBe("error");
    if (result.outcome === "error") {
      expect(result.error).toContain("Branch mismatch");
    }
  });
});
