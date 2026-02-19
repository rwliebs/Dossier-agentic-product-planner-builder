/**
 * Claude-flow execution plane client.
 * Real client uses subprocess adapter (claude-flow CLI) when available;
 * falls back to mock when claude-flow is not importable or ANTHROPIC_API_KEY is unset.
 *
 * @see REMAINING_WORK_PLAN.md §5 O10
 * @see docs/O10_CLAUDE_FLOW_GAP.md — programmatic API gap and subprocess bridge
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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

export interface ClaudeFlowClient {
  dispatch(payload: DispatchPayload): Promise<DispatchResult>;
  status(executionId: string): Promise<StatusResult>;
  cancel(executionId: string): Promise<CancelResult>;
}

/** Process registry for subprocess adapter: execution_id -> { pid, startedAt } */
const processRegistry = new Map<
  string,
  { pid: number; startedAt: string }
>();

/**
 * Real client — subprocess adapter that spawns claude-flow CLI.
 * Uses buildTaskFromPayload to translate DispatchPayload into task description.
 *
 * @see docs/O10_CLAUDE_FLOW_GAP.md
 */
export function createRealClaudeFlowClient(): ClaudeFlowClient {
  return {
    async dispatch(payload: DispatchPayload): Promise<DispatchResult> {
      const { taskDescription } = buildTaskFromPayload(payload);
      const executionId = randomUUID();
      const cwd = payload.worktree_path ?? process.cwd();
      const env = {
        ...process.env,
        CLAUDE_FLOW_NON_INTERACTIVE: "true",
      };

      try {
        const child = spawn(
          "npx",
          [
            "claude-flow",
            "swarm",
            taskDescription,
            "--no-interactive",
            "--output-format",
            "json",
          ],
          {
            cwd,
            env,
            stdio: ["ignore", "pipe", "pipe"],
            detached: true,
          }
        );

        child.unref();
        processRegistry.set(executionId, {
          pid: child.pid!,
          startedAt: new Date().toISOString(),
        });

        child.on("exit", (code) => {
          processRegistry.delete(executionId);
        });

        return {
          success: true,
          execution_id: executionId,
        };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : String(err),
        };
      }
    },

    async status(executionId: string): Promise<StatusResult> {
      const entry = processRegistry.get(executionId);
      if (!entry) {
        return {
          success: false,
          error: `Execution not found: ${executionId}`,
        };
      }

      try {
        process.kill(entry.pid, 0);
      } catch {
        processRegistry.delete(executionId);
        return {
          success: true,
          status: {
            execution_id: executionId,
            status: "completed",
            started_at: entry.startedAt,
            ended_at: new Date().toISOString(),
            summary: "Process exited (status unknown after unref)",
          },
        };
      }

      return {
        success: true,
        status: {
          execution_id: executionId,
          status: "running",
          started_at: entry.startedAt,
        },
      };
    },

    async cancel(executionId: string): Promise<CancelResult> {
      const entry = processRegistry.get(executionId);
      if (!entry) {
        return {
          success: false,
          error: `Execution not found: ${executionId}`,
        };
      }

      try {
        process.kill(entry.pid, "SIGTERM");
        processRegistry.delete(executionId);
        return { success: true };
      } catch (err) {
        processRegistry.delete(executionId);
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/** Whether the real client is available (claude-flow importable + ANTHROPIC_API_KEY set) */
let realClientAvailable: boolean | null = null;

/**
 * @internal For testing only — resets availability so createClaudeFlowClient re-evaluates.
 */
export function __setRealClientAvailableForTesting(
  available: boolean | null
): void {
  realClientAvailable = available;
}

/**
 * Returns the execution client.
 * If claude-flow is importable and ANTHROPIC_API_KEY is set, returns the real (subprocess) client.
 * Otherwise falls back to mock and logs a warning.
 */
export function createClaudeFlowClient(): ClaudeFlowClient {
  if (realClientAvailable === null) {
    const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    if (!hasKey) {
      realClientAvailable = false;
    } else {
      try {
        require.resolve("claude-flow");
        realClientAvailable = true;
      } catch {
        realClientAvailable = false;
      }
    }
  }

  if (realClientAvailable) {
    return createRealClaudeFlowClient();
  }

  if (typeof console !== "undefined" && console.warn) {
    console.warn("claude-flow not available — using mock client");
  }
  return createMockClaudeFlowClient();
}

/**
 * Mock client — simulates dispatch and immediate completion.
 * Simulates webhook callback with sample knowledge items to exercise the full feedback loop.
 */
export function createMockClaudeFlowClient(): ClaudeFlowClient {
  const executions = new Map<
    string,
    { payload: DispatchPayload; createdAt: string }
  >();

  return {
    async dispatch(payload: DispatchPayload): Promise<DispatchResult> {
      const executionId = `mock-exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      executions.set(executionId, {
        payload,
        createdAt: new Date().toISOString(),
      });

      // Simulate webhook callback after a short delay (exercises full feedback loop in dev)
      // Skip in test environment — tests use mocked DB, real DB may not have the card
      if (typeof process !== "undefined" && process.env?.VITEST) {
        // no-op in tests
      } else {
        setImmediate(async () => {
          try {
            const { getDb } = await import("@/lib/db");
            const { processWebhook } = await import("./process-webhook");
            const db = getDb();
            await processWebhook(db, {
              event_type: "execution_completed",
              assignment_id: payload.assignment_id,
              execution_id: executionId,
              ended_at: new Date().toISOString(),
              summary: "[Mock] Execution completed (dry-run)",
              knowledge: {
                facts: [
                  { text: "Mock: Codebase uses TypeScript", evidence_source: "tsconfig.json" },
                ],
                assumptions: [
                  { text: "Mock: Assumed existing API patterns apply" },
                ],
                questions: [
                  { text: "Mock: Should we add error boundaries for this component?" },
                ],
              },
            });
          } catch (err) {
            console.warn("Mock webhook simulation failed:", err);
          }
        });
      }

      return {
        success: true,
        execution_id: executionId,
      };
    },

    async status(executionId: string): Promise<StatusResult> {
      const exec = executions.get(executionId);
      if (!exec) {
        return {
          success: false,
          error: `Execution not found: ${executionId}`,
        };
      }
      return {
        success: true,
        status: {
          execution_id: executionId,
          status: "completed",
          started_at: exec.createdAt,
          ended_at: new Date().toISOString(),
          summary: "[Mock] Execution completed (dry-run)",
          commits: [],
        },
      };
    },

    async cancel(executionId: string): Promise<CancelResult> {
      if (!executions.has(executionId)) {
        return { success: false, error: `Execution not found: ${executionId}` };
      }
      executions.delete(executionId);
      return { success: true };
    },
  };
}
