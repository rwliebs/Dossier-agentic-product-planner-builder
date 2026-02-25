/**
 * Agentic-flow execution plane client.
 *
 * Uses @anthropic-ai/claude-agent-sdk `query()` directly with agentic-flow's
 * `getAgent()` for agent definitions (system prompts). We call the SDK directly
 * (instead of agentic-flow's `claudeAgent()` wrapper) to pass the native `cwd`
 * option so the agent executes in the target repository clone, not the Dossier
 * project root.
 *
 * Dossier disables all MCP servers and uses Anthropic only, so the wrapper adds
 * little value. Direct SDK usage gives us concurrent-safe CWD and access to
 * options like persistSession: false for ephemeral builds.
 *
 * @see REMAINING_WORK_PLAN.md §5 O10
 * @see docs/adr/0008-agentic-flow-execution-plane.md
 * @see docs/investigations/investigation-build-only-readme.md
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readConfigFile } from "@/lib/config/data-dir";
import { buildTaskFromPayload } from "./build-task";
import type { WebhookEventType } from "./process-webhook";

export interface PlannedFileDetail {
  logical_file_name: string;
  action: string;
  artifact_kind: string;
  intent_summary: string;
  contract_notes?: string;
  module_hint?: string;
}

export interface ContextArtifactDetail {
  name: string;
  type: string;
  title?: string;
  content: string;
}

export interface DispatchPayload {
  run_id: string;
  assignment_id: string;
  card_id: string;
  feature_branch: string;
  worktree_path?: string | null;
  allowed_paths: string[];
  forbidden_paths?: string[] | null;
  assignment_input_snapshot: Record<string, unknown>;
  memory_context_refs?: string[];
  acceptance_criteria?: string[];
  card_title?: string;
  card_description?: string;
  planned_files_detail?: PlannedFileDetail[];
  context_artifacts?: ContextArtifactDetail[];
}

export interface DispatchResult {
  success: boolean;
  execution_id?: string;
  error?: string;
}

export interface ExecutionStatus {
  execution_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  started_at?: string;
  ended_at?: string;
  summary?: string;
  error?: string;
  commits?: Array<{ sha: string; branch: string; message: string }>;
}

export interface StatusResult {
  success: boolean;
  status?: ExecutionStatus;
  error?: string;
}

export interface CancelResult {
  success: boolean;
  error?: string;
}

export interface AgenticFlowClient {
  dispatch(payload: DispatchPayload): Promise<DispatchResult>;
  status(executionId: string): Promise<StatusResult>;
  cancel(executionId: string): Promise<CancelResult>;
}

/** Backward-compatible type alias */
export type ClaudeFlowClient = AgenticFlowClient;

interface ExecutionEntry {
  abortController: AbortController;
  startedAt: string;
  status: "running" | "completed" | "failed" | "cancelled";
  endedAt?: string;
  summary?: string;
  error?: string;
}

/** Execution registry: execution_id -> entry */
const executionRegistry = new Map<string, ExecutionEntry>();

/** Default agent name from agentic-flow's agent registry */
const DEFAULT_AGENT = "coder";

/**
 * Resolves the agentic-flow dist root inside node_modules.
 * The alpha publishes with nested structure: agentic-flow/agentic-flow/dist/
 */
function getAgenticFlowDistRoot(): string {
  return path.join(
    process.cwd(),
    "node_modules",
    "agentic-flow",
    "agentic-flow",
    "dist"
  );
}

/** Agent definition from agentic-flow's registry */
interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
}

/**
 * Lazily imports agentic-flow's `getAgent` loader for agent definitions.
 * We use the SDK `query()` directly (not claudeAgent) to pass native `cwd`.
 */
async function loadAgentLoader(): Promise<{
  getAgent: (name: string) => AgentDefinition | undefined;
}> {
  const distRoot = getAgenticFlowDistRoot();
  const loaderMod = await import(
    /* webpackIgnore: true */
    "file://" + path.join(distRoot, "utils", "agentLoader.js")
  );
  return { getAgent: loaderMod.getAgent };
}

/** Retry helper: 2 retries with exponential backoff */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/**
 * Runs SDK query and collects assistant text output from the stream.
 */
async function runQueryAndCollectOutput(
  taskDescription: string,
  options: {
    systemPrompt: string;
    cwd?: string;
    onStream?: (chunk: string) => void;
  }
): Promise<string> {
  const result = query({
    prompt: taskDescription,
    options: {
      systemPrompt: options.systemPrompt,
      model: process.env.COMPLETION_MODEL || "claude-sonnet-4-5-20250929",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      allowedTools: [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
        "WebFetch",
        "WebSearch",
      ],
      cwd: options.cwd,
      persistSession: false,
    },
  });

  let output = "";
  for await (const msg of result) {
    const m = msg as { type?: string; message?: { content?: Array<{ type?: string; text?: string }> } };
    if (m.type === "assistant" && m.message?.content) {
      const chunk =
        m.message.content
          ?.map((c) => (c.type === "text" ? c.text : ""))
          .join("") || "";
      output += chunk;
      if (options.onStream && chunk) {
        options.onStream(chunk);
      }
    }
  }
  return output;
}

