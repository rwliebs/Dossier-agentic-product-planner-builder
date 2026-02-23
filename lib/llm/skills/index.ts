/**
 * Local planning skills: Jobs-to-be-Done and User Story Mapping.
 * These are injected into the planning system prompt so the agent follows JTBD and USM.
 * For more skills (MCP), see docs/reference/skillsmith.md and https://www.skillsmith.app/
 */

import { JOBS_TO_BE_DONE_SKILL } from "./jobs-to-be-done";
import { USER_STORY_MAPPING_SKILL } from "./user-story-mapping";

/** Combined skill text to prepend or append to planning system prompts. */
export function getPlanningSkills(): string {
  return [USER_STORY_MAPPING_SKILL, JOBS_TO_BE_DONE_SKILL].join("\n\n");
}

export { JOBS_TO_BE_DONE_SKILL } from "./jobs-to-be-done";
export { USER_STORY_MAPPING_SKILL } from "./user-story-mapping";
