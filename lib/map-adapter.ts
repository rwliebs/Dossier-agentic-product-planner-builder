/**
 * Adapter to transform MapSnapshot (canonical API response) to Iteration[] (UI shape).
 * Bridges the gap until UI components migrate to canonical Workflow/Activity/Step/Card types.
 */

import type { Iteration, Epic, UserActivity, Card, ContextDoc } from "@/components/dossier/types";

export interface MapCard {
  id: string;
  workflow_activity_id: string;
  step_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  build_state: string | null;
  last_built_at: string | null;
  last_build_ref: string | null;
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
  project: { id: string; name: string; repo_url: string | null; default_branch: string };
  workflows: MapWorkflow[];
}

const EPIC_COLORS = ["yellow", "blue", "purple", "green", "orange", "pink"] as const;

function mapCardToUICard(card: MapCard, activityId: string): Card {
  return {
    id: card.id,
    activityId,
    title: card.title,
    description: card.description ?? undefined,
    status: card.status as Card["status"],
    priority: card.priority,
    contextDocs: [],
    requirements: [],
    knownFacts: [],
    assumptions: [],
    questions: [],
    codeFileIds: [],
    testFileIds: [],
  };
}

/**
 * Transforms a MapSnapshot from the API into Iteration[] for the existing UI components.
 */
export function mapSnapshotToIterations(snapshot: MapSnapshot): Iteration[] {
  if (!snapshot.workflows || snapshot.workflows.length === 0) {
    return [];
  }

  const iteration: Iteration = {
    id: "iteration-map",
    phase: "mvp",
    label: "Implementation Map",
    description: snapshot.project.name,
    epics: snapshot.workflows.map((wf, wfIndex) => {
      const epic: Epic = {
        id: wf.id,
        title: wf.title,
        color: (EPIC_COLORS[wfIndex % EPIC_COLORS.length] ?? "yellow") as Epic["color"],
        activities: [],
      };

      for (const act of wf.activities) {
        const stepCards: Card[] = [];
        for (const step of act.steps) {
          for (const card of step.cards) {
            stepCards.push(mapCardToUICard(card, act.id));
          }
        }
        const activityCards = act.cards.map((c) => mapCardToUICard(c, act.id));
        const allCards = [...stepCards, ...activityCards].sort(
          (a, b) => a.priority - b.priority
        );

        epic.activities.push({
          id: act.id,
          epicId: wf.id,
          title: act.title,
          cards: allCards,
        });
      }

      return epic;
    }),
  };

  return [iteration];
}
