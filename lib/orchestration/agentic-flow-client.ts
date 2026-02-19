/**
 * Agentic-flow execution plane client.
 *
 * Real client imports agentic-flow's `claudeAgent` function and `getAgent` loader,
 * which wraps @anthropic-ai/claude-agent-sdk `query()` with:
 *   - Agent definitions from .claude/agents/ (system prompts, hooks, capabilities)
 *   - Multi-provider routing (Anthropic, Gemini, OpenRouter, ONNX)
 *   - Retry/resilience via withRetry()
 *   - MCP server orchestration (optional)
 *
 * IMPORTANT: We do NOT use the agentic-flow CLI (`npx agentic-flow --agent ...`)
 * because the CLI path uses `claudeAgentDirect` which only calls
 * `messages.create()` — a plain text completion with NO tool execution.
 * The programmatic `claudeAgent()` function uses the SDK `query()` which provides
 * real filesystem tools: Write, Edit, Bash, Read, Glob, Grep.
 *
 * @see REMAINING_WORK_PLAN.md §5 O10
 * @see docs/adr/0008-agentic-flow-execution-plane.md
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { readConfigFile } from "@/lib/config/data-dir";
import { buildTaskFromPayload } from "./build-task";

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

/**
 * Lazily imports agentic-flow's `claudeAgent` function and `getAgent` loader.
 *
 * `claudeAgent` wraps @anthropic-ai/claude-agent-sdk `query()` with:
 *   - Agent system prompts from .claude/agents/ definitions
 *   - permissionMode: 'bypassPermissions'
 *   - allowedTools: Write, Edit, Bash, Read, Glob, Grep, WebFetch, WebSearch, etc.
 *   - Multi-provider routing and retry logic
 *
 * We disable external MCP servers to avoid unnecessary npx spawns.
 */
async function importAgenticFlow(): Promise<{
  claudeAgent: (
    agent: { name: string; description: string; systemPrompt: string },
    input: string,
    onStream?: (chunk: string) => void,
    modelOverride?: string
  ) => Promise<{ output: string; agent: string }>;
  getAgent: (name: string) => {
    name: string;
    description: string;
    systemPrompt: string;
  } | undefined;
}> {
  process.env.ENABLE_CLAUDE_FLOW_MCP = "false";
  process.env.ENABLE_FLOW_NEXUS_MCP = "false";
  process.env.ENABLE_AGENTIC_PAYMENTS_MCP = "false";
  process.env.ENABLE_CLAUDE_FLOW_SDK = "false";

  const distRoot = getAgenticFlowDistRoot();
  const agentMod = await import(
    /* webpackIgnore: true */
    "file://" + path.join(distRoot, "agents", "claudeAgent.js")
  );
  const loaderMod = await import(
    /* webpackIgnore: true */
    "file://" + path.join(distRoot, "utils", "agentLoader.js")
  );

  return {
    claudeAgent: agentMod.claudeAgent,
    getAgent: loaderMod.getAgent,
  };
}

/**
 * Real client — uses agentic-flow's `claudeAgent()` function (programmatic API).
 *
 * This imports agentic-flow's agent loader to get the "coder" agent definition
 * (system prompt, capabilities, hooks), then calls `claudeAgent()` which internally
 * uses @anthropic-ai/claude-agent-sdk `query()` with real filesystem tools:
 *   Write, Edit, Read, Bash, Glob, Grep, WebFetch, WebSearch
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

      let agenticFlow: Awaited<ReturnType<typeof importAgenticFlow>>;
      try {
        agenticFlow = await importAgenticFlow();
      } catch (err) {
        return {
          success: false,
          error: `Failed to import agentic-flow: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }

      const agent = agenticFlow.getAgent(DEFAULT_AGENT);
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
        let eventType: string;
        let summary: string;
        let errorMsg: string | undefined;

        try {
          const result = await agenticFlow.claudeAgent(
            agent,
            taskDescription,
            (chunk: string) => {
              if (abortController.signal.aborted) return;
            }
          );

          entry.status = "completed";
          entry.endedAt = new Date().toISOString();
          entry.summary = result.output.substring(0, 500);
          eventType = "execution_completed";
          summary = entry.summary;
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
            knowledge: {
              facts: [],
              assumptions: [],
              questions: [],
            },
          });
        } catch (webhookErr) {
          console.warn("Post-execution webhook processing failed:", webhookErr);
        }
      };

      runExecution().catch((err) => {
        entry.status = "failed";
        entry.endedAt = new Date().toISOString();
        entry.error = err instanceof Error ? err.message : String(err);
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

