/**
 * Single source of truth for action button labels.
 * Components and tests import from here so label changes stay in sync.
 * Pre-commit hook runs relevant tests when these or action-button components change.
 */
export const ACTION_BUTTONS = {
  BUILD_ALL: "Build All",
  POPULATE: "Populate",
  POPULATING: "Populating…",
  FINALIZE_PROJECT: "Approve Project",
  FINALIZING_PROJECT: "Approving…",
  FINALIZE_CARD: "Approve",
  FINALIZING_CARD: "Approving…",
  VIEW_DETAILS_EDIT: "View Details & Edit",
  /** Card action labels by status (implementation-card) */
  CARD_ACTION: {
    active: "Monitor",
    review: "Test",
    questions: "Reply",
    todo: "Build",
    production: "Build",
  } as const,
  /** View mode toggle (header) */
  VIEW_MODE: {
    functionality: "Functionality",
    architecture: "Architecture",
  } as const,
  /** Review button: opens files pane with this card's feature branch */
  REVIEW_FILES: "Review",
  /** Unified action button labels by build/flow state */
  UNIFIED: {
    BUILDING: "Building…",
    QUEUED: "Queued…",
    RESUME_BUILD: "Resume build",
    MERGE_FEATURE: "Merge feature",
  } as const,
} as const;

export type CardStatusForAction = keyof typeof ACTION_BUTTONS.CARD_ACTION;
