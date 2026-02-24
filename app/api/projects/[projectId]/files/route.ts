import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  getProject,
  getPlannedFilesByProject,
} from "@/lib/db/queries";
import {
  listOrchestrationRunsByProject,
  getCardAssignmentsByRun,
} from "@/lib/db/queries/orchestration";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";
import {
  getRepoFileTreeWithStatus,
  getFileContent,
  getWorkingFileContent,
  getWorkingTreeFileTreeWithStatus,
  getFileDiff,
  type FileNode,
} from "@/lib/orchestration/repo-reader";

export type { FileNode };

type RouteParams = { params: Promise<{ projectId: string }> };

function buildTree(rows: { logical_file_name: string }[]): FileNode[] {
  const byPath = new Map<string, FileNode>();
  for (const row of rows) {
    const path = "/" + row.logical_file_name.replace(/^\/+/, "").trim();
    const segments = path.split("/").filter(Boolean);
    let currentPath = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
      if (byPath.has(currentPath)) continue;
      const node: FileNode = {
        name: segment,
        type: isLast ? "file" : "folder",
        path: currentPath,
      };
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const db = getDb();
    const project = await getProject(db, projectId);
    if (!project) return notFoundError("Project not found");

    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source") ?? "planned";

    if (source === "repo") {
      const runs = await listOrchestrationRunsByProject(db, projectId, {
        limit: 5,
      });
      const run = runs.find(
        (r) => (r as { worktree_root?: string }).worktree_root
      );
      if (!run) {
        return json(
          { error: "No build with repository available. Trigger a build first." },
          404
        );
      }
      const runRow = run as {
        worktree_root: string;
        base_branch: string;
        id: string;
      };
      const assignments = await getCardAssignmentsByRun(db, runRow.id);
      const assignment = assignments.find(
        (a) => (a as { worktree_path?: string }).worktree_path
      ) as { feature_branch: string; worktree_path?: string | null } | undefined;
      if (!assignment) {
        return json(
          { error: "No assignment with worktree. Trigger a build first." },
          404
        );
      }
      const repoPath = assignment.worktree_path ?? runRow.worktree_root;

      const filePath = searchParams.get("path");
      const wantContent = searchParams.get("content") === "1";
      const wantDiff = searchParams.get("diff") === "1";

      if (wantContent && filePath) {
        const workingContent = getWorkingFileContent(repoPath, filePath);
        if (workingContent.success) {
          return new Response(workingContent.content ?? "", {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        const contentResult = getFileContent(repoPath, assignment.feature_branch, filePath);
        if (!contentResult.success) {
          return json(
            { error: contentResult.error ?? "Failed to read file" },
            404
          );
        }
        return new Response(contentResult.content ?? "", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      if (wantDiff && filePath) {
        const diffResult = getFileDiff(
          repoPath,
          runRow.base_branch,
          assignment.feature_branch,
          filePath
        );
        if (!diffResult.success) {
          return json(
            { error: diffResult.error ?? "Failed to get diff" },
            404
          );
        }
        return new Response(diffResult.diff ?? "", {
          headers: { "Content-Type": "text/x-diff; charset=utf-8" },
        });
      }

      let result = getWorkingTreeFileTreeWithStatus(
        repoPath,
        assignment.feature_branch,
        runRow.base_branch
      );
      if (!result.success) {
        result = getRepoFileTreeWithStatus(
          repoPath,
          assignment.feature_branch,
          runRow.base_branch
        );
      }
      if (!result.success) {
        return json(
          { error: result.error ?? "Failed to read repository files" },
          500
        );
      }
      return json(result.tree ?? []);
    }

    const rows = await getPlannedFilesByProject(db, projectId);
    const tree = buildTree(rows as { logical_file_name: string }[]);
    return json(tree);
  } catch (err) {
    console.error("GET /api/projects/[projectId]/files error:", err);
    return internalError();
  }
}
