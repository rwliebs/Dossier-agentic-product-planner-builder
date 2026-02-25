import type { DbAdapter } from "@/lib/db/adapter";
import type { PlanningState } from "@/lib/schemas/planning-state";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import { claudeStreamingRequest } from "@/lib/llm/claude-client";
import { parseActionsFromStream } from "@/lib/llm/stream-action-parser";
import { validatePlanningOutput } from "@/lib/llm/validate-planning-output";
import { pipelineApply } from "@/lib/db/mutations";
import { fetchMapSnapshot } from "@/lib/db/map-snapshot";

export type Emitter = (event: string, data: unknown) => void;

export async function runLlmSubStep(opts: {
  db: DbAdapter;
  projectId: string;
  systemPrompt: string;
  userMessage: string;
  state: PlanningState;
  emit: Emitter;
  actionFilter?: (action: PlanningAction) => boolean;
  mockResponse?: string;
}): Promise<{ actionCount: number; updatedState: PlanningState }> {
  const { db, projectId, systemPrompt, userMessage, emit, actionFilter, mockResponse } = opts;
  let currentState = opts.state;

  const useMock =
    process.env.PLANNING_MOCK_ALLOWED === "1" &&
    typeof mockResponse === "string" &&
    mockResponse.length > 0;

  let rawLlmOutput = "";
  const llmStreamRaw = useMock
    ? null
    : await claudeStreamingRequest({ systemPrompt, userMessage });
  const llmStream = useMock
    ? new ReadableStream<string>({
        start(ctrl) {
          ctrl.enqueue(mockResponse!);
          ctrl.close();
        },
      })
    : (() => {
        const [parseBranch, logBranch] = llmStreamRaw!.tee();
        const reader = logBranch.getReader();
        const decoder = new TextDecoder();
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              rawLlmOutput += typeof value === "string" ? value : decoder.decode(value);
            }
          } catch {
            /* ignore */
          }
        })();
        return parseBranch;
      })();

  let actionCount = 0;

  for await (const result of parseActionsFromStream(llmStream)) {
    if (result.type === "response_type") {
      if (result.responseType === "clarification") {
        console.warn("[planning] LLM returned type 'clarification' — skipping actions.");
        return { actionCount, updatedState: currentState };
      }
      continue;
    }
    if (result.type === "message") {
      emit("message", { message: result.message });
      continue;
    }
    if (result.type === "done") break;
    if (result.type !== "action") continue;

    const action = result.action;
    if (actionFilter && !actionFilter(action)) continue;

    const targetRef = action.target_ref as Record<string, unknown>;
    const projectIdValue = currentState.project.id;
    const actionWithProjectId = {
      ...action,
      project_id: action.project_id || projectIdValue,
      target_ref: {
        ...targetRef,
        ...(action.action_type === "createWorkflow" && !targetRef.project_id
          ? { project_id: projectIdValue }
          : {}),
      },
    };

    const { valid, rejected } = validatePlanningOutput(
      [actionWithProjectId],
      currentState,
    );

    if (rejected.length > 0) {
      emit("error", { action: actionWithProjectId, reason: rejected[0].reason });
      continue;
    }

    const applyResult = await pipelineApply(db, projectId, valid);
    if (applyResult.failedAt !== undefined) {
      emit("error", { action: actionWithProjectId, reason: applyResult.rejectionReason ?? "Apply failed" });
      continue;
    }

    actionCount++;
    emit("action", { action: actionWithProjectId, applied: applyResult.applied });

    const newState = await fetchMapSnapshot(db, projectId);
    if (newState) currentState = newState;
  }

  if (!useMock && rawLlmOutput) {
    if (actionCount === 0) {
      console.warn(
        "[planning] LLM sub-step produced 0 actions. Raw output:\n",
        rawLlmOutput.slice(0, 4000),
        rawLlmOutput.length > 4000 ? "\n...(truncated)" : "",
      );
    } else if (process.env.PLANNING_DEBUG === "1") {
      console.log(
        "[planning] LLM sub-step raw output:\n",
        rawLlmOutput.slice(0, 4000),
        rawLlmOutput.length > 4000 ? "\n...(truncated)" : "",
      );
    }
  }

  return { actionCount, updatedState: currentState };
}
