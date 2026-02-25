/**
 * Parse root folder paths from the architectural summary markdown.
 * Extracts lines under "## Root folder structure" section.
 */

const ROOT_FOLDER_SECTION = "## Root folder structure";

/**
 * Extracts root folder paths from architectural summary content.
 * Looks for "## Root folder structure" and parses bullet lines (- path/).
 * Normalizes paths: strips leading slashes, optional trailing slash.
 */
export function parseRootFoldersFromArchitecturalSummary(content: string): string[] {
  if (!content || typeof content !== "string") return [];

  const lines = content.split("\n");
  let inSection = false;
  const folders: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ") && !trimmed.toLowerCase().startsWith(ROOT_FOLDER_SECTION.toLowerCase())) {
      inSection = false;
    }
    if (trimmed.toLowerCase().startsWith(ROOT_FOLDER_SECTION.toLowerCase())) {
      inSection = true;
      continue;
    }
    if (inSection && trimmed.startsWith("- ")) {
      const pathPart = trimmed.slice(2).trim();
      const normalized = normalizeFolderPath(pathPart);
      if (normalized) folders.push(normalized);
    }
  }

  return [...new Set(folders)];
}

function normalizeFolderPath(raw: string): string {
  const s = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!s) return "";
  if (s.includes("..") || s.includes("//")) return "";
  return s;
}
