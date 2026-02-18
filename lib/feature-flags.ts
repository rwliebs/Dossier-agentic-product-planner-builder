/**
 * Feature flags for progressive rollout.
 * Gate behavior per flag. Env vars override defaults.
 */

/** Planning LLM (chat, idea → map). Default: true. */
export const PLANNING_LLM =
  process.env.NEXT_PUBLIC_PLANNING_LLM_ENABLED !== "false";

/** Build orchestrator (trigger build, runs, approvals, PR). Default: true. */
export const BUILD_ORCHESTRATOR =
  process.env.NEXT_PUBLIC_BUILD_ORCHESTRATOR_ENABLED !== "false";

/** Memory plane (RuVector retrieval, harvest, semantic context). Default: true. */
export const MEMORY_PLANE =
  process.env.NEXT_PUBLIC_MEMORY_PLANE_ENABLED !== "false";

/** All flags for iteration / debugging. */
export const flags = {
  PLANNING_LLM,
  BUILD_ORCHESTRATOR,
  MEMORY_PLANE,
} as const;
