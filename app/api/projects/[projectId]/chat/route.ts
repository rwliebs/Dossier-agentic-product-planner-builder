import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { fetchMapSnapshot, getLinkedArtifactsForPrompt } from "@/lib/supabase/map-snapshot";
import {
  claudePlanningRequest,
  parsePlanningResponse,
  validatePlanningOutput,
} from "@/lib/llm";
import { buildPreviewFromActions } from "@/lib/llm/build-preview-response";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import { json, validationError } from "@/lib/api/response-helpers";
import { PLANNING_LLM } from "@/lib/feature-flags";
import { chatRequestSchema } from "@/lib/validation/request-schema";

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  status: "success" | "error";
  actions: PlanningAction[];
  preview: {
    added: { workflows: string[]; activities: string[]; steps: string[]; cards: string[] };
    modified: { cards: string[]; artifacts: string[] };
    reordered: string[];
    summary: string;
  } | null;
  errors?: Array<{ action: PlanningAction; reason: string }>;
  metadata: { tokens: number; model: string };
}

/**
 * POST /api/projects/[projectId]/chat
 * Planning LLM endpoint: user message -> validated actions + preview delta.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!PLANNING_LLM) {
    return json(
      {
        status: "error",
        error: "Planning LLM is disabled",
        message: "Set NEXT_PUBLIC_PLANNING_LLM_ENABLED=true to enable.",
      },
      503,
    );
  }

  const { projectId } = await params;
  if (!projectId) {
    return json({ status: "error", message: "Project ID required" }, 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ status: "error", message: "Invalid JSON body" }, 400);
  }

  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    parsed.error.errors.forEach((e) => {
      const path = e.path.join(".") || "body";
      if (!details[path]) details[path] = [];
      details[path].push(e.message);
    });
    return validationError("Invalid request body", details);
  }
  const message = parsed.data.message;

  let db;
  try {
    db = getDb();
  } catch (e) {
    return json(
      {
        status: "error",
        message: "Server configuration error. Database not configured.",
      },
      500,
    );
  }

  const state = await fetchMapSnapshot(db, projectId);
  if (!state) {
    return json({ status: "error", message: "Project not found" }, 404);
  }

  const linkedArtifacts = getLinkedArtifactsForPrompt(state, 5);

  let llmResponse;
  try {
    llmResponse = await claudePlanningRequest({
      userRequest: message,
      mapSnapshot: state,
      linkedArtifacts,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : "Planning service error";
    console.error("[chat] Planning LLM error:", err);

    let userMessage: string;
    if (err.includes("ANTHROPIC_API_KEY")) {
      userMessage = "Planning LLM not configured. Set ANTHROPIC_API_KEY.";
    } else if (err.includes("timed out")) {
      userMessage = "Planning request timed out. Try again.";
    } else if (err.includes("credit balance") || err.includes("billing")) {
      userMessage =
        "Anthropic API credit balance is too low. Add credits at console.anthropic.com.";
    } else if (
      err.includes("401") ||
      err.includes("authentication") ||
      err.includes("invalid.*api.*key")
    ) {
      userMessage =
        "Anthropic API key is invalid. Check ANTHROPIC_API_KEY in your config.";
    } else if (err.includes("429") || err.includes("rate limit")) {
      userMessage = "Rate limit exceeded. Please try again in a moment.";
    } else {
      userMessage = "Planning service temporarily unavailable.";
    }

    return json({ status: "error", message: userMessage }, 502);
  }

  const parseResult = parsePlanningResponse(llmResponse.text);

  const projectIdValue = state.project.id;
  const actionsWithProjectId = parseResult.actions.map((a) => {
    const targetRef = a.target_ref as Record<string, unknown>;
    if (a.action_type === "createWorkflow" && !targetRef.project_id) {
      targetRef.project_id = projectIdValue;
    }
    return {
      ...a,
      project_id: a.project_id || projectIdValue,
      target_ref: targetRef,
    };
  });

  const { valid, rejected } = validatePlanningOutput(actionsWithProjectId, state);

  const preview = buildPreviewFromActions(valid, state);

  const response: ChatResponse = {
    status: valid.length > 0 || rejected.length === 0 ? "success" : "error",
    actions: valid,
    preview,
    errors:
      rejected.length > 0
        ? rejected.map((r) => ({ action: r.action, reason: r.reason }))
        : undefined,
    metadata: {
      tokens: llmResponse.usage.inputTokens + llmResponse.usage.outputTokens,
      model: llmResponse.model,
    },
  };

  return json(response);
}
