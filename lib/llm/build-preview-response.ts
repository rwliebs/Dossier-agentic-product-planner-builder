import type { PlanningAction } from "@/lib/schemas/slice-a";
import { previewActionBatch } from "@/lib/actions/preview-action";
import type { PlanningState } from "@/lib/schemas/planning-state";

export interface ChatPreviewResponse {
  added: {
    workflows: string[];
    activities: string[];
    cards: string[];
  };
  modified: {
    cards: string[];
    artifacts: string[];
  };
  reordered: string[];
  summary: string;
}

/**
 * Build preview response from valid actions for chat API.
 */
export function buildPreviewFromActions(
  actions: PlanningAction[],
  state: PlanningState,
): ChatPreviewResponse | null {
  const previews = previewActionBatch(actions, state);
  if (!previews) return null;

  const added = {
    workflows: [] as string[],
    activities: [] as string[],
    cards: [] as string[],
  };
  const modified = { cards: [] as string[], artifacts: [] as string[] };
  const reordered: string[] = [];
  const summaries: string[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const preview = previews[i];
    if (!preview) continue;

    if (preview.summary) summaries.push(preview.summary);

    switch (action.action_type) {
      case "createWorkflow":
        added.workflows.push(preview.created_ids[0] ?? "new");
        break;
      case "createActivity":
        added.activities.push(preview.created_ids[0] ?? "new");
        break;
      case "createCard":
        added.cards.push(preview.created_ids[0] ?? "new");
        break;
      case "updateCard":
      case "linkContextArtifact":
      case "upsertCardPlannedFile":
      case "approveCardPlannedFile":
      case "upsertCardKnowledgeItem":
      case "setCardKnowledgeStatus":
        for (const id of preview.updated_ids) {
          if (!modified.cards.includes(id)) modified.cards.push(id);
        }
        if (action.action_type === "linkContextArtifact") {
          modified.artifacts.push("linked");
        }
        break;
      case "reorderCard":
        reordered.push(...preview.reordered_ids);
        break;
    }
  }

  const summary =
    summaries.length > 0
      ? summaries.join(". ")
      : actions.length > 0
        ? `${actions.length} planning action(s) ready to apply`
        : "No changes";

  return {
    added,
    modified,
    reordered,
    summary,
  };
}
