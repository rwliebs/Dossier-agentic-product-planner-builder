/**
 * Parse scaffold file path + content pairs from the project-scaffold artifact.
 * Expects markdown with "### FILE: <relative-path>" followed by a fenced code block.
 *
 * @see docs/strategy/runnable-project-scaffold.md
 */

const FILE_HEADER_PREFIX = "### FILE:";

export interface ScaffoldFile {
  path: string;
  content: string;
}

/**
 * Extracts file path and content pairs from scaffold artifact markdown.
 * Looks for "### FILE: <path>" lines followed by a fenced code block (``` or ```lang).
 * Returns empty array if content is missing or no valid FILE sections found.
 */
export function parseScaffoldFiles(content: string): ScaffoldFile[] {
  if (!content || typeof content !== "string") return [];

  const results: ScaffoldFile[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.toUpperCase().startsWith(FILE_HEADER_PREFIX.toUpperCase())) {
      const pathPart = trimmed.slice(FILE_HEADER_PREFIX.length).trim();
      const normalizedPath = normalizeFilePath(pathPart);
      if (!normalizedPath) {
        i++;
        continue;
      }

      // Find next fenced code block
      i++;
      let fence: string | null = null;
      const codeLines: string[] = [];

      while (i < lines.length) {
        const current = lines[i];
        const fenceMatch = current.match(/^\s*(```[\w]*)\s*$/);
        if (fenceMatch) {
          if (fence === null) {
            fence = fenceMatch[1];
            i++;
            continue;
          }
          // Closing fence: same or any ``` (markdown often uses ``` to close ```json)
          if (current.trim() === fence || current.trim().startsWith("```")) {
            i++;
            break;
          }
        }
        if (fence !== null) {
          codeLines.push(current);
        }
        i++;
      }

      if (codeLines.length > 0 || normalizedPath) {
        results.push({ path: normalizedPath, content: codeLines.join("\n") });
      }
      continue;
    }

    i++;
  }

  return results;
}

function normalizeFilePath(raw: string): string {
  const s = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!s) return "";
  if (s.includes("..") || s.includes("//")) return "";
  return s;
}
