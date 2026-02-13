import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getProject,
  getWorkflowsByProject,
  getActivitiesByWorkflow,
  getStepsByActivity,
  getCardsByStep,
  getCardsByActivity,
} from "@/lib/supabase/queries";
import { json, notFoundError, internalError } from "@/lib/api/response-helpers";

type RouteParams = { params: Promise<{ projectId: string }> };

export interface MapStep {
  id: string;
  workflow_activity_id: string;
  title: string;
  position: number;
  cards: MapCard[];
}

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

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createClient();

    const project = await getProject(supabase, projectId);
    if (!project) {
      return notFoundError("Project not found");
    }

    const workflows = await getWorkflowsByProject(supabase, projectId);
    const workflowsWithTree: MapWorkflow[] = [];

    for (const wf of workflows) {
      const activities = await getActivitiesByWorkflow(supabase, wf.id);
      const activitiesWithTree: MapActivity[] = [];

      for (const act of activities) {
        const steps = await getStepsByActivity(supabase, act.id);
        const stepsWithCards: MapStep[] = [];

        for (const step of steps) {
          const cards = await getCardsByStep(supabase, step.id);
          stepsWithCards.push({
            id: step.id,
            workflow_activity_id: step.workflow_activity_id,
            title: step.title,
            position: step.position,
            cards: cards.map(normalizeCard),
          });
        }

        const activityCards = await getCardsByActivity(supabase, act.id);

        activitiesWithTree.push({
          id: act.id,
          workflow_id: act.workflow_id,
          title: act.title,
          color: act.color,
          position: act.position,
          steps: stepsWithCards.sort((a, b) => a.position - b.position),
          cards: activityCards.map(normalizeCard),
        });
      }

      workflowsWithTree.push({
        id: wf.id,
        project_id: wf.project_id,
        title: wf.title,
        description: wf.description ?? null,
        build_state: wf.build_state ?? null,
        position: wf.position,
        activities: activitiesWithTree.sort((a, b) => a.position - b.position),
      });
    }

    const snapshot: MapSnapshot = {
      project: {
        id: project.id,
        name: project.name,
        repo_url: project.repo_url ?? null,
        default_branch: project.default_branch ?? "main",
      },
      workflows: workflowsWithTree.sort((a, b) => a.position - b.position),
    };

    return json(snapshot);
  } catch (err) {
    console.error("GET /api/projects/[projectId]/map error:", err);
    return internalError();
  }
}

function normalizeCard(row: Record<string, unknown>): MapCard {
  return {
    id: row.id as string,
    workflow_activity_id: row.workflow_activity_id as string,
    step_id: (row.step_id as string) ?? null,
    title: row.title as string,
    description: (row.description as string) ?? null,
    status: row.status as string,
    priority: (row.priority as number) ?? 0,
    build_state: (row.build_state as string) ?? null,
    last_built_at: (row.last_built_at as string) ?? null,
    last_build_ref: (row.last_build_ref as string) ?? null,
  };
}
