import type { DbAdapter } from "@/lib/db/adapter";
import type { PlanningState } from "@/lib/schemas/planning-state";
import {
  buildFinalizeDocSystemPrompt,
  buildFinalizeDocUserMessage,
  FINALIZE_DOC_SPECS,
} from "@/lib/llm/planning-prompt";
import { runLlmSubStep, type Emitter } from "@/lib/llm/run-llm-substep";

/**
 * Run multi-step finalization: 5 LLM calls in parallel (one per project document).
 * Parallel execution reduces total latency vs sequential. Each doc is independent.
 *
 * Alternative (one prompt for all 5 docs): Would reduce input tokens (state sent once)
 * but increases output size and timeout risk. Holistic context could improve
 * cross-doc consistency. Consider if parallel still times out.
 */
export async function runFinalizeMultiStep(opts: {
  db: DbAdapter;
  projectId: string;
  state: PlanningState;
  emit: Emitter;
  mockResponse?: string;
}): Promise<number> {
  const { db, projectId, emit, mockResponse } = opts;
  const state = opts.state;
  const totalSteps = FINALIZE_DOC_SPECS.length;

  for (let i = 0; i < totalSteps; i++) {
    emit("finalize_progress", {
      step: "doc",
      step_index: i,
      total_steps: totalSteps,
      status: "generating",
      label: `Generating ${FINALIZE_DOC_SPECS[i].label}`,
    });
  }

  const results = await Promise.all(
    FINALIZE_DOC_SPECS.map(async (spec, i) => {
      try {
        const result = await runLlmSubStep({
          db,
          projectId,
          systemPrompt: buildFinalizeDocSystemPrompt(spec),
          userMessage: buildFinalizeDocUserMessage(state, spec),
          state,
          emit,
          actionFilter: (a) => a.action_type === "createContextArtifact",
          mockResponse,
        });
        emit("finalize_progress", {
          step: "doc",
          step_index: i,
          total_steps: totalSteps,
          status: "complete",
          label: `Created ${spec.label}`,
        });
        return result.actionCount;
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
        return 0;
      }
    }),
  );

  return results.reduce((a, b) => a + b, 0);
}
