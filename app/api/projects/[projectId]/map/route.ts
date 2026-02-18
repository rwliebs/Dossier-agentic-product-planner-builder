import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  getProject,
  getWorkflowsByProject,
  getActivitiesByProject,
  getStepsByProject,
  getCardsByProject,
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
  quick_answer?: string | null;
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

/** Batched map fetch: 5 queries total instead of N+1. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const db = getDb();

    const project = await getProject(db, projectId);
    if (!project) {
      return notFoundError("Project not found");
    }

    const [workflows, activities, steps, cards] = await Promise.all([
      getWorkflowsByProject(db, projectId),
      getActivitiesByProject(db, projectId),
      getStepsByProject(db, projectId),
      getCardsByProject(db, projectId),
    ]);

    const activityByWf = new Map<string, typeof activities>();
    for (const a of activities) {
      const wfId = a.workflow_id as string;
      if (!activityByWf.has(wfId)) activityByWf.set(wfId, []);
      activityByWf.get(wfId)!.push(a);
    }
    const stepsByAct = new Map<string, typeof steps>();
    for (const s of steps) {
      const actId = s.workflow_activity_id as string;
      if (!stepsByAct.has(actId)) stepsByAct.set(actId, []);
      stepsByAct.get(actId)!.push(s);
    }
    const cardsByStep = new Map<string, typeof cards>();
    const cardsByAct = new Map<string, typeof cards>();
    for (const c of cards) {
      const stepId = c.step_id as string | null;
      const actId = c.workflow_activity_id as string;
      if (stepId) {
        if (!cardsByStep.has(stepId)) cardsByStep.set(stepId, []);
        cardsByStep.get(stepId)!.push(c);
      } else {
        if (!cardsByAct.has(actId)) cardsByAct.set(actId, []);
        cardsByAct.get(actId)!.push(c);
      }
    }

    const workflowsWithTree: MapWorkflow[] = workflows.map((wf) => {
      const wfActivities = (activityByWf.get(wf.id as string) ?? []).sort(
        (a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0)
      );
      const activitiesWithTree: MapActivity[] = wfActivities.map((act) => {
        const actSteps = (stepsByAct.get(act.id as string) ?? []).sort(
          (a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0)
        );
        const stepsWithCards: MapStep[] = actSteps.map((step) => ({
          id: step.id as string,
          workflow_activity_id: step.workflow_activity_id as string,
          title: step.title as string,
          position: (step.position as number) ?? 0,
          cards: (cardsByStep.get(step.id as string) ?? []).map(normalizeCard),
        }));
        const activityCards = (cardsByAct.get(act.id as string) ?? []).map(normalizeCard);
        return {
          id: act.id as string,
          workflow_id: act.workflow_id as string,
          title: act.title as string,
          color: (act.color as string) ?? null,
          position: (act.position as number) ?? 0,
          steps: stepsWithCards,
          cards: activityCards,
        };
      });
      return {
        id: wf.id as string,
        project_id: wf.project_id as string,
        title: wf.title as string,
        description: (wf.description as string) ?? null,
        build_state: (wf.build_state as string) ?? null,
        position: (wf.position as number) ?? 0,
        activities: activitiesWithTree.sort(
          (a, b) => a.position - b.position
        ),
      };
    });

    const snapshot: MapSnapshot = {
      project: {
        id: project.id as string,
        name: project.name as string,
        repo_url: (project.repo_url as string) ?? null,
        default_branch: (project.default_branch as string) ?? "main",
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
    quick_answer: (row.quick_answer as string) ?? null,
    build_state: (row.build_state as string) ?? null,
    last_built_at: (row.last_built_at as string) ?? null,
    last_build_ref: (row.last_build_ref as string) ?? null,
  };
}
