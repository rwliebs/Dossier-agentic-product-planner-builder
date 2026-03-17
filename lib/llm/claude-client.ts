import { execSync, spawn } from "child_process";
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

/** Distinguishes API keys (sk-ant-api*) from OAuth tokens (sk-ant-oat*). No longer used for planning routing; kept for tests. */
export function isLikelyApiKey(credential: string): boolean {
  return credential.startsWith("sk-ant-") && !credential.startsWith("sk-ant-oat");
}
const DEFAULT_TIMEOUT_MS = 120_000;

const CLI_DEFAULT_MODEL = "claude-sonnet-4-6";

/** Verify the claude binary exists and is authenticated (e.g. Max subscription). */
const CLI_VERSION_CHECK_TIMEOUT_MS = 3_000;

export function isClaudeCliAvailable(): boolean {
  try {
    execSync("claude --version", {
      stdio: "pipe",
      timeout: CLI_VERSION_CHECK_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves auth method: API key (env or ~/.dossier/config or .claude/settings) vs CLI subprocess.
 * Use "api-key" path when any credential is present; use "cli" only when none and CLI is available.
 */
function resolveAuthMethod(apiKeyOverride?: string): "api-key" | "cli" {
  if (apiKeyOverride?.trim()) return "api-key";
  if (resolvePlanningCredential()) return "api-key";
  if (isClaudeCliAvailable()) return "cli";
  throw new Error(
    "No authentication configured. Set ANTHROPIC_API_KEY or install and authenticate Claude Code CLI.",
  );
}

/**
 * Run planning request via Claude Code CLI (-p). Uses machine credential (e.g. Max OAuth).
 * CLI does not support separate system prompt; we prepend it to the stdin payload.
 */
async function claudePlanningRequestViaCli(
  systemPrompt: string,
  userMessage: string,
  options?: { model?: string; timeoutMs?: number },
): Promise<ClaudePlanningResponse> {
  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? CLI_DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stdinPayload = `${systemPrompt}\n\n---\n\n${userMessage}`;

  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json", "--model", model];
    const proc = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`CLI planning request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { result?: string };
        resolve({
          text: parsed.result ?? stdout,
          stopReason: "end_turn",
          usage: { inputTokens: 0, outputTokens: 0 },
          model,
        });
      } catch {
        resolve({
          text: stdout.trim(),
          stopReason: "end_turn",
          usage: { inputTokens: 0, outputTokens: 0 },
          model,
        });
      }
    });

    proc.stdin.write(stdinPayload);
    proc.stdin.end();
  });
}

/**
 * Run streaming request via Claude Code CLI. Uses --output-format stream-json;
 * parses newline-delimited JSON and emits text deltas. Falls back to single chunk if needed.
 */
async function claudeStreamingRequestViaCli(
  systemPrompt: string,
  userMessage: string,
  options?: { model?: string; timeoutMs?: number },
): Promise<ReadableStream<string>> {
  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? CLI_DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stdinPayload = `${systemPrompt}\n\n---\n\n${userMessage}`;

  return new Promise((resolve) => {
    const args = ["-p", "--output-format", "stream-json", "--model", model];
    const proc = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });

    let lineBuffer = "";
    let fullStdout = "";
    let hadChunk = false;

    const stream = new ReadableStream<string>({
      start(controller) {
        let done = false;

        const finish = (error?: Error) => {
          if (done) return;
          done = true;
          if (error) {
            controller.error(error);
          } else {
            controller.close();
          }
        };

        const safeEnqueue = (text: string) => {
          if (done) return;
          controller.enqueue(text);
        };

        const timer = setTimeout(() => {
          proc.kill();
          if (!hadChunk && fullStdout.trim()) {
            hadChunk = true;
            safeEnqueue(fullStdout.trim());
          }
          if (!hadChunk) {
            finish(new Error(`CLI stream timed out after ${timeoutMs}ms`));
          } else {
            finish();
          }
        }, timeoutMs);

        proc.stdout.on("data", (chunk: Buffer) => {
          const str = chunk.toString();
          fullStdout += str;
          lineBuffer += str;
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed) as { type?: string; text?: string; delta?: string };
              const text = parsed.text ?? parsed.delta ?? (typeof parsed === "string" ? parsed : "");
              if (text) {
                hadChunk = true;
                safeEnqueue(text);
              }
            } catch {
              // Not JSON or unknown shape; skip
            }
          }
        });

        proc.on("close", (code) => {
          clearTimeout(timer);
          if (lineBuffer.trim()) {
            try {
              const parsed = JSON.parse(lineBuffer.trim()) as { text?: string; delta?: string };
              const text = parsed.text ?? parsed.delta ?? lineBuffer.trim();
              if (text) {
                hadChunk = true;
                safeEnqueue(text);
              }
            } catch {
              // fall through to full buffer fallback
            }
          }
          if (!hadChunk && fullStdout.trim()) {
            hadChunk = true;
            safeEnqueue(fullStdout.trim());
          }
          if (code !== 0 && !hadChunk) {
            finish(new Error(`claude CLI exited with code ${code}`));
          } else {
            finish();
          }
        });

        proc.stderr.on("data", () => {});

        proc.stdin.write(stdinPayload);
        proc.stdin.end();
      },
    });

    resolve(stream);
  });
}

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
    /** Working directory for SDK Read/Glob/Grep tools (e.g. cloned repo path). */
    cwd?: string;
    /** @internal Force CLI path for tests when child_process mock is not applied. */
    forceCliForTesting?: boolean;
  },
): Promise<ClaudePlanningResponse> {
  const auth = options?.forceCliForTesting === true ? "cli" : resolveAuthMethod(options?.apiKey);
  if (auth === "cli") {
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
    return claudePlanningRequestViaCli(systemPrompt, userMessage, {
      model: options?.model,
      timeoutMs: options?.timeoutMs,
    });
  }

  const credential = options?.apiKey ?? resolvePlanningCredential();
  if (!credential) {
    throw new Error(
      "Anthropic credential required for planning. Set ANTHROPIC_API_KEY in .env.local or ~/.dossier/config, or use Claude Code (we use your installed CLI config when no key is set).",
    );
  }

  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
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
    if (error && typeof error === "object" && "status" in error && (error as { status: number }).status === 429) {
      throw new Error(
        "Planning service rate limit exceeded. Please try again in a moment.",
      );
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
    /** Working directory for SDK Read/Glob/Grep tools (e.g. cloned repo path). */
    cwd?: string;
  },
): Promise<ReadableStream<string>> {
  const auth = resolveAuthMethod(options?.apiKey);
  if (auth === "cli") {
    return claudeStreamingRequestViaCli(input.systemPrompt, input.userMessage, {
      model: options?.model,
      timeoutMs: options?.timeoutMs,
    });
  }

  const credential = options?.apiKey ?? resolvePlanningCredential();
  if (!credential) {
    throw new Error(
      "Anthropic credential required for planning. Set ANTHROPIC_API_KEY in .env.local or ~/.dossier/config, or use Claude Code (we use your installed CLI config when no key is set).",
    );
  }

  const model = options?.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout>;
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), timeoutMs);
  };
  resetIdleTimer();
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
          resetIdleTimer();
          streamController.enqueue(chunk);
        }
        clearTimeout(idleTimer);
        streamController.close();
      } catch (err) {
        clearTimeout(idleTimer);
        streamController.error(
          err instanceof Error && err.name === "AbortError"
            ? new Error(`Planning LLM stream idle for ${timeoutMs}ms with no data. Try again.`)
            : err,
        );
      }
    },
  });
}
