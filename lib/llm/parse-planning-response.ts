import { v4 as uuidv4 } from "uuid";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import { planningActionTypeSchema, planningActionSchema } from "@/lib/schemas/slice-a";

export interface ParseResult {
  actions: PlanningAction[];
  confidence: "high" | "medium" | "low";
  rawExtract?: string;
  parseError?: string;
}

/**
 * Extract JSON array from LLM response text.
 * Handles: raw JSON, markdown code blocks, text before/after JSON.
 */
function extractJsonArray(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Try direct parse first (raw JSON array)
  const directMatch = trimmed.match(/^\[[\s\S]*\]$/);
  if (directMatch) return directMatch[0];

  // Try markdown code block: ```json [...] ``` or ``` [...] ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    if (inner.startsWith("[")) return inner;
  }

  // Try to find JSON array anywhere in the text (first [ ... ] that parses)
  const arrayStart = trimmed.indexOf("[");
  if (arrayStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let quoteChar = "";
  let end = -1;

  for (let i = arrayStart; i < trimmed.length; i++) {
    const c = trimmed[i];

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
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end !== -1) {
    return trimmed.slice(arrayStart, end + 1);
  }

  return null;
}

/**
 * Ensure action has required fields: id, project_id.
 * Generate UUIDs for missing ids.
 */
function normalizeAction(obj: Record<string, unknown>): PlanningAction {
  const id = typeof obj.id === "string" ? obj.id : uuidv4();
  const targetRef = (obj.target_ref ?? obj.targetRef ?? {}) as Record<string, unknown>;
  const project_id =
    typeof obj.project_id === "string"
      ? obj.project_id
      : typeof targetRef.project_id === "string"
        ? targetRef.project_id
        : "";
  const rawActionType = obj.action_type as string;
  const action_type = planningActionTypeSchema.safeParse(rawActionType).success
    ? (rawActionType as PlanningAction["action_type"])
    : "updateCard"; // fallback for unknown types
  const payload = (obj.payload ?? {}) as Record<string, unknown>;

  return {
    id,
    project_id,
    action_type,
    target_ref: targetRef,
    payload,
  };
}

/**
 * Parse LLM response into PlanningAction[].
 * Robust extraction with fallbacks for malformed output.
 */
export function parsePlanningResponse(responseText: string): ParseResult {
  const extracted = extractJsonArray(responseText);

  if (!extracted) {
    return {
      actions: [],
      confidence: "low",
      rawExtract: responseText.slice(0, 500),
      parseError: "Could not find JSON array in LLM response",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch {
    return {
      actions: [],
      confidence: "low",
      rawExtract: extracted.slice(0, 500),
      parseError: "Invalid JSON in extracted array",
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      actions: [],
      confidence: "low",
      rawExtract: extracted.slice(0, 500),
      parseError: "Extracted value is not an array",
    };
  }

  const actions: PlanningAction[] = [];
  let validCount = 0;

  for (const item of parsed) {
    if (item === null || typeof item !== "object") continue;

    const normalized = normalizeAction(item as Record<string, unknown>);

    try {
      planningActionSchema.parse(normalized);
      actions.push(normalized);
      validCount++;
    } catch {
      // Skip invalid items but continue parsing others
    }
  }

  const confidence: ParseResult["confidence"] =
    validCount === parsed.length && parsed.length > 0
      ? "high"
      : validCount > 0
        ? "medium"
        : "low";

  return {
    actions,
    confidence,
    rawExtract: extracted.slice(0, 1000),
    parseError:
      validCount < parsed.length
        ? `Only ${validCount}/${parsed.length} items passed schema validation`
        : undefined,
  };
}
