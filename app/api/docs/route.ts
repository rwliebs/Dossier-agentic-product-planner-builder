import { NextRequest } from "next/server";
import { json, internalError } from "@/lib/api/response-helpers";
import * as fs from "fs";
import * as path from "path";

const DOCS_ROOT = path.join(process.cwd(), "docs");

interface DocsIndexDoc {
  id: string;
  path: string;
  tags?: string[];
}

/** Parse docs-index.yaml documents array (minimal YAML parsing for our structure) */
function parseDocsIndex(raw: string): DocsIndexDoc[] {
  const documents: DocsIndexDoc[] = [];
  const blocks = raw.split(/\n\s{4}-\s+id:\s+/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const idMatch = block.match(/^([^\s\n]+)/);
    const pathMatch = block.match(/\n\s+path:\s+([^\s\n]+)/);
    const tagsMatch = block.match(/\n\s+tags:\s+\[([^\]]*)\]/);
    if (idMatch && pathMatch) {
      documents.push({
        id: idMatch[1].trim(),
        path: pathMatch[1].trim(),
        tags: tagsMatch ? tagsMatch[1].split(",").map((t) => t.trim()) : [],
      });
    }
  }
  return documents;
}

/**
 * GET /api/docs
 * Returns the list of reference docs from docs-index.yaml.
 * Used by the Docs panel to show design system, user workflows, domains, etc.
 * ?path=product/user-workflows-reference.md returns single doc content.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const docPath = searchParams.get("path");

    if (docPath) {
      const safePath = path.normalize(docPath).replace(/^(\.\.(\/|\\|$))+/, "");
      const fullPath = path.join(DOCS_ROOT, safePath);
      if (!fullPath.startsWith(DOCS_ROOT)) {
        return new Response(JSON.stringify({ error: "Invalid path" }), {
          status: 400,
        });
      }
      if (!fs.existsSync(fullPath)) {
        return new Response(JSON.stringify({ error: "Doc not found" }), {
          status: 404,
        });
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      return json({ content });
    }

    const indexPath = path.join(DOCS_ROOT, "docs-index.yaml");
    if (!fs.existsSync(indexPath)) {
      return json({ documents: [] });
    }

    const raw = fs.readFileSync(indexPath, "utf-8");
    const documents = parseDocsIndex(raw);
    return json({ documents });
  } catch (err) {
    console.error("GET /api/docs error:", err);
    return internalError();
  }
}
