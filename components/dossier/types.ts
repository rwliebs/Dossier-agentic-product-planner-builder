/**
 * Re-export UI types from canonical lib. Use @/lib/types/ui in new code.
 * This file is kept for backward compatibility; new imports should use @/lib/types/ui.
 */

export type {
  ViewMode,
  CardStatus,
  EpicColor,
  ProjectContext,
  MapCard,
  MapStep,
  MapActivity,
  MapWorkflow,
  MapSnapshot,
  ContextArtifact,
  CodeFile,
  DataFlow,
  EpicLike,
} from "@/lib/types/ui";

/** @deprecated Use ContextArtifact from @/lib/types/ui */
export type ContextDoc = import("@/lib/types/ui").ContextArtifact;

/** @deprecated Use MapWorkflow + MapActivity + MapCard; for legacy IterationBlock/EpicRow only */
export interface Epic {
  id: string;
  title: string;
  color: import("@/lib/types/ui").EpicColor;
  activities: { id: string; epicId: string; title: string; cards: import("@/lib/types/ui").MapCard[] }[];
}

/** @deprecated Use MapSnapshot; for legacy IterationBlock only */
export interface Iteration {
  id: string;
  phase: string;
  label: string;
  description: string;
  epics: Epic[];
  codeFiles?: import("@/lib/types/ui").CodeFile[];
  dataFlows?: import("@/lib/types/ui").DataFlow[];
}
