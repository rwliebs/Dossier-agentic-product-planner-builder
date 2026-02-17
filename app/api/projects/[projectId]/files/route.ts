import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProject, getPlannedFilesByProject } from "@/lib/supabase/queries";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";

type RouteParams = { params: Promise<{ projectId: string }> };

export interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileNode[];
}

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

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createClient();
    const project = await getProject(supabase, projectId);
    if (!project) return notFoundError("Project not found");
    const rows = await getPlannedFilesByProject(supabase, projectId);
    const tree = buildTree(rows as { logical_file_name: string }[]);
    return json(tree);
  } catch (err) {
    console.error("GET /api/projects/[projectId]/files error:", err);
    return internalError();
  }
}
