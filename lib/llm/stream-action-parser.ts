import { v4 as uuidv4, validate as uuidValidate } from "uuid";
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
/**
 * Remap any target_ref values that reference IDs the normalizer replaced.
 * E.g. Haiku generates a fake card UUID, normalizer replaces it in createCard,
 * then upsertCardKnowledgeItem still references the fake UUID — this fixes that.
 */
function remapTargetRef(
  targetRef: Record<string, unknown>,
  idRemap: Map<string, string>,
): Record<string, unknown> {
  if (idRemap.size === 0) return targetRef;
  const remapped = { ...targetRef };
  for (const [key, value] of Object.entries(remapped)) {
    if (typeof value === "string" && idRemap.has(value)) {
      remapped[key] = idRemap.get(value)!;
    }
  }
  return remapped;
}

function normalizeAction(
  obj: Record<string, unknown>,
  idRemap: Map<string, string>,
): PlanningAction {
  const rawId = typeof obj.id === "string" ? obj.id : undefined;
  const id = rawId && uuidValidate(rawId) ? rawId : uuidv4();
  let targetRef = (obj.target_ref ?? obj.targetRef ?? {}) as Record<string, unknown>;
  const rawActionType = (obj.action_type ?? obj.action ?? obj.type) as string;
  const action_type = planningActionTypeSchema.safeParse(rawActionType).success
    ? (rawActionType as PlanningAction["action_type"])
    : "updateCard";

  // Normalize createCard target_ref: LLMs sometimes use activity_id or put it in payload
  if (action_type === "createCard" && !targetRef.workflow_activity_id) {
    const rawPayload = (obj.payload ?? {}) as Record<string, unknown>;
    const activityId =
      targetRef.activity_id ??
      targetRef.activityId ??
      (targetRef as Record<string, unknown>).workflowActivityId ??
      rawPayload.workflow_activity_id ??
      rawPayload.activity_id ??
      rawPayload.activityId;
    if (typeof activityId === "string") {
      targetRef = { ...targetRef, workflow_activity_id: activityId };
    }
  }

  // Remap target_ref values that reference replaced IDs
  targetRef = remapTargetRef(targetRef, idRemap);

  const project_id =
    typeof obj.project_id === "string"
      ? obj.project_id
      : typeof targetRef.project_id === "string"
        ? targetRef.project_id
        : "";
  const payload = (obj.payload ?? {}) as Record<string, unknown>;

  // Ensure create* entity IDs are UUIDs; track replacements for downstream references
  if (
    action_type === "createWorkflow" ||
    action_type === "createActivity" ||
    action_type === "createCard"
  ) {
    const rawPayloadId = typeof payload.id === "string" ? payload.id : undefined;
    const newId = rawPayloadId && uuidValidate(rawPayloadId) ? rawPayloadId : uuidv4();
    if (rawPayloadId && rawPayloadId !== newId) {
      idRemap.set(rawPayloadId, newId);
    }
    payload.id = newId;
  }

  return {
    id,
    project_id,
    action_type,
    target_ref: targetRef,
    payload,
  };
}

/**
 * Extract a single JSON object from text that may have preamble/trailing text or markdown.
 * Tries: (1) markdown code block, (2) whole string, (3) first balanced { ... }.
 */
function extractJsonText(text: string): string {
  let s = text.trim();
  const jsonBlock = /^```(?:json)?\s*([\s\S]*?)```\s*$/;
  const m = s.match(jsonBlock);
  if (m) s = m[1].trim();
  if (!s) return "";

  // If the whole string parses as JSON, use it (handles "Output ONLY the JSON" responses)
  try {
    JSON.parse(s);
    return s;
  } catch {
    /* continue to fallback */
  }

  // LLM often adds preamble e.g. "Here are the actions:\n{ ... }" — find first { and matching }
  const start = s.indexOf("{");
  if (start === -1) return s;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = "";
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s;
}

/**
 * Try to parse a JSON object and extract PlanningAction(s) or message.
 */
function tryParseObject(
  text: string,
  idRemap: Map<string, string>,
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
          const normalized = normalizeAction(item as Record<string, unknown>, idRemap);
          planningActionSchema.parse(normalized);
          actions.push(normalized);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[stream-action-parser] Skipped invalid action:", msg, JSON.stringify(item).slice(0, 200));
        }
      }
    }
    const message = typeof obj.message === "string" ? obj.message : undefined;
    const responseType = typeof obj.type === "string" ? obj.type : undefined;
    return { actions, message, responseType };
  }

  // Single action format (NDJSON): { "action_type": "createWorkflow", ... }
  if ("action_type" in obj || "type" in obj) {
    try {
      const normalized = normalizeAction(obj, idRemap);
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
  const idRemap = new Map<string, string>();

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
        const result = tryParseObject(line, idRemap);
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
      const result = tryParseObject(buffer, idRemap);
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
      const result = tryParseObject(fullText, idRemap);
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
