/**
 * UI-facing types: re-exports from canonical schemas plus API response shapes and UI-only types.
 * Components should import from @/lib/types/ui (or @/lib/schemas for raw schema types).
 */

// Re-export canonical domain types from schemas
export type {
  Project,
  Workflow,
  WorkflowActivity,
  Step,
  Card,
  PlanningAction,
} from "@/lib/schemas/slice-a";

export type {
  ContextArtifact,
  CardRequirement,
  CardKnownFact,
  CardAssumption,
  CardQuestion,
  CardPlannedFile,
  CardWithContext,
} from "@/lib/schemas/slice-b";

export type { PlanningState } from "@/lib/schemas/planning-state";

// Re-export enums/union types used in UI
export type { CardStatus } from "@/lib/schemas/slice-a";
import type { Card as SchemaCard } from "@/lib/schemas/slice-a";

// Map API response: card shape from GET /api/projects/[id]/map (matches API exactly)
export interface MapCard {
  id: string;
  workflow_activity_id: string;
  step_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  quick_answer?: string | null;
  build_state?: string | null;
  last_built_at?: string | null;
  last_build_ref?: string | null;
}

export interface MapStep {
  id: string;
  workflow_activity_id: string;
  title: string;
  position: number;
  cards: MapCard[];
}

export interface MapActivity {
  id: string;
  workflow_id: string;
  title: string;
  color: string | null;
  position: number;
  steps: MapStep[];
  cards: MapCard[];
}

export interface MapWorkflow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  build_state: string | null;
  position: number;
  activities: MapActivity[];
}

export interface MapSnapshot {
  project: {
    id: string;
    name: string;
    description: string | null;
    repo_url: string | null;
    default_branch: string;
  };
  workflows: MapWorkflow[];
}

/** Return type for getCardKnowledge callback used by WorkflowBlock/StoryMapCanvas */
export interface CardKnowledgeForDisplay {
  requirements?: import("@/lib/schemas/slice-b").CardRequirement[];
  contextArtifacts?: import("@/lib/schemas/slice-b").ContextArtifact[];
  plannedFiles?: import("@/lib/schemas/slice-b").CardPlannedFile[];
  facts?: import("@/lib/schemas/slice-b").CardKnownFact[];
  assumptions?: import("@/lib/schemas/slice-b").CardAssumption[];
  questions?: import("@/lib/schemas/slice-b").CardQuestion[];
  quickAnswer?: string | null;
}

// UI-only: card with knowledge items and artifacts for display
export interface CardWithKnowledge extends SchemaCard {
  requirements?: import("@/lib/schemas/slice-b").CardRequirement[];
  facts?: import("@/lib/schemas/slice-b").CardKnownFact[];
  assumptions?: import("@/lib/schemas/slice-b").CardAssumption[];
  questions?: import("@/lib/schemas/slice-b").CardQuestion[];
  plannedFiles?: import("@/lib/schemas/slice-b").CardPlannedFile[];
  contextArtifacts?: import("@/lib/schemas/slice-b").ContextArtifact[];
}

// View and display enums (kept for UI)
export type ViewMode = "functionality" | "architecture";
export type EpicColor = "yellow" | "blue" | "purple" | "green" | "orange" | "pink";

// Project context for banner (derived from project + optional user request)
export interface ProjectContext {
  userRequest: string;
  generatedAt: string;
  activeAgents: number;
  lastUpdate: string;
}

// Architecture view (UI-only; not in canonical API)
export type FileType = "component" | "api" | "service" | "hook" | "util" | "schema" | "middleware";
export type DataFlowDirection = "input" | "output" | "bidirectional";

export interface CodeFile {
  id: string;
  path: string;
  name: string;
  type: FileType;
  description?: string;
  cardIds: string[];
  epicIds: string[];
  code?: string;
}

export interface DataFlow {
  id: string;
  fromFileId: string;
  toFileId: string;
  direction: DataFlowDirection;
  label?: string;
}

// Epic-like shape for architecture view (derived from MapWorkflow)
export interface EpicLike {
  id: string;
  title: string;
  color: EpicColor;
  activities: { id: string; epicId: string; title: string; cards: MapCard[] }[];
}
