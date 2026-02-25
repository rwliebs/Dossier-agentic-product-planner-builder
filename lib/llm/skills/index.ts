/**
 * Planning skills organized by agent profile.
 *
 * Visionary  (scaffold)  — JTBD + User Story Mapping
 * Architect  (finalize)  — System Design or Design Systems (per document)
 * Product Manager (populate) — User Stories & Requirements + Value Prioritization + User Story Mapping
 */

import { JOBS_TO_BE_DONE_SKILL } from "./jobs-to-be-done";
import { USER_STORY_MAPPING_SKILL } from "./user-story-mapping";
import { SYSTEM_DESIGN_SKILL } from "./system-design";
import { DESIGN_SYSTEMS_SKILL } from "./design-systems";
import { USER_STORIES_REQUIREMENTS_SKILL } from "./user-stories-requirements";
import { VALUE_PRIORITIZATION_SKILL } from "./value-prioritization";

/** @deprecated Use profile-specific getters instead. */
export function getPlanningSkills(): string {
  return [USER_STORY_MAPPING_SKILL, JOBS_TO_BE_DONE_SKILL].join("\n\n");
}

/** Visionary profile: scaffold stage. */
export function getVisionarySkills(): string {
  return [JOBS_TO_BE_DONE_SKILL, USER_STORY_MAPPING_SKILL].join("\n\n");
}

/**
 * Architect profile: finalize stage.
 * Selects Design Systems skill for the design-system doc, System Design for all others.
 */
export function getArchitectSkills(docName?: string): string {
  if (docName === "design-system") {
    return DESIGN_SYSTEMS_SKILL;
  }
  return SYSTEM_DESIGN_SKILL;
}

/** Product Manager profile: populate stage. */
export function getProductManagerSkills(): string {
  return [
    USER_STORY_MAPPING_SKILL,
    USER_STORIES_REQUIREMENTS_SKILL,
    VALUE_PRIORITIZATION_SKILL,
  ].join("\n\n");
}

export { JOBS_TO_BE_DONE_SKILL } from "./jobs-to-be-done";
export { USER_STORY_MAPPING_SKILL } from "./user-story-mapping";
export { SYSTEM_DESIGN_SKILL } from "./system-design";
export { DESIGN_SYSTEMS_SKILL } from "./design-systems";
export { USER_STORIES_REQUIREMENTS_SKILL } from "./user-stories-requirements";
export { VALUE_PRIORITIZATION_SKILL } from "./value-prioritization";
