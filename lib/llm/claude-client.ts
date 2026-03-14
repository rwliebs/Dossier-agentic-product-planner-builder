import Anthropic from "@anthropic-ai/sdk";
import type { PlanningState } from "@/lib/schemas/planning-state";
import type { ContextArtifact } from "@/lib/schemas/slice-b";
import {
  buildPlanningSystemPrompt,
  buildPlanningUserMessage,
  buildConversationMessages,
  type ConversationMessage,
} from "./planning-prompt";
import { resolvePlanningCredential } from "./planning-credential";
import { planningResponseFromSdkText } from "./planning-sdk-bridge";
import { runPlanningQuery, streamPlanningQuery } from "./planning-sdk-runner";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** OAuth tokens are not sk-ant-*; use Agent SDK path when credential is not an API key. */
function isLikelyApiKey(credential: string): boolean {
  return credential.startsWith("sk-ant-");
}
const DEFAULT_MAX_TOKENS = 16384;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface ClaudeStreamingRequestInput {
  systemPrompt: string;
  userMessage: string;
}

export interface ClaudePlanningRequestInput {
  userRequest: string;
  mapSnapshot: PlanningState;
  linkedArtifacts?: ContextArtifact[];
  conversationHistory?: ConversationMessage[];
}

export interface ClaudePlanningResponse {
  text: string;
  stopReason: string | null;
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
    systemPromptOverride?: string;
    userMessageOverride?: string;
    /** When set (e.g. cloned repo path), planning SDK runs Read/Glob/Grep in this directory. */
    cwd?: string;
  },
): Promise<ClaudePlanningResponse> {
  const credential = options?.apiKey ?? resolvePlanningCredential();
  if (!credential) {
    throw new Error(
      "Anthropic credential required for planning. Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in .env.local or ~/.dossier/config.",
    );
  }

  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const systemPrompt = options?.systemPromptOverride ?? buildPlanningSystemPrompt();
  const history = input.conversationHistory ?? [];
  const userMessage = options?.userMessageOverride
    ? options.userMessageOverride
    : history.length > 0
      ? (() => {
          const messages = buildConversationMessages(
            input.userRequest,
            input.mapSnapshot,
            input.linkedArtifacts ?? [],
            history,
          );
          return messages
            .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n\n");
        })()
      : buildPlanningUserMessage(
          input.userRequest,
          input.mapSnapshot,
          input.linkedArtifacts ?? [],
        );

  if (!isLikelyApiKey(credential)) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const text = await runPlanningQuery({
        systemPrompt,
        userMessage,
        model,
        signal: controller.signal,
        ...(options?.cwd && { cwd: options.cwd }),
      });
      clearTimeout(timeoutId);
      return planningResponseFromSdkText(text, { model });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Planning LLM request timed out after ${timeoutMs}ms. Try again.`);
      }
      throw error;
    }
  }

  const client = new Anthropic({ apiKey: credential });
  const messages = options?.userMessageOverride
    ? [{ role: "user" as const, content: options.userMessageOverride }]
    : history.length > 0
      ? buildConversationMessages(
          input.userRequest,
          input.mapSnapshot,
          input.linkedArtifacts ?? [],
          history,
        )
      : [{ role: "user" as const, content: buildPlanningUserMessage(
          input.userRequest,
          input.mapSnapshot,
          input.linkedArtifacts ?? [],
        )}];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const createParams = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: false as const,
      cache_control: { type: "ephemeral" },
    };
    const message = await client.messages.create(
      createParams as Parameters<typeof client.messages.create>[0],
      { signal: controller.signal },
    );

    clearTimeout(timeoutId);

    const text = extractTextFromContent((message as { content: Array<{ type: string; text?: string }> }).content);
    const msg = message as {
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string | null;
      model: string;
    };
    const usage = msg.usage;

    return {
      text,
      stopReason: msg.stop_reason ?? null,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
      },
      model: msg.model,
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

/**
 * Call Claude API with streaming. Returns a ReadableStream that yields text deltas
 * as they arrive. Used for incremental parsing and live updates.
 *
 * Timeout behaviour: idle-based. The timer resets each time a text chunk arrives,
 * so long-running generations that are actively streaming won't be killed.
 * Only stalls (no data for timeoutMs) trigger an abort.
 */
export async function claudeStreamingRequest(
  input: ClaudeStreamingRequestInput,
  options?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    timeoutMs?: number;
    /** When set (e.g. cloned repo path), planning SDK runs Read/Glob/Grep in this directory. */
    cwd?: string;
  },
): Promise<ReadableStream<string>> {
  const credential = options?.apiKey ?? resolvePlanningCredential();
  if (!credential) {
    throw new Error(
      "Anthropic credential required for planning. Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in .env.local or ~/.dossier/config.",
    );
  }

  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!isLikelyApiKey(credential)) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return new ReadableStream<string>({
      async start(streamController) {
        try {
          for await (const chunk of streamPlanningQuery({
            systemPrompt: input.systemPrompt,
            userMessage: input.userMessage,
            model,
            signal: controller.signal,
            ...(options?.cwd && { cwd: options.cwd }),
          })) {
            clearTimeout(timeoutId);
            streamController.enqueue(chunk);
          }
          streamController.close();
        } catch (err) {
          clearTimeout(timeoutId);
          streamController.error(
            err instanceof Error && err.name === "AbortError"
              ? new Error(`Planning LLM stream idle for ${timeoutMs}ms with no data. Try again.`)
              : err,
          );
        }
      },
    });
  }

  const client = new Anthropic({ apiKey: credential });
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const controller = new AbortController();

  let idleTimer: ReturnType<typeof setTimeout>;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), timeoutMs);
  };
  resetIdleTimer();

  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system: input.systemPrompt,
      messages: [{ role: "user", content: input.userMessage }],
      cache_control: { type: "ephemeral" },
    } as Parameters<typeof client.messages.stream>[0],
    { signal: controller.signal },
  );

  return new ReadableStream<string>({
    start(streamController) {
      stream.on("text", (delta: string) => {
        resetIdleTimer();
        try {
          streamController.enqueue(delta);
        } catch {
          // Stream may be closed
        }
      });
      stream.on("end", () => {
        clearTimeout(idleTimer);
        streamController.close();
      });
      stream.on("error", (err) => {
        clearTimeout(idleTimer);
        streamController.error(err);
      });
      stream.on("abort", () => {
        clearTimeout(idleTimer);
        streamController.error(
          new Error(
            `Planning LLM stream idle for ${timeoutMs}ms with no data. Try again.`,
          ),
        );
      });
    },
  });
}
