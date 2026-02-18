import { v4 as uuidv4 } from "uuid";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import { planningActionTypeSchema, planningActionSchema } from "@/lib/schemas/slice-a";

export type StreamParseResult =
  | { type: "action"; action: PlanningAction }
  | { type: "message"; message: string }
  | { type: "response_type"; responseType: "clarification" | "actions" | "mixed" }
  | { type: "done" };

/**
 * Normalize a raw object into a PlanningAction.
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
    : "updateCard";
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
 * Extract JSON-serializable text from LLM output that may be wrapped in markdown.
 */
function extractJsonText(text: string): string {
  let s = text.trim();
  const jsonBlock = /^```(?:json)?\s*([\s\S]*?)```\s*$/;
  const m = s.match(jsonBlock);
  if (m) s = m[1].trim();
  return s;
}

/**
 * Try to parse a JSON object and extract PlanningAction(s) or message.
 */
function tryParseObject(
  text: string,
): { actions: PlanningAction[]; message?: string; responseType?: string } | null {
  const extracted = extractJsonText(text);
  if (!extracted) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Wrapper format: { "type": "actions", "message": "...", "actions": [...] }
  if ("type" in obj && "actions" in obj && Array.isArray(obj.actions)) {
    const actions: PlanningAction[] = [];
    for (const item of obj.actions) {
      if (item && typeof item === "object") {
        try {
          const normalized = normalizeAction(item as Record<string, unknown>);
          planningActionSchema.parse(normalized);
          actions.push(normalized);
        } catch {
          // Skip invalid action
        }
      }
    }
    const message = typeof obj.message === "string" ? obj.message : undefined;
    const responseType = typeof obj.type === "string" ? obj.type : undefined;
    return { actions, message, responseType };
  }

  // Single action format (NDJSON): { "action_type": "createWorkflow", ... }
  if ("action_type" in obj) {
    try {
      const normalized = normalizeAction(obj);
      planningActionSchema.parse(normalized);
      return { actions: [normalized] };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Parse a ReadableStream of text chunks into PlanningAction objects.
 * Supports:
 * 1. NDJSON: one action per line
 * 2. Wrapper format: { "type": "actions", "actions": [...] } (possibly in one chunk)
 *
 * Yields each action as it becomes parseable, plus message/responseType when present.
 */
export async function* parseActionsFromStream(
  stream: ReadableStream<string>,
): AsyncGenerator<StreamParseResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let emittedAny = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = typeof value === "string" ? value : decoder.decode(value, { stream: true });
      buffer += chunk;
      fullText += chunk;

      // Process complete lines (NDJSON: one JSON object per line)
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const result = tryParseObject(line);
        if (result) {
          emittedAny = true;
          if (result.responseType) {
            yield { type: "response_type", responseType: result.responseType as "clarification" | "actions" | "mixed" };
          }
          if (result.message) {
            yield { type: "message", message: result.message };
          }
          for (const action of result.actions) {
            yield { type: "action", action };
          }
        }
      }
    }

    // Try remaining buffer (single line), then full text (pretty-printed or markdown-wrapped)
    if (!emittedAny && buffer.trim()) {
      const result = tryParseObject(buffer);
      if (result && result.actions.length > 0) {
        emittedAny = true;
        if (result.responseType) {
          yield { type: "response_type", responseType: result.responseType as "clarification" | "actions" | "mixed" };
        }
        if (result.message) {
          yield { type: "message", message: result.message };
        }
        for (const action of result.actions) {
          yield { type: "action", action };
        }
      }
    }
    if (!emittedAny && fullText.trim()) {
      const result = tryParseObject(fullText);
      if (result && (result.actions.length > 0 || result.responseType)) {
        emittedAny = true;
        if (result.responseType) {
          yield { type: "response_type", responseType: result.responseType as "clarification" | "actions" | "mixed" };
        }
        if (result.message) {
          yield { type: "message", message: result.message };
        }
        for (const action of result.actions) {
          yield { type: "action", action };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: "done" };
}