/**
 * Real client — calls SDK `query()` directly with `cwd` from payload.worktree_path.
 * Uses agentic-flow's getAgent() for agent definitions only.
 *
 * Dispatch fires off the agent asynchronously; status/cancel use the
 * AbortController and execution registry to track progress.
 */
export function createRealAgenticFlowClient(): AgenticFlowClient {
  return {
    async dispatch(payload: DispatchPayload): Promise<DispatchResult> {
      const { taskDescription } = buildTaskFromPayload(payload);
      const executionId = randomUUID();

      const anthropicKey = resolveAnthropicKey();
      if (!anthropicKey) {
        return {
          success: false,
          error:
            "ANTHROPIC_API_KEY not set (checked process.env and ~/.dossier/config)",
        };
      }

      let loader: Awaited<ReturnType<typeof loadAgentLoader>>;
      try {
        loader = await loadAgentLoader();
      } catch (err) {
        return {
          success: false,
          error: `Failed to import agentic-flow: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }

      const agent = loader.getAgent(DEFAULT_AGENT);
      if (!agent) {
        return {
          success: false,
          error: `Agent "${DEFAULT_AGENT}" not found in agentic-flow registry`,
        };
      }

      const abortController = new AbortController();
      const entry: ExecutionEntry = {
        abortController,
        startedAt: new Date().toISOString(),
        status: "running",
      };
      executionRegistry.set(executionId, entry);

      const runExecution = async () => {
        let eventType: WebhookEventType;
        let summary: string;
        let errorMsg: string | undefined;
        let learnings: string[] = [];

        try {
          const output = await withRetry(() =>
            runQueryAndCollectOutput(taskDescription, {
              systemPrompt: agent.systemPrompt,
              cwd: payload.worktree_path || undefined,
              onStream: (chunk: string) => {
                if (abortController.signal.aborted) return;
              },
            })
          );

          entry.status = "completed";
          entry.endedAt = new Date().toISOString();
          entry.summary = output.substring(0, 500);
          eventType = "execution_completed";
          summary = entry.summary;
          const trimmed = output?.trim();
          if (trimmed) {
            learnings = [trimmed.length > 8000 ? trimmed.substring(0, 8000) + "\n[... truncated]" : trimmed];
          }
        } catch (err) {
          if (abortController.signal.aborted) {
            entry.status = "cancelled";
            eventType = "execution_failed";
            summary = "Execution cancelled";
          } else {
            entry.status = "failed";
            entry.error =
              err instanceof Error ? err.message : String(err);
            eventType = "execution_failed";
            summary = entry.error;
            errorMsg = entry.error;
          }
          entry.endedAt = new Date().toISOString();
        }

        // Delay before webhook/auto-commit so FS can flush when agent created many files (race fix).
        const preAutoCommitMs =
          typeof process.env.DOSSIER_PRE_AUTOCOMMIT_DELAY_MS !== "undefined"
            ? Number(process.env.DOSSIER_PRE_AUTOCOMMIT_DELAY_MS)
            : 2000;
        if (eventType === "execution_completed" && preAutoCommitMs > 0) {
          await new Promise((r) => setTimeout(r, preAutoCommitMs));
        }

        try {
          const { getDb } = await import("@/lib/db");
          const { processWebhook } = await import("./process-webhook");
          const db = getDb();
          await processWebhook(db, {
            event_type: eventType,
            assignment_id: payload.assignment_id,
            execution_id: executionId,
            ended_at: entry.endedAt!,
            summary,
            error: errorMsg,
            learnings,
            knowledge: {
              facts: [],
              assumptions: [],
              questions: [],
            },
          });
        } catch (webhookErr) {
          console.warn("Post-execution webhook processing failed:", webhookErr);
          // Ensure card is updated when processWebhook throws (e.g. DB or auto-commit error)
          try {
            const { getDb } = await import("@/lib/db");
            const { processWebhook: pw } = await import("./process-webhook");
            const db = getDb();
            await pw(db, {
              event_type: "execution_failed",
              assignment_id: payload.assignment_id,
              execution_id: executionId,
              ended_at: entry.endedAt ?? new Date().toISOString(),
              summary:
                webhookErr instanceof Error ? webhookErr.message : String(webhookErr),
              error:
                webhookErr instanceof Error ? webhookErr.message : String(webhookErr),
            });
          } catch (fallbackErr) {
            console.error("Fallback webhook (execution_failed) also failed:", fallbackErr);
          }
        }
      };

      runExecution().catch(async (err) => {
        entry.status = "failed";
        entry.endedAt = new Date().toISOString();
        entry.error = err instanceof Error ? err.message : String(err);
        // Ensure card is updated when runExecution rejects (e.g. before/during webhook)
        try {
          const { getDb } = await import("@/lib/db");
          const { processWebhook } = await import("./process-webhook");
          const db = getDb();
          await processWebhook(db, {
            event_type: "execution_failed",
            assignment_id: payload.assignment_id,
            execution_id: executionId,
            ended_at: entry.endedAt!,
            summary: entry.error,
            error: entry.error,
          });
        } catch (webhookErr) {
          console.error("Post-failure webhook (execution_failed) failed:", webhookErr);
        }
      });

      return { success: true, execution_id: executionId };
    },

    async status(executionId: string): Promise<StatusResult> {
      const entry = executionRegistry.get(executionId);
      if (!entry) {
        return {
          success: false,
          error: `Execution not found: ${executionId}`,
        };
      }

      return {
        success: true,
        status: {
          execution_id: executionId,
          status: entry.status,
          started_at: entry.startedAt,
          ended_at: entry.endedAt,
          summary: entry.summary,
          error: entry.error,
        },
      };
    },

    async cancel(executionId: string): Promise<CancelResult> {
      const entry = executionRegistry.get(executionId);
      if (!entry) {
        return {
          success: false,
          error: `Execution not found: ${executionId}`,
        };
      }

      entry.abortController.abort();
      entry.status = "cancelled";
      entry.endedAt = new Date().toISOString();
      return { success: true };
    },
  };
}

/**
 * Check if agentic-flow (alpha) and @anthropic-ai/claude-agent-sdk are installed.
 * Both are required: agentic-flow for agent definitions/routing, SDK for tool execution.
 */
function isAgenticFlowInstalled(): { hasPackage: boolean; hasSdk: boolean } {
  let hasPackage = false;
  let hasSdk = false;

  try {
    const distRoot = getAgenticFlowDistRoot();
    hasPackage =
      fs.existsSync(path.join(distRoot, "agents", "claudeAgent.js")) &&
      fs.existsSync(path.join(distRoot, "utils", "agentLoader.js"));
  } catch {
    /* not found */
  }

  try {
    require.resolve("@anthropic-ai/claude-agent-sdk");
    hasSdk = true;
  } catch {
    try {
      hasSdk = fs.existsSync(
        path.join(
          process.cwd(),
          "node_modules",
          "@anthropic-ai",
          "claude-agent-sdk",
          "sdk.mjs"
        )
      );
    } catch {
      /* not found */
    }
  }

  return { hasPackage, hasSdk };
}

/**
 * Resolves ANTHROPIC_API_KEY from process.env or ~/.dossier/config.
 * If found in config but not in env, injects it into process.env so
 * agentic-flow's internals (which read process.env directly) see it.
 */
function resolveAnthropicKey(): string | null {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const config = readConfigFile();
  const fromConfig = config.ANTHROPIC_API_KEY?.trim();
  if (fromConfig) {
    process.env.ANTHROPIC_API_KEY = fromConfig;
    return fromConfig;
  }

  return null;
}

/**
 * Returns the execution client.
 * Resolves ANTHROPIC_API_KEY from process.env or ~/.dossier/config.
 * Throws if agentic-flow, the Claude Agent SDK, or the key are missing —
 * there is no mock fallback.
 */
export function createAgenticFlowClient(): AgenticFlowClient {
  const hasKey = Boolean(resolveAnthropicKey());
  const { hasPackage, hasSdk } = isAgenticFlowInstalled();

  const reasons: string[] = [];
  if (!hasKey)
    reasons.push(
      "ANTHROPIC_API_KEY not set (checked process.env and ~/.dossier/config)"
    );
  if (!hasPackage)
    reasons.push(
      "agentic-flow package not installed (run: pnpm add agentic-flow@alpha)"
    );
  if (!hasSdk)
    reasons.push(
      "@anthropic-ai/claude-agent-sdk not installed (run: pnpm add @anthropic-ai/claude-agent-sdk)"
    );

  if (reasons.length > 0) {
    throw new Error(
      `agentic-flow not available: ${reasons.join("; ")}`
    );
  }

  return createRealAgenticFlowClient();
}

/** Backward-compatible factory alias */
export const createClaudeFlowClient = createAgenticFlowClient;

