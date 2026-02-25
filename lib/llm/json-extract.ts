/**
 * Extract JSON object or array from LLM response text.
 * Handles: raw JSON, markdown code blocks, preamble/trailing text.
 * Used by both batch (parse-planning-response) and stream (stream-action-parser) parsers.
 */

/**
 * Find the first balanced { ... } or [ ... ] in a string, respecting strings and escapes.
 */
function findBalanced(
  text: string,
  open: "{" | "[",
  close: "}" | "]",
  startIndex: number,
): number | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let quoteChar = "";

  for (let i = startIndex; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quoteChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quoteChar = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

/**
 * Extract a JSON object from text. Tries: first balanced { ... }, whole string parse, code block, then fallback balanced.
 * Prefers balanced-brace extraction over a greedy regex so trailing text ending with "}" (e.g. "See {Authentication}.")
 * does not overmatch and break JSON.parse in the caller.
 */
export function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    const objStart = trimmed.indexOf("{");
    const end = findBalanced(trimmed, "{", "}", objStart);
    if (end !== null) {
      const candidate = trimmed.slice(objStart, end + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
          return candidate;
      } catch {
        /* continue */
      }
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
        return trimmed;
    } catch {
      /* continue */
    }
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    if (inner.startsWith("{")) return inner;
  }

  const objStart = trimmed.indexOf("{");
  if (objStart === -1) return null;
  const end = findBalanced(trimmed, "{", "}", objStart);
  if (end !== null) return trimmed.slice(objStart, end + 1);
  return null;
}

/**
 * Extract a JSON array from text. Tries: first balanced [ ... ], whole string parse, code block, then fallback balanced.
 * Prefers balanced-bracket extraction so trailing text ending with "]" does not overmatch.
 */
export function extractJsonArray(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[")) {
    const arrStart = trimmed.indexOf("[");
    const end = findBalanced(trimmed, "[", "]", arrStart);
    if (end !== null) {
      const candidate = trimmed.slice(arrStart, end + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) return candidate;
      } catch {
        /* continue */
      }
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return trimmed;
    } catch {
      /* continue */
    }
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    if (inner.startsWith("[")) return inner;
  }

  const arrayStart = trimmed.indexOf("[");
  if (arrayStart === -1) return null;
  const end = findBalanced(trimmed, "[", "]", arrayStart);
  if (end !== null) return trimmed.slice(arrayStart, end + 1);
  return null;
}
