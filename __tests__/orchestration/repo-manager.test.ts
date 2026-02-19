/**
 * Tests for repo-manager: clone path, URL conversion, ensureClone, createFeatureBranch.
 * Uses a local temp git repo for ensureClone (file:// URL).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import {
  getClonePath,
  repoUrlToCloneUrl,
  ensureClone,
  createFeatureBranch,
} from "@/lib/orchestration/repo-manager";

describe("repo-manager", () => {
  let tempDir: string;
  let remoteDir: string;

  beforeEach(() => {
    tempDir = path.join(
      require("node:os").tmpdir(),
      `dossier-repo-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    remoteDir = path.join(tempDir, "remote");
    fs.mkdirSync(remoteDir, { recursive: true });
    execSync("git init", { cwd: remoteDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: remoteDir, stdio: "pipe" });
    execSync("git config user.name 'Test'", { cwd: remoteDir, stdio: "pipe" });
    fs.writeFileSync(path.join(remoteDir, "README.md"), "# Test\n", "utf-8");
    execSync("git add README.md", { cwd: remoteDir, stdio: "pipe" });
    execSync("git commit -m 'Initial'", { cwd: remoteDir, stdio: "pipe" });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("getClonePath", () => {
    it("returns path under data dir", () => {
      const p = getClonePath("proj-123");
      expect(p).toContain("repos");
      expect(p).toContain("proj-123");
    });
  });

  describe("repoUrlToCloneUrl", () => {
    it("appends .git when missing", () => {
      expect(repoUrlToCloneUrl("https://github.com/u/r")).toBe(
        "https://github.com/u/r.git"
      );
    });
    it("keeps .git when present", () => {
      expect(repoUrlToCloneUrl("https://github.com/u/r.git")).toBe(
        "https://github.com/u/r.git"
      );
    });
    it("injects token when provided", () => {
      const url = repoUrlToCloneUrl("https://github.com/u/r", "secret");
      expect(url).toBe("https://secret@github.com/u/r.git");
    });
  });

  describe("ensureClone", () => {
    it("clones when DOSSIER_DATA_DIR points to temp", () => {
      const projectId = "test-project";
      const dataDir = path.join(tempDir, "dossier-data");
      fs.mkdirSync(dataDir, { recursive: true });
      const fileUrl = pathToFileURL(remoteDir).href;

      const origEnv = process.env.DOSSIER_DATA_DIR;
      process.env.DOSSIER_DATA_DIR = dataDir;
      try {
        const result = ensureClone(projectId, fileUrl, null);
        if (!result.success) {
          throw new Error(result.error);
        }
        expect(result.clonePath).toBeDefined();
        const clonePath = result.clonePath!;
        expect(fs.existsSync(path.join(clonePath, "README.md"))).toBe(true);
      } finally {
        if (origEnv !== undefined) process.env.DOSSIER_DATA_DIR = origEnv;
        else delete process.env.DOSSIER_DATA_DIR;
      }
    });
  });

  describe("createFeatureBranch", () => {
    it("creates branch from origin/base", () => {
      const clonePath = path.join(tempDir, "clone");
      execSync(`git clone "${remoteDir}" "${clonePath}"`, { stdio: "pipe" });
      execSync("git fetch origin", { cwd: clonePath, stdio: "pipe" });

      const result = createFeatureBranch(clonePath, "feat/test", "main");

      expect(result.success).toBe(true);
      const branch = execSync("git branch --show-current", {
        cwd: clonePath,
        encoding: "utf-8",
      }).trim();
      expect(branch).toBe("feat/test");
    });
  });
});
