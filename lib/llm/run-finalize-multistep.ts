import type { DbAdapter } from "@/lib/db/adapter";
import type { PlanningState } from "@/lib/schemas/planning-state";
import {
  buildFinalizeDocSystemPrompt,
  buildFinalizeDocUserMessage,
  FINALIZE_DOC_SPECS,
} from "@/lib/llm/planning-prompt";
import { runLlmSubStep, type Emitter } from "@/lib/llm/run-llm-substep";

/**
 * Run multi-step finalization: 1 LLM call per project document (5 docs = 5 calls).
 * Each sub-step generates a single artifact. Used by both streaming and non-streaming planning.
 */
export async function runFinalizeMultiStep(opts: {
  db: DbAdapter;
  projectId: string;
  state: PlanningState;
  emit: Emitter;
  mockResponse?: string;
}): Promise<number> {
  const { db, projectId, emit, mockResponse } = opts;
  let currentState = opts.state;
  const totalSteps = FINALIZE_DOC_SPECS.length;
  let totalActions = 0;

  for (let i = 0; i < FINALIZE_DOC_SPECS.length; i++) {
    const spec = FINALIZE_DOC_SPECS[i];

    emit("finalize_progress", {
      step: "doc",
      step_index: i,
      total_steps: totalSteps,
      status: "generating",
      label: `Generating ${spec.label}`,
    });

    try {
      const result = await runLlmSubStep({
        db,
        projectId,
        systemPrompt: buildFinalizeDocSystemPrompt(spec),
        userMessage: buildFinalizeDocUserMessage(currentState, spec),
        state: currentState,
        emit,
        actionFilter: (a) => a.action_type === "createContextArtifact",
        mockResponse,
      });

      totalActions += result.actionCount;
      currentState = result.updatedState;

      emit("finalize_progress", {
        step: "doc",
        step_index: i,
        total_steps: totalSteps,
        status: "complete",
        label: `Created ${spec.label}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Doc generation failed";
      console.error(`[finalize] Doc generation failed for ${spec.name}:`, msg);
      emit("error", { reason: `Failed to generate ${spec.label}: ${msg}` });
      emit("finalize_progress", {
        step: "doc",
        step_index: i,
        total_steps: totalSteps,
        status: "error",
        label: `Failed: ${spec.label}`,
      });
    }
  }

  return totalActions;
}
