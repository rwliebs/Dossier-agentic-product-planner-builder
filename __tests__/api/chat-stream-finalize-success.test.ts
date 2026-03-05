/**
 * Finalize success path: when all 6 docs exist (mocked), handler writes project-scaffold
 * to a real temp clone. Verifies the full pipeline: artifact → parseScaffoldFiles →
 * writeScaffoldFilesToRepo → clone contains scaffold files.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getClonePath } from "@/lib/orchestration/repo-manager";
import { FINALIZE_DOC_SPECS } from "@/lib/llm/planning-prompt";

// Hoisted so the mock factory can use it (vi.mock runs before imports).
const FINALIZE_DOC_COUNT = vi.hoisted(() => 6);

vi.mock("@/lib/llm/run-finalize-multistep", () => ({
  runFinalizeMultiStep: vi.fn().mockResolvedValue({
    artifactsCreated: FINALIZE_DOC_COUNT,
    failedDocs: [] as string[],
    totalDocs: FINALIZE_DOC_COUNT,
  }),
}));

async function consumeSSE(res: Response): Promise<{ event: string; data: unknown }[]> {
  const events: { event: string; data: unknown }[] = [];
  const reader = res.body?.getReader();
  if (!reader) return events;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\n\n+/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      let eventType = "";
      let dataStr = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        if (line.startsWith("data: ")) dataStr = line.slice(6);
      }
      if (eventType && dataStr) {
        try {
          events.push({ event: eventType, data: JSON.parse(dataStr) });
        } catch {
          // skip
        }
      }
    }
  }
  if (buffer.trim()) {
    const lines = buffer.split("\n");
    let eventType = "";
    let dataStr = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) eventType = line.slice(7).trim();
      if (line.startsWith("data: ")) dataStr = line.slice(6);
    }
    if (eventType && dataStr) {
      try {
        events.push({ event: eventType, data: JSON.parse(dataStr) });
      } catch {
        // skip
      }
    }
  }
  return events;
}

describe("chat/stream finalize success with scaffold write", () => {
  let tempDir: string;
  let remoteDir: string;
  let dataDir: string;
  let origDataDir: string | undefined;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_PLANNING_LLM_ENABLED = "true";
    tempDir = path.join(
      require("node:os").tmpdir(),
      `dossier-finalize-success-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    dataDir = path.join(tempDir, "dossier-data");
    remoteDir = path.join(tempDir, "remote");
    fs.mkdirSync(remoteDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    execSync("git init", { cwd: remoteDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: remoteDir, stdio: "pipe" });
    execSync("git config user.name 'Test'", { cwd: remoteDir, stdio: "pipe" });
    fs.writeFileSync(path.join(remoteDir, "README.md"), "# Test\n", "utf-8");
    execSync("git add README.md", { cwd: remoteDir, stdio: "pipe" });
    execSync("git commit -m 'Initial'", { cwd: remoteDir, stdio: "pipe" });
    execSync("git branch -m main", { cwd: remoteDir, stdio: "pipe" });
    origDataDir = process.env.DOSSIER_DATA_DIR;
    process.env.DOSSIER_DATA_DIR = dataDir;
  });

  afterAll(() => {
    if (origDataDir !== undefined) process.env.DOSSIER_DATA_DIR = origDataDir;
    else delete process.env.DOSSIER_DATA_DIR;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("finalize success writes project-scaffold to clone and sets finalized_at", async () => {
    const db = getDb();
    const projectId = crypto.randomUUID();
    const fileUrl = pathToFileURL(remoteDir).href;

    await db.insertProject({
      id: projectId,
      name: "Finalize Success Test " + Date.now(),
      repo_url: fileUrl,
      default_branch: "main",
    });

    const artifactNames = FINALIZE_DOC_SPECS.map((s) => s.name);
    for (const name of artifactNames) {
      const content =
        name === "project-scaffold"
          ? "### FILE: package.json\n\n```json\n{}\n```"
          : `# ${name}`;
      await db.insertContextArtifact({
        id: crypto.randomUUID(),
        project_id: projectId,
        name,
        type: "doc",
        title: name,
        content,
      });
    }

    const { POST } = await import("@/app/api/projects/[projectId]/chat/stream/route");
    const req = new NextRequest(
      `http://localhost/api/projects/${projectId}/chat/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Approve project",
          mode: "finalize",
        }),
      }
    );

    const res = await POST(req, { params: Promise.resolve({ projectId }) });
    expect(res.status).toBe(200);

    const events = await consumeSSE(res);
    const phaseComplete = events.find((e) => e.event === "phase_complete");
    expect(phaseComplete).toBeTruthy();
    expect((phaseComplete?.data as { responseType?: string })?.responseType).toBe(
      "finalize_complete"
    );

    const project = await db.getProject(projectId);
    expect((project as { finalized_at?: string | null } | null)?.finalized_at).toBeTruthy();

    const clonePath = getClonePath(projectId);
    const pkgPath = path.join(clonePath, "package.json");
    expect(fs.existsSync(pkgPath)).toBe(true);
    const pkgContent = fs.readFileSync(pkgPath, "utf-8").trim();
    expect(pkgContent).toBe("{}");
  });
});
