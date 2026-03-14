/**
 * Bridge from Agent SDK planning output to ClaudePlanningResponse contract.
 * Issue #10 — allows planning to use OAuth/Max via Agent SDK while keeping
 * existing parser contracts unchanged.
 */

import type { ClaudePlanningResponse } from "./claude-client";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/**
 * Builds a ClaudePlanningResponse from raw text produced by the Agent SDK.
 * SDK may not expose usage/stopReason in the same shape as the Messages API;
 * we return a valid contract with best-effort defaults.
 */
export function planningResponseFromSdkText(
  rawText: string,
  options?: { model?: string; usage?: { inputTokens: number; outputTokens: number }; stopReason?: string | null }
): ClaudePlanningResponse {
  return {
    text: rawText,
    stopReason: options?.stopReason ?? null,
    usage: options?.usage ?? { inputTokens: 0, outputTokens: 0 },
    model: options?.model ?? DEFAULT_MODEL,
  };
}
