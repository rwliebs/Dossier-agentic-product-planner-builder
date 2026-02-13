import Anthropic from "@anthropic-ai/sdk";
import type { PlanningState } from "@/lib/schemas/planning-state";
import type { ContextArtifact } from "@/lib/schemas/slice-b";
import {
  buildPlanningSystemPrompt,
  buildPlanningUserMessage,
} from "./planning-prompt";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ClaudePlanningRequestInput {
  userRequest: string;
  mapSnapshot: PlanningState;
  linkedArtifacts?: ContextArtifact[];
}

export interface ClaudePlanningResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}

/**
 * Extract text from Anthropic Message content blocks.
 * Handles text blocks and skips thinking blocks for the final output.
 */
function extractTextFromContent(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

/**
 * Call Claude API for planning context engine.
 * Returns raw LLM response text for parsing into PlanningAction[].
 */
export async function claudePlanningRequest(
  input: ClaudePlanningRequestInput,
  options?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    timeoutMs?: number;
  },
): Promise<ClaudePlanningResponse> {
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for planning LLM. Set it in .env.local.",
    );
  }

  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const client = new Anthropic({ apiKey });

  const systemPrompt = buildPlanningSystemPrompt();
  const userMessage = buildPlanningUserMessage(
    input.userRequest,
    input.mapSnapshot,
    input.linkedArtifacts ?? [],
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const message = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      },
      { signal: controller.signal },
    );

    clearTimeout(timeoutId);

    const text = extractTextFromContent(message.content);
    const usage = message.usage;

    return {
      text,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
      },
      model: message.model,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(
          `Planning LLM request timed out after ${timeoutMs}ms. Try again.`,
        );
      }
      if ("status" in error && (error as { status: number }).status === 429) {
        throw new Error(
          "Planning service rate limit exceeded. Please try again in a moment.",
        );
      }
      throw error;
    }
    throw error;
  }
}
