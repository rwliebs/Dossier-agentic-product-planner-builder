import { v4 as uuidv4 } from "uuid";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import { planningActionTypeSchema, planningActionSchema } from "@/lib/schemas/slice-a";
import { extractJsonObject, extractJsonArray } from "@/lib/llm/json-extract";

export type ResponseType = "clarification" | "actions" | "mixed";

export interface ParseResult {
  responseType: ResponseType;
  message?: string;
  actions: PlanningAction[];
  confidence: "high" | "medium" | "low";
  rawExtract?: string;
  parseError?: string;
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
 * Parse actions from an array of raw objects.
 */
function parseActionsFromArray(items: unknown[]): { actions: PlanningAction[]; validCount: number } {
  const actions: PlanningAction[] = [];
  let validCount = 0;

  for (const item of items) {
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

  return { actions, validCount };
}

/**
 * Parse LLM response into structured result with response type, message, and actions.
 * Supports both the new object format and legacy array format for backward compatibility.
 */
export function parsePlanningResponse(responseText: string): ParseResult {
  // Try new object format first: { "type": ..., "message": ..., "actions": [...] }
  const extractedObj = extractJsonObject(responseText);
  if (extractedObj) {
    try {
      const parsed = JSON.parse(extractedObj);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "type" in parsed) {
        const responseType = (parsed.type as string) || "actions";
        const message = typeof parsed.message === "string" ? parsed.message : undefined;
        const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];

        const { actions, validCount } = parseActionsFromArray(rawActions);

        const validType: ResponseType =
          responseType === "clarification" || responseType === "mixed"
            ? responseType
            : "actions";

        const confidence: ParseResult["confidence"] =
          validType === "clarification"
            ? (message ? "high" : "low")
            : validCount === rawActions.length && rawActions.length > 0
              ? "high"
              : validCount > 0
                ? "medium"
                : validType === "mixed" && message
                  ? "medium"
                  : "low";

        return {
          responseType: validType,
          message,
          actions,
          confidence,
          rawExtract: extractedObj.slice(0, 1000),
          parseError:
            rawActions.length > 0 && validCount < rawActions.length
              ? `Only ${validCount}/${rawActions.length} items passed schema validation`
              : undefined,
        };
      }
    } catch {
      // Fall through to legacy array parsing
    }
  }

  // Legacy format: raw PlanningAction[] array
  const extracted = extractJsonArray(responseText);

  if (!extracted) {
    return {
      responseType: "clarification",
      message: responseText.trim() || undefined,
      actions: [],
      confidence: "low",
      rawExtract: responseText.slice(0, 500),
      parseError: "Could not find JSON in LLM response",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch {
    return {
      responseType: "actions",
      actions: [],
      confidence: "low",
      rawExtract: extracted.slice(0, 500),
      parseError: "Invalid JSON in extracted array",
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      responseType: "actions",
      actions: [],
      confidence: "low",
      rawExtract: extracted.slice(0, 500),
      parseError: "Extracted value is not an array",
    };
  }

  const { actions, validCount } = parseActionsFromArray(parsed);

  const confidence: ParseResult["confidence"] =
    validCount === parsed.length && parsed.length > 0
      ? "high"
      : validCount > 0
        ? "medium"
        : "low";

  return {
    responseType: "actions",
    actions,
    confidence,
    rawExtract: extracted.slice(0, 1000),
    parseError:
      validCount < parsed.length
        ? `Only ${validCount}/${parsed.length} items passed schema validation`
        : undefined,
  };
}
