/**
 * Agentic-flow execution plane client.
 * HTTP client to AGENTIC_FLOW_URL for dispatch, status, cancel.
 * Mock client for dev when service unavailable.
 *
 * @see documents/adr/0006-agentic-flow-execution-plane.md
 * @see WORKTREE_MANAGEMENT_FLOW.md
 */

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

const AGENTIC_FLOW_URL =
  process.env.AGENTIC_FLOW_URL ?? "http://localhost:9000";

function isAgenticFlowAvailable(): boolean {
  return Boolean(
    process.env.AGENTIC_FLOW_URL || process.env.AGENTIC_FLOW_ENABLED === "true"
  );
}

/**
 * HTTP client for agentic-flow service.
 */
export function createAgenticFlowClient(): AgenticFlowClient {
  if (!isAgenticFlowAvailable()) {
    return createMockAgenticFlowClient();
  }

  const baseUrl = AGENTIC_FLOW_URL.replace(/\/$/, "");

  return {
    async dispatch(payload: DispatchPayload): Promise<DispatchResult> {
      try {
        const res = await fetch(`${baseUrl}/api/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const text = await res.text();
          return {
            success: false,
            error: `agentic-flow dispatch failed: ${res.status} ${text}`,
          };
        }

        const data = (await res.json()) as { execution_id?: string };
        return {
          success: true,
          execution_id: data.execution_id,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: `agentic-flow dispatch error: ${msg}` };
      }
    },

    async status(executionId: string): Promise<StatusResult> {
      try {
        const res = await fetch(
          `${baseUrl}/api/executions/${encodeURIComponent(executionId)}`
        );

        if (!res.ok) {
          const text = await res.text();
          return {
            success: false,
            error: `agentic-flow status failed: ${res.status} ${text}`,
          };
        }

        const data = (await res.json()) as ExecutionStatus;
        return { success: true, status: data };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: `agentic-flow status error: ${msg}` };
      }
    },

    async cancel(executionId: string): Promise<CancelResult> {
      try {
        const res = await fetch(
          `${baseUrl}/api/executions/${encodeURIComponent(executionId)}/cancel`,
          { method: "POST" }
        );

        if (!res.ok) {
          const text = await res.text();
          return {
            success: false,
            error: `agentic-flow cancel failed: ${res.status} ${text}`,
          };
        }

        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: `agentic-flow cancel error: ${msg}` };
      }
    },
  };
}

/**
 * Mock client for development when agentic-flow is unavailable.
 * Simulates successful dispatch and immediate completion.
 */
export function createMockAgenticFlowClient(): AgenticFlowClient {
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
